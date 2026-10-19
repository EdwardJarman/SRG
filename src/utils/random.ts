export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fnv1aHex(input: string): string {
  return fnv1a32(input).toString(16).padStart(8, "0");
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomId(): string {
  const length = 8;
  let out = "";
  const cryptoObj: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
  }
  return `srg-${out}`;
}
