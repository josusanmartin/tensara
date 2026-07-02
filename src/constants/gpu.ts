function readConfiguredValue(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed;
}

const configuredGpuType = readConfiguredValue(
  process.env.NEXT_PUBLIC_TENSARA_GPU_TYPE
);
const configuredGpuDisplayName = readConfiguredValue(
  process.env.NEXT_PUBLIC_TENSARA_GPU_DISPLAY_NAME
);

export const SINGLE_GPU_TYPE = configuredGpuType ?? "RTX5090";
export const SINGLE_GPU_DISPLAY_NAME =
  configuredGpuDisplayName ?? "NVIDIA GeForce RTX 5090";

const shortGpuDisplayName = SINGLE_GPU_DISPLAY_NAME.replace(
  /^NVIDIA\s+(GeForce\s+)?/,
  ""
);

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

export const GPU_DISPLAY_ON_PROFILE: Record<string, string> = {
  [SINGLE_GPU_TYPE]: shortGpuDisplayName,
  none: "N/A",
} as const;
