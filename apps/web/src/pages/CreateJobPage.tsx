import { useEffect, useState } from "react";
import type { AgentDefinition } from "@personal-agent-os/shared";
import type { UiField } from "@personal-agent-os/ui-schema";
import { PageHeader } from "../components/PageHeader.js";
import { DAGPreview } from "../components/DAGPreview.js";
import { createJob, listAgents } from "../lib/api.js";

function getDefaultValue(field: UiField): string {
  if (field.defaultValue === undefined) {
    return field.type === "boolean" ? "false" : "";
  }
  return String(field.defaultValue);
}

export function CreateJobPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>("");
  const [formState, setFormState] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    void listAgents().then((items) => {
      setAgents(items);
      const first = items[0];
      if (first) {
        setSelectedAgentKey(first.key);
        const defaults = Object.fromEntries(
          first.uiSchema.sections.flatMap((section) => section.fields.map((field) => [field.name, getDefaultValue(field)]))
        );
        setFormState(defaults);
      }
    });
  }, []);

  const selectedAgent = agents.find((agent) => agent.key === selectedAgentKey);

  return (
    <section>
      <PageHeader
        title="Create Job"
        description="The form is rendered from the selected agent definition UI schema so new agent experiences can stay configuration-first."
      />

      <form
        className="form card"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!selectedAgent) {
            return;
          }

          const input = Object.fromEntries(
            selectedAgent.uiSchema.sections.flatMap((section) =>
              section.fields.map((field) => {
                const rawValue = formState[field.name] ?? "";
                if (field.type === "number") {
                  return [field.name, Number(rawValue)];
                }
                if (field.type === "boolean") {
                  return [field.name, rawValue === "true"];
                }
                return [field.name, rawValue];
              })
            )
          );

          await createJob({
            agentDefinitionKey: selectedAgent.key,
            dagId: selectedAgent.dag.id,
            name: `${selectedAgent.name} Job`,
            scheduleExpression: selectedAgent.defaultSchedule,
            timezone: "America/Los_Angeles",
            inputs: input,
            alertPreferences: [
              {
                channel: "email",
                destination: String(input.email ?? "demo@example.com"),
                onSuccess: true,
                onFailure: true
              }
            ]
          });

          setMessage("Job created. Visit the Jobs page to simulate a run.");
        }}
      >
        <label>
          Agent Definition
          <select
            value={selectedAgentKey}
            onChange={(event) => {
              const nextKey = event.target.value;
              setSelectedAgentKey(nextKey);
              const nextAgent = agents.find((agent) => agent.key === nextKey);
              if (nextAgent) {
                setFormState(
                  Object.fromEntries(
                    nextAgent.uiSchema.sections.flatMap((section) =>
                      section.fields.map((field) => [field.name, getDefaultValue(field)])
                    )
                  )
                );
              }
            }}
          >
            {agents.map((agent) => (
              <option key={agent.key} value={agent.key}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        {selectedAgent?.uiSchema.sections.map((section) => (
          <div key={section.title} className="section">
            <div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </div>
            {section.fields.map((field) => (
              <label key={field.name}>
                {field.label}
                {field.type === "select" ? (
                  <select
                    value={formState[field.name] ?? ""}
                    onChange={(event) => setFormState((current) => ({ ...current, [field.name]: event.target.value }))}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    value={formState[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setFormState((current) => ({ ...current, [field.name]: event.target.value }))}
                  />
                ) : field.type === "boolean" ? (
                  <select
                    value={formState[field.name] ?? "false"}
                    onChange={(event) => setFormState((current) => ({ ...current, [field.name]: event.target.value }))}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={formState[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => setFormState((current) => ({ ...current, [field.name]: event.target.value }))}
                  />
                )}
              </label>
            ))}
          </div>
        ))}

        {selectedAgent ? <DAGPreview agentDefinition={selectedAgent} /> : null}

        <button type="submit">Create Job</button>
        {message ? <p className="success">{message}</p> : null}
      </form>
    </section>
  );
}
