import { App } from "obsidian";

export class FakeAdapter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`No such file: ${path}`);
    return value;
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async rename(from: string, to: string): Promise<void> {
    const value = this.files.get(from);
    if (value === undefined) throw new Error(`No such file: ${from}`);
    this.files.delete(from);
    this.files.set(to, value);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  list(): string[] {
    return Array.from(this.files.keys()).sort();
  }
}

export function fakeApp(adapter: FakeAdapter): App {
  return { vault: { adapter } } as unknown as App;
}
