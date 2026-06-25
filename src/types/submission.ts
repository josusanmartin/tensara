// Submission Status Constants
export const SubmissionStatus = {
  IN_QUEUE: "IN_QUEUE",
  COMPILING: "COMPILING",
  CHECKING: "CHECKING",
  TEST_RESULT: "TEST_RESULT",
  WRONG_ANSWER: "WRONG_ANSWER",
  CHECKED: "CHECKED",
  BENCHMARKING: "BENCHMARKING",
  BENCHMARK_RESULT: "BENCHMARK_RESULT",
  BENCHMARKED: "BENCHMARKED",
  ACCEPTED: "ACCEPTED",
  SANITY_CHECK_PASSED: "SANITY_CHECK_PASSED",
  PTX: "PTX",
  SASS: "SASS",
  WARNING: "WARNING",
  // Sandbox statuses
  SANDBOX_RUNNING: "SANDBOX_RUNNING",
  SANDBOX_OUTPUT: "SANDBOX_OUTPUT",
  SANDBOX_SUCCESS: "SANDBOX_SUCCESS",
  SANDBOX_ERROR: "SANDBOX_ERROR",
  SANDBOX_TIMEOUT: "SANDBOX_TIMEOUT",
  SANDBOX_OUTPUT_LIMIT: "SANDBOX_OUTPUT_LIMIT",
} as const;

// Submission Errors
export const SubmissionError = {
  COMPILE_ERROR: "COMPILE_ERROR",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TIME_LIMIT_EXCEEDED: "TIME_LIMIT_EXCEEDED",
  ERROR: "ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

export type SubmissionStatusType =
  (typeof SubmissionStatus)[keyof typeof SubmissionStatus];
export type SubmissionErrorType =
  (typeof SubmissionError)[keyof typeof SubmissionError];

export function isSubmissionError(
  status: string
): status is SubmissionErrorType {
  return Object.values(SubmissionError).includes(status as SubmissionErrorType);
}

// Test and Benchmark Result Types
export type TestResult = {
  test_id: number;
  name: string;
  status: string;
  debug_info?: string;
};

export type DebugInfo = {
  max_difference?: number;
  mean_difference?: number;
  sample_differences?: Record<
    string,
    {
      expected: number;
      actual: number;
      diff: number;
    }
  >;
  message?: string;
};

export type BenchmarkResult = {
  name: string;
  test_id: number;
  gflops?: number;
  runtime_ms: number;
  memory_bytes?: number;
  memory_bandwidth_gbps?: number;
  benchmark_stats?: {
    runtime_ms_min: number;
    runtime_ms_max: number;
    runtime_ms_mean: number;
    runtime_ms_stdev: number;
    cv: number;
    iterations: number;
    target_cv: number;
    converged: boolean;
    is_long_kernel: boolean;
  };
  cuda_kernel_profile?: CudaKernelProfile;
};

// GPU Monitoring Types

/**
 * Single GPU sample collected every ~5ms during kernel execution
 */
export interface GPUSample {
  timestamp: number; // Unix timestamp in seconds
  sm_clock_mhz: number; // Streaming multiprocessor clock in MHz
  temp_c: number; // GPU temperature in Celsius
  pstate: number; // Performance state (0 = max performance)
  throttle_reasons: number; // Bitmask of active throttle reasons
  power_w?: number;
  gpu_utilization_pct?: number;
  memory_utilization_pct?: number;
  memory_used_mb?: number;
  memory_total_mb?: number;
}

/**
 * Aggregated GPU metrics statistics for a single benchmark run
 */
export interface GPUMetricsStats {
  sample_count: number;
  // Temperature stats
  temp_c_min: number;
  temp_c_max: number;
  temp_c_mean: number;
  // SM Clock stats
  sm_clock_mhz_min: number;
  sm_clock_mhz_max: number;
  sm_clock_mhz_mean: number;
  // Performance state
  pstate_min: number;
  pstate_max: number;
  // Throttle reasons (OR of all seen during run)
  throttle_reasons_any: number;
  power_w_min?: number;
  power_w_max?: number;
  power_w_mean?: number;
  gpu_utilization_pct_min?: number;
  gpu_utilization_pct_max?: number;
  gpu_utilization_pct_mean?: number;
  memory_utilization_pct_min?: number;
  memory_utilization_pct_max?: number;
  memory_utilization_pct_mean?: number;
  memory_used_mb_min?: number;
  memory_used_mb_max?: number;
  memory_used_mb_mean?: number;
  memory_total_mb_min?: number;
  memory_total_mb_max?: number;
  memory_total_mb_mean?: number;
}

export interface CudaKernelProfileEvent {
  name: string;
  calls: number;
  cuda_time_total_us: number;
  cuda_time_avg_us: number;
  cpu_time_total_us: number;
  cpu_time_avg_us: number;
  self_cpu_time_total_us: number;
  cpu_memory_usage_bytes: number;
  cuda_memory_usage_bytes: number;
}

export interface CudaKernelProfile {
  backend: string;
  activities?: string[];
  total_cuda_time_us?: number;
  events?: CudaKernelProfileEvent[];
  event_count?: number;
  error?: string;
}

/**
 * Individual benchmark run data with GPU metrics
 */
export interface BenchmarkRunData {
  run_index: number;
  runtime_ms: number;
  gflops?: number;
  gpu_samples: GPUSample[];
  gpu_metrics?: GPUMetricsStats;
}

/**
 * Test result with per-run benchmark data including GPU metrics
 */
export interface TestResultWithRuns {
  test_id: number;
  name: string;
  avg_runtime_ms: number;
  avg_gflops?: number;
  runs: BenchmarkRunData[];
}

// Response Types
interface BaseResponse<T extends SubmissionStatusType | SubmissionErrorType> {
  status: T;
}

export interface ErrorResponse extends BaseResponse<SubmissionErrorType> {
  message: string;
  details: string;
}

export interface TestResultResponse extends BaseResponse<"TEST_RESULT"> {
  result: TestResult;
  total_tests: number;
}

export interface CheckedResponse extends BaseResponse<"CHECKED"> {
  test_results: TestResult[];
  passed_tests: number;
  total_tests: number;
}

export interface WrongAnswerResponse extends BaseResponse<"WRONG_ANSWER"> {
  debug_info: DebugInfo;
  passed_tests: number;
  total_tests: number;
  test_results: TestResult[];
}

export interface BenchmarkResultResponse
  extends BaseResponse<"BENCHMARK_RESULT"> {
  result: BenchmarkResult & {
    // New format fields (from engine with GPU metrics)
    avg_runtime_ms?: number;
    avg_gflops?: number;
    runs?: BenchmarkRunData[]; // Per-run data with GPU metrics (new submissions)
  };
  total_tests: number;
}

export interface BenchmarkedResponse extends BaseResponse<"BENCHMARKED"> {
  test_results: BenchmarkResultResponse[];
  avg_gflops?: number;
  avg_runtime_ms: number;
  total_tests: number;
}

export interface AcceptedResponse extends BaseResponse<"ACCEPTED"> {
  benchmark_results: BenchmarkResultResponse[];
  avg_gflops?: number;
  avg_runtime_ms: number;
  total_tests: number;
}

// Sandbox Response Types
export interface SandboxOutputResponse extends BaseResponse<"SANDBOX_OUTPUT"> {
  stream: "stdout" | "stderr";
  line: string;
  timestamp: number;
}

export interface SandboxSuccessResponse
  extends BaseResponse<"SANDBOX_SUCCESS"> {
  stdout: string;
  stderr: string;
  return_code: number;
}

export interface SandboxErrorResponse extends BaseResponse<"SANDBOX_ERROR"> {
  message: string;
  stdout?: string;
  stderr?: string;
  return_code?: number;
  details?: string;
}

export interface SandboxTimeoutResponse
  extends BaseResponse<"SANDBOX_TIMEOUT"> {
  message: string;
  details: string;
}

export interface SandboxOutputLimitResponse
  extends BaseResponse<"SANDBOX_OUTPUT_LIMIT"> {
  message: string;
  stdout?: string;
  stderr?: string;
  details?: string;
}

// Unified Union Type for API Response
export type SubmissionResponse =
  | ErrorResponse
  | TestResultResponse
  | CheckedResponse
  | WrongAnswerResponse
  | BenchmarkResultResponse
  | BenchmarkedResponse
  | AcceptedResponse
  | SandboxOutputResponse
  | SandboxSuccessResponse
  | SandboxErrorResponse
  | SandboxTimeoutResponse
  | SandboxOutputLimitResponse;

// Sample Run Status Constants
export const SampleStatus = {
  IDLE: "IDLE",
  IN_QUEUE: "IN_QUEUE",
  COMPILING: "COMPILING",
  RUNNING: "RUNNING",
  PASSED: "PASSED",
  FAILED: "FAILED",
  ERROR: "ERROR",
  COMPILE_ERROR: "COMPILE_ERROR",
  TIME_LIMIT_EXCEEDED: "TIME_LIMIT_EXCEEDED",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  PTX: "PTX",
  SASS: "SASS",
  WARNING: "WARNING",
} as const;

// Sandbox Status Constants
export const SandboxStatus = {
  IN_QUEUE: "IN_QUEUE",
  COMPILING: "COMPILING",
  PTX: "PTX",
  SASS: "SASS",
  WARNING: "WARNING",
  SANDBOX_RUNNING: "SANDBOX_RUNNING",
  SANDBOX_OUTPUT: "SANDBOX_OUTPUT",
  SANDBOX_SUCCESS: "SANDBOX_SUCCESS",
  SANDBOX_ERROR: "SANDBOX_ERROR",
  SANDBOX_TIMEOUT: "SANDBOX_TIMEOUT",
  SANDBOX_OUTPUT_LIMIT: "SANDBOX_OUTPUT_LIMIT",
} as const;

export type SandboxStatusType =
  (typeof SandboxStatus)[keyof typeof SandboxStatus];

export type SampleStatusType = (typeof SampleStatus)[keyof typeof SampleStatus];

export type SampleEvent = {
  status: SampleStatusType;
  message?: string;
  details?: string;
  input?: unknown;
  output?: unknown;
  debug_info?: unknown;
  stdout?: string;
  stderr?: string;
  expected_output?: unknown;
};

// Sample Run Errors
export const SampleError = {
  COMPILE_ERROR: "COMPILE_ERROR",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  ERROR: "ERROR",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
} as const;

export type SampleResult = {
  status:
    | (typeof SampleStatus)[keyof typeof SampleStatus]
    | (typeof SampleError)[keyof typeof SampleError];
  message?: string;
  details?: string;
  input?: unknown;
  actual_output?: unknown;
  debug_info?: unknown;
  stdout?: string;
  stderr?: string;
  expected_output?: unknown;
};

// Added from Console.tsx
export type SampleOutput = {
  status: SampleStatusType;
  input?: string;
  output?: string;
  stdout?: string;
  stderr?: string;
  message?: string;
  details?: string;
  expected_output?: string;
  ptx?: string;
  sass?: string;
};
