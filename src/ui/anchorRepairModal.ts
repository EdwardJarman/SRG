import { App, Modal, TFile } from "obsidian";
import { Card } from "../core/types";
import { AnchorChoice, buildAnchorChoices } from "../vault/anchorChoices";

export class AnchorRepairModal extends Modal {
  private choices: AnchorChoice[] = [];

  constructor(
    app: App,
    private readonly card: Card,
    private readonly onSubmit: (choice: AnchorChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Repair plant anchor");
    const { contentEl } = this;
    contentEl.addClass("srg-repair");
    contentEl.createEl("p", {
      cls: "srg-repair-sub",
      text: this.card.title || this.card.file,
    });

    const file = this.app.vault.getAbstractFileByPath(this.card.file);
    if (!(file instanceof TFile)) {
      contentEl.createEl("p", {
        text: "The note for this plant is missing. Restore or rename it first.",
      });
      this.addCancel(contentEl);
      return;
    }

    void this.app.vault.cachedRead(file).then(
      (text) => {
        if (!this.contentEl.isConnected) return;
        this.choices = buildAnchorChoices(text, file.basename);
        const label = contentEl.createEl("label", { text: "Attach this plant to" });
        const select = contentEl.createEl("select", { cls: "dropdown" });
        label.htmlFor = "srg-repair-target";
        select.id = "srg-repair-target";
        for (let index = 0; index < this.choices.length; index++) {
          select.createEl("option", { value: String(index), text: this.choices[index].label });
        }
        const actions = contentEl.createDiv({ cls: "srg-repair-actions" });
        this.addCancel(actions);
        const submit = actions.createEl("button", { text: "Repair anchor", cls: "mod-cta" });
        submit.addEventListener("click", () => {
          const choice = this.choices[Number(select.value)];
          if (!choice) return;
          this.close();
          this.onSubmit(choice);
        });
      },
      () => {
        if (!this.contentEl.isConnected) return;
        contentEl.createEl("p", { text: "Could not read this note." });
        this.addCancel(contentEl);
      },
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addCancel(parent: HTMLElement): void {
    const actions = parent === this.contentEl ? parent.createDiv({ cls: "srg-repair-actions" }) : parent;
    const cancel = actions.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }
}
