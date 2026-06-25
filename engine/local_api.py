from threading import Thread
import hmac
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
import simplejson

import runner
import utils


web_app = FastAPI()


def _read_env_token():
    token = os.environ.get("LOCAL_ENGINE_TOKEN")
    if token:
        return token

    env_path = Path(__file__).resolve().parents[1] / ".env"
    try:
        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            if key.strip() != "LOCAL_ENGINE_TOKEN":
                continue
            return value.strip().strip('"').strip("'")
    except FileNotFoundError:
        return None

    return None


ENGINE_TOKEN = _read_env_token()


def _authorized(request: Request):
    if not ENGINE_TOKEN:
        return True

    authorization = request.headers.get("authorization", "")
    bearer = authorization.removeprefix("Bearer ").strip()
    header_token = request.headers.get("x-tensara-engine-token", "").strip()
    return hmac.compare_digest(bearer, ENGINE_TOKEN) or hmac.compare_digest(
        header_token, ENGINE_TOKEN
    )


def _unauthorized_response():
    return JSONResponse(status_code=401, content={"error": "Engine token required"})


def gen_wrapper(gen):
    for event in gen:
        if event is None or event == {}:
            continue
        yield "data: " + simplejson.dumps(event, ignore_nan=True) + "\n\n"


def _unsupported_gpu_response(gpu: str):
    return JSONResponse(status_code=404, content={"error": f"GPU '{gpu}' not supported"})


def _compile_error(message: str, details: str):
    return {
        "status": "COMPILE_ERROR",
        "message": message,
        "details": details,
    }


def _validate_solution_signature(problem_name: str, problem_def: str, solution_code: str):
    problem = utils.load_problem_module(problem_name, problem_def)
    expected = len(problem.get_function_signature().get("argtypes") or [])
    utils.validate_cuda_solution_signature_from_source(solution_code, expected)


def _compile_cuda(gpu: str, solution_code: str, output_name: str):
    try:
        return utils.run_nvcc_and_return_bytes(gpu, solution_code, output_name)
    except utils.NVCCError as e:
        raise RuntimeError(("NVCC Compilation Failed", e.args[0])) from e
    except Exception as e:
        raise RuntimeError(("Unexpected Compilation Error", str(e))) from e


def local_binary_runner(
    type: str,
    compiled_lib: bytes | None,
    solution_code: str,
    problem_name: str,
    problem_def: str,
    language: str,
    profiling_options: dict | None = None,
):
    if language == "mojo" and compiled_lib is None:
        if type != "sandbox":
            try:
                problem = utils.load_problem_module(problem_name, problem_def)
                expected = len(problem.get_function_signature().get("argtypes") or [])
                utils.validate_mojo_solution_signature_from_source(solution_code, expected)
            except utils.SolutionSignatureError as e:
                yield _compile_error("Invalid `solution` signature", str(e))
                return
        try:
            if type == "sandbox":
                compiled_lib = utils.run_mojo_and_return_executable(solution_code, type)
            else:
                compiled_lib = utils.run_mojo_and_return_bytes(solution_code, type)
        except utils.MojoError as e:
            yield _compile_error("Compilation Failed", e.args[0])
            return

    if type == "sandbox":
        gen = runner.run_sandbox(compiled_lib, solution_code)
    elif type == "sample":
        gen = runner.run_sample_case(
            problem_name, problem_def, solution_code, compiled_lib, language
        )
    else:
        try:
            problem = utils.load_problem_module(problem_name, problem_def)
            solution_func = utils.make_solution_func(language, solution_code, compiled_lib, problem)
        except utils.SolutionSignatureError as e:
            yield _compile_error("Invalid `solution` signature", str(e))
            return
        except Exception as e:
            yield _compile_error("Compilation Failed", str(e))
            return

        if type == "checker":
            gen = runner.run_checker(problem_name, problem_def, solution_func, language)
        elif type == "benchmark":
            gen = runner.run_benchmark(
                problem_name,
                problem_def,
                solution_func,
                language,
                profiling_options=profiling_options,
            )
        elif type == "sanity_check":
            gen = runner.run_sanity_check(problem_name, problem_def, solution_func, language)
        else:
            raise ValueError(f"Unknown binary type: {type}")

    yield from gen


@web_app.get("/health")
async def health():
    return {"status": "ok", "gpus": sorted(utils.GPU_COMPUTE_CAPABILITIES.keys())}


@web_app.post("/checker-{gpu}")
async def checker(gpu: str, request: Request):
    if not _authorized(request):
        return _unauthorized_response()

    req = await request.json()
    if gpu not in utils.GPU_COMPUTE_CAPABILITIES:
        return _unsupported_gpu_response(gpu)

    solution_code = req["solution_code"]
    problem_def = req["problem_def"]
    language = req["language"]
    problem_name = utils.convert_slug_to_module_name(req["problem"])

    def create_stream():
        yield {"status": "COMPILING"}

        if language == "cuda":
            try:
                _validate_solution_signature(problem_name, problem_def, solution_code)
            except utils.SolutionSignatureError as e:
                yield _compile_error("Invalid `solution` signature", str(e))
                return

            def compile_benchmark():
                try:
                    utils.run_nvcc_and_return_bytes(gpu, solution_code, "benchmark")
                except Exception:
                    pass

            bench_thr = Thread(target=compile_benchmark)
            bench_thr.start()

            try:
                checker_compiled = _compile_cuda(gpu, solution_code, "checker")
            except RuntimeError as e:
                message, details = e.args[0]
                yield _compile_error(message, details)
                return

            bench_thr.join()

            yield from utils.yield_ptx_sass(gpu, solution_code)
        else:
            checker_compiled = None

        yield from local_binary_runner(
            "checker", checker_compiled, solution_code, problem_name, problem_def, language
        )

    return StreamingResponse(gen_wrapper(create_stream()), media_type="text/event-stream")


@web_app.post("/benchmark-{gpu}")
async def benchmark(gpu: str, request: Request):
    if not _authorized(request):
        return _unauthorized_response()

    req = await request.json()
    if gpu not in utils.GPU_COMPUTE_CAPABILITIES:
        return _unsupported_gpu_response(gpu)

    solution_code = req["solution_code"]
    problem_def = req["problem_def"]
    language = req["language"]
    problem_name = utils.convert_slug_to_module_name(req["problem"])
    profiling_options = req.get("profiling_options")

    def create_stream():
        if language == "cuda":
            try:
                _validate_solution_signature(problem_name, problem_def, solution_code)
                benchmark_compiled = _compile_cuda(gpu, solution_code, "benchmark")
            except utils.SolutionSignatureError as e:
                yield _compile_error("Invalid `solution` signature", str(e))
                return
            except RuntimeError as e:
                message, details = e.args[0]
                yield _compile_error(message, details)
                return

            yield from utils.yield_ptx_sass(gpu, solution_code)
        else:
            benchmark_compiled = None

        yield from local_binary_runner(
            "benchmark",
            benchmark_compiled,
            solution_code,
            problem_name,
            problem_def,
            language,
            profiling_options=profiling_options,
        )

    return StreamingResponse(gen_wrapper(create_stream()), media_type="text/event-stream")


@web_app.post("/sample-{gpu}")
async def sample_runner(gpu: str, request: Request):
    if not _authorized(request):
        return _unauthorized_response()

    req = await request.json()
    if gpu not in utils.GPU_COMPUTE_CAPABILITIES:
        return _unsupported_gpu_response(gpu)

    solution_code = req["solution_code"]
    problem_def = req["problem_def"]
    language = req["language"]
    problem_name = utils.convert_slug_to_module_name(req["problem"])

    def create_stream():
        yield {"status": "COMPILING"}

        if language == "cuda":
            try:
                _validate_solution_signature(problem_name, problem_def, solution_code)
                sample_compiled = _compile_cuda(gpu, solution_code, "sample")
            except utils.SolutionSignatureError as e:
                yield _compile_error("Invalid `solution` signature", str(e))
                return
            except RuntimeError as e:
                message, details = e.args[0]
                yield _compile_error(message, details)
                return

            yield from utils.yield_ptx_sass(gpu, solution_code)
        else:
            sample_compiled = None

        yield from local_binary_runner(
            "sample", sample_compiled, solution_code, problem_name, problem_def, language
        )

    return StreamingResponse(gen_wrapper(create_stream()), media_type="text/event-stream")


@web_app.post("/sandbox-{gpu}")
async def sandbox(gpu: str, request: Request):
    if not _authorized(request):
        return _unauthorized_response()

    req = await request.json()
    if gpu not in utils.GPU_COMPUTE_CAPABILITIES:
        return _unsupported_gpu_response(gpu)

    solution_code = req["code"]
    language = req.get("language", "cuda")

    def create_stream():
        yield {"status": "COMPILING"}

        try:
            if language == "cuda":
                compiled_lib = utils.run_nvcc_and_return_executable(gpu, solution_code)
                yield from utils.yield_ptx_sass(gpu, solution_code)
            elif language == "mojo":
                compiled_lib = utils.run_mojo_and_return_executable(solution_code, "sandbox")
            else:
                yield _compile_error(
                    "Compilation Failed", f"Unsupported language for sandbox: {language}"
                )
                return
        except utils.NVCCError as e:
            yield _compile_error("Compilation Failed", e.args[0])
            return
        except utils.MojoError as e:
            yield _compile_error("Compilation Failed", e.args[0])
            return
        except Exception as e:
            yield _compile_error("Unexpected Compilation Error", str(e))
            return

        for event in local_binary_runner(
            "sandbox", compiled_lib, solution_code, "sandbox", "sandbox", language
        ):
            if not event:
                continue
            status = event.get("status") if isinstance(event, dict) else None
            if status == "TIME_LIMIT_EXCEEDED":
                yield {
                    "status": "SANDBOX_TIMEOUT",
                    "message": event.get("message", "Sandbox time limit exceeded"),
                    "details": event.get("details", ""),
                }
                return
            yield event

    return StreamingResponse(gen_wrapper(create_stream()), media_type="text/event-stream")


@web_app.post("/benchmark_cli-{gpu}")
async def benchmark_cli(gpu: str, request: Request):
    if not _authorized(request):
        return _unauthorized_response()

    req = await request.json()
    if gpu not in utils.GPU_COMPUTE_CAPABILITIES:
        return _unsupported_gpu_response(gpu)

    solution_code = req["solution_code"]
    problem_def = req["problem_def"]
    language = req["language"]
    problem_name = utils.convert_slug_to_module_name(req["problem"])
    profiling_options = req.get("profiling_options")

    def create_stream():
        yield {"status": "COMPILING"}

        if language == "cuda":
            try:
                _validate_solution_signature(problem_name, problem_def, solution_code)
                benchmark_compiled = _compile_cuda(gpu, solution_code, "benchmark")
            except utils.SolutionSignatureError as e:
                yield _compile_error("Invalid `solution` signature", str(e))
                return
            except RuntimeError as e:
                message, details = e.args[0]
                yield _compile_error(message, details)
                return
        else:
            benchmark_compiled = None

        sanity_check_stream = local_binary_runner(
            "sanity_check",
            benchmark_compiled,
            solution_code,
            problem_name,
            problem_def,
            language,
        )
        for event in sanity_check_stream:
            yield event
            if event["status"] == "SANITY_CHECK_PASSED":
                break
            if event["status"] in {"RUNTIME_ERROR", "ERROR", "COMPILE_ERROR", "WRONG_ANSWER"}:
                return

        yield from local_binary_runner(
            "benchmark",
            benchmark_compiled,
            solution_code,
            problem_name,
            problem_def,
            language,
            profiling_options=profiling_options,
        )

    return StreamingResponse(gen_wrapper(create_stream()), media_type="text/event-stream")


app = web_app
