// src/main.ts
import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE, TypingStudioView } from "./view/TypingStudioView";
import { PluginSettingsTab } from "./settings/PluginSettingsTab";

export interface PluginSettings {
  userLayoutsFolder: string;     // folder to scan for user keymaps/layouts
  exportFolder: string;          // where to write "Export right to note"
  openLocation: "main" | "right"; // where to open the studio
  defaultInputScheme: string;    // initial input keymap id
  defaultOutputScript: string;   // initial output script (for Sanscript)
  showKeyboardByDefault: boolean;
  imeModeByDefault: boolean;
  convertOnSpace: boolean;
  idleMs: number;
}

export const DEFAULTS: PluginSettings = {
  userLayoutsFolder: "user-layouts",
  exportFolder: "Indic-Typing",
  openLocation: "main",
  defaultInputScheme: "devanagari",    // safe fallback
  defaultOutputScript: "devanagari",
  showKeyboardByDefault: true,
  imeModeByDefault: true,
  convertOnSpace: true,
  idleMs: 3000,
};

export default class IndicTypingStudioPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULTS };

  async onload() {
    await this.loadSettings();
// in src/main.ts, inside onload()
this.addCommand({
  id: "its-diagnose-paths",
  name: "ITS: Diagnose paths",
  callback: async () => {
    const base = (this.settings.userLayoutsFolder ?? "").toString().trim().replace(/^\/+/, "") || "user-layouts";
    const a = this.app.vault.adapter;
    const rootList = await a.list("");
    const existsBase = await a.exists(base);
    const existsSchemes = await a.exists(`${base}/schemes`);
    const existsLayouts = await a.exists(`${base}/layouts`);
    const schemesList = existsSchemes ? await a.list(`${base}/schemes`) : { files: [], folders: [] };

    console.warn("[ITS] DIAG vault top-level folders:", rootList.folders);
    console.warn("[ITS] DIAG base:", base, "exists:", existsBase);
    console.warn("[ITS] DIAG schemes exists:", existsSchemes, "files:", schemesList.files);
    console.warn("[ITS] DIAG layouts exists:", existsLayouts);
  },
});



    this.registerView(VIEW_TYPE, (leaf) => new TypingStudioView(leaf, this));

    this.addCommand({
      id: "open-indic-typing-studio",
      name: "Open Indic typing studio",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new PluginSettingsTab(this.app, this));
  }
  

  async activateView() {
    // honor user preference: main leaf vs right sidebar
    let leaf: WorkspaceLeaf;
    if (this.settings.openLocation === "right") {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    } else {
      leaf = this.app.workspace.getLeaf(true);
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
}
