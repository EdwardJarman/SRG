import { App } from "obsidian";
import { DATA_VERSION, deserializeGardenData, emptyGardenData, serializeGardenData } from "../core/persistence";
import { pathsEqual } from "../core/sections";
import { Anchor, Card, DayStats, GardenData } from "../core/types";

export const GARDEN_FOLDER = "Spaced Repetition Garden";
export const GARDEN_FILE = `${GARDEN_FOLDER}/cards.json`;

const SAVE_DEBOUNCE_MS = 4000;

type Listener = () => void;

export class GardenStore {
  loadProblem: string | null = null;

  private data: GardenData = emptyGardenData();
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private dirty = false;
  private persistenceDisabled = false;

  private readonly path: string;
  private readonly folder: string;
  private readonly tmpPath: string;

  constructor(
    private app: App,
    path: string = GARDEN_FILE,
  ) {
    this.path = path;
    const slash = path.lastIndexOf("/");
    this.folder = slash === -1 ? "" : path.slice(0, slash);
    this.tmpPath = `${path}.tmp`;
  }

  async load(): Promise<void> {
    const adapter = this.app.vault.adapter;
    let raw: string | null = null;
    let rawExisted = false;

    try {
      if (await adapter.exists(this.path)) {
        rawExisted = true;
        raw = await adapter.read(this.path);
      }
    } catch (error) {
      this.loadProblem = `Could not read ${this.path}: ${String(error)}`;
      this.persistenceDisabled = true;
    }

    if (raw !== null) {
      const parsed = deserializeGardenData(raw);
      if (parsed) {
        this.data = parsed;
        await this.removeTmp();
        this.emit();
        return;
      }
    }

    const tmpRaw = await this.readTmp();
    const parsedTmp = tmpRaw === null ? null : deserializeGardenData(tmpRaw);
    if (parsedTmp) {
      this.data = parsedTmp;
      this.markDirty();
      this.emit();
      return;
    }

    if (rawExisted && raw !== null) {
      const version = tryReadVersion(raw);
      if (version !== null && version > DATA_VERSION) {
        this.persistenceDisabled = true;
        this.loadProblem = `${this.path} was written by a newer version of the plugin. It is loaded read-only; changes will not be saved.`;
      } else {
        const backupPath = `${this.path}.bak-${Date.now()}`;
        let backedUp = false;
        try {
          await adapter.rename(this.path, backupPath);
          backedUp = true;
        } catch {
          backedUp = false;
        }
        if (backedUp) {
          this.loadProblem = `${this.path} was unreadable, so it was backed up to ${backupPath}. A fresh garden was started.`;
        } else {
          this.persistenceDisabled = true;
          this.loadProblem = `${this.path} was unreadable and could not be backed up. Changes will not be saved, to avoid overwriting it.`;
        }
      }
    }

    this.data = emptyGardenData();
    this.emit();
  }

  getData(): GardenData {
    return this.data;
  }

  getCards(): Card[] {
    return Object.values(this.data.cards);
  }

  getCard(id: string): Card | null {
    return this.data.cards[id] ?? null;
  }

  findCard(file: string, anchor: Anchor): Card | null {
    for (const card of Object.values(this.data.cards)) {
      if (card.file === file && anchorsEqual(card.anchor, anchor)) return card;
    }
    return null;
  }

  upsert(card: Card): void {
    this.data.cards[card.id] = card;
    this.markDirty();
  }

  deleteCard(id: string): void {
    if (this.data.cards[id] === undefined) return;
    delete this.data.cards[id];
    this.markDirty();
  }

  recordReview(dayKey: string, wasAgain: boolean): void {
    const entry: DayStats = this.data.daily[dayKey] ?? { reviews: 0, again: 0 };
    entry.reviews += 1;
    if (wasAgain) entry.again += 1;
    this.data.daily[dayKey] = entry;
    this.markDirty();
  }

  undoReview(dayKey: string, wasAgain: boolean): void {
    const entry: DayStats | undefined = this.data.daily[dayKey];
    if (!entry) return;
    entry.reviews = Math.max(0, entry.reviews - 1);
    if (wasAgain) entry.again = Math.max(0, entry.again - 1);
    if (entry.reviews === 0) {
      delete this.data.daily[dayKey];
    } else {
      this.data.daily[dayKey] = entry;
    }
    this.markDirty();
  }

  repointFile(oldPath: string, newPath: string): void {
    let changed = false;
    for (const card of Object.values(this.data.cards)) {
      if (card.file === oldPath || card.file.startsWith(`${oldPath}/`)) {
        card.file = newPath + card.file.slice(oldPath.length);
        if (card.anchor.type === "note") {
          card.title = fileNameToTitle(card.file);
        }
        card.updatedAt = Date.now();
        changed = true;
      }
    }
    if (changed) this.markDirty();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.persistenceDisabled || !this.dirty) return;
    this.dirty = false;
    const snapshot = serializeGardenData(this.data);
    this.writeChain = this.writeChain.then(() => this.writeSnapshot(snapshot)).catch((error) => {
      this.dirty = true;
      console.error("[Spaced Repetition Garden] Could not save garden data:", error);
    });
    return this.writeChain;
  }

  private markDirty(): void {
    this.dirty = true;
    this.emit();
    if (this.persistenceDisabled || this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }

  private async writeSnapshot(json: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (this.folder && !(await adapter.exists(this.folder))) {
      try {
        await adapter.mkdir(this.folder);
      } catch (error) {
        if (!(await adapter.exists(this.folder))) throw error;
      }
    }
    await adapter.write(this.tmpPath, json);
    if (await adapter.exists(this.path)) await adapter.remove(this.path);
    await adapter.rename(this.tmpPath, this.path);
  }

  private async readTmp(): Promise<string | null> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.tmpPath)) return await adapter.read(this.tmpPath);
    } catch {
      return null;
    }
    return null;
  }

  private async removeTmp(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.tmpPath)) await adapter.remove(this.tmpPath);
    } catch {
      // Best effort - a stale tmp file is cleaned up on the next successful load.
    }
  }
}

function anchorsEqual(a: Anchor, b: Anchor): boolean {
  if (a.type === "note" && b.type === "note") return true;
  if (a.type === "heading" && b.type === "heading") return pathsEqual(a.path, b.path);
  if (a.type === "block" && b.type === "block") return a.blockId === b.blockId;
  return false;
}

function fileNameToTitle(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "");
}

function tryReadVersion(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const version = (parsed as Record<string, unknown>).version;
      if (typeof version === "number" && Number.isFinite(version)) return version;
    }
    return null;
  } catch {
    return null;
  }
}
