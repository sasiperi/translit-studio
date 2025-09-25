// src/view/TypingStudioView.ts
//import { ItemView, WorkspaceLeaf } from "obsidian";
import { ItemView, WorkspaceLeaf, Notice, normalizePath, TFile } from "obsidian";

import {
  loadUserData,
  type LoadedData,
  type Keymap,
  type KeyLayers,
  type SchemeMap,
} from "../loaders/userKeymaps";
import Sanscript from "@indic-transliteration/sanscript";

export const VIEW_TYPE = "indic-typing-studio";

/** Static list only used for OUTPUT scripts (Sanscript targets) */
const OUTPUT_SCRIPTS = [
  "itrans",
  "hk",
  "iast",
  "slp1",
  "iso",
  "devanagari",
  "telugu",
  "kannada",
  "tamil",
  "bengali",
  "gurmukhi",
  "gujarati",
  "oriya",
  "malayalam",
];

/** Physical ANSI-ish keyboard rows */
const KB_ROWS: string[][] = [
  ["Backquote","Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0","Minus","Equal","Backspace"],
  ["Tab","KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP","BracketLeft","BracketRight","Backslash"],
  ["CapsLock","KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","Semicolon","Quote","Enter"],
  ["ShiftLeft","KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period","Slash","ShiftRight"],
  ["ControlLeft","AltLeft","MetaLeft","Space","MetaRight","AltRight","ContextMenu","ControlRight"],
];

const KB_WIDTH: Record<string, string> = {
  Backspace: "its-w-backspace",
  Tab: "its-w-tab",
  CapsLock: "its-w-caps",
  Enter: "its-w-enter",
  ShiftLeft: "its-w-shift",
  ShiftRight: "its-w-shift",
  Space: "its-w-space",
};

const STATIC_LABELS: Record<string, string> = {
  Escape: "esc",
  Backspace: "⌫",
  Tab: "↹",
  CapsLock: "⇪",
  Enter: "↵",
  ShiftLeft: "⇧",
  ShiftRight: "⇧",
  ControlLeft: "⌃",
  ControlRight: "⌃",
  AltLeft: "⌥",
  AltRight: "⌥",
  MetaLeft: "⌘",
  MetaRight: "⌘",
  Space: "⎵",
};

type LabelKeymap = Keymap;

export class TypingStudioView extends ItemView {
  /* DOM */
  rootEl!: HTMLElement;
  toolbarEl!: HTMLElement;
  keyboardEl!: HTMLElement;
  panesEl!: HTMLElement;
  leftEl!: HTMLTextAreaElement;
  rightEl!: HTMLTextAreaElement;

  inputSel!: HTMLSelectElement;   // schemes only (from user JSON)
  outputSel!: HTMLSelectElement;  // Sanscript targets
  showKbChk!: HTMLInputElement;
  imeModeChk!: HTMLInputElement;
  labelModeSel!: HTMLSelectElement; // "input" | "output"

  /* State */
  private labelRefs: Map<string, HTMLElement> = new Map();
  private mod = { shift: false, alt: false, ctrl: false };
  private vmod = { shift: false, alt: false, ctrl: false };
  private idleTimer: number | null = null;
  private lastInputAt = 0;

  private data: LoadedData = {
    keymaps: new Map<string, Keymap>(),
    schemes: new Map<string, SchemeMap>(),
    layouts: new Map<string, any>(),
  };

  private currentLayoutId = "ansi-4row";
  private currentLayoutPhonemes: Keymap = {};
  private currentSchemeId = "itrans";
  private currentScheme: SchemeMap | null = null;
  private currentLabelKeymap: LabelKeymap = {};

  // label mode + tooltips
  private labelMode: "input" | "output" = "input";
  private inputLabelKeymap: LabelKeymap = {};
  private outputLabelKeymap: LabelKeymap = {};
  private tipEl: HTMLElement | null = null;
  private hoveredCode: string | null = null;
  private tipTimer: number | null = null;


  constructor(public leaf: WorkspaceLeaf, private plugin: any) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Indic typing studio"; }
  getIcon() { return "keyboard"; }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();
    

    /* -------- Build static DOM first -------- */
    this.rootEl = containerEl.createDiv({ cls: "its-root" });
    this.toolbarEl = this.rootEl.createDiv({ cls: "its-toolbar" });

    // IME toggle
    this.imeModeChk = this.toolbarEl.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    this.imeModeChk.checked = true;
    this.toolbarEl.createSpan({ text: " ime mode", cls: "its-small" });

    // Show keyboard toggle
    this.showKbChk = this.toolbarEl.createEl("input", { type: "checkbox" }) as HTMLInputElement;
    this.showKbChk.checked = !!this.plugin.settings.showKeyboardByDefault;
    this.toolbarEl.createSpan({ text: " show keyboard", cls: "its-small" });

    // Input selector placeholder (populated after loading)
    this.toolbarEl.createSpan({ text: " input:", cls: "its-small" });
    this.inputSel = this.toolbarEl.createEl("select");

    // Output selector (Sanscript targets)
    this.toolbarEl.createSpan({ text: " → output:", cls: "its-small" });
    this.outputSel = this.toolbarEl.createEl("select");
    for (const s of OUTPUT_SCRIPTS) {
      const o = this.outputSel.createEl("option", { text: s, value: s });
      if (s === this.plugin.settings.defaultOutputScript) o.selected = true;
    }

    // Label mode
    this.toolbarEl.createSpan({ text: " labels:", cls: "its-small" });
    this.labelModeSel = this.toolbarEl.createEl("select");
    [{ v: "input", t: "input" }, { v: "output", t: "output" }].forEach(o => {
      const opt = this.labelModeSel.createEl("option", { value: o.v, text: o.t });
      if (o.v === this.labelMode) opt.selected = true;
    });

    // Keyboard container
    this.keyboardEl = this.rootEl.createDiv({ cls: "its-kb" });
    if (!this.showKbChk.checked) this.keyboardEl.addClass("its-hidden");

    // Panes
    this.panesEl = this.rootEl.createDiv({ cls: "its-panes" });
    const leftPane = this.panesEl.createDiv({ cls: "its-pane its-left" });
    leftPane.createDiv({ cls: "label", text: "Left: Type here (input scheme or Unicode)" });
    this.leftEl = leftPane.createEl("textarea");
    const rightPane = this.panesEl.createDiv({ cls: "its-pane its-right" });
    rightPane.createDiv({ cls: "label", text: "Right: Live output (target script)" });
    this.rightEl = rightPane.createEl("textarea");
    this.rightEl.readOnly = true;

    const actions = this.toolbarEl.createDiv({ cls: "its-actions" });
    const exportBtn = actions.createEl("button", { text: "Export to note" });
    exportBtn.onclick = () => this.exportRightToNote();


    /* -------- Load user data & choose layout/scheme -------- */
    this.data = await loadUserData(this.app, this.plugin.settings.userLayoutsFolder || "user-layouts");

    if (this.data.layouts.has("ansi-4row")) {
      this.currentLayoutId = "ansi-4row";
    } else if (this.data.layouts.size) {
      this.currentLayoutId = Array.from(this.data.layouts.keys())[0]!;
    }

    const layoutObj = this.data.layouts.get(this.currentLayoutId);
    const layoutKeys: Keymap | undefined = layoutObj?.keys;
    this.currentLayoutPhonemes = normalizeKeymap(layoutKeys || {});

    const availableSchemes = Array.from(this.data.schemes.keys()).sort();
    if (availableSchemes.length) {
      this.currentSchemeId = availableSchemes.includes(this.plugin.settings.defaultInputScheme)
        ? this.plugin.settings.defaultInputScheme
        : availableSchemes[0]!;
    } else {
      this.currentSchemeId = this.plugin.settings.defaultInputScheme || "itrans";
    }
    this.currentScheme = this.data.schemes.get(this.currentSchemeId) ?? null;

    // Populate input dropdown
    this.inputSel.empty?.();
    if (availableSchemes.length === 0) {
      this.inputSel.createEl("option", { value: "", text: "(no schemes found)" });
      this.inputSel.disabled = true;
    } else {
      for (const id of availableSchemes) {
        const o = this.inputSel.createEl("option", { text: id, value: id });
        if (id === this.currentSchemeId) o.selected = true;
      }
    }

    // Build keyboard DOM now that keyboardEl exists
    this.mountKeyboardShell();
    this.cacheLabelRefs();

    // Build initial labels
    this.rebuildAndApplyLabels();

    /* -------- Wire events -------- */

    // Persist show keyboard toggle
    this.showKbChk.onchange = () => {
      this.keyboardEl.toggleClass("its-hidden", !this.showKbChk.checked);
      this.plugin.settings.showKeyboardByDefault = this.showKbChk.checked;
      this.plugin.saveSettings();
    };

    // Input selector change
    this.inputSel.onchange = async () => {
      this.currentSchemeId = this.inputSel.value;
      this.plugin.settings.defaultInputScheme = this.currentSchemeId;
      await this.plugin.saveSettings();
      this.currentScheme = this.data.schemes.get(this.currentSchemeId) ?? null;
      this.rebuildAndApplyLabels();
      this.fullConvert();
    };

    // Output selector change
    this.outputSel.onchange = async () => {
      this.plugin.settings.defaultOutputScript = this.outputSel.value;
      await this.plugin.saveSettings();
      this.rebuildAndApplyLabels();
      this.fullConvert();
    };

    // Label mode change
    this.labelModeSel.onchange = async () => {
      this.labelMode = this.labelModeSel.value as "input" | "output";
      this.rebuildAndApplyLabels();
    };

    // Typing handlers (space + idle)
    const convertOnSpace = this.plugin.settings.convertOnSpace ?? true;
    const idleMs = this.plugin.settings.idleMs ?? 3000;

    this.leftEl.addEventListener("keydown", (ev) => {
      this.lastInputAt = Date.now();
      if (ev.key === " " && convertOnSpace) {
        this.fullConvert();
        queueMicrotask(() => this.scheduleIdle(idleMs));
      } else {
        this.scheduleIdle(idleMs);
      }
    });
    this.leftEl.addEventListener("input", () => {
      this.lastInputAt = Date.now();
      this.scheduleIdle(idleMs);
    });

    // Hardware key → IME insertion
    const onHwDown = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") this.mod.shift = true;
      if (ev.key === "Alt" || ev.key === "AltGraph") this.mod.alt = true;
      if (ev.key === "Control") this.mod.ctrl = true;
      this.applyKeymapLabels(this.currentLabelKeymap);

      if (!this.imeModeChk.checked) return;

      const layers = this.currentLayoutPhonemes[ev.code];
      if (!layers) return;
      const phoneme = this.pickLayer(layers);
      if (!phoneme) return;

      const token = this.currentScheme?.[phoneme] ?? phoneme;
      if (token) {
        ev.preventDefault();
        this.highlightKey(ev.code, true);
        this.insertText(token);
        this.fullConvert();
      }
    };
    const onHwUp = (ev: KeyboardEvent) => {
      if (ev.key === "Shift") this.mod.shift = false;
      if (ev.key === "Alt" || ev.key === "AltGraph") this.mod.alt = false;
      if (ev.key === "Control") this.mod.ctrl = false;
      this.applyKeymapLabels(this.currentLabelKeymap);
      this.highlightKey(ev.code, false);
    };
    window.addEventListener("keydown", onHwDown, true);
    window.addEventListener("keyup", onHwUp, true);
    this.register(() => {
      window.removeEventListener("keydown", onHwDown, true);
      window.removeEventListener("keyup", onHwUp, true);
    });

    // Pointer typing (click)
    this.keyboardEl.addEventListener(
      "pointerdown",
      (ev) => {
        const keyEl = (ev.target as HTMLElement).closest(".its-kb-key") as HTMLElement | null;
        if (!keyEl) return;
        const code = keyEl.getAttr("data-code")!;
        ev.preventDefault();

        // Sticky modifiers
        if (/^(Shift|Alt|Control)/.test(code)) {
          this.toggleVirtualModifier(code);
          return;
        }

        // Special keys
        if (code === "Backspace") {
          this.backspaceOne();
          this.fullConvert();
          return;
        }
        if (code === "Enter") {
          this.insertText("\n");
          this.fullConvert();
          return;
        }
        if (code === "Tab") {
          this.insertText("\t");
          this.fullConvert();
          return;
        }

        // Normal: emit scheme-mapped token
        const layers = this.currentLayoutPhonemes[code];
        if (!layers) return;
        const phoneme = this.pickLayer(layers);
        if (!phoneme) return;

        const token = this.currentScheme?.[phoneme] ?? phoneme;
        if (!token) return;

        this.insertText(token);
        this.fullConvert();
      },
      { passive: false },
    );

    // Modifier highlights for hardware keys
    this.bindModifierHighlights();

    // Hover card (safe init AFTER keyboard exists)
    this.initHoverCard();

    // First conversion
    this.fullConvert();
  }

  async onClose() {
    // remove floating tip if we created one
    if (this.tipEl && this.tipEl.parentElement) {
      this.tipEl.parentElement.removeChild(this.tipEl);
    }
    this.tipEl = null;
  }

  /* ── Helpers ───────────────────────────────────────────── */

  private async ensureFolder(folder: string): Promise<string> {
  const base = normalizePath(folder || "Indic-Typing");
  const parts = base.split("/").filter(Boolean);
  let acc = "";
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p;
    if (!(await this.app.vault.adapter.exists(acc))) {
      await this.app.vault.createFolder(acc);
    }
  }
  return base;
}

private async uniquePath(p: string): Promise<string> {
  const adapter = this.app.vault.adapter;
  let path = normalizePath(p);
  if (!(await adapter.exists(path))) return path;
  const dot = path.lastIndexOf(".");
  const ext = dot >= 0 ? path.slice(dot) : "";
  const stem = dot >= 0 ? path.slice(0, dot) : path;
  let i = 2;
  while (await adapter.exists(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

private async exportRightToNote(): Promise<void> {
  const body = this.rightEl?.value ?? "";
  if (!body.trim()) { new Notice("Nothing to export."); return; }

  const folder = await this.ensureFolder(this.plugin.settings.exportFolder || "Indic-Typing");
  const stamp  = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  const path   = await this.uniquePath(`${folder}/Typing-${stamp}.md`);

  const file = await this.app.vault.create(path, body + "\n");
  new Notice(`Exported → ${path}`);

  const leaf = this.app.workspace.getLeaf(true);
  await leaf.openFile(file as TFile);
}


  private rebuildAndApplyLabels(): void {
    const useOutput = this.labelMode === "output";
    const outId =
      (this.outputSel && this.outputSel.value) ||
      this.plugin.settings.defaultOutputScript ||
      "devanagari";

    this.inputLabelKeymap = this.buildLabelKeymapWithFallback(
      this.currentLayoutPhonemes,
      this.currentScheme,
      outId
    );
    this.outputLabelKeymap = this.buildLabelKeymapWithFallback(
      this.currentLayoutPhonemes,
      this.data.schemes.get(outId) ?? null,
      outId
    );

    this.currentLabelKeymap = useOutput ? this.outputLabelKeymap : this.inputLabelKeymap;
    this.applyKeymapLabels(this.currentLabelKeymap);
  }

  /** Map layout tokens via a scheme; if missing, try ITRANS->Sanscript(target); else show token. */
  /** Map layout tokens via a scheme; if missing, try ITRANS→Sanscript(target); else hide noisy IDs. */
private buildLabelKeymapWithFallback(
  layout: Keymap,
  scheme: SchemeMap | null,
  outputTarget: string
): LabelKeymap {
  const out: LabelKeymap = {};
  const itrans = this.data.schemes.get("itrans") ?? null;
  const canTranslit = !!(itrans && (Sanscript as any)?.t && outputTarget);

  const mapOne = (token?: string): string => {
    if (!token) return "";

    // 1) Direct glyph from the selected scheme
    const direct = scheme?.[token];
    if (direct) return direct;

    // 2) Fallback via ITRANS → Sanscript(target), if we have a roman for this token
    if (canTranslit) {
      const roman = itrans?.[token];
      if (roman) {
        try { return (Sanscript as any).t(roman, "itrans", outputTarget); } catch {}
      }
    }

    // 3) Still unresolved: hide “noisy” IDs (tokens that look like constants)
    //    Examples: VS_E_SHORT, VEDIC_ANUDATTA, CHANDRABINDU, etc.
    if (token.includes("_") || /^[A-Z0-9]{3,}$/.test(token)) return "";

    // 4) Otherwise keep short human-ish tokens like "aa", "kh", etc.
    return token;
  };

  for (const [code, layers] of Object.entries(layout)) {
    out[code] = {
      base:      mapOne(layers.base),
      shift:     mapOne(layers.shift),
      alt:       mapOne(layers.alt),
      altShift:  mapOne(layers.altShift),
      ctrl:      mapOne(layers.ctrl),
      ctrlShift: mapOne(layers.ctrlShift),
      label:     layers.label ? mapOne(layers.label) : undefined,
    };
  }
  return out;
}


  private buildLabelKeymap(layout: Keymap, scheme: SchemeMap | null): LabelKeymap {
    const out: LabelKeymap = {};
    for (const [code, layers] of Object.entries(layout)) {
      const lab: KeyLayers = {};
      const mapOne = (s?: string) => (s ? scheme?.[s] ?? s : "");
      lab.base = mapOne(layers.base);
      lab.shift = mapOne(layers.shift);
      lab.alt = mapOne(layers.alt);
      lab.altShift = mapOne(layers.altShift);
      lab.ctrl = mapOne(layers.ctrl);
      lab.ctrlShift = mapOne(layers.ctrlShift);
      lab.label = layers.label ? mapOne(layers.label) : undefined;
      out[code] = lab;
    }
    return out;
  }

  private pickLayer(l: KeyLayers): string {
    const shift = this.mod.shift || this.vmod.shift;
    const alt = this.mod.alt || this.vmod.alt;
    const ctrl = this.mod.ctrl || this.vmod.ctrl;
    if (ctrl && shift && l.ctrlShift) return l.ctrlShift!;
    if (ctrl && l.ctrl) return l.ctrl!;
    if (alt && shift && l.altShift) return l.altShift!;
    if (alt && l.alt) return l.alt!;
    if (shift && l.shift) return l.shift!;
    return l.base ?? "";
  }

  private applyKeymapLabels(map: LabelKeymap): void {
  for (const [code, labelEl] of this.labelRefs.entries()) {
    const layers = map[code];
    let text = layers ? this.pickLayer(layers) || layers.label || "" : "";
    if (!text) text = STATIC_LABELS[code] ?? "";
    labelEl.setText(text);
  }
  if (this.hoveredCode) this.renderTip(this.hoveredCode);
}


  private initHoverCard(): void {
  if (this.tipEl) return;
  this.tipEl = document.createElement("div");
  this.tipEl.className = "its-tip its-hidden";
  document.body.appendChild(this.tipEl);

  this.keyboardEl.addEventListener("mousemove", (ev: MouseEvent) => {
    const target = ev.target as HTMLElement | null;
    const keyEl = target?.closest?.(".its-kb-key") as HTMLElement | null;
    if (!keyEl) { this.hideTip(); return; }
    const code = keyEl.getAttr("data-code");
    if (!code) { this.hideTip(); return; }

    // defer showing to reduce noise
    if (this.hoveredCode !== code) {
      this.hoveredCode = code;
      if (this.tipTimer) window.clearTimeout(this.tipTimer);
      this.tipTimer = window.setTimeout(() => {
        this.renderTip(code);
        this.tipEl?.classList.remove("its-hidden");
      }, 120);
    }
    this.positionTip(ev);
  }, { passive: true });

  this.keyboardEl.addEventListener("mouseleave", () => this.hideTip(), { passive: true });
}

private hideTip(): void {
  this.hoveredCode = null;
  if (this.tipTimer) { window.clearTimeout(this.tipTimer); this.tipTimer = null; }
  if (this.tipEl) this.tipEl.addClass("its-hidden");
}

private positionTip(e: MouseEvent): void {
  if (!this.tipEl) return;
  const pad = 14;
  this.tipEl.style.position = "fixed";
  this.tipEl.style.left = `${e.clientX + pad}px`;
  this.tipEl.style.top  = `${e.clientY + pad}px`;
}

private renderTip(code: string): void {
  if (!this.tipEl) return;

  const lay = this.currentLayoutPhonemes?.[code] || {};
  const layerNames: Array<keyof KeyLayers> = ["base","shift","alt","altShift","ctrl","ctrlShift"];

  const inId  = (this.inputSel && this.inputSel.value) || this.currentSchemeId || "input";
  const outId = (this.outputSel && this.outputSel.value) || this.plugin.settings.defaultOutputScript || "output";

  const inMap  = this.inputLabelKeymap[code]  || {};
  const outMap = this.outputLabelKeymap[code] || {};

  const get = (m: any, k: keyof KeyLayers) => (m && (m[k] || m.label)) || "";

  const curIn  = get(inMap,  this.pickLayer(lay) as keyof KeyLayers) || this.pickLayer(inMap as any) || "";
  const curOut = get(outMap, this.pickLayer(lay) as keyof KeyLayers) || this.pickLayer(outMap as any) || "";

  // base values to compare against
  const baseIn  = get(inMap,  "base");
  const baseOut = get(outMap, "base");

  const rows = layerNames
    .map((k) => {
      const i = get(inMap, k);
      const o = get(outMap, k);
      // always include base; others only if they differ from base and are non-empty
      const include = (k === "base") || ((i && i !== baseIn) || (o && o !== baseOut));
      if (!include) return "";
      return `<div class="itstip-row"><span class="ly">${k}</span><span class="in">${i || "·"}</span><span class="out">${o || "·"}</span></div>`;
    })
    .filter(Boolean)
    .join("");

  this.tipEl.innerHTML = `
    <div class="itstip-main">
      <span class="pill">${inId}</span> ${curIn || "·"}
      &nbsp;→&nbsp;
      <span class="pill">${outId}</span> ${curOut || "·"}
    </div>
    <div class="itstip-rows">${rows}</div>
  `;
}


  private backspaceOne() {
    const el = this.leftEl;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? s;
    if (s === e && s > 0) el.setRangeText("", s - 1, e, "end");
    else el.setRangeText("", s, e, "end");
  }

  private highlightKey(code: string, on: boolean): void {
    const el = this.keyboardEl.querySelector<HTMLElement>(`.its-kb-key[data-code="${code}"]`);
    if (el) el.setAttr("data-active", on ? "1" : "0");
  }

  private cacheLabelRefs(): void {
    this.labelRefs.clear();
    this.keyboardEl.querySelectorAll<HTMLElement>(".its-kb-key").forEach((k) => {
      const code = k.getAttr("data-code")!;
      const lab = k.querySelector<HTMLElement>(".its-kb-label")!;
      this.labelRefs.set(code, lab);
    });
  }

  private mountKeyboardShell(): void {
    this.keyboardEl.empty();
    const shell = this.keyboardEl.createDiv({ cls: "its-kb-shell" });
    KB_ROWS.forEach((rowCodes, idx) => {
      const row = shell.createDiv({ cls: `its-kb-row r${idx + 1}` });
      for (const code of rowCodes) {
        const key = row.createDiv({ cls: `its-kb-key ${KB_WIDTH[code] ?? ""}` });
        key.setAttr("data-code", code);
        key.createSpan({ cls: "its-kb-label" });
        if (/^(Shift|Alt|Control|Meta)/.test(code)) key.addClass("mod");
      }
    });
  }

  private scheduleIdle(ms: number): void {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (Date.now() - this.lastInputAt >= ms - 10) this.fullConvert();
    }, ms);
  }

  private fullConvert(): void {
    const src = this.leftEl.value ?? "";
    const from = this.inputSel?.value || this.currentSchemeId || "itrans";
    const to = this.outputSel?.value || this.plugin.settings.defaultOutputScript || "devanagari";

    try {
      if ((Sanscript as any)?.t) {
        this.rightEl.value = (Sanscript as any).t(src, from, to);
        return;
      }
    } catch {}
    this.rightEl.value = src;
  }

  private insertText(text: string): void {
    if (!text) return;
    this.leftEl.focus();
    const el = this.leftEl;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const value = el.value ?? "";
    el.value = value.slice(0, start) + text + value.slice(end);
    const pos = start + text.length;
    el.selectionStart = el.selectionEnd = pos;
    this.lastInputAt = Date.now();
  }

  private bindModifierHighlights(): void {
    const set = (code: string, on: boolean) => {
      const el = this.keyboardEl.querySelector<HTMLElement>(`.its-kb-key[data-code="${code}"]`);
      if (el) el.setAttr("data-active", on ? "1" : "0");
    };
    const down = (e: KeyboardEvent) => {
      if (e.code.startsWith("Shift")) set(e.code, true);
      if (e.code.startsWith("Control")) set(e.code, true);
      if (e.code.startsWith("Alt")) set(e.code, true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code.startsWith("Shift")) set(e.code, false);
      if (e.code.startsWith("Control")) set(e.code, false);
      if (e.code.startsWith("Alt")) set(e.code, false);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    this.register(() => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    });
  }

  private toggleVirtualModifier(code: string) {
    if (code === "ShiftLeft" || code === "ShiftRight") this.vmod.shift = !this.vmod.shift;
    if (code === "AltLeft" || code === "AltRight") this.vmod.alt = !this.vmod.alt;
    if (code === "ControlLeft" || code === "ControlRight") this.vmod.ctrl = !this.vmod.ctrl;

    ["ShiftLeft","ShiftRight","AltLeft","AltRight","ControlLeft","ControlRight"].forEach((c) => {
      const el = this.keyboardEl.querySelector<HTMLElement>(`.its-kb-key[data-code="${c}"]`);
      if (!el) return;
      const on =
        (c.includes("Shift") && this.vmod.shift) ||
        (c.includes("Alt") && this.vmod.alt) ||
        (c.includes("Control") && this.vmod.ctrl);
      el.setAttr("data-active", on ? "1" : "0");
    });

    this.applyKeymapLabels(this.currentLabelKeymap);
  }
}

/* Normalize missing layers so label switching always works */
function normalizeKeymap(map: Keymap): Keymap {
  const out: Keymap = {};
  for (const [code, l] of Object.entries(map || {})) {
    const base = l.base ?? "";
    out[code] = {
      base,
      shift: l.shift ?? base,
      alt: l.alt ?? base,
      altShift: l.altShift ?? l.shift ?? base,
      ctrl: l.ctrl ?? base,
      ctrlShift: l.ctrlShift ?? l.shift ?? base,
      label: l.label,
    };
  }
  return out;
}
