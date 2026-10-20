import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly heading: string,
    private readonly message: string,
    private readonly confirmLabel: string,
    private readonly onConfirm: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    const { contentEl } = this;
    contentEl.addClass("srg-confirm");
    contentEl.createEl("p", { text: this.message });

    const actions = contentEl.createDiv({ cls: "srg-confirm-actions" });
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { text: this.confirmLabel, cls: "mod-cta" });
    confirm.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.confirmed) this.onConfirm();
  }
}
