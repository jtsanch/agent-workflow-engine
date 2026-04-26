import { z } from "zod";

export const alertChannelSchema = z.enum(["email", "slack", "push"]);
export const jsonSchemaSchema: z.ZodType = z.lazy(() =>
  z.object({
    type: z.enum(["string", "integer", "number", "boolean", "object", "array", "null"]),
    title: z.string().optional(),
    description: z.string().optional(),
    properties: z.record(jsonSchemaSchema).optional(),
    required: z.array(z.string()).optional(),
    items: jsonSchemaSchema.optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaSchema]).optional(),
    enum: z.array(z.unknown()).optional()
  })
);

export const createJobInputSchema = z.object({
  agentDefinitionKey: z.string(),
  dagId: z.string().optional(),
  name: z.string().min(1),
  scheduleExpression: z.string().min(1),
  timezone: z.string().min(1),
  inputs: z.record(z.unknown()),
  alertPreferences: z.array(
    z.object({
      channel: alertChannelSchema,
      destination: z.string(),
      onSuccess: z.boolean().default(false),
      onFailure: z.boolean().default(true)
    })
  )
});

export const simulateRunInputSchema = z.object({
  jobId: z.string()
});

export type CreateJobInput = z.infer<typeof createJobInputSchema>;
