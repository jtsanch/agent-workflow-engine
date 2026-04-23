import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AgentDefinition, Job, NodeExecution, NodeFeedback, ToolInvocation } from "@personal-agent-os/shared";
import { Button } from "../components/Button.js";
import { DAGWorkflowViewer, type WorkflowEdge, type WorkflowNode } from "../components/DAGWorkflowViewer.js";
import { PageHeader } from "../components/PageHeader.js";
import { getRun, listAgents, listJobs, listRuns } from "../lib/api.js";

interface RunListItem {
  id: string;
  jobId: string;
  status: string;
  triggerSource: "manual" | "schedule" | "api";
  startedAt: string;
  output?: unknown;
  toolInvocations: ToolInvocation[];
  nodeExecutions: NodeExecution[];
  nodeFeedback: NodeFeedback[];
}

function formatRunTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTrigger(triggerSource: RunListItem["triggerSource"]): string {
  switch (triggerSource) {
    case "schedule":
      return "Scheduled";
    case "api":
      return "API";
    default:
      return "Manual";
  }
}

function formatJobType(agent?: AgentDefinition, job?: Job): string {
  const source = agent?.name ?? job?.name ?? job?.agentDefinitionKey ?? "Workflow";
  const formatted = source
    .replace(/weekly/gi, "")
    .replace(/planner/gi, "")
    .replace(/agent/gi, "")
    .replace(/-/g, " ")
    .trim();

  return formatted || "Workflow";
}

function getRunStatusClass(status: string): string {
  switch (status) {
    case "running":
      return "workflow-status-running";
    case "succeeded":
      return "workflow-status-success";
    case "failed":
      return "workflow-status-error";
    default:
      return "workflow-status-idle";
  }
}

function getNodeStatus(execution?: NodeExecution): WorkflowNode["status"] {
  if (execution?.status === "succeeded") {
    return "success";
  }

  if (execution?.status === "running") {
    return "running";
  }

  if (execution?.status === "failed" || execution?.status === "retry_scheduled") {
    return "error";
  }

  return "idle";
}

function getNodeStatusLabel(execution?: NodeExecution): string {
  if (!execution) {
    return "idle";
  }

  if (execution.status === "retry_scheduled") {
    return "retry scheduled";
  }

  return execution.status;
}

export function RunsPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [refreshingRunId, setRefreshingRunId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([listRuns(), listJobs(), listAgents()]).then(([runItems, jobItems, agentItems]) => {
      setRuns(runItems);
      setJobs(jobItems);
      setAgents(agentItems);
    });
  }, []);

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job] as const)), [jobs]);
  const agentsByRunId = useMemo(() => {
    const entries = runs.map((run) => {
      const job = jobsById.get(run.jobId);
      const agent = agents.find(
        (currentAgent) => currentAgent.dag.id === job?.dagId || currentAgent.key === job?.agentDefinitionKey
      );

      return [run.id, agent] as const;
    });

    return new Map(entries);
  }, [agents, jobsById, runs]);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const selectedJob = selectedRun ? jobsById.get(selectedRun.jobId) : undefined;
  const selectedAgent = selectedRun ? agentsByRunId.get(selectedRun.id) : undefined;

  const nodeExecutionById = useMemo(
    () =>
      Object.fromEntries(
        (selectedRun?.nodeExecutions ?? []).map((execution) => [execution.nodeId, execution] as const)
      ),
    [selectedRun]
  );
  const nodeFeedbackByNodeId = useMemo(
    () =>
      Object.fromEntries(
        (selectedRun?.nodeFeedback ?? []).map((feedback) => [feedback.sourceNodeId, feedback] as const)
      ),
    [selectedRun]
  );

  const workflowNodes: WorkflowNode[] = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    return selectedAgent.dag.nodes.map((node) => {
      const execution = nodeExecutionById[node.id];
      const feedback = nodeFeedbackByNodeId[node.id];
      const outputPayload =
        execution?.output?.data ??
        execution?.output ??
        {};
      const output: ReactNode = (
        <div className="workflow-output-stack">
          <div className="detail-grid">
            <article className="detail-item">
              <strong>Status</strong>
              <p>{getNodeStatusLabel(execution)}</p>
            </article>
            <article className="detail-item">
              <strong>Retries</strong>
              <p>{execution?.retryCount ?? 0}</p>
            </article>
            <article className="detail-item">
              <strong>Latency</strong>
              <p>{execution ? `${execution.latencyMs} ms` : "n/a"}</p>
            </article>
            <article className="detail-item">
              <strong>Tokens</strong>
              <p>{execution?.tokenUsage ?? 0}</p>
            </article>
          </div>

          {feedback ? (
            <article className="detail-note">
              <strong>Evaluator feedback</strong>
              <p>{feedback.summary}</p>
              <p className="muted">
                Score: {feedback.score} {feedback.shouldRetry ? "· Retry suggested" : "· Approved"}
              </p>
            </article>
          ) : null}

          <article className="detail-note">
            <strong>Output</strong>
            <pre>{JSON.stringify(outputPayload, null, 2)}</pre>
          </article>
        </div>
      );

      return {
        id: node.id,
        title: node.name,
        kind: node.type,
        status: getNodeStatus(execution),
        output
      };
    });
  }, [nodeExecutionById, nodeFeedbackByNodeId, selectedAgent]);

  const workflowEdges: WorkflowEdge[] = useMemo(
    () =>
      selectedAgent?.dag.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.type
      })) ?? [],
    [selectedAgent]
  );

  const selectedNode = selectedNodeId
    ? workflowNodes.find((node) => node.id === selectedNodeId)
    : undefined;
  const isDagOpen = expandedRunId !== null;

  async function handleFlowToggle(run: RunListItem) {
    const isOpen = expandedRunId === run.id;
    if (isOpen) {
      setExpandedRunId(null);
      return;
    }

    setSelectedRunId(run.id);
    setSelectedNodeId(null);

    if (run.status === "queued" || run.status === "running") {
      setRefreshingRunId(run.id);
      try {
        const refreshedRun = await getRun(run.id);
        setRuns((currentRuns) =>
          currentRuns.map((candidate) => (candidate.id === refreshedRun.id ? refreshedRun : candidate))
        );
      } finally {
        setRefreshingRunId(null);
      }
    }

    setExpandedRunId(run.id);
  }

  return (
    <section>
      <PageHeader
        title="Runs"
        description="Review each run as a workflow. Expand steps, open the DAG, and inspect node outputs, retries, and feedback in one place."
      />

      <div className="runs-stack">
        {runs.map((run) => {
          const job = jobsById.get(run.jobId);
          const agent = agentsByRunId.get(run.id);
          const dagVisible = expandedRunId === run.id;
          const isSelected = selectedRun?.id === run.id;

          return (
            <article
              key={run.id}
              className={`card run-shell${isSelected ? " run-shell-active" : ""}${dagVisible ? " run-shell-dag-open" : ""}`}
            >
              <div className="run-shell-summary">
                <div className="run-shell-summary-main">
                  <div className="run-shell-summary-copy">
                    <div className="card-row run-shell-topline">
                      <h3 className="run-shell-title">{formatJobType(agent, job)}</h3>
                      <span className={`status ${getRunStatusClass(run.status)}`}>{run.status}</span>
                    </div>

                    <div className="run-shell-meta">
                      <p>
                        <strong>Run:</strong> {formatRunTime(run.startedAt)}
                      </p>
                      <p>
                        <strong>Trigger:</strong> {formatTrigger(run.triggerSource)}
                      </p>
                      <p>
                        <strong>Workflow:</strong> v{agent?.dag.version ?? "n/a"}
                      </p>
                    </div>

                    <div className="run-shell-actions">
                      <Button
                        variant="subtle"
                        onClick={() => void handleFlowToggle(run)}
                        disabled={refreshingRunId === run.id}
                      >
                        {dagVisible ? "Hide Flow" : refreshingRunId === run.id ? "Refreshing..." : "View Flow"}
                      </Button>
                    </div>
                  </div>

                  {dagVisible ? (
                    <div className="run-shell-flow">
                      {isSelected && selectedAgent ? (
                        <DAGWorkflowViewer
                          title={selectedAgent.dag.name}
                          nodes={workflowNodes}
                          edges={workflowEdges}
                          selectedNodeId={selectedNodeId}
                          onSelectNode={(nodeId) => {
                            setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
                          }}
                          showHeader={false}
                        />
                      ) : (
                        <article className="card empty">Select this run to inspect its DAG.</article>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {dagVisible && isSelected && selectedNode ? (
                <section className="workflow-inspector run-shell-inspector">
                  <div className="card-row">
                    <div>
                      <p className="eyebrow">Inspector Panel</p>
                      <h3>{selectedNode.title}</h3>
                    </div>
                    <div className="workflow-inspector-actions">
                      <span className={`status workflow-status-${selectedNode.status ?? "idle"}`}>
                        {selectedNode.status ?? "idle"}
                      </span>
                      <Button variant="subtle" size="sm" onClick={() => setSelectedNodeId(null)}>
                        Close
                      </Button>
                    </div>
                  </div>

                  <div className="workflow-output-panel">
                    {selectedNode.output}
                  </div>
                </section>
              ) : null}
            </article>
          );
        })}

        {runs.length === 0 ? <article className="card empty">No runs have been simulated yet.</article> : null}
      </div>
    </section>
  );
}
