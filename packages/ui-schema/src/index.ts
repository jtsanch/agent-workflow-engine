import { z } from "zod";

export const uiFieldTypeSchema = z.enum(["text", "textarea", "select", "number", "boolean"]);

export const uiFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  type: uiFieldTypeSchema,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional()
});

export const uiSectionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(uiFieldSchema).min(1)
});

export const uiFormSchema = z.object({
  version: z.literal("1"),
  title: z.string(),
  description: z.string().optional(),
  sections: z.array(uiSectionSchema).min(1)
});

export type UiFieldType = z.infer<typeof uiFieldTypeSchema>;
export type UiField = z.infer<typeof uiFieldSchema>;
export type UiSection = z.infer<typeof uiSectionSchema>;
export type UiFormSchema = z.infer<typeof uiFormSchema>;

