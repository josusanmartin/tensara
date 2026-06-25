import { db } from "~/server/db";

export type ProfilingOptions = {
  min_iterations?: number;
  max_iterations?: number;
  target_cv?: number;
  sample_interval_ms?: number;
  long_kernel_threshold?: number;
  include_raw_samples?: boolean;
  include_cuda_kernel_profile?: boolean;
  cuda_kernel_profile_top_k?: number;
};

const clampNumber = (
  value: unknown,
  defaultValue: number,
  min: number,
  max: number
) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
};

export const normalizeProfilingOptions = (
  input: ProfilingOptions | undefined
): ProfilingOptions | undefined => {
  if (!input) return undefined;

  const minIterations = Math.round(clampNumber(input.min_iterations, 5, 1, 50));
  const maxIterations = Math.round(
    clampNumber(input.max_iterations, 20, minIterations, 200)
  );

  return {
    min_iterations: minIterations,
    max_iterations: maxIterations,
    target_cv: clampNumber(input.target_cv, 0.01, 0.001, 0.25),
    sample_interval_ms: Math.round(
      clampNumber(input.sample_interval_ms, 5, 1, 1000)
    ),
    long_kernel_threshold: clampNumber(
      input.long_kernel_threshold,
      1,
      0.01,
      30
    ),
    include_raw_samples: input.include_raw_samples !== false,
    include_cuda_kernel_profile: input.include_cuda_kernel_profile === true,
    cuda_kernel_profile_top_k: Math.round(
      clampNumber(input.cuda_kernel_profile_top_k, 25, 1, 100)
    ),
  };
};

export const canUserUseProfiler = async (userId: string) => {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { canUseProfiler: true, isActive: true },
  });

  return user?.isActive === true && user.canUseProfiler === true;
};
