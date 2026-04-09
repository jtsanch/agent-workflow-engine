export function evaluateRun(output: Record<string, unknown>): { score: number; summary: string } {
  return {
    score: 0.82,
    summary: `Run completed with output keys: ${Object.keys(output).join(", ")}`
  };
}

