import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { packagePlugin, ROOT, readVersion } from "./package.mjs";

function changelogNotes(text, version) {
  const escaped = version.replace(/\./g, "\\.");
  const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*$`, "m");
  const match = heading.exec(text);
  if (!match) return `Release ${version}.`;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

const version = readVersion();
const tag = `v${version}`;
const zip = packagePlugin();
const notes = changelogNotes(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"), version);

execFileSync("gh", ["release", "create", tag, zip, "--title", tag, "--notes", notes], {
  cwd: ROOT,
  stdio: "inherit",
});

console.log(`Published ${tag}`);
