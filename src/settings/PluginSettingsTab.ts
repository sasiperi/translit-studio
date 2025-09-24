// src/settings/PluginSettingsTab.ts
import {
  App,
  PluginSettingTab,
  Setting,
  DropdownComponent,
  Notice,
} from "obsidian";
import type IndicTypingStudioPlugin from "../main";
import { loadUserKeymaps } from "../loaders/userKeymaps";

export class PluginSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: IndicTypingStudioPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Indic typing studio — Settings" });

    /* ── Folders ─────────────────────────────────────────────── */

    new Setting(containerEl)
      .setName("User layouts folder")
      .setDesc("Folder where custom keyboard keymaps/layouts (JSON) are stored.")
      .addText((t) => {
        t.setPlaceholder("user-layouts")
          .setValue(this.plugin.settings.userLayoutsFolder)
          .onChange(async (v) => {
          const val = String(v ?? "");
          this.plugin.settings.userLayoutsFolder = val.trim() || "user-layouts";
          await this.plugin.saveSettings();
        });

      });

    new Setting(containerEl)
      .setName("Default export folder")
      .setDesc("Folder where converted output notes are saved.")
      .addText((t) => {
        t.setPlaceholder("Indic-Typing")
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (v) => {
            this.plugin.settings.exportFolder = v.trim() || "Indic-Typing";
            await this.plugin.saveSettings();
          });
      });

    /* ── Open location ───────────────────────────────────────── */

    new Setting(containerEl)
      .setName("Open studio in")
      .setDesc("Choose whether the studio opens in the main editing area or the right sidebar.")
      .addDropdown((d: DropdownComponent) => {
        d.addOptions({ main: "Main leaf", right: "Right sidebar" });
        d.setValue(this.plugin.settings.openLocation);
        d.onChange(async (val: string) => {
          const v = (val === "right" ? "right" : "main") as "main" | "right";
          this.plugin.settings.openLocation = v;
          await this.plugin.saveSettings();
        });
      });

    /* ── Toggles & timings ───────────────────────────────────── */

    new Setting(containerEl)
      .setName("Show keyboard by default")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.showKeyboardByDefault)
          .onChange(async (v) => {
            this.plugin.settings.showKeyboardByDefault = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("IME mode by default")
      .setDesc(
        "When enabled, keystrokes insert from the keymap; when disabled, they type raw characters.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.imeModeByDefault)
          .onChange(async (v) => {
            this.plugin.settings.imeModeByDefault = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Convert on space")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.convertOnSpace)
          .onChange(async (v) => {
            this.plugin.settings.convertOnSpace = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Idle conversion delay (ms)")
      .setDesc("Re-run conversion after you stop typing.")
      .addText((t) =>
        t
          .setPlaceholder("3000")
          .setValue(String(this.plugin.settings.idleMs))
          .onChange(async (v) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) {
              new Notice("Enter a valid number");
              return;
            }
            this.plugin.settings.idleMs = n;
            await this.plugin.saveSettings();
          }),
      );

    /* ── Defaults (input keymap / output script) ─────────────── */

    containerEl.createEl("h4", { text: "Defaults" });

    // Keep a typed handle so TS knows about addOption()
    let inputDD: DropdownComponent | null = null;

    new Setting(containerEl)
  .setName("Default input keymap")
  .setDesc("Pick which user keymap to use by default.")
  .addDropdown((d: DropdownComponent) => {
    inputDD = d; // capture reference
    // temporary option until we populate from disk
    d.addOption(this.plugin.settings.defaultInputScheme, this.plugin.settings.defaultInputScheme);
    d.setValue(this.plugin.settings.defaultInputScheme);
    d.onChange(async (val: string) => {
      this.plugin.settings.defaultInputScheme = val;
      await this.plugin.saveSettings();
    });
  });


    new Setting(containerEl)
      .setName("Default output script")
      .setDesc("Used for transliteration output (e.g., devanagari, telugu, itrans).")
      .addText((t) =>
        t
          .setPlaceholder("devanagari / telugu / itrans ...")
          .setValue(this.plugin.settings.defaultOutputScript)
          .onChange(async (v) => {
            this.plugin.settings.defaultOutputScript =
              v.trim() || "devanagari";
            await this.plugin.saveSettings();
          }),
      );

    // Populate input keymap list asynchronously from userLayoutsFolder
    (async () => {
  try {
    const maps = await loadUserKeymaps(this.app, this.plugin.settings.userLayoutsFolder);
    const ids = Array.from(maps.keys()).sort();

    const d = inputDD as DropdownComponent | null;
    if (!d) return; // safety: UI not constructed yet

    // clear options safely
    (d as any).selectEl.innerHTML = "";

    if (ids.length === 0) {
      d.addOption(this.plugin.settings.defaultInputScheme, this.plugin.settings.defaultInputScheme);
    } else {
      ids.forEach((id) => d.addOption(id, id));
    }

    const desired = ids.includes(this.plugin.settings.defaultInputScheme)
      ? this.plugin.settings.defaultInputScheme
      : (ids[0] ?? this.plugin.settings.defaultInputScheme);

    d.setValue(desired);
  } catch (e) {
    console.error("[ITS] failed to load user keymaps", e);
  }
})();

  }
}
