// src/loaders/userKeymaps.ts
import { App, TFile, normalizePath } from "obsidian";

export type KeyLayers = { base?: string; shift?: string; alt?: string; altShift?: string; ctrl?: string; ctrlShift?: string; label?: string; };
export type Keymap = Record<string, KeyLayers>;
export type SchemeMap = Record<string, string>;
export type LoadedData = { keymaps: Map<string, Keymap>; schemes: Map<string, SchemeMap>; layouts: Map<string, any>; };

/* ---------- utilities ---------- */
function cleanPath(p: string) {
  const cleaned = (p ?? "").toString().trim().replace(/^\/+/, "");
  return normalizePath(cleaned || "user-layouts");
}

/** Find JSON files by vault-relative prefix (works with symlinks, etc.) */
function listJsonFilesByPrefix(app: App, dir: string): TFile[] {
  const prefix = normalizePath(dir).replace(/\/+$/, "") + "/";
  const hits = app.vault.getFiles().filter(
    (f) => f.path.startsWith(prefix) && f.path.toLowerCase().endsWith(".json"),
  );
  console.log(`[ITS] vault scan prefix="${prefix}" → ${hits.length} json file(s)`, hits.map(f => f.path));
  return hits;
}

async function readJson(app: App, file: TFile): Promise<any | undefined> {
  try { return JSON.parse(await app.vault.read(file)); }
  catch (e) { console.warn("[ITS] JSON parse error:", file.path, e); return undefined; }
}

/* ---------- loader ---------- */
export async function loadUserData(app: App, root: string): Promise<LoadedData> {
  const base = cleanPath(root); // <— use it
  console.warn("[ITS] userLayoutsFolder (cleaned):", base);

  const schemesDir = `${base}/schemes`;
  const layoutsDir = `${base}/layouts`;

  const schemes = new Map<string, SchemeMap>();
  const layouts = new Map<string, any>();
  const keymaps = new Map<string, Keymap>();

  // SCHEMES (targeted)
  let schemeFiles = listJsonFilesByPrefix(app, schemesDir);
  console.log(`[ITS] scan ${schemesDir} → ${schemeFiles.length} file(s)`);

  // Fallback: scan whole vault for any /schemes/*.json
  if (schemeFiles.length === 0) {
    const all = app.vault.getFiles();
    const anySchemes = all.filter(f => /\/schemes\/[^/]+\.json$/i.test(f.path));
    console.warn(`[ITS] fallback scan found ${anySchemes.length} scheme json(s):`, anySchemes.map(f => f.path));
    schemeFiles = anySchemes;
  }

  for (const tf of schemeFiles) {
    const j = await readJson(app, tf);
    const id = j?.id && String(j.id).trim();
    const map = (j?.map && typeof j.map === "object") ? (j.map as Record<string,string>) : null;
    if (!id) { console.warn("[ITS] scheme missing id:", tf.path); continue; }
    if (!map || !Object.keys(map).length) { console.warn(`[ITS] scheme "${id}" empty map:`, tf.path); continue; }
    if (schemes.has(id)) { console.warn(`[ITS] duplicate scheme id "${id}" (keeping first)`); continue; }
    schemes.set(id, map);
    console.log(`[ITS] scheme loaded: ${id} (${tf.path})`);
  }

  // LAYOUTS
  let layoutFiles = listJsonFilesByPrefix(app, layoutsDir);
  console.log(`[ITS] scan ${layoutsDir} → ${layoutFiles.length} file(s)`);
  if (layoutFiles.length === 0) {
    const all = app.vault.getFiles();
    const anyLayouts = all.filter(f => /\/layouts\/[^/]+\.json$/i.test(f.path));
    console.warn(`[ITS] fallback scan found ${anyLayouts.length} layout json(s):`, anyLayouts.map(f => f.path));
    layoutFiles = anyLayouts;
  }

  for (const tf of layoutFiles) {
    const j = await readJson(app, tf);
    const id = j?.id && String(j.id).trim();
    const keys = j?.keys && typeof j.keys === "object" && !Array.isArray(j.keys) ? j.keys : null;
    if (!id || !keys) { console.warn("[ITS] layout invalid:", tf.path); continue; }
    if (layouts.has(id)) { console.warn(`[ITS] duplicate layout id "${id}" (keeping first)`); continue; }
    layouts.set(id, j);
    console.log(`[ITS] layout loaded: ${id} (${tf.path}) keys=${Object.keys(keys).length}`);
  }

  console.log("[ITS] schemes found:", Array.from(schemes.keys()));
  console.log("[ITS] layouts found:", Array.from(layouts.keys()));
  return { keymaps, schemes, layouts };
}

export async function loadUserKeymaps(app: App, root: string): Promise<Map<string, Keymap>> {
  const all = await loadUserData(app, root);
  return all.keymaps;
}
