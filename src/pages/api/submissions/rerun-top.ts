import { type NextApiRequest, type NextApiResponse } from "next";
import { type Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { env } from "~/env";
import { engineAuthHeaders } from "~/server/engine-auth";
import { getLanguageGpuSupportError } from "~/constants/language";
import { isSubmissionError, SubmissionStatus } from "~/types/submission";
import type {
  BenchmarkedResponse,
  BenchmarkResultResponse,
  BenchmarkRunData,
  CheckedResponse,
  ErrorResponse,
  SubmissionStatusType,
  TestResult,
  TestResultResponse,
  WrongAnswerResponse,
} from "~/types/submission";
import { proxyUpstreamSSE } from "./sseProxy";
import { invalidateLeaderboardCaches } from "~/server/api/routers/submissions";
import { SINGLE_GPU_TYPE } from "~/constants/gpu";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { problemSlug, rank, submissionId } = req.body as {
    problemSlug?: string;
    gpuType?: string;
    rank?: number;
    submissionId?: string;
  };
  const gpuType = SINGLE_GPU_TYPE;

  if (!problemSlug && !submissionId) {
    res.status(400).json({ error: "Missing required field: problemSlug" });
    return;
  }

  const targetRank = Math.max(1, Math.floor(rank ?? 1));
  const [topSubmission] = await db.submission.findMany({
    where: submissionId
      ? {
          id: submissionId,
          status: SubmissionStatus.ACCEPTED,
          moderationStatus: null,
          runtime: { not: null },
          ...(problemSlug ? { problem: { slug: problemSlug } } : {}),
          gpuType,
        }
      : {
          status: SubmissionStatus.ACCEPTED,
          moderationStatus: null,
          runtime: { not: null },
          problem: { slug: problemSlug },
          gpuType,
        },
    skip: submissionId ? 0 : targetRank - 1,
    take: 1,
    orderBy: {
      runtime: "asc",
    },
    include: { problem: true },
  });

  if (!topSubmission) {
    res.status(404).json({ error: "No accepted submission found to rerun" });
    return;
  }

  const languageGpuError = getLanguageGpuSupportError(
    topSubmission.language,
    gpuType
  );
  if (languageGpuError) {
    res.status(400).json({ error: languageGpuError });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Content-Encoding", "identity");
  res.setHeader("Keep-Alive", "timeout=120, max=1000");

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`);
    } catch {}
  }, 30000);

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const submission = await db.submission.create({
    data: {
      code: topSubmission.code,
      language: topSubmission.language,
      gpuType,
      status: SubmissionStatus.IN_QUEUE,
      problem: { connect: { id: topSubmission.problemId } },
      user: { connect: { id: topSubmission.userId } },
      isPublic: topSubmission.isPublic,
    },
    include: {
      problem: true,
    },
  });

  res.write(
    `event: ${SubmissionStatus.IN_QUEUE}\ndata: ${JSON.stringify({
      id: submission.id,
      rerunOfSubmissionId: topSubmission.id,
    })}\n\n`
  );

  const payload = {
    solution_code: submission.code,
    problem: submission.problem.slug,
    problem_def: submission.problem.definition,
    gpu_type: submission.gpuType,
    language: submission.language,
    profiling_options: undefined,
  };

  await db.submission.update({
    where: { id: submission.id },
    data: { status: SubmissionStatus.CHECKING },
  });

  res.write(
    `event: ${SubmissionStatus.CHECKING}\ndata: {"status":"${SubmissionStatus.CHECKING}"}\n\n`
  );

  let passedTests = 0;
  let totalTests = 0;
  const seenTests = new Set<number>();

  const checkerResult = await proxyUpstreamSSE(
    res,
    `${env.MODAL_ENDPOINT}/checker-${SINGLE_GPU_TYPE}`,
    payload,
    async (evt) => {
      const s = evt?.status as string | undefined;
      if (!s) return "CONTINUE";

      if (s === SubmissionStatus.TEST_RESULT) {
        const r = evt as TestResultResponse;
        const id = r.result?.test_id;
        if (id !== undefined && !seenTests.has(id)) {
          seenTests.add(id);
          totalTests++;
          if (r.result?.status === "PASSED") passedTests++;
          await db.submission.update({
            where: { id: submission.id },
            data: { passedTests, totalTests },
          });
        }
        return "CONTINUE";
      }

      if (s === SubmissionStatus.CHECKED) {
        const r = evt as CheckedResponse;
        if (typeof r.total_tests === "number") totalTests = r.total_tests;
        if (typeof r.passed_tests === "number") passedTests = r.passed_tests;
        await db.submission.update({
          where: { id: submission.id },
          data: { passedTests, totalTests },
        });
        return "CONTINUE";
      }

      if (s === SubmissionStatus.WRONG_ANSWER) {
        const r = evt as WrongAnswerResponse;
        const failed = r.test_results?.find(
          (t: TestResult) => t.status === "FAILED"
        );
        await db.submission.update({
          where: { id: submission.id },
          data: {
            status: SubmissionStatus.WRONG_ANSWER,
            passedTests: r.passed_tests ?? passedTests,
            totalTests: r.total_tests ?? totalTests,
            errorMessage: failed
              ? `Failed on test ${failed.test_id} (${failed.name})`
              : "Wrong answer",
            errorDetails: JSON.stringify(r.debug_info ?? {}),
          },
        });
        return "STOP";
      }

      if (isSubmissionError(s)) {
        const err = evt as Partial<ErrorResponse>;
        await db.submission.update({
          where: { id: submission.id },
          data: {
            status: s,
            errorMessage: err.message ?? "Unknown error",
            errorDetails: err.details ?? "",
            passedTests,
            totalTests,
          },
        });
        return "STOP";
      }

      return "CONTINUE";
    },
    controller.signal,
    engineAuthHeaders()
  );

  if (checkerResult === "STOPPED") {
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {}
    return;
  }

  res.write(
    `event: ${SubmissionStatus.BENCHMARKING}\ndata: {"status":"${SubmissionStatus.BENCHMARKING}"}\n\n`
  );
  await db.submission.update({
    where: { id: submission.id },
    data: {
      status: SubmissionStatus.BENCHMARKING,
      passedTests,
      totalTests,
    },
  });

  const benchResults: BenchmarkResultResponse["result"][] = [];

  await proxyUpstreamSSE(
    res,
    `${env.MODAL_ENDPOINT}/benchmark-${SINGLE_GPU_TYPE}`,
    payload,
    async (evt) => {
      const s = evt?.status as string | undefined;
      if (!s) return "CONTINUE";

      if (s === SubmissionStatus.BENCHMARK_RESULT) {
        const r = evt as BenchmarkResultResponse;
        if (r.result) {
          benchResults.push(r.result);
          await db.submission.update({
            where: { id: submission.id },
            data: {
              benchmarkResults:
                benchResults as unknown as Prisma.InputJsonValue,
            },
          });

          const testResult = r.result;
          const runs = testResult.runs ?? [];

          if (runs.length > 0) {
            await db.testResult.create({
              data: {
                submissionId: submission.id,
                testId: testResult.test_id,
                name: testResult.name,
                avgRuntimeMs: testResult.runtime_ms,
                avgGflops: testResult.gflops ?? null,
                runs: {
                  create: runs.map((run: BenchmarkRunData) => ({
                    runIndex: run.run_index,
                    runtimeMs: run.runtime_ms,
                    gflops: run.gflops ?? null,
                    gpuSamples: (run.gpu_samples ??
                      []) as unknown as Prisma.InputJsonValue,
                    gpuMetrics: (run.gpu_metrics ??
                      null) as unknown as Prisma.InputJsonValue,
                  })),
                },
              },
            });
          }
        }
        return "CONTINUE";
      }

      if (s === SubmissionStatus.BENCHMARKED) {
        const r = evt as BenchmarkedResponse;
        const updateData: Partial<Record<string, unknown>> & {
          status: SubmissionStatusType;
        } = {
          status: SubmissionStatus.ACCEPTED,
          benchmarkResults: benchResults as unknown as Prisma.InputJsonValue,
        };
        if (typeof r.avg_runtime_ms === "number")
          updateData.runtime = r.avg_runtime_ms;
        if (typeof r.avg_gflops === "number") updateData.gflops = r.avg_gflops;

        await db.submission.update({
          where: { id: submission.id },
          data: updateData,
        });
        invalidateLeaderboardCaches();

        res.write(
          `event: ${SubmissionStatus.ACCEPTED}\ndata: ${JSON.stringify({
            id: submission.id,
            rerunOfSubmissionId: topSubmission.id,
            avg_runtime_ms: r.avg_runtime_ms,
            avg_gflops: r.avg_gflops,
            benchmark_results: benchResults,
            total_tests: benchResults.length,
          })}\n\n`
        );

        return "CONTINUE";
      }

      if (s === SubmissionStatus.WRONG_ANSWER) {
        const err = evt as WrongAnswerResponse;
        await db.submission.update({
          where: { id: submission.id },
          data: {
            status: SubmissionStatus.WRONG_ANSWER,
            errorMessage:
              err.debug_info?.message ?? "Failed benchmarking checksum",
            passedTests,
            totalTests: err.total_tests ?? totalTests,
            errorDetails: JSON.stringify(err.debug_info ?? {}),
          },
        });
        return "STOP";
      }

      if (isSubmissionError(s)) {
        const err = evt as Partial<ErrorResponse>;
        await db.submission.update({
          where: { id: submission.id },
          data: {
            status: s,
            errorMessage: err.message ?? "Unknown error",
            errorDetails: err.details ?? "",
          },
        });
        return "STOP";
      }

      return "CONTINUE";
    },
    controller.signal,
    engineAuthHeaders()
  );

  clearInterval(heartbeat);
  try {
    res.end();
  } catch {}
}
