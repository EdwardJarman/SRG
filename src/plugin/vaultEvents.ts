import { GardenStore } from "../store/cardStore";

export interface VaultEventHost {
  store: GardenStore;
  notify(message: string, timeout?: number): void;
}

export function handleVaultDelete(host: VaultEventHost, filePath: string): void {
  const affected = host.store.getAllCards().filter((card) => card.file === filePath);
  if (affected.length === 0) return;
  host.store.setFileMissing(filePath, true);
  host.notify(
    affected.length === 1
      ? "1 plant lost its note and is held back. Restore the note or remove it in Manage plants."
      : `${affected.length} plants lost their notes and are held back. Restore the notes or remove them in Manage plants.`,
    8000,
  );
}

export function handleVaultCreate(host: VaultEventHost, filePath: string): void {
  host.store.setFileMissing(filePath, false);
}

export function handleVaultRename(host: VaultEventHost, oldPath: string, newPath: string): void {
  host.store.repointFile(oldPath, newPath);
}
