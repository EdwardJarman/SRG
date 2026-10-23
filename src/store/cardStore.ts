import { App } from "obsidian";
import { restoreCard as restoredCard, trashCard as trashedCard } from "../core/cardActions";
import {
  aggregateWriterStats,
  DAILY_HISTORY_DAYS,
  DATA_VERSION,
  deserializeGardenData,
  emptyGardenData,
  mergeGardenData,
  normalizeWriterStats,
  pruneDaily,
  pruneWriterStats,
  serializeGardenData,
} from "../core/persistence";
import { pathsEqual } from "../core/sections";
import { Anchor, Card, DayStats, GardenData } from "../core/types";
import { randomId } from "../utils/random";

export const GARDEN_FOLDER = "Spaced Repetition Garden";
export const GARDEN_FILE = `${GARDEN_FOLDER}/cards.json`;

const SAVE_DEBOUNCE_MS = 4000;
const COMPACT_CARD_THRESHOLD = 250;
const CONFLICT_PATTERN = /conflict/i;
const WRITE_ATTEMPTS = 3;
const BACKUP_RETENTION_DAYS = 365;
const MAX_BACKUPS = 20;
const BACKUP_PATTERN = /^cards\.json\.bak-(?:reset-)?(\d+)$/;

type Listener = () => void;

function sameData(a: GardenData, b: GardenData): boolean {
  return serializeGardenData(a, true) === serializeGardenData(b, true);
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writerDayStats(writers: GardenData["writers"], dayKey: string): DayStats | null {
  let reviews = 0;
  let again = 0;
  for (const days of Object.values(writers)) {
    const stats = days[dayKey];
    if (!stats) continue;
    reviews += stats.reviews;
    again += stats.again;
  }
  if (reviews === 0) return null;
  return { reviews, again: Math.min(reviews, again) };
}

export class GardenStore {
  loadProblem: string | null = null;

  private readonly writerId = randomId();
  private data: GardenData = emptyGardenData();
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private dirty = false;
  private persistenceDisabled = false;
  private readOnlyReason: string | null = null;
  private saveProblem: string | null = null;
  private lastSeenRaw: string | null = null;
  private lastSeenSignature: string | null = null;
  private pendingConflictPaths = new Set<string>();

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
      const message = `Could not read ${this.path}: ${String(error)}`;
      this.loadProblem = message;
      this.readOnlyReason = `${message}. Changes will not be saved.`;
      this.persistenceDisabled = true;
    }

    this.lastSeenRaw = raw;
    this.lastSeenSignature = await this.diskSignature();
    const rawVersion = raw === null ? null : tryReadVersion(raw);

    if (rawExisted && raw !== null) {
      const version = rawVersion;
      if (version !== null && version > DATA_VERSION) {
        this.persistenceDisabled = true;
        this.readOnlyReason = `${this.path} was written by a newer version of the plugin. Update Spaced Repetition Garden to edit this garden. Nothing will be saved by this version.`;
        this.loadProblem = this.readOnlyReason;
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
    let backedUpUnreadable = false;

    if (mainData && tmpData) {
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
          this.readOnlyReason = `${this.path} was written by a newer version of the plugin. Update Spaced Repetition Garden to edit this garden. Nothing will be saved by this version.`;
          this.loadProblem = this.readOnlyReason;
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
            backedUpUnreadable = true;
            this.lastSeenRaw = null;
            this.lastSeenSignature = null;
            this.loadProblem = `${this.path} was unreadable, so it was backed up to ${backupPath}. A fresh garden was started.`;
          } else {
            this.persistenceDisabled = true;
            this.readOnlyReason = `${this.path} was unreadable and could not be backed up. Changes will not be saved, to avoid overwriting it.`;
            this.loadProblem = this.readOnlyReason;
          }
        }
      }
      data = emptyGardenData();
    }

    const hadWriters = Object.keys(data.writers).length > 0;
    data = normalizeWriterStats(data);
    if (!hadWriters && Object.keys(data.writers).length > 0) shouldWrite = true;
    if (rawVersion !== null && rawVersion < DATA_VERSION) shouldWrite = true;
    if (backedUpUnreadable) shouldWrite = true;

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
      for (const path of conflicts.paths) this.pendingConflictPaths.add(path);
    }

    const keys = Object.keys(data.daily).sort();
    if (keys.length > 0) {
      const lastDay = keys[keys.length - 1];
      const prunedWriters = pruneWriterStats(data.writers, lastDay, DAILY_HISTORY_DAYS);
      if (prunedWriters > 0) {
        data.daily = aggregateWriterStats(data.writers);
        shouldWrite = true;
      }
      if (pruneDaily(data.daily, lastDay, DAILY_HISTORY_DAYS) > 0) shouldWrite = true;
    }

    this.data = data;
    if (shouldWrite) this.markDirty();
    if (!shouldWrite) await this.archivePendingConflicts();
    this.emit();
    await this.pruneBackups();
  }

  getData(): GardenData {
    return this.data;
  }

  getDataFilePath(): string {
    return this.path;
  }

  isReadOnly(): boolean {
    return this.persistenceDisabled;
  }

  getReadOnlyReason(): string | null {
    return this.readOnlyReason;
  }

  getSaveProblem(): string | null {
    return this.saveProblem;
  }

  getStatusProblem(): string | null {
    return this.saveProblem ?? this.readOnlyReason;
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

  getOrphanedCards(): Card[] {
    return this.getCards().filter((card) => card.orphaned && !card.missing);
  }

  getCard(id: string): Card | null {
    return this.data.cards[id] ?? null;
  }

  isDeleted(id: string): boolean {
    return this.data.deleted[id] !== undefined;
  }

  findCard(file: string, anchor: Anchor, includeTrashed = false): Card | null {
    for (const card of Object.values(this.data.cards)) {
      if (!includeTrashed && card.trashedAt !== null) continue;
      if (card.file === file && anchorsEqual(card.anchor, anchor)) return card;
    }
    return null;
  }

  upsert(card: Card): void {
    if (this.isDeleted(card.id)) return;
    this.data.cards[card.id] = card;
    this.markDirty();
  }

  deleteCard(id: string): void {
    if (this.data.cards[id] === undefined) return;
    delete this.data.cards[id];
    this.data.deleted[id] = Date.now();
    this.markDirty();
  }

  deleteCards(ids: string[]): number {
    let removed = 0;
    for (const id of ids) {
      if (this.data.cards[id] !== undefined) {
        delete this.data.cards[id];
        this.data.deleted[id] = Date.now();
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
        this.data.deleted[id] = Date.now();
        removed += 1;
      }
    }
    if (removed > 0) this.markDirty();
    return removed;
  }

  async resetGarden(): Promise<string | null> {
    if (this.persistenceDisabled) {
      throw new Error(this.readOnlyReason ?? "The garden is read-only.");
    }

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.writeChain;

    const adapter = this.app.vault.adapter;
    const stamp = Date.now();
    const oldRaw = await this.readCurrentRaw();
    const hadData =
      this.getAllCards().length > 0 ||
      Object.keys(this.data.daily).length > 0 ||
      Object.keys(this.data.writers).length > 0 ||
      Object.keys(this.data.deleted).length > 0;
    let backupPath: string | null = null;

    if (hadData) {
      backupPath = `${this.path}.bak-reset-${stamp}`;
      await adapter.write(backupPath, serializeGardenData(this.data));
    }

    const archived: Array<{ from: string; to: string }> = [];
    try {
      for (const path of await this.conflictCopyPaths()) {
        const to = `${path}.bak-reset-${stamp}`;
        await adapter.rename(path, to);
        archived.push({ from: path, to });
      }
    } catch (error) {
      await this.restoreArchived(archived);
      throw error;
    }

    const reset = emptyGardenData();
    reset.resetAt = stamp;
    const json = serializeGardenData(reset);

    try {
      await this.writeJsonAtomically(json, oldRaw);
    } catch (error) {
      await this.restoreArchived(archived);
      this.saveProblem = `Could not save the reset to ${this.path}. ${String(error)}`;
      this.dirty = true;
      this.emit();
      throw error;
    }

    this.data = reset;
    this.lastSeenRaw = json;
    this.lastSeenSignature = await this.diskSignature();
    await this.removeTmp();
    this.pendingConflictPaths.clear();
    this.saveProblem = null;
    this.dirty = false;
    this.emit();
    await this.pruneBackups();
    return backupPath;
  }

  recordReview(dayKey: string, wasAgain: boolean): void {
    const days = (this.data.writers[this.writerId] ??= {});
    const entry = days[dayKey] ?? { reviews: 0, again: 0 };
    entry.reviews += 1;
    if (wasAgain) entry.again += 1;
    days[dayKey] = entry;

    const aggregate = writerDayStats(this.data.writers, dayKey);
    if (aggregate) this.data.daily[dayKey] = aggregate;
    else delete this.data.daily[dayKey];

    pruneWriterStats(this.data.writers, dayKey, DAILY_HISTORY_DAYS);
    this.data.daily = aggregateWriterStats(this.data.writers);
    this.markDirty();
  }

  undoReview(dayKey: string, wasAgain: boolean): void {
    const days = this.data.writers[this.writerId];
    const entry = days?.[dayKey];
    if (!days || !entry) return;

    entry.reviews = Math.max(0, entry.reviews - 1);
    if (wasAgain) entry.again = Math.max(0, entry.again - 1);
    entry.again = Math.min(entry.reviews, entry.again);

    if (entry.reviews === 0) delete days[dayKey];
    if (Object.keys(days).length === 0) delete this.data.writers[this.writerId];

    this.data.daily = aggregateWriterStats(this.data.writers);
    this.markDirty();
  }

  repointFile(oldPath: string, newPath: string): void {
    if (this.persistenceDisabled) return;
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
    if (this.persistenceDisabled) return;
    let changed = false;
    for (const card of Object.values(this.data.cards)) {
      if (card.file !== filePath || card.missing === missing) continue;
      card.missing = missing;
      card.updatedAt = Date.now();
      changed = true;
    }
    if (changed) this.markDirty();
  }

  setFileMissingPrefix(path: string, missing: boolean): number {
    if (this.persistenceDisabled) return 0;
    let changed = 0;
    for (const card of Object.values(this.data.cards)) {
      const matches = card.file === path || card.file.startsWith(`${path}/`);
      if (!matches || card.missing === missing) continue;
      card.missing = missing;
      card.updatedAt = Date.now();
      changed += 1;
    }
    if (changed > 0) this.markDirty();
    return changed;
  }

  clearMissing(cardId: string): void {
    const card = this.data.cards[cardId];
    if (!card || !card.missing) return;
    card.missing = false;
    card.updatedAt = Date.now();
    this.markDirty();
  }

  setOrphaned(cardId: string, orphaned: boolean): void {
    const card = this.data.cards[cardId];
    if (!card || card.orphaned === orphaned) return;
    card.orphaned = orphaned;
    card.updatedAt = Date.now();
    this.markDirty();
  }

  clearOrphaned(cardId: string): void {
    this.setOrphaned(cardId, false);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reconcileMissingNotes(): Promise<{ markedMissing: number; restored: number }> {
    if (this.persistenceDisabled) return { markedMissing: 0, restored: 0 };
    const paths = Array.from(new Set(this.getAllCards().map((card) => card.file))).sort();
    const exists = new Map<string, boolean | null>();
    for (const path of paths) exists.set(path, await this.fileExists(path));

    const now = Date.now();
    let markedMissing = 0;
    let restored = 0;
    let changed = false;
    for (const card of this.getAllCards()) {
      const present = exists.get(card.file);
      if (present === null || present === undefined) continue;
      const missing = !present;
      if (card.missing === missing) continue;
      card.missing = missing;
      card.updatedAt = now;
      changed = true;
      if (missing) markedMissing += 1;
      else restored += 1;
    }
    if (changed) this.markDirty();
    return { markedMissing, restored };
  }

  async syncFromDisk(): Promise<void> {
    if (this.persistenceDisabled) return;
    if (await this.mergeDiskChanges()) this.markDirty();
    if (this.persistenceDisabled) return;
    await this.syncConflictCopies();
  }

  async syncConflictCopies(): Promise<void> {
    if (this.persistenceDisabled) return;
    const conflicts = await this.readConflictCopies();
    if (!conflicts) return;
    const merged = mergeGardenData(this.data, conflicts.data);
    for (const path of conflicts.paths) this.pendingConflictPaths.add(path);
    if (!sameData(merged, this.data)) {
      this.data = merged;
      this.markDirty();
      return;
    }
    await this.archivePendingConflicts();
  }

  async flush(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.persistenceDisabled) return;
    if (!this.dirty) {
      await this.archivePendingConflicts();
      return;
    }

    this.dirty = false;
    this.writeChain = this.writeChain.then(async () => {
      try {
        await this.writeWithRetry();
        const hadProblem = this.saveProblem !== null;
        this.saveProblem = null;
        await this.archivePendingConflicts();
        if (hadProblem) this.emit();
      } catch (error) {
        this.dirty = true;
        this.saveProblem = `Could not save ${this.path}. ${String(error)}`;
        console.error("[Spaced Repetition Garden] Could not save garden data:", error);
        this.emit();
      }
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

  private async writeWithRetry(): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt++) {
      try {
        await this.writeCurrent();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < WRITE_ATTEMPTS) await delay(attempt * 75);
      }
    }
    throw lastError;
  }

  private async writeCurrent(): Promise<void> {
    if (this.persistenceDisabled) return;
    if (await this.mergeDiskChanges()) this.emit();
    if (this.persistenceDisabled) return;

    const compact = this.getAllCards().length >= COMPACT_CARD_THRESHOLD;
    const json = serializeGardenData(this.data, compact);
    if (json === this.lastSeenRaw) return;

    await this.writeJsonAtomically(json, this.lastSeenRaw);
    this.lastSeenRaw = json;
    this.lastSeenSignature = await this.diskSignature();
  }

  private async writeJsonAtomically(json: string, oldRaw: string | null): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (this.folder && !(await adapter.exists(this.folder))) {
      try {
        await adapter.mkdir(this.folder);
      } catch (error) {
        if (!(await adapter.exists(this.folder))) throw error;
      }
    }

    await adapter.write(this.tmpPath, json);
    try {
      if (await adapter.exists(this.path)) await adapter.remove(this.path);
      await adapter.rename(this.tmpPath, this.path);
    } catch (error) {
      if (oldRaw !== null) {
        try {
          if (!(await adapter.exists(this.path))) await adapter.write(this.path, oldRaw);
        } catch {
          // Best effort recovery; the original error is more useful.
        }
      }
      try {
        if (await adapter.exists(this.tmpPath)) await adapter.remove(this.tmpPath);
      } catch {
        // Best effort cleanup.
      }
      throw error;
    }
  }

  private async mergeDiskChanges(): Promise<boolean> {
    const snapshot = await this.readDiskSnapshot();
    if (!snapshot) return false;
    this.lastSeenSignature = snapshot.signature;
    if (snapshot.raw === this.lastSeenRaw) return false;
    this.lastSeenRaw = snapshot.raw;

    const version = tryReadVersion(snapshot.raw);
    if (version !== null && version > DATA_VERSION) {
      this.persistenceDisabled = true;
      this.readOnlyReason = `${this.path} was written by a newer version of the plugin. Update Spaced Repetition Garden to edit this garden. Nothing will be saved by this version.`;
      this.emit();
      return false;
    }

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

  private async readCurrentRaw(): Promise<string | null> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.path)) return await adapter.read(this.path);
    } catch {
      return null;
    }
    return null;
  }

  private async diskSignature(): Promise<string | null> {
    try {
      const adapter = this.app.vault.adapter;
      const stat = await adapter.stat(this.path);
      if (!stat || stat.type !== "file") return null;
      return `${stat.mtime}:${stat.ctime}:${stat.size}`;
    } catch {
      return null;
    }
  }

  private async fileExists(path: string): Promise<boolean | null> {
    const vault = this.app.vault as unknown as {
      getAbstractFileByPath?: (path: string) => unknown;
    };
    if (typeof vault.getAbstractFileByPath === "function") {
      try {
        if (vault.getAbstractFileByPath(path) !== null) return true;
      } catch {
        return null;
      }
    }
    try {
      const stat = await this.app.vault.adapter.stat(path);
      if (!stat) return false;
      return stat.type === "file";
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
        // A half-synced copy is retried on the next load.
      }
    }
    return merged ? { data: merged, paths: used } : null;
  }

  private async archivePendingConflicts(): Promise<void> {
    if (this.pendingConflictPaths.size === 0) return;
    const adapter = this.app.vault.adapter;
    const stamp = Date.now();
    for (const path of Array.from(this.pendingConflictPaths)) {
      const archive = `${path}.merged-${stamp}`;
      try {
        await adapter.rename(path, archive);
        this.pendingConflictPaths.delete(path);
      } catch (error) {
        console.error("[Spaced Repetition Garden] Could not archive conflicted copy:", error);
      }
    }
  }

  private async restoreArchived(archived: Array<{ from: string; to: string }>): Promise<void> {
    const adapter = this.app.vault.adapter;
    for (const { from, to } of archived.reverse()) {
      try {
        if (await adapter.exists(to)) await adapter.rename(to, from);
      } catch {
        // Best effort; the backup still contains the merged state.
      }
    }
  }

  private async pruneBackups(): Promise<void> {
    if (this.folder === "") return;
    let files: string[];
    try {
      files = (await this.app.vault.adapter.list(this.folder)).files;
    } catch {
      return;
    }

    const backups: Array<{ path: string; timestamp: number }> = [];
    for (const path of files) {
      const match = BACKUP_PATTERN.exec(basename(path));
      if (!match) continue;
      backups.push({ path, timestamp: Number(match[1]) });
    }
    backups.sort((a, b) => b.timestamp - a.timestamp);
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 86_400_000;
    for (const backup of backups) {
      if (backups.indexOf(backup) < MAX_BACKUPS && backup.timestamp >= cutoff) continue;
      try {
        await this.app.vault.adapter.remove(backup.path);
      } catch {
        // Best effort cleanup.
      }
    }
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
