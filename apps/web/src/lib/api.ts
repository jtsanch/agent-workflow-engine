import type {
  AgentDefinition,
  CreateJobInput,
  Job,
  JobRun,
  NodeExecution,
  NodeFeedback,
  ToolInvocation
} from "@personal-agent-os/shared";

const apiBaseUrl = "http://localhost:4000";

export type HydratedRun = JobRun & {
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
};

export interface SearchResponse {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedAt?: string;
    source?: string;
    score?: number;
    raw?: unknown;
  }>;
  metadata?: {
    total?: number;
    provider: string;
    latencyMs: number;
  };
}

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

export async function createJob(input: CreateJobInput): Promise<Job> {
  const response = await fetch(`${apiBaseUrl}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  return payload.item;
}

export async function listRuns(): Promise<HydratedRun[]> {
  const response = await fetch(`${apiBaseUrl}/runs`);
  const payload = await response.json();
  return payload.items;
}

export async function getRun(runId: string): Promise<HydratedRun> {
  const response = await fetch(`${apiBaseUrl}/runs/${runId}`);
  const payload = await response.json();
  return payload.item;
}

export async function searchCatalog(input: {
  query?: string;
  zipcode?: string;
  stores?: string;
  category?: string;
}): Promise<SearchResponse> {
  const params = new URLSearchParams();
  if (input.query) {
    params.set("query", input.query);
  }
  if (input.zipcode) {
    params.set("zipcode", input.zipcode);
  }
  if (input.stores) {
    params.set("stores", input.stores);
  }
  if (input.category) {
    params.set("category", input.category);
  }

  const response = await fetch(`${apiBaseUrl}/search?${params.toString()}`);
  const payload = await response.json();
  return payload.item;
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

export async function executeRun(jobId: string): Promise<JobRun> {
  const response = await fetch(`${apiBaseUrl}/runs/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  const payload = await response.json();
  return payload.item;
}
