import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { listRuns } from "../lib/api.js";

interface RunListItem {
  id: string;
  jobId: string;
  status: string;
  output?: Record<string, unknown>;
  steps: Array<{ name: string; status: string }>;
}

export function RunsPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);

  useEffect(() => {
    void listRuns().then(setRuns);
  }, []);

  return (
    <section>
      <PageHeader
        title="Runs"
        description="Runs show the latest execution trail for each job, including step-level output for debugging and evaluation."
      />
      <div className="card-list">
        {runs.map((run) => (
          <article key={run.id} className="card">
            <div className="card-row">
              <div>
                <h3>{run.id}</h3>
                <p>Job: {run.jobId}</p>
              </div>
              <span className={`status status-${run.status}`}>{run.status}</span>
            </div>
            <p>{String(run.output?.summary ?? "No output summary")}</p>
            <div className="pill-row">
              {run.steps.map((step) => (
                <span key={step.name} className="pill">
                  {step.name}
                </span>
              ))}
            </div>
          </article>
        ))}
        {runs.length === 0 ? <article className="card empty">No runs have been simulated yet.</article> : null}
      </div>
    </section>
  );
}

