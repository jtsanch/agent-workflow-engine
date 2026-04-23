import type { ToolMap } from "../types.js";
import { LlmGenerateTextTool } from "./llm-generate-text-tool.js";
import { NotificationsSendTool } from "./notifications-send-tool.js";
import { WebSearchTool } from "./web-search-tool.js";

export { BaseTool } from "./base-tool.js";
export { LlmGenerateTextTool } from "./llm-generate-text-tool.js";
export { NotificationsSendTool } from "./notifications-send-tool.js";
export { WebSearchTool } from "./web-search-tool.js";

export function createDefaultTools(): Array<ToolMap[keyof ToolMap]> {
  return [new WebSearchTool(), new LlmGenerateTextTool(), new NotificationsSendTool()];
}
