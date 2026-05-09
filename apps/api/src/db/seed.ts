import type { DatabaseTables } from "./database.js";

export function createSeedTables(): DatabaseTables {
  return {
    users: [],
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
