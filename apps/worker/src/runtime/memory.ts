import type { JobMemory } from "@personal-agent-os/shared";

export function updateMemory(jobId: string, output: Record<string, unknown>): JobMemory {
  return {
    id: `memory_${jobId}`,
    jobId,
    key: "latest-output",
    value: output,
    updatedAt: new Date().toISOString()
  };
}

