export const GPU_DISPLAY_NAMES: Record<string, string> = {
  all: "All GPUs",
  T4: "Tesla T4",
  H100: "NVIDIA H100",
  H200: "NVIDIA H200",
  B200: "NVIDIA B200",
  "A100-80GB": "NVIDIA A100",
  A10G: "NVIDIA A10G",
  L40S: "NVIDIA L40S",
  L4: "NVIDIA L4",
  RTX4090: "NVIDIA GeForce RTX 4090",
  RTXA6000: "NVIDIA RTX A6000",
  RTX3090: "NVIDIA GeForce RTX 3090",
} as const;

export const gpuTypes = Object.keys(GPU_DISPLAY_NAMES);

export const LOCAL_GPU_TYPES = ["RTX4090", "RTXA6000", "RTX3090"] as const;

export function getAllowedGpuTypes(allowedGpus?: string[]): string[] {
  const hostedGpus = allowedGpus?.length
    ? allowedGpus
    : Object.keys(GPU_DISPLAY_NAMES).filter((gpu) => gpu !== "all");
  const isB200Only =
    hostedGpus.length > 0 && hostedGpus.every((gpu) => gpu === "B200");
  const localGpus = isB200Only ? [] : LOCAL_GPU_TYPES;

  return Array.from(new Set([...hostedGpus, ...localGpus]));
}

export const GPU_DISPLAY_ON_PROFILE = {
  T4: "T4",
  H100: "H100",
  H200: "H200",
  B200: "B200",
  "A100-80GB": "A100",
  A10G: "A10G",
  L40S: "L40S",
  L4: "L4",
  RTX4090: "RTX 4090",
  RTXA6000: "RTX A6000",
  RTX3090: "RTX 3090",
  none: "N/A",
} as const;
