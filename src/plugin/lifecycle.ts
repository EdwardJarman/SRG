export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibilityTargetLike extends EventTargetLike {
  hidden: boolean;
}

export function bindFlushOnBlur(
  win: EventTargetLike,
  doc: VisibilityTargetLike,
  flush: () => void,
): () => void {
  const onBlur = (): void => flush();
  const onVisibilityChange = (): void => {
    if (doc.hidden) flush();
  };
  win.addEventListener("blur", onBlur);
  doc.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    win.removeEventListener("blur", onBlur);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
