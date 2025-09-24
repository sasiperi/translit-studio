// src/view/TypingStudioView.ts
import { ItemView, WorkspaceLeaf } from "obsidian";
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

type LabelKeymap = Keymap; // same shape; values are already mapped labels

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

  /* State */
  private labelRefs: Map<string, HTMLElement> = new Map();
  private mod = { shift: false, alt: false, ctrl: false };
  private vmod = { shift: false, alt: false, ctrl: false }; // sticky via mouse
  private idleTimer: number | null = null;
  private lastInputAt = 0;

  private data: LoadedData = {
    keymaps: new Map<string, Keymap>(),
    schemes: new Map<string, SchemeMap>(),
    layouts: new Map<string, any>(),
  };

  private currentLayoutId = "ansi-4row";     // physical layout id (from layouts/*.json)
  private currentLayoutPhonemes: Keymap = {}; // KeyEvent.code -> { base/shift/...: PHONEME_ID }
  private currentSchemeId = "itrans";        // scheme id (from schemes/*.json)
  private currentScheme: SchemeMap | null = null; // PHONEME_ID -> token
  private currentLabelKeymap: LabelKeymap = {};   // labels shown on keys

  constructor(public leaf: WorkspaceLeaf, private plugin: any) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Indic typing studio"; }
  getIcon() { return "keyboard"; }

  async onOpen() {
    const { containerEl } = this;
    containerEl.empty();

    /* Load user data from disk */
    this.data = await loadUserData(this.app, this.plugin.settings.userLayoutsFolder || "user-layouts");
    

    // Choose a layout (prefer ansi-4row, else first available with .keys)
    if (this.data.layouts.has("ansi-4row")) {
      this.currentLayoutId = "ansi-4row";
    } else if (this.data.layouts.size) {
      this.currentLayoutId = Array.from(this.data.layouts.keys())[0]!;
    }

    const layoutObj = this.data.layouts.get(this.currentLayoutId);
    const layoutKeys: Keymap | undefined = layoutObj?.keys;
    this.currentLayoutPhonemes = normalizeKeymap(layoutKeys || {}); // safe: {} if missing

    // Choose scheme (from settings or first available)
    const availableSchemes = Array.from(this.data.schemes.keys()).sort();
    if (availableSchemes.length) {
      this.currentSchemeId = availableSchemes.includes(this.plugin.settings.defaultInputScheme)
        ? this.plugin.settings.defaultInputScheme
        : availableSchemes[0]!;
    } else {
      this.currentSchemeId = this.plugin.settings.defaultInputScheme || "itrans";
    }
    this.currentScheme = this.data.schemes.get(this.currentSchemeId) ?? null;

    // Build initial label keymap
    this.currentLabelKeymap = this.buildLabelKeymap(this.currentLayoutPhonemes, this.currentScheme);

    /* UI */
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
    this.showKbChk.onchange = () => {
      this.keyboardEl.toggleClass("its-hidden", !this.showKbChk.checked);
      this.plugin.settings.showKeyboardByDefault = this.showKbChk.checked;
      this.plugin.saveSettings();
    };

    // Input (schemes) selector — only from user JSON
    this.toolbarEl.createSpan({ text: " input:", cls: "its-small" });
    this.inputSel = this.toolbarEl.createEl("select");
    if (availableSchemes.length === 0) {
      // indicate empty state
      this.inputSel.createEl("option", { value: "", text: "(no schemes found)" });
      this.inputSel.disabled = true;
    } else {
      for (const id of availableSchemes) {
        const o = this.inputSel.createEl("option", { text: id, value: id });
        if (id === this.currentSchemeId) o.selected = true;
      }
      this.inputSel.onchange = async () => {
        this.currentSchemeId = this.inputSel.value;
        this.plugin.settings.defaultInputScheme = this.currentSchemeId;
        await this.plugin.saveSettings();
        this.currentScheme = this.data.schemes.get(this.currentSchemeId) ?? null;
        this.currentLabelKeymap = this.buildLabelKeymap(this.currentLayoutPhonemes, this.currentScheme);
        this.applyKeymapLabels(this.currentLabelKeymap);
        this.fullConvert();
      };
    }

    // Output selector (Sanscript targets)
    this.toolbarEl.createSpan({ text: " → output:", cls: "its-small" });
    this.outputSel = this.toolbarEl.createEl("select");
    for (const s of OUTPUT_SCRIPTS) {
      const o = this.outputSel.createEl("option", { text: s, value: s });
      if (s === this.plugin.settings.defaultOutputScript) o.selected = true;
    }
    this.outputSel.onchange = async () => {
      this.plugin.settings.defaultOutputScript = this.outputSel.value;
      await this.plugin.saveSettings();
      this.fullConvert();
    };

    // Keyboard shell + labels
    this.keyboardEl = this.rootEl.createDiv({ cls: "its-kb" });
    if (!this.showKbChk.checked) this.keyboardEl.addClass("its-hidden");
    this.mountKeyboardShell();
    this.cacheLabelRefs();
    this.applyKeymapLabels(this.currentLabelKeymap);

    // Panes
    this.panesEl = this.rootEl.createDiv({ cls: "its-panes" });
    const leftPane = this.panesEl.createDiv({ cls: "its-pane its-left" });
    leftPane.createDiv({ cls: "label", text: "Left: Type here (input scheme or Unicode)" });
    this.leftEl = leftPane.createEl("textarea");
    const rightPane = this.panesEl.createDiv({ cls: "its-pane its-right" });
    rightPane.createDiv({ cls: "label", text: "Right: Live output (target script)" });
    this.rightEl = rightPane.createEl("textarea");
    this.rightEl.readOnly = true;

    // Typing handlers (space + idle)
    const convertOnSpace = this.plugin.settings.convertOnSpace ?? true;
    const idleMs = this.plugin.settings.idleMs ?? 3000;

    this.leftEl.addEventListener("keydown", (ev) => {
      this.lastInputAt = Date.now();
      if (ev.key === " " && convertOnSpace) {
        this.fullConvert(); // simplifies: convert entire buffer
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

      const token = this.currentScheme?.[phoneme] ?? phoneme; // map via scheme, else identity
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

    // First conversion
    this.fullConvert();
  }

  async onClose() {}

  /* ── Helpers ───────────────────────────────────────────── */

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
    for (const [code, node] of this.labelRefs.entries()) {
      const layers = map[code];
      let text = layers ? this.pickLayer(layers) || layers.label || "" : "";
      if (!text) text = STATIC_LABELS[code] ?? "";
      node.setText(text);
    }
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
