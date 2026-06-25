export const SINGLE_GPU_TYPE = "RTXA6000";
export const SINGLE_GPU_DISPLAY_NAME = "NVIDIA RTX A6000";

export const GPU_DISPLAY_NAMES: Record<string, string> = {
  all: SINGLE_GPU_DISPLAY_NAME,
  [SINGLE_GPU_TYPE]: SINGLE_GPU_DISPLAY_NAME,
} as const;

export const gpuTypes = Object.keys(GPU_DISPLAY_NAMES);

export const LOCAL_GPU_TYPES = [SINGLE_GPU_TYPE] as const;

export function normalizeGpuType(_gpuType?: string | null): string {
  return SINGLE_GPU_TYPE;
}

export function getAllowedGpuTypes(_allowedGpus?: string[]): string[] {
  return [SINGLE_GPU_TYPE];
}

export const GPU_DISPLAY_ON_PROFILE = {
  RTXA6000: "RTX A6000",
  none: "N/A",
} as const;
