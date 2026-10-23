import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { packagePlugin, ROOT, readVersion } from "./package.mjs";
import { tagToVersion, versionToTag } from "./version.mjs";

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit" });
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function changelogNotes(text, version) {
  const escaped = version.replace(/\./g, "\\.");
  const heading = new RegExp(`^## \\[${escaped}\\][^\\n]*$`, "m");
  const match = heading.exec(text);
  if (!match) return `Release ${version}.`;
  const rest = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function tagExists(tag) {
  try {
    capture("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

const dryRun = process.argv.includes("--dry-run");
const version = readVersion();
const tag = versionToTag(version);
if (tagToVersion(tag) !== version) {
  console.error(`Invalid release tag ${tag} for version ${version}.`);
  process.exit(1);
}

const dirty = capture("git", ["status", "--porcelain"]);
if (dirty) {
  if (!dryRun) {
    console.error("Your working tree has changes. Commit them before releasing.");
    console.error(dirty);
    process.exit(1);
  }
  console.warn("Dry run: working tree has changes, so commit and tag steps are skipped.");
}

if (!dryRun && tagExists(tag)) {
  console.error(`Tag ${tag} already exists. Bump the version before releasing.`);
  process.exit(1);
}

const zip = packagePlugin({ syncVersion: !dryRun });
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
if (manifest.version !== version) {
  if (dryRun) {
    console.warn(`Dry run: manifest.json is at ${manifest.version}, package.json is at ${version}.`);
  } else {
    console.error(`manifest.json is at ${manifest.version}, but package.json is at ${version}.`);
    process.exit(1);
  }
}

const notes = changelogNotes(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"), version);
if (dryRun) {
  console.log(`Dry run OK for tag ${tag}.`);
  console.log(`Package: ${zip}`);
  console.log(`Notes preview:\n${notes}`);
  process.exit(0);
}

const status = capture("git", ["status", "--porcelain"]);
if (status) {
  run("git", ["add", "manifest.json", "versions.json"]);
  run("git", ["commit", "-m", `Release ${tag}`]);
}
run("git", ["push"]);

run("git", ["tag", "-a", tag, "-m", tag]);
run("git", ["push", "origin", tag]);
