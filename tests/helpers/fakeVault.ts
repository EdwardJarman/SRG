import { App } from "obsidian";

interface FakeStat {
  type: "file" | "folder";
  mtime: number;
  ctime: number;
  size: number;
}

export class FakeAdapter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();
  readonly mtimes = new Map<string, number>();

  writeCount = 0;
  removeCount = 0;
  readCount = 0;

  private clock = 1_000;

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    this.readCount += 1;
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`No such file: ${path}`);
    return value;
  }

  async write(path: string, data: string): Promise<void> {
    this.writeCount += 1;
    this.files.set(path, data);
    this.mtimes.set(path, this.tick());
  }

  async remove(path: string): Promise<void> {
    this.removeCount += 1;
    this.files.delete(path);
    this.mtimes.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    const value = this.files.get(from);
    if (value === undefined) throw new Error(`No such file: ${from}`);
    const mtime = this.mtimes.get(from);
    this.files.delete(from);
    this.mtimes.delete(from);
    this.files.set(to, value);
    this.mtimes.set(to, mtime ?? this.tick());
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async stat(path: string): Promise<FakeStat | null> {
    if (this.folders.has(path)) {
      return { type: "folder", mtime: 0, ctime: 0, size: 0 };
    }
    const data = this.files.get(path);
    if (data === undefined) return null;
    const mtime = this.mtimes.get(path) ?? 0;
    return { type: "file", mtime, ctime: mtime, size: data.length };
  }

  list(path = ""): { files: string[]; folders: string[] } {
    const prefix = path === "" ? "" : `${path.replace(/\/+$/, "")}/`;
    return {
      files: Array.from(this.files.keys())
        .filter((file) => file.startsWith(prefix))
        .sort(),
      folders: Array.from(this.folders)
        .filter((folder) => folder.startsWith(prefix))
        .sort(),
    };
  }
}

export function fakeApp(adapter: FakeAdapter): App {
  return { vault: { adapter } } as unknown as App;
}
