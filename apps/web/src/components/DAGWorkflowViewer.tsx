import { useMemo } from "react";
import type { ReactNode } from "react";

export type WorkflowNode = {
  id: string;
  title: string;
  kind?: string;
  status?: "idle" | "running" | "success" | "error";
  output: ReactNode;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  kind?: string;
};

interface PositionedNode extends WorkflowNode {
  x: number;
  y: number;
  height: number;
}

interface DAGWorkflowViewerProps {
  title: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  showHeader?: boolean;
}

const NODE_WIDTH = 148;
const NODE_MIN_HEIGHT = 84;
const COLUMN_GAP = 52;
const ROW_GAP = 36;
const PADDING = 20;
const SHORTCUT_DETOUR_OFFSET = 44;
const SHORTCUT_CANVAS_PADDING = 56;
const TITLE_LINE_HEIGHT = 20;
const TITLE_CHARS_PER_LINE = 16;
const TITLE_MAX_LINES = 4;

function estimateNodeHeight(title: string): number {
  const estimatedLines = Math.max(1, Math.min(TITLE_MAX_LINES, Math.ceil(title.length / TITLE_CHARS_PER_LINE)));
  return NODE_MIN_HEIGHT + (estimatedLines - 1) * TITLE_LINE_HEIGHT;
}

function getStatusClass(status?: WorkflowNode["status"]): string {
  switch (status) {
    case "running":
      return "workflow-node-running";
    case "success":
      return "workflow-node-success";
    case "error":
      return "workflow-node-error";
    default:
      return "workflow-node-idle";
  }
}

function buildGraphMetadata(nodes: WorkflowNode[], edges: WorkflowEdge[]): {
  levels: WorkflowNode[][];
  childrenById: Map<string, string[]>;
  indegree: Map<string, number>;
} {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const childrenById = new Map<string, string[]>();
  const forwardEdges = edges.filter((edge) => edge.kind !== "feedback");

  for (const edge of forwardEdges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      continue;
    }

    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    childrenById.set(edge.from, [...(childrenById.get(edge.from) ?? []), edge.to]);
  }

  const rootIds = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const queue = [...rootIds];
  const levelById = new Map<string, number>(rootIds.map((id) => [id, 0]));

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const nextLevel = (levelById.get(currentId) ?? 0) + 1;
    for (const childId of childrenById.get(currentId) ?? []) {
      const previousLevel = levelById.get(childId);
      if (previousLevel === undefined || previousLevel < nextLevel) {
        levelById.set(childId, nextLevel);
      }

      indegree.set(childId, (indegree.get(childId) ?? 1) - 1);
      if ((indegree.get(childId) ?? 0) <= 0) {
        queue.push(childId);
      }
    }
  }

  const fallbackLevel = Math.max(...levelById.values(), 0);
  const buckets = new Map<number, WorkflowNode[]>();

  for (const node of nodes) {
    const level = levelById.get(node.id) ?? fallbackLevel + 1;
    buckets.set(level, [...(buckets.get(level) ?? []), node]);
  }

  return {
    levels: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, levelNodes]) => levelNodes),
    childrenById,
    indegree
  };
}

function hasAlternatePath(
  sourceId: string,
  targetId: string,
  childrenById: Map<string, string[]>,
  skippedEdgeKey: string
): boolean {
  const queue = [...(childrenById.get(sourceId) ?? [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    const edgeKey = `${sourceId}->${currentId}`;
    if (edgeKey === skippedEdgeKey) {
      continue;
    }

    if (currentId === targetId) {
      return true;
    }

    visited.add(currentId);
    for (const childId of childrenById.get(currentId) ?? []) {
      queue.push(childId);
    }
  }

  return false;
}

function buildForwardChildren(edges: WorkflowEdge[]): Map<string, string[]> {
  const forwardEdges = edges.filter((edge) => edge.kind !== "feedback");
  const childrenById = new Map<string, string[]>();

  for (const edge of forwardEdges) {
    childrenById.set(edge.from, [...(childrenById.get(edge.from) ?? []), edge.to]);
  }

  return childrenById;
}

function isShortcutEdge(edge: WorkflowEdge, childrenById: Map<string, string[]>): boolean {
  const siblings = childrenById.get(edge.from) ?? [];
  if (siblings.length <= 1) {
    return false;
  }

  const filteredChildren = siblings.filter((childId) => childId !== edge.to);
  const alternateChildrenById = new Map(childrenById);
  alternateChildrenById.set(edge.from, filteredChildren);

  return hasAlternatePath(edge.from, edge.to, alternateChildrenById, `${edge.from}->${edge.to}`);
}

function buildRowAssignments(
  nodes: WorkflowNode[],
  childrenById: Map<string, string[]>,
  indegree: Map<string, number>
): Map<string, number> {
  const rowById = new Map<string, number>();
  const roots = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const rootId = roots[0];
  if (!rootId) {
    return rowById;
  }

  const mainPath = new Set<string>();
  let currentId: string | undefined = rootId;
  while (currentId && !mainPath.has(currentId)) {
    mainPath.add(currentId);
    const children: string[] = childrenById.get(currentId) ?? [];
    currentId = children[0];
  }

  mainPath.forEach((nodeId) => {
    rowById.set(nodeId, 0);
  });

  let nextRow = 1;

  function assignBranch(nodeId: string, row: number, visited: Set<string>) {
    if (mainPath.has(nodeId) || visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    rowById.set(nodeId, row);

    for (const childId of childrenById.get(nodeId) ?? []) {
      assignBranch(childId, row, visited);
    }
  }

  for (const nodeId of mainPath) {
    const children: string[] = childrenById.get(nodeId) ?? [];
    const branchChildren = children.slice(1);

    for (const branchChildId of branchChildren) {
      assignBranch(branchChildId, nextRow, new Set<string>());
      nextRow += 1;
    }
  }

  nodes.forEach((node) => {
    if (!rowById.has(node.id)) {
      assignBranch(node.id, nextRow, new Set<string>());
      nextRow += 1;
    }
  });

  return rowById;
}

export function DAGWorkflowViewer({
  title,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  showHeader = true
}: DAGWorkflowViewerProps) {
  const { positionedNodes, width, height } = useMemo(() => {
    const { levels, childrenById, indegree } = buildGraphMetadata(nodes, edges);
    const rowById = buildRowAssignments(nodes, childrenById, indegree);
    const positioned: PositionedNode[] = [];
    const maxRows = Math.max(...[...rowById.values()].map((value) => value + 1), 1);
    const rowHeights = Array.from({ length: maxRows }, (_, rowIndex) =>
      Math.max(
        ...nodes.map((node) => {
          if ((rowById.get(node.id) ?? -1) !== rowIndex) {
            return NODE_MIN_HEIGHT;
          }

          return estimateNodeHeight(node.title);
        }),
        NODE_MIN_HEIGHT
      )
    );
    const rowOffsets = rowHeights.reduce<number[]>((offsets, currentHeight, rowIndex) => {
      if (rowIndex === 0) {
        offsets.push(PADDING);
        return offsets;
      }

      offsets.push(offsets[rowIndex - 1] + rowHeights[rowIndex - 1] + ROW_GAP);
      return offsets;
    }, []);

    levels.forEach((levelNodes, columnIndex) => {
      levelNodes.forEach((node) => {
        const rowIndex = rowById.get(node.id) ?? 0;
        positioned.push({
          ...node,
          x: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP),
          y: rowOffsets[rowIndex] ?? PADDING,
          height: rowHeights[rowIndex] ?? NODE_MIN_HEIGHT
        });
      });
    });

    const computedWidth =
      levels.length > 0 ? PADDING * 2 + levels.length * NODE_WIDTH + Math.max(0, levels.length - 1) * COLUMN_GAP : 480;
    const computedHeight =
      PADDING * 2 +
      rowHeights.reduce((total, currentHeight) => total + currentHeight, 0) +
      Math.max(0, maxRows - 1) * ROW_GAP +
      SHORTCUT_CANVAS_PADDING;

    return {
      positionedNodes: positioned,
      width: computedWidth,
      height: computedHeight
    };
  }, [edges, nodes]);

  const nodeById = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node] as const)),
    [positionedNodes]
  );
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const visibleEdges = useMemo(() => edges.filter((edge) => edge.kind !== "feedback"), [edges]);
  const childrenById = useMemo(() => buildForwardChildren(edges), [edges]);

  return (
    <section className="card workflow-viewer">
      {showHeader ? (
        <div className="card-row">
          <div>
            <p className="eyebrow">Workflow Graph</p>
            <h3>{title}</h3>
          </div>
          {selectedNode ? (
            <span className={`status workflow-status-${selectedNode.status ?? "idle"}`}>
              {selectedNode.status ?? "idle"}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="workflow-graph-panel">
        <div className="workflow-graph-scroll">
          <svg
            className="workflow-edges"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="workflow-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(140, 217, 173, 0.65)" />
              </marker>
            </defs>

            {visibleEdges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) {
                return null;
              }

              const startX = from.x + NODE_WIDTH;
              const startY = from.y + from.height / 2;
              const endX = to.x;
              const endY = to.y + to.height / 2;
              const shortcutEdge = isShortcutEdge(edge, childrenById);

              if (shortcutEdge) {
                const leftBound = Math.min(startX, endX);
                const rightBound = Math.max(startX, endX);
                const blockingNodes = positionedNodes.filter((node) => {
                  const nodeLeft = node.x;
                  const nodeRight = node.x + NODE_WIDTH;
                  return nodeRight >= leftBound && nodeLeft <= rightBound;
                });
                const bottomBound =
                  Math.max(
                    ...blockingNodes.map((node) => node.y + node.height),
                    from.y + from.height,
                    to.y + to.height
                  ) + SHORTCUT_DETOUR_OFFSET;

                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${startX} ${startY} L ${startX + 14} ${startY} C ${startX + 34} ${startY}, ${startX + 34} ${bottomBound}, ${startX + 34} ${bottomBound} L ${endX - 34} ${bottomBound} C ${endX - 14} ${bottomBound}, ${endX - 14} ${endY}, ${endX} ${endY}`}
                    className="workflow-edge workflow-edge-detour"
                    markerEnd="url(#workflow-arrow)"
                  />
                );
              }

              const horizontalGap = Math.max(18, (endX - startX) / 2);
              const curveStartX = startX + 14;
              const curveEndX = endX - 14;
              const midX = startX + horizontalGap;

              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={`M ${startX} ${startY} L ${curveStartX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${curveEndX} ${endY} L ${endX} ${endY}`}
                  className="workflow-edge"
                  markerEnd="url(#workflow-arrow)"
                />
              );
            })}
          </svg>

          <div className="workflow-node-layer" style={{ width, height }}>
            {positionedNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                className={`workflow-node ${getStatusClass(node.status)}${selectedNode?.id === node.id ? " workflow-node-selected" : ""}`}
                style={{
                  width: NODE_WIDTH,
                  minHeight: node.height,
                  left: node.x,
                  top: node.y
                }}
                onClick={() => onSelectNode(node.id)}
              >
                <strong>{node.title}</strong>
                <span className="workflow-node-kind">{(node.kind ?? "transform").toLowerCase()}</span>
                <span className="workflow-node-status">{node.status ?? "idle"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
