import { App, PluginSettingTab, Setting } from "obsidian";
import { clampDayStartHour } from "./core/dates";
import { DEFAULT_SETTINGS, GardenSettings } from "./core/types";
import { GARDEN_FILE } from "./store/cardStore";
import type SpacedRepetitionGardenPlugin from "./main";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function sanitizeSettings(raw: Partial<GardenSettings> | null | undefined): GardenSettings {
  const source = raw ?? {};
  const dayStart =
    typeof source.dayStartHour === "number"
      ? clampDayStartHour(source.dayStartHour)
      : DEFAULT_SETTINGS.dayStartHour;
  return {
    newCardsPerDay: clampInt(source.newCardsPerDay, 0, 200, DEFAULT_SETTINGS.newCardsPerDay),
    dayStartHour: dayStart,
    retentionWindowDays: clampInt(source.retentionWindowDays, 1, 365, DEFAULT_SETTINGS.retentionWindowDays),
  };
}

export class SRGSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: SpacedRepetitionGardenPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Spaced Repetition Garden" });

    new Setting(containerEl)
      .setName("New seeds per day")
      .setDesc("How many brand-new cards may enter your reviews each day. 0 means reviews only.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.newCardsPerDay)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          this.plugin.settings = sanitizeSettings({ ...this.plugin.settings, newCardsPerDay: parsed });
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        }),
      );

    new Setting(containerEl)
      .setName("Day starts at (hour)")
      .setDesc("The hour a new review day begins. 4 means reviews after 4am count for the new day.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.dayStartHour)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          this.plugin.settings = sanitizeSettings({ ...this.plugin.settings, dayStartHour: parsed });
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        }),
      );

    new Setting(containerEl)
      .setName("Retention window (days)")
      .setDesc("How many days of reviews are included in the retention rate.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.retentionWindowDays)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isNaN(parsed)) return;
          this.plugin.settings = sanitizeSettings({ ...this.plugin.settings, retentionWindowDays: parsed });
          await this.plugin.saveSettings();
          this.plugin.updateStatusBar();
        }),
      );

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: `Card scheduling data lives in your vault at ${GARDEN_FILE}, so it travels with your notes.`,
    });
  }
}
