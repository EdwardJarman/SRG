export interface CanvasCall {
  kind: "method" | "set";
  name: string;
  args?: unknown[];
  value?: unknown;
}

export function fakeCanvasContext(): {
  ctx: CanvasRenderingContext2D;
  calls: CanvasCall[];
} {
  const calls: CanvasCall[] = [];
  const target: Record<string, unknown> = {};

  const ctx = new Proxy(target, {
    get(_target, property) {
      const name = String(property);
      if (name === "measureText") {
        return () => ({ width: 40 });
      }
      if (name === "createLinearGradient" || name === "createRadialGradient") {
        return () => ({ addColorStop: () => undefined });
      }
      return (...args: unknown[]) => {
        calls.push({ kind: "method", name, args });
      };
    },
    set(_target, property, value) {
      calls.push({ kind: "set", name: String(property), value });
      return true;
    },
  });

  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
