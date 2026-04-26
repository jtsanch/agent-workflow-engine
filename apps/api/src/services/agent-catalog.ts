import { seedAgentDefinitions } from "@personal-agent-os/agent-sdk";
import type { AgentDefinition } from "@personal-agent-os/shared";

export class AgentCatalogService {
  list(): AgentDefinition[] {
    return seedAgentDefinitions;
  }

  getByKey(agentDefinitionKey: string): AgentDefinition | null {
    return seedAgentDefinitions.find((agent) => agent.key === agentDefinitionKey) ?? null;
  }

  getByDagId(dagId: string): AgentDefinition | null {
    return seedAgentDefinitions.find((agent) => agent.dag.id === dagId) ?? null;
  }
}
