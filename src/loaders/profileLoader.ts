import type { App, TFile } from "obsidian";
import { LayoutSchema, type LayoutFile } from "../schema/layout";
import { SchemeSchema, type SchemeFile } from "../schema/scheme";
import type { Keymap } from "../types/keymap";

export type ResolvedLayout = LayoutFile["keys"]; // Record<string, KeyLayers>
export type ResolvedScheme = SchemeFile["map"];  // Record<string, string>

export interface LoadedData {
  layouts: Map<string, ResolvedLayout>;
  schemes: Map<string, ResolvedScheme>;
}

/** Load JSON under a folder (user-layouts) */
async function loadJsonFiles(app: App, folder: string) {
  const out: Array<{ path: string; json: any }> = [];
  const { vault } = app;
  if (!(await vault.adapter.exists(folder))) return out;
  const files: TFile[] = vault.getFiles().filter(
    f => f.path.startsWith(folder + "/") && f.extension.toLowerCase() === "json"
  );
  for (const f of files) {
    try {
      const raw = await vault.read(f);
      out.push({ path: f.path, json: JSON.parse(raw) });
    } catch (e) {
      console.warn("[ITS] Bad JSON:", f.path, e);
    }
  }
  return out;
}

/** Load user layouts & schemes. No profiles. */
export async function loadUserData(app: App, folder: string): Promise<LoadedData> {
  const layouts = new Map<string, ResolvedLayout>();
  const schemes = new Map<string, ResolvedScheme>();

  const files = await loadJsonFiles(app, folder);
  for (const f of files) {
    const isLayout = /\/layouts\/.+\.json$/i.test(f.path);
    const isScheme = /\/schemes\/.+\.json$/i.test(f.path);

    try {
      if (isLayout) {
        const parsed = LayoutSchema.parse(f.json);
        layouts.set(parsed.id, parsed.keys);
      } else if (isScheme) {
        const parsed = SchemeSchema.parse(f.json);
        schemes.set(parsed.id, parsed.map);
      } else {
        // Try both
        try {
          const l = LayoutSchema.parse(f.json);
          layouts.set(l.id, l.keys);
        } catch {
          const s = SchemeSchema.parse(f.json);
          schemes.set(s.id, s.map);
        }
      }
    } catch (e) {
      console.warn("[ITS] Invalid file skipped:", f.path, e);
    }
  }

  return { layouts, schemes };
}

/** Merge order: user overrides > built-ins */
export function mergeData(builtIn: LoadedData, user: LoadedData): LoadedData {
  const layouts = new Map(builtIn.layouts);
  const schemes = new Map(builtIn.schemes);
  user.layouts.forEach((v, k) => layouts.set(k, v));
  user.schemes.forEach((v, k) => schemes.set(k, v));
  return { layouts, schemes };
}
