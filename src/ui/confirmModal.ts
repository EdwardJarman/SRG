import { App, Modal } from "obsidian";

export interface ConfirmOptions {
  requireText?: string;
  danger?: boolean;
}

export class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onConfirm: () => void,
    private readonly options: ConfirmOptions = {},
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    const { contentEl } = this;
    contentEl.addClass("srg-confirm");
    contentEl.createEl("p", { text: this.message });

    let confirm: HTMLButtonElement | null = null;
    const required = this.options.requireText;

    if (required) {
      const row = contentEl.createDiv({ cls: "srg-confirm-required" });
      row.createEl("label", { text: `Type ${required} to confirm` });
      const input = row.createEl("input", { type: "text" });
      input.addEventListener("input", () => {
        if (confirm) confirm.disabled = input.value.trim().toLowerCase() !== required.toLowerCase();
      });
    }

    const actions = contentEl.createDiv({ cls: "srg-confirm-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    confirm = actions.createEl("button", {
      text: this.confirmLabel,
      cls: this.options.danger ? "mod-warning" : "mod-cta",
    });
    if (required) confirm.disabled = true;
    confirm.addEventListener("click", () => {
      if (required) {
        const input = contentEl.querySelector<HTMLInputElement>(".srg-confirm-required input");
        if (!input || input.value.trim().toLowerCase() !== required.toLowerCase()) return;
      }
      this.confirmed = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.confirmed) this.onConfirm();
  }
}
