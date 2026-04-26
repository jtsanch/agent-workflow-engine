import { describe, expect, it } from "vitest";
import type { AgentDAG } from "@personal-agent-os/shared";
import { buildGraph } from "../../../src/runtime/build-graph.js";

describe("buildGraph", () => {
  it("builds forward and reverse dependencies for node output bindings", () => {
    const dag: AgentDAG = {
      id: "dag_graph",
      version: "1.0.0",
      name: "Graph DAG",
      nodes: [
        {
          id: "source",
          version: "1.0.0",
          type: "transform",
          name: "Source",
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        },
        {
          id: "middle",
          version: "1.0.0",
          type: "transform",
          name: "Middle",
          input: {
            bindings: [
              { key: "source", ref: { source: "node_output", nodeId: "source" } },
              { key: "label", ref: { source: "static", value: "ignored" } }
            ]
          },
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        },
        {
          id: "terminal",
          version: "1.0.0",
          type: "transform",
          name: "Terminal",
          input: {
            bindings: [{ key: "middle", ref: { source: "node_output", nodeId: "middle" } }]
          },
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        },
        {
          id: "isolated",
          version: "1.0.0",
          type: "transform",
          name: "Isolated",
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        }
      ]
    };

    expect(buildGraph(dag)).toEqual({
      forward: {
        source: new Set(["middle"]),
        middle: new Set(["terminal"]),
        terminal: new Set(),
        isolated: new Set()
      },
      reverse: {
        source: new Set(),
        middle: new Set(["source"]),
        terminal: new Set(["middle"]),
        isolated: new Set()
      }
    });
  });

  it("throws when a node output binding references a node that does not exist", () => {
    const dag: AgentDAG = {
      id: "dag_missing_dependency",
      version: "1.0.0",
      name: "Missing Dependency DAG",
      nodes: [
        {
          id: "consumer",
          version: "1.0.0",
          type: "transform",
          name: "Consumer",
          input: {
            bindings: [{ key: "missing", ref: { source: "node_output", nodeId: "unknown" } }]
          },
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        }
      ]
    };

    expect(() => buildGraph(dag)).toThrow(
      'Invalid DAG: node "consumer" has an input binding that references missing node "unknown".'
    );
  });

  it("keeps a single dependency edge when multiple bindings reference the same upstream node", () => {
    const dag: AgentDAG = {
      id: "dag_duplicate_bindings",
      version: "1.0.0",
      name: "Duplicate Bindings DAG",
      nodes: [
        {
          id: "draft",
          version: "1.0.0",
          type: "transform",
          name: "Draft",
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        },
        {
          id: "review",
          version: "1.0.0",
          type: "transform",
          name: "Review",
          input: {
            bindings: [
              { key: "draftText", ref: { source: "node_output", nodeId: "draft", path: "text" } },
              { key: "draftScore", ref: { source: "node_output", nodeId: "draft", path: "score" } }
            ]
          },
          run: () => ({}),
          output: { schema: { type: "object", additionalProperties: true } }
        }
      ]
    };

    const graph = buildGraph(dag);

    expect(Array.from(graph.forward.draft)).toEqual(["review"]);
    expect(Array.from(graph.reverse.review)).toEqual(["draft"]);
  });
});

