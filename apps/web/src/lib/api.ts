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

declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken(): Promise<string | null>;
      };
    };
  }
}

export type HydratedRun = JobRun & {
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
};

export interface AppAuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "active" | "disabled";
  role: "admin" | "user";
}

export interface AppUsage {
  dailyUsed: number;
  dailyLimit: number;
  monthlyUsed: number;
  monthlyLimit: number;
  perRunLimit: number;
}

export interface AppAuthResponse {
  user: AppAuthUser;
  usage: AppUsage;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: "active" | "disabled";
  role: "admin" | "user";
  usage: AppUsage;
}

export interface AdminUsersResponse {
  users: AdminUserRecord[];
  nextCursor?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

async function getAuthHeaders(headers?: HeadersInit): Promise<Headers> {
  const token = await window.Clerk?.session?.getToken();
  if (!token) {
    throw new Error("Missing Clerk auth token");
  }

  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${token}`);
  return nextHeaders;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: await getAuthHeaders(init?.headers)
  });

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiError(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
        response.status);
  }
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.error?.code
    );
  }

  return payload as T;
}

export async function listAgents(): Promise<AgentDefinition[]> {
  const payload = await fetchJson<{ items: AgentDefinition[] }>("/agents");
  return payload.items;
}

export async function getAuthMe(): Promise<AppAuthResponse> {
  return fetchJson<AppAuthResponse>("/auth/me");
}

export async function listJobs(): Promise<Array<Job & { schedule?: { scheduleExpression: string } }>> {
  const payload = await fetchJson<{ items: Array<Job & { schedule?: { scheduleExpression: string } }> }>("/jobs");
  return payload.items;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const payload = await fetchJson<{ item: Job }>("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return payload.item;
}

export async function listRuns(): Promise<HydratedRun[]> {
  const payload = await fetchJson<{ items: HydratedRun[] }>("/runs");
  return payload.items;
}

export async function getRun(runId: string): Promise<HydratedRun> {
  const payload = await fetchJson<{ item: HydratedRun }>(`/runs/${runId}`);
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

  const payload = await fetchJson<{ item: SearchResponse }>(`/search?${params.toString()}`);
  return payload.item;
}

export async function queueRun(jobId: string): Promise<JobRun> {
  const payload = await fetchJson<{ item: JobRun }>("/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  return payload.item;
}

export async function listAdminUsers(cursor?: string, limit?: number): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set("cursor", cursor);
  }
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }

  const query = params.toString();
  return fetchJson<AdminUsersResponse>(query ? `/admin/users?${query}` : "/admin/users");
}

export async function enableUser(userId: string): Promise<void> {
  await fetchJson<null>(`/admin/users/${userId}/enable`, {
    method: "POST"
  });
}

export async function disableUser(userId: string): Promise<void> {
  await fetchJson<null>(`/admin/users/${userId}/disable`, {
    method: "POST"
  });
}
