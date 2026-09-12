import { PluginSettingTab, Setting, type App } from "obsidian";
import type PluginExperiment from "../main";

export interface PluginSettings {
  topN: number;
  adaptiveBoostEnabled: boolean;
}

export const SETTINGS_VERSION = 1;
export const DEFAULT_SETTINGS: PluginSettings = { topN: 5, adaptiveBoostEnabled: true };

export function sanitizeSettings(value: unknown): PluginSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    topN: typeof raw.topN === "number" && Number.isInteger(raw.topN) && raw.topN >= 3 && raw.topN <= 15
      ? raw.topN : DEFAULT_SETTINGS.topN,
    adaptiveBoostEnabled: typeof raw.adaptiveBoostEnabled === "boolean"
      ? raw.adaptiveBoostEnabled : DEFAULT_SETTINGS.adaptiveBoostEnabled,
  };
}

export class FindDontSearchSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: PluginExperiment) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Related results")
      .setDesc("How many notes to show in the related panel and Find a note.")
      .addSlider(slider => slider.setLimits(3, 15, 1).setValue(this.plugin.settings.topN)
        .setDynamicTooltip().onChange(async topN => {
          await this.plugin.saveSettings({ ...this.plugin.settings, topN });
        }));
    new Setting(containerEl)
      .setName("Adaptive ranking")
      .setDesc("Boost notes you've previously opened from search or the related panel.")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.adaptiveBoostEnabled)
        .onChange(async adaptiveBoostEnabled => {
          await this.plugin.saveSettings({ ...this.plugin.settings, adaptiveBoostEnabled });
        }));
    new Setting(containerEl)
      .setName("Rebuild index")
      .setDesc("Refresh connections by indexing all Markdown notes again.")
      .addButton(button => button.setButtonText("Rebuild index")
        .setDisabled(this.plugin.indexStatus === "loading").onClick(() => {
          this.plugin.rebuildIndex();
          this.display();
        }));
    const count = `${this.plugin.index.size} notes indexed`;
    const status = this.plugin.indexStatus === "ready" ? `Ready — ${count}`
      : this.plugin.indexStatus === "loading" ? `Indexing… — ${count}`
      : `Error — check the console and try Rebuild index — ${count}`;
    new Setting(containerEl).setName("Index status").setDesc(status);
  }
}
