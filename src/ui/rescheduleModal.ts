import { App, Modal } from "obsidian";
import { DAY_MS, logicalDayStart } from "../core/dates";
import { Card } from "../core/types";

interface Preset {
  label: string;
  days: number;
}

const PRESETS: Preset[] = [
  { label: "Now", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
  { label: "In a month", days: 30 },
  { label: "In 3 months", days: 90 },
];

function toDateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string, dayStartHour: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), dayStartHour, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

export class RescheduleModal extends Modal {
  private selected: number;

  constructor(
    app: App,
    private readonly card: Card,
    private readonly dayStartHour: number,
    private readonly onSubmit: (due: number) => void,
  ) {
    super(app);
    this.selected = card.due;
  }

  onOpen(): void {
    this.titleEl.setText("Reschedule plant");
    const { contentEl } = this;
    contentEl.addClass("srg-reschedule");

    contentEl.createEl("p", {
      cls: "srg-reschedule-sub",
      text: this.card.title || this.card.file,
    });

    const summary = contentEl.createDiv({ cls: "srg-reschedule-summary" });
    const dateRow = contentEl.createDiv({ cls: "srg-reschedule-date" });
    dateRow.createEl("label", { text: "On" });
    const dateInput = dateRow.createEl("input", { type: "date" });
    dateInput.value = toDateInputValue(this.selected);

    const updateSummary = (): void => {
      summary.setText(`Next review on ${new Date(this.selected).toLocaleDateString()}.`);
    };
    updateSummary();

    const presets = contentEl.createDiv({ cls: "srg-reschedule-presets" });
    for (const preset of PRESETS) {
      const button = presets.createEl("button", { text: preset.label });
      button.addEventListener("click", () => {
        this.selected =
          preset.days === 0
            ? Date.now()
            : logicalDayStart(Date.now(), this.dayStartHour) + preset.days * DAY_MS;
        dateInput.value = toDateInputValue(this.selected);
        updateSummary();
      });
    }

    dateInput.addEventListener("change", () => {
      const parsed = fromDateInputValue(dateInput.value, this.dayStartHour);
      if (parsed !== null) {
        this.selected = parsed;
        updateSummary();
      }
    });

    const actions = contentEl.createDiv({ cls: "srg-reschedule-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", { text: "Reschedule", cls: "mod-cta" });
    submit.addEventListener("click", () => {
      const due = this.selected;
      this.close();
      this.onSubmit(due);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
