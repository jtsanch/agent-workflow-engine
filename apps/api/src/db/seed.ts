import type { DatabaseTables } from "./database.js";

export function createSeedTables(): DatabaseTables {
  return {
    jobs: [],
    schedules: [],
    alertPreferences: [],
    runs: [],
    runSteps: [],
    toolInvocations: [],
    nodeExecutions: [],
    nodeFeedback: [],
    memories: [],
    feedbackEvents: []
  };
}
