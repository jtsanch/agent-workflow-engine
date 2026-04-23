import type { InputBinding, JSONSchema } from "@personal-agent-os/shared";

type DagNodeLike = {
  id: string;
  type: string;
  input?: {
    schema?: JSONSchema;
    bindings?: InputBinding[];
  };
  output: {
    schema: JSONSchema;
  };
  transform?: unknown;
};

type DagLike = {
  nodes: DagNodeLike[];
  edges: Array<{ from: string; to: string; type?: string }>;
};

const GENERIC_FIELD_NAMES = new Set(["text", "data", "output"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describePath(path: string[]): string {
  return path.length === 0 ? "value" : path.join(".");
}

export function validateSchema(value: unknown, schema: JSONSchema | undefined, path: string[] = []): void {
  if (!schema?.type) {
    return;
  }

  switch (schema.type) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(`Expected ${describePath(path)} to be a string`);
      }
      return;
    case "number":
    case "integer":
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Expected ${describePath(path)} to be a number`);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Expected ${describePath(path)} to be a boolean`);
      }
      return;
    case "null":
      if (value !== null) {
        throw new Error(`Expected ${describePath(path)} to be null`);
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        throw new Error(`Expected ${describePath(path)} to be an array`);
      }
      if (schema.items) {
        value.forEach((item, index) => validateSchema(item, schema.items, [...path, String(index)]));
      }
      return;
    case "object":
      if (!isRecord(value)) {
        throw new Error(`Expected ${describePath(path)} to be an object`);
      }

      for (const key of schema.required ?? []) {
        if (!(key in value)) {
          throw new Error(`Missing required field ${describePath([...path, key])}`);
        }
      }

      for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
        if (key in value && value[key] !== undefined) {
          validateSchema(value[key], childSchema, [...path, key]);
        }
      }

      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in (schema.properties ?? {}))) {
            throw new Error(`Unexpected field ${describePath([...path, key])}`);
          }
        }
      }
      return;
    default:
      return;
  }
}

function getSchemaByPath(schema: JSONSchema | undefined, path: string[]): JSONSchema | undefined {
  let current = schema;

  for (const segment of path) {
    if (!current) {
      return undefined;
    }

    if (current.type === "object") {
      current = current.properties?.[segment];
      continue;
    }

    if (current.type === "array") {
      current = current.items;
      continue;
    }

    return undefined;
  }

  return current;
}

function isCompatible(fromSchema?: JSONSchema, toSchema?: JSONSchema): boolean {
  if (!fromSchema || !toSchema || !fromSchema.type || !toSchema.type) {
    return true;
  }

  if (fromSchema.type !== toSchema.type) {
    return false;
  }

  if (fromSchema.type === "array") {
    return isCompatible(fromSchema.items, toSchema.items);
  }

  if (fromSchema.type === "object") {
    return Object.entries(toSchema.properties ?? {}).every(([key, childSchema]) => {
      const candidate = fromSchema.properties?.[key];
      const isRequired = (toSchema.required ?? []).includes(key);
      if (!candidate) {
        return !isRequired;
      }

      return isCompatible(candidate, childSchema);
    });
  }

  return true;
}

function lintSchema(schema?: JSONSchema, path: string[] = []): string[] {
  if (!schema?.properties) {
    return [];
  }

  const errors: string[] = [];
  for (const [fieldName, childSchema] of Object.entries(schema.properties)) {
    if (GENERIC_FIELD_NAMES.has(fieldName)) {
      errors.push(`Generic field name "${fieldName}" is not allowed at ${describePath([...path, fieldName])}`);
    }

    errors.push(...lintSchema(childSchema, [...path, fieldName]));
  }

  return errors;
}

function validateTransformNode(node: DagNodeLike): void {
  if (node.type !== "transform" || typeof node.transform !== "function") {
    return;
  }

  const source = node.transform.toString();
  if (node.transform.constructor.name === "AsyncFunction" || /\bawait\b/.test(source)) {
    throw new Error(`Transform node ${node.id} must be synchronous`);
  }

  if (/\b(fetch|axios|XMLHttpRequest|openai|llm|createToolRegistry)\b/.test(source)) {
    throw new Error(`Transform node ${node.id} must only reshape data`);
  }
}

export function validateDag(dag: DagLike): void {
  const nodesById = new Map(dag.nodes.map((node) => [node.id, node]));

  for (const node of dag.nodes) {
    const lintErrors = [...lintSchema(node.input?.schema), ...lintSchema(node.output.schema)];
    if (lintErrors.length > 0) {
      throw new Error(`Schema lint failed for ${node.id}: ${lintErrors[0]}`);
    }

    validateTransformNode(node);
  }

  for (const edge of dag.edges.filter((edge) => (edge.type ?? "data") === "data")) {
    const fromNode = nodesById.get(edge.from);
    const toNode = nodesById.get(edge.to);
    if (!fromNode || !toNode) {
      throw new Error(`Invalid edge: ${edge.from} -> ${edge.to}`);
    }

    const bindings = (toNode.input?.bindings ?? []).filter((binding) => {
      return binding.ref.source === "node_output" && binding.ref.nodeId === fromNode.id;
    });

    for (const binding of bindings) {
      const refPath = "path" in binding.ref ? binding.ref.path : undefined;
      const sourceSchema = getSchemaByPath(
        fromNode.output.schema,
        refPath ? refPath.split(".") : []
      );
      const targetSchema = getSchemaByPath(toNode.input?.schema, [binding.key]);

      if (!isCompatible(sourceSchema, targetSchema)) {
        throw new Error(`Invalid edge: ${fromNode.id} -> ${toNode.id}`);
      }
    }
  }
}
