import { z } from "zod";

export const KeyLayers = z.object({
  base: z.string().optional(),
  shift: z.string().optional(),
  alt: z.string().optional(),
  altShift: z.string().optional(),
  ctrl: z.string().optional(),
  ctrlShift: z.string().optional(),
  label: z.string().optional(),
});

// Zod v3: z.record(valueType) defaults key type to string
export const LayoutSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1),
  label: z.string().optional(),
  keys: z.record(KeyLayers),
});

export type LayoutFile = z.infer<typeof LayoutSchema>;
