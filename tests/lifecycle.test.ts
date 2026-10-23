import { describe, expect, it } from "vitest";
import { bindFlushOnBlur } from "../src/plugin/lifecycle";

class FakeTarget {
  hidden = false;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  trigger(type: string): void {
    for (const listener of Array.from(this.listeners.get(type) ?? [])) listener();
  }
}

describe("bindFlushOnBlur", () => {
  it("flushes when the window loses focus", () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    let flushes = 0;

    bindFlushOnBlur(win, doc, () => {
      flushes += 1;
    });
    win.trigger("blur");

    expect(flushes).toBe(1);
  });

  it("flushes when the document becomes hidden", () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    let flushes = 0;

    bindFlushOnBlur(win, doc, () => {
      flushes += 1;
    });
    doc.hidden = true;
    doc.trigger("visibilitychange");
    doc.hidden = false;
    doc.trigger("visibilitychange");

    expect(flushes).toBe(1);
  });

  it("removes both listeners when disposed", () => {
    const win = new FakeTarget();
    const doc = new FakeTarget();
    let flushes = 0;

    const dispose = bindFlushOnBlur(win, doc, () => {
      flushes += 1;
    });
    dispose();
    win.trigger("blur");
    doc.hidden = true;
    doc.trigger("visibilitychange");

    expect(flushes).toBe(0);
  });
});
