import { z } from "zod";

export const SchemeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  label: z.string().optional(),
  map: z.record(z.string()),
});

export type SchemeFile = z.infer<typeof SchemeSchema>;