import { env } from "~/env";

export const engineAuthHeaders = (): Record<string, string> => {
  if (!env.LOCAL_ENGINE_TOKEN) return {};

  return { Authorization: `Bearer ${env.LOCAL_ENGINE_TOKEN}` };
};
