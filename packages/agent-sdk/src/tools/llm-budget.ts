import type { ExecutionContext, LlmBudget } from "../types.js";

export const DEFAULT_LLM_RUN_BUDGET = 5000;
export const DEFAULT_LLM_WARNING_THRESHOLD = 7500;
export const DEFAULT_LLM_MAX_TOKENS_PER_CALL = 800;

export function createLlmBudget(): LlmBudget {
  return {
    maxTokens: DEFAULT_LLM_RUN_BUDGET,
    warningThreshold: DEFAULT_LLM_WARNING_THRESHOLD,
    consumedTokens: 0,
    warningLogged: false
  };
}

export function trackLlmTokens(context: ExecutionContext, tokensUsed: number): void {
  const budget = context.llmBudget;
  if (!budget || tokensUsed <= 0) {
    return;
  }

  budget.consumedTokens += tokensUsed;

  if (!budget.warningLogged && budget.consumedTokens >= budget.warningThreshold) {
    logBudgetWarning(context, budget);
    budget.warningLogged = true;
  }

  if (budget.consumedTokens > budget.maxTokens) {
    logBudgetExceeded(context, budget);
    throw new Error(
      `LLM token budget exceeded: used ${budget.consumedTokens} tokens of ${budget.maxTokens} for this run`
    );
  }
}

function logBudgetWarning(context: ExecutionContext, budget: LlmBudget): void {
  const log = context.logger.warn ?? context.logger.info;
  log("LLM token usage is nearing the run budget", {
    consumedTokens: budget.consumedTokens,
    warningThreshold: budget.warningThreshold,
    maxTokens: budget.maxTokens
  });
}

function logBudgetExceeded(context: ExecutionContext, budget: LlmBudget): void {
  const log = context.logger.warn ?? context.logger.info;
  log("LLM token usage exceeded the run budget", {
    consumedTokens: budget.consumedTokens,
    maxTokens: budget.maxTokens
  });
}
