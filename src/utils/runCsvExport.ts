import type { Prisma, SubmissionModerationStatus } from "@prisma/client";

type JsonValue = Prisma.JsonValue | null | undefined;

export type ExportRun = {
  id: string;
  runIndex: number;
  runtimeMs: number;
  gflops: number | null;
  gpuMetrics?: JsonValue;
};

export type ExportTestResult = {
  testId: number;
  name: string;
  avgRuntimeMs: number;
  avgGflops: number | null;
  runs?: ExportRun[];
};

export type ExportSubmission = {
  id: string;
  createdAt: Date | string;
  status: string | null;
  moderationStatus?: SubmissionModerationStatus | null;
  runtime: number | null;
  gflops: number | null;
  language: string;
  gpuType: string | null;
  passedTests?: number | null;
  totalTests?: number | null;
  isPublic?: boolean;
  user?: {
    username: string | null;
  } | null;
  problem?: {
    title: string;
    slug: string;
  } | null;
  testResults?: ExportTestResult[];
};

type CsvValue = string | number | boolean | null | undefined;
type CsvRow = Record<string, CsvValue>;

const baseHeaders = [
  "submission_id",
  "created_at",
  "username",
  "problem_slug",
  "problem_title",
  "status",
  "moderation_status",
  "language",
  "gpu_type",
  "passed_tests",
  "total_tests",
  "submission_runtime_ms",
  "submission_gflops",
  "is_public",
] as const;

const testFields = [
  "name",
  "avg_runtime_ms",
  "avg_gflops",
  "run_count",
  "temp_c_mean",
  "sm_clock_mhz_mean",
  "sample_count",
  "power_w_mean",
  "gpu_utilization_pct_mean",
  "memory_utilization_pct_mean",
  "memory_used_mb_mean",
  "memory_total_mb_mean",
  "throttle_reasons_any",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numericMetric = (metrics: JsonValue, field: string): number | null => {
  if (!isRecord(metrics)) return null;
  const value = metrics[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const weightedMetricAverage = (
  runs: ExportRun[],
  field: string
): number | null => {
  let weightedSum = 0;
  let totalWeight = 0;

  runs.forEach((run) => {
    const value = numericMetric(run.gpuMetrics, field);
    if (value === null) return;

    const sampleCount = numericMetric(run.gpuMetrics, "sample_count");
    const weight = sampleCount && sampleCount > 0 ? sampleCount : 1;
    weightedSum += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : null;
};

const sampleCountTotal = (runs: ExportRun[]): number | null => {
  let total = 0;

  runs.forEach((run) => {
    const sampleCount = numericMetric(run.gpuMetrics, "sample_count");
    if (sampleCount !== null) total += sampleCount;
  });

  return total > 0 ? total : null;
};

const throttleReasonsAny = (runs: ExportRun[]): number | null => {
  let bitmask = 0;
  let hasValue = false;

  runs.forEach((run) => {
    const value = numericMetric(run.gpuMetrics, "throttle_reasons_any");
    if (value === null) return;
    bitmask |= value;
    hasValue = true;
  });

  return hasValue ? bitmask : null;
};

const csvCell = (value: CsvValue) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const toIsoString = (value: Date | string) => {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const getSortedTests = (submission: ExportSubmission) =>
  [...(submission.testResults ?? [])].sort((a, b) => a.testId - b.testId);

const testHeader = (testNumber: number, field: (typeof testFields)[number]) =>
  `test_${testNumber}_${field}`;

export function buildRunsCsv(submissions: ExportSubmission[]) {
  const maxTestCount = Math.max(
    0,
    ...submissions.map((submission) => getSortedTests(submission).length)
  );

  const headers: string[] = [...baseHeaders];
  for (let index = 1; index <= maxTestCount; index++) {
    testFields.forEach((field) => headers.push(testHeader(index, field)));
  }

  const rows = submissions.map((submission): CsvRow => {
    const row: CsvRow = {
      submission_id: submission.id,
      created_at: toIsoString(submission.createdAt),
      username: submission.user?.username,
      problem_slug: submission.problem?.slug,
      problem_title: submission.problem?.title,
      status: submission.status,
      moderation_status: submission.moderationStatus,
      language: submission.language,
      gpu_type: submission.gpuType,
      passed_tests: submission.passedTests,
      total_tests: submission.totalTests,
      submission_runtime_ms: submission.runtime,
      submission_gflops: submission.gflops,
      is_public: submission.isPublic,
    };

    getSortedTests(submission).forEach((testResult, index) => {
      const testNumber = index + 1;
      const runs = testResult.runs ?? [];

      row[testHeader(testNumber, "name")] = testResult.name;
      row[testHeader(testNumber, "avg_runtime_ms")] = testResult.avgRuntimeMs;
      row[testHeader(testNumber, "avg_gflops")] = testResult.avgGflops;
      row[testHeader(testNumber, "run_count")] = runs.length || null;
      row[testHeader(testNumber, "temp_c_mean")] = weightedMetricAverage(
        runs,
        "temp_c_mean"
      );
      row[testHeader(testNumber, "sm_clock_mhz_mean")] = weightedMetricAverage(
        runs,
        "sm_clock_mhz_mean"
      );
      row[testHeader(testNumber, "sample_count")] = sampleCountTotal(runs);
      row[testHeader(testNumber, "power_w_mean")] = weightedMetricAverage(
        runs,
        "power_w_mean"
      );
      row[testHeader(testNumber, "gpu_utilization_pct_mean")] =
        weightedMetricAverage(runs, "gpu_utilization_pct_mean");
      row[testHeader(testNumber, "memory_utilization_pct_mean")] =
        weightedMetricAverage(runs, "memory_utilization_pct_mean");
      row[testHeader(testNumber, "memory_used_mb_mean")] =
        weightedMetricAverage(runs, "memory_used_mb_mean");
      row[testHeader(testNumber, "memory_total_mb_mean")] =
        weightedMetricAverage(runs, "memory_total_mb_mean");
      row[testHeader(testNumber, "throttle_reasons_any")] =
        throttleReasonsAny(runs);
    });

    return row;
  });

  return [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(",")
    ),
  ].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
