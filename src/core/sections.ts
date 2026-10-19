import { fnv1aHex } from "../utils/random";

export interface Heading {
  level: number;
  text: string;
  startLine: number;
  endLine: number;
}

export interface ParsedText {
  lines: string[];
  frontmatterEndLine: number;
  headings: Heading[];
}

export interface SectionMatch {
  index: number;
  path: string[];
  title: string;
  hash: string;
  content: string;
}

export interface BlockMatch {
  startLine: number;
  endLine: number;
  text: string;
}

export interface HeadingTarget {
  path: string[];
  hash: string;
  title: string;
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchAtx(trimmed: string): { level: number; text: string } | null {
  const match = /^(#{1,6})(\s|$)/.exec(trimmed);
  if (!match) return null;
  const level = match[1].length;
  let text = trimmed.slice(level).replace(/^\s+/, "");
  text = text.replace(/\s+#+\s*$/, "").trimEnd();
  return { level, text };
}

function isParagraphLine(line: string, beforeLine: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  const indent = line.length - line.trimStart().length;
  if (indent > 3) return false;
  if (/^[#>\-*+|`~^]/.test(trimmed)) return false;
  if (/^\d+\.\s/.test(trimmed)) return false;
  if (/^(=+|-+)\s*$/.test(trimmed)) return false;
  return beforeLine.trim() === "";
}

export function parseText(text: string): ParsedText {
  const lines = text.split(/\r?\n/);

  let frontmatterEndLine = -1;
  if (lines.length > 0 && lines[0].trimEnd() === "---") {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      if (line === "---" || line === "...") {
        frontmatterEndLine = i;
        break;
      }
    }
  }

  const headings: Heading[] = [];
  let fenceMarker: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (i <= frontmatterEndLine) continue;

    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    const fence = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence) {
      const marker = fence[1][0];
      if (fenceMarker === null) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = null;
      continue;
    }

    if (fenceMarker !== null) continue;
    if (indent > 3) continue;

    const atx = matchAtx(trimmed);
    if (atx) {
      headings.push({ level: atx.level, text: atx.text, startLine: i, endLine: i });
      continue;
    }

    if (/^(=+|-+)\s*$/.test(trimmed)) {
      const textLine = i - 1;
      if (textLine > frontmatterEndLine) {
        const before = textLine - 1 <= frontmatterEndLine ? "" : lines[textLine - 1];
        if (isParagraphLine(lines[textLine], before)) {
          headings.push({
            level: trimmed.startsWith("=") ? 1 : 2,
            text: lines[textLine].trim(),
            startLine: textLine,
            endLine: i,
          });
        }
      }
    }
  }

  return { lines, frontmatterEndLine, headings };
}

export function headingPaths(parsed: ParsedText): string[][] {
  const paths: string[][] = [];
  const stack: { level: number; text: string }[] = [];
  for (const heading of parsed.headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    stack.push({ level: heading.level, text: heading.text });
    paths.push(stack.map((entry) => entry.text));
  }
  return paths;
}

export function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function sectionRange(parsed: ParsedText, index: number): { startLine: number; endLine: number } {
  const heading = parsed.headings[index];
  let endLine = parsed.lines.length - 1;
  for (let j = index + 1; j < parsed.headings.length; j++) {
    if (parsed.headings[j].level <= heading.level) {
      endLine = parsed.headings[j].startLine - 1;
      break;
    }
  }
  return { startLine: heading.endLine + 1, endLine };
}

export function sectionContent(parsed: ParsedText, index: number): string {
  const { startLine, endLine } = sectionRange(parsed, index);
  if (endLine < startLine) return "";
  return parsed.lines
    .slice(startLine, endLine + 1)
    .join("\n")
    .trim();
}

function normalizeContent(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function sectionHash(parsed: ParsedText, index: number): string {
  return fnv1aHex(normalizeContent(sectionContent(parsed, index)));
}

export function findHeadingIndexAtLine(parsed: ParsedText, line: number): number {
  let result = -1;
  for (let i = 0; i < parsed.headings.length; i++) {
    if (parsed.headings[i].startLine <= line) result = i;
    else break;
  }
  return result;
}

export function headingTargetAtLine(parsed: ParsedText, line: number): HeadingTarget | null {
  const index = findHeadingIndexAtLine(parsed, line);
  if (index === -1) return null;
  return {
    path: headingPaths(parsed)[index],
    hash: sectionHash(parsed, index),
    title: parsed.headings[index].text,
  };
}

export function findSection(parsed: ParsedText, anchor: { path: string[]; hash: string }): SectionMatch | null {
  const paths = headingPaths(parsed);
  const build = (index: number): SectionMatch => ({
    index,
    path: paths[index],
    title: parsed.headings[index].text,
    hash: sectionHash(parsed, index),
    content: sectionContent(parsed, index),
  });

  const candidates: number[] = [];
  for (let i = 0; i < parsed.headings.length; i++) {
    if (pathsEqual(paths[i], anchor.path)) candidates.push(i);
  }
  for (const index of candidates) {
    if (sectionHash(parsed, index) === anchor.hash) return build(index);
  }
  if (candidates.length > 0) return build(candidates[0]);

  for (let i = 0; i < parsed.headings.length; i++) {
    if (sectionHash(parsed, i) === anchor.hash) return build(i);
  }
  return null;
}

export function findBlockByRef(parsed: ParsedText, blockId: string): BlockMatch | null {
  const idPattern = new RegExp(`(?:^|\\s)\\^${escapeRegExp(blockId)}\\s*$`);
  let found = -1;
  for (let i = 0; i < parsed.lines.length; i++) {
    if (idPattern.test(parsed.lines[i])) {
      found = i;
      break;
    }
  }
  if (found === -1) return null;

  const headingLines = new Set<number>();
  for (const heading of parsed.headings) {
    for (let line = heading.startLine; line <= heading.endLine; line++) headingLines.add(line);
  }

  let start = found;
  while (start > 0 && parsed.lines[start - 1].trim() !== "" && !headingLines.has(start - 1)) start--;
  let end = found;
  while (end < parsed.lines.length - 1 && parsed.lines[end + 1].trim() !== "" && !headingLines.has(end + 1)) end++;

  const text = parsed.lines
    .slice(start, end + 1)
    .join("\n")
    .replace(new RegExp(`[ \\t]*\\^${escapeRegExp(blockId)}[ \\t]*$`, "m"), "");

  return { startLine: start, endLine: end, text };
}

export function plainTextTitle(text: string, maxLength = 80): string {
  const firstLine = text.split("\n").find((line) => line.trim() !== "") ?? "";
  let title = firstLine
    .trim()
    .replace(/^[>\s]*(?:[-*+]|\d+\.)?\s*/, "")
    .replace(/^#+\s*/, "")
    .trim();
  if (title.length > maxLength) title = `${title.slice(0, maxLength - 3)}...`;
  return title;
}

export function stripFrontmatter(parsed: ParsedText): string {
  const start = parsed.frontmatterEndLine === -1 ? 0 : parsed.frontmatterEndLine + 1;
  return parsed.lines.slice(start).join("\n");
}
