import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const createToolRegistry = vi.fn(() => ({
  execute
}));

vi.mock("@personal-agent-os/agent-sdk", () => ({
  createToolRegistry
}));

describe("SearchService", () => {
  beforeEach(() => {
    execute.mockReset();
    createToolRegistry.mockClear();
  });

  it("executes web search through the tool registry", async () => {
    execute.mockResolvedValue({
      results: [{ title: "Deal" }]
    });

    const { SearchService } = await import("../../../src/services/search-service.js");
    const service = new SearchService();
    const input = {
      query: "grocery deals",
      zipcode: "94107",
      stores: "Trader Joe's,Costco",
      category: "daily grocery deals"
    };

    await expect(service.search(input)).resolves.toEqual({
      results: [{ title: "Deal" }]
    });
    expect(createToolRegistry).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(
      "web_search.search",
      input,
      expect.objectContaining({
        registry: expect.any(Object),
        logger: expect.objectContaining({
          info: expect.any(Function)
        }),
        now: expect.any(Function)
      })
    );
    const context = execute.mock.calls[0]?.[2];
    const now = context.now();
    expect(new Date(now).toISOString()).toBe(now);
  });
});
