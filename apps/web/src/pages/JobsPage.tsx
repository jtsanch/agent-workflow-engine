import { useEffect, useState } from "react";
import { Button } from "../components/Button.js";
import { PageHeader } from "../components/PageHeader.js";
import { listJobs, queueRun } from "../lib/api.js";

interface JobListItem {
  id: string;
  name: string;
  dagId: string;
  agentDefinitionKey?: string;
  status: string;
  schedule?: {
    scheduleExpression: string;
  } | null;
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobListItem[]>([]);

  async function refresh() {
    setJobs(await listJobs());
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section>
      <PageHeader
        title="Jobs"
        description="Jobs are the first-class control plane object: an agent definition, user config, schedule, and alerts."
      />
      <div className="card-list">
        {jobs.map((job) => (
          <article key={job.id} className="card">
            <div className="card-row">
              <div>
                <h3>{job.name}</h3>
                <p>{job.dagId}{job.agentDefinitionKey ? ` · ${job.agentDefinitionKey}` : ""}</p>
              </div>
              <span className={`status status-${job.status}`}>{job.status}</span>
            </div>
            <p>{job.schedule?.scheduleExpression ?? "No schedule found"}</p>
            <div className="job-card-actions">
              <Button
                variant="secondary"
                onClick={async () => {
                  await queueRun(job.id);
                  await refresh();
                }}
              >
                Queue Run
              </Button>
            </div>
          </article>
        ))}
        {jobs.length === 0 ? <article className="card empty">No jobs created yet.</article> : null}
      </div>
    </section>
  );
}
