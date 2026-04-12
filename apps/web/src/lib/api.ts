import type { AgentDefinition, Job, JobRun, NodeExecution, NodeFeedback } from "@personal-agent-os/shared";

const apiBaseUrl = "http://localhost:4000";

export async function listAgents(): Promise<AgentDefinition[]> {
  const response = await fetch(`${apiBaseUrl}/agents`);
  const payload = await response.json();
  return payload.items;
}

export async function listJobs(): Promise<Array<Job & { schedule?: { scheduleExpression: string } }>> {
  const response = await fetch(`${apiBaseUrl}/jobs`);
  const payload = await response.json();
  return payload.items;
}

export async function createJob(input: Record<string, unknown>): Promise<Job> {
  const response = await fetch(`${apiBaseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  return payload.item;
}

export async function listRuns(): Promise<Array<JobRun & { steps: Array<{ name: string; status: string; detail?: Record<string, unknown> }>; nodeExecutions: NodeExecution[]; nodeFeedback: NodeFeedback[] }>> {
  const response = await fetch(`${apiBaseUrl}/runs`);
  const payload = await response.json();
  return payload.items;
}

export async function queueRun(jobId: string): Promise<JobRun> {
  const response = await fetch(`${apiBaseUrl}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  const payload = await response.json();
  return payload.item;
}

export async function simulateRun(jobId: string): Promise<JobRun> {
  const response = await fetch(`${apiBaseUrl}/runs/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  const payload = await response.json();
  return payload.item;
}
