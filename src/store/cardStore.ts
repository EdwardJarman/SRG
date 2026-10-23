import { App } from "obsidian";
import { restoreCard as restoredCard, trashCard as trashedCard } from "../core/cardActions";
import {
  DAILY_HISTORY_DAYS,
  DATA_VERSION,
  deserializeGardenData,
  emptyGardenData,
  mergeGardenData,
  pruneDaily,
  serializeGardenData,
} from "../core/persistence";
import { pathsEqual } from "../core/sections";
import { Anchor, Card, DayStats, GardenData } from "../core/types";

export const GARDEN_FOLDER = "Spaced Repetition Garden";
export const GARDEN_FILE = `${GARDEN_FOLDER}/cards.json`;

const SAVE_DEBOUNCE_MS = 4000;
const COMPACT_CARD_THRESHOLD = 250;
const CONFLICT_PATTERN = /conflict/i;

type Listener = () => void;

function sameData(a: GardenData, b: GardenData): boolean {
  return serializeGardenData(a, true) === serializeGardenData(b, true);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

export class GardenStore {
  loadProblem: string | null = null;

  private data: GardenData = emptyGardenData();
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private dirty = false;
  private persistenceDisabled = false;
  private lastSeenRaw: string | null = null;
  private lastSeenSignature: string | null = null;
  private lastWriteError: unknown = null;

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

    this.lastSeenRaw = raw;
    this.lastSeenSignature = await this.diskSignature();

    if (rawExisted && raw !== null) {
      const version = tryReadVersion(raw);
      if (version !== null && version > DATA_VERSION) {
        this.persistenceDisabled = true;
        this.loadProblem = `${this.path} was written by a newer version of the plugin. It is loaded read-only; changes will not be saved.`;
        this.data = emptyGardenData();
        this.emit();
        return;
      }
    }

    const tmpRaw = await this.readTmp();
    const mainData = raw === null ? null : deserializeGardenData(raw);
    const tmpData = tmpRaw === null ? null : deserializeGardenData(tmpRaw);

    let data: GardenData | null = null;
    let shouldWrite = false;

    if (mainData && tmpData) {
      // A crash can leave a temp file beside a good one. Keep both rather than
      // throwing away whichever was written first.
      data = mergeGardenData(mainData, tmpData);
      shouldWrite = !sameData(data, mainData);
      await this.removeTmp();
    } else if (mainData) {
      data = mainData;
      await this.removeTmp();
    } else if (tmpData) {
      data = tmpData;
      shouldWrite = true;
    }

    if (data === null) {
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
      data = emptyGardenData();
    }

    const conflicts = await this.readConflictCopies();
    if (conflicts) {
      const merged = mergeGardenData(data, conflicts.data);
      if (!sameData(merged, data)) {
        data = merged;
        shouldWrite = true;
        if (this.loadProblem === null) {
          this.loadProblem = `Merged ${conflicts.paths.length} conflicted ${
            conflicts.paths.length === 1 ? "copy" : "copies"
          } of ${basename(this.path)} into the garden.`;
        }
      }
    }

    const keys = Object.keys(data.daily).sort();
    if (keys.length > 0 && pruneDaily(data.daily, keys[keys.length - 1], DAILY_HISTORY_DAYS) > 0) {
      shouldWrite = true;
    }

    this.data = data;
    if (shouldWrite) this.markDirty();
    this.emit();
  }

  getData(): GardenData {
    return this.data;
  }

  isReadOnly(): boolean {
    return this.persistenceDisabled;
  }

  getAllCards(): Card[] {
    return Object.values(this.data.cards);
  }

  getCards(): Card[] {
    return this.getAllCards().filter((card) => card.trashedAt === null);
  }

  getTrashedCards(): Card[] {
    return this.getAllCards().filter((card) => card.trashedAt !== null);
  }

  getMissingCards(): Card[] {
    return this.getCards().filter((card) => card.missing);
  }

  getCard(id: string): Card | null {
    return this.data.cards[id] ?? null;
  }

  findCard(file: string, anchor: Anchor, includeTrashed = false): Card | null {
    for (const card of Object.values(this.data.cards)) {
      if (!includeTrashed && card.trashedAt !== null) continue;
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

  deleteCards(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.data.cards[id] !== undefined) {
        delete this.data.cards[id];
        removed += 1;
      }
    }
    if (removed > 0) this.markDirty();
    return removed;
  }

  trashCard(id: string, now: number): void {
    const card = this.data.cards[id];
    if (!card || card.trashedAt !== null) return;
    this.data.cards[id] = trashedCard(card, now);
    this.markDirty();
  }

  trashCards(ids: string[], now: number): number {
    let changed = 0;
    for (const id of ids) {
      const card = this.data.cards[id];
      if (!card || card.trashedAt !== null) continue;
      this.data.cards[id] = trashedCard(card, now);
      changed += 1;
    }
    if (changed > 0) this.markDirty();
    return changed;
  }

  restoreCard(id: string, now: number): void {
    const card = this.data.cards[id];
    if (!card || card.trashedAt === null) return;
    this.data.cards[id] = restoredCard(card, now);
    this.markDirty();
  }

  emptyTrash(): number {
    let removed = 0;
    for (const [id, card] of Object.entries(this.data.cards)) {
      if (card.trashedAt !== null) {
        delete this.data.cards[id];
        removed += 1;
      }
    }
    if (removed > 0) this.markDirty();
    return removed;
  }

  async resetGarden(): Promise<string | null> {
    const adapter = this.app.vault.adapter;
    const stamp = Date.now();

    let backupPath: string | null = null;
    if (this.getAllCards().length > 0 || Object.keys(this.data.daily).length > 0) {
      backupPath = `${this.path}.bak-reset-${stamp}`;
      await adapter.write(backupPath, serializeGardenData(this.data));
    }

    for (const path of await this.conflictCopyPaths()) {
      await adapter.rename(path, `${path}.bak-reset-${stamp}`);
    }

    this.data = emptyGardenData();
    this.markDirty();
    await this.flush();
    if (this.lastWriteError !== null) throw this.lastWriteError;
    return backupPath;
  }

  recordReview(dayKey: string, wasAgain: boolean): void {
    const entry: DayStats = this.data.daily[dayKey] ?? { reviews: 0, again: 0 };
    entry.reviews += 1;
    if (wasAgain) entry.again += 1;
    this.data.daily[dayKey] = entry;
    pruneDaily(this.data.daily, dayKey, DAILY_HISTORY_DAYS);
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

  setFileMissing(filePath: string, missing: boolean): void {
    let changed = false;
    for (const card of Object.values(this.data.cards)) {
      if (card.file !== filePath || card.missing === missing) continue;
      card.missing = missing;
      card.updatedAt = Date.now();
      changed = true;
    }
    if (changed) this.markDirty();
  }

  clearMissing(cardId: string): void {
    const card = this.data.cards[cardId];
    if (!card || !card.missing) return;
    card.missing = false;
    card.updatedAt = Date.now();
    this.markDirty();
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async syncFromDisk(): Promise<void> {
    if (this.persistenceDisabled) return;
    if (await this.mergeDiskChanges()) this.markDirty();
    await this.syncConflictCopies();
  }

  async syncConflictCopies(): Promise<void> {
    const conflicts = await this.readConflictCopies();
    if (!conflicts) return;
    const merged = mergeGardenData(this.data, conflicts.data);
    if (!sameData(merged, this.data)) {
      this.data = merged;
      this.markDirty();
    }
  }

  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.persistenceDisabled || !this.dirty) return;
    this.dirty = false;
    this.writeChain = this.writeChain
      .then(() => this.writeCurrent())
      .then(() => {
        this.lastWriteError = null;
      })
      .catch((error) => {
        this.dirty = true;
        this.lastWriteError = error;
        console.error("[Spaced Repetition Garden] Could not save garden data:", error);
      });
    return this.writeChain;
  }

  private markDirty(): void {
    this.dirty = true;
    this.emit();
    if (this.persistenceDisabled || this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }

  private async writeCurrent(): Promise<void> {
    if (this.persistenceDisabled) return;
    if (await this.mergeDiskChanges()) this.emit();

    const compact = this.getAllCards().length >= COMPACT_CARD_THRESHOLD;
    const json = serializeGardenData(this.data, compact);
    if (json === this.lastSeenRaw) return;

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

    this.lastSeenRaw = json;
    this.lastSeenSignature = await this.diskSignature();
  }

  private async mergeDiskChanges(): Promise<boolean> {
    const snapshot = await this.readDiskSnapshot();
    if (!snapshot) return false;
    this.lastSeenSignature = snapshot.signature;
    if (snapshot.raw === this.lastSeenRaw) return false;
    this.lastSeenRaw = snapshot.raw;

    const external = deserializeGardenData(snapshot.raw);
    if (!external) return false;
    const merged = mergeGardenData(this.data, external);
    if (sameData(merged, this.data)) return false;
    this.data = merged;
    return true;
  }

  private async readDiskSnapshot(): Promise<{ raw: string; signature: string | null } | null> {
    const adapter = this.app.vault.adapter;
    try {
      const signature = await this.diskSignature();
      if (signature !== null && signature === this.lastSeenSignature) return null;
      if (!(await adapter.exists(this.path))) return null;
      return { raw: await adapter.read(this.path), signature };
    } catch {
      return null;
    }
  }

  private async diskSignature(): Promise<string | null> {
    try {
      const adapter = this.app.vault.adapter;
      const stat = await adapter.stat(this.path);
      if (!stat || stat.type !== "file") return null;
      return `${stat.mtime}:${stat.size}`;
    } catch {
      return null;
    }
  }

  private async conflictCopyPaths(): Promise<string[]> {
    if (this.folder === "") return [];
    let files: string[];
    try {
      files = (await this.app.vault.adapter.list(this.folder)).files;
    } catch {
      return [];
    }

    const mainBase = basename(this.path).replace(/\.json$/i, "").toLowerCase();
    return files.filter((path) => {
      if (path === this.path || path === this.tmpPath) return false;
      const name = basename(path);
      if (!name.toLowerCase().endsWith(".json")) return false;
      if (!CONFLICT_PATTERN.test(name)) return false;
      return name.toLowerCase().startsWith(mainBase);
    });
  }

  private async readConflictCopies(): Promise<{ data: GardenData; paths: string[] } | null> {
    if (this.folder === "") return null;
    const adapter = this.app.vault.adapter;
    const candidates = await this.conflictCopyPaths();

    let merged: GardenData | null = null;
    const used: string[] = [];
    for (const path of candidates) {
      try {
        const data = deserializeGardenData(await adapter.read(path));
        if (!data) continue;
        merged = merged ? mergeGardenData(merged, data) : data;
        used.push(path);
      } catch {
        // A half-synced copy is ignored; it will be retried on the next load.
      }
    }
    return merged ? { data: merged, paths: used } : null;
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
