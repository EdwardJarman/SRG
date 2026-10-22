import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./package.mjs";

export function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

export function tagToVersion(tag) {
  return tag.replace(/^v/, "");
}

export function versionToTag(version) {
  return `v${version}`;
}

export function syncManifestVersion(version) {
  const manifestPath = join(ROOT, "manifest.json");
  const versionsPath = join(ROOT, "versions.json");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const versions = JSON.parse(readFileSync(versionsPath, "utf8"));

  let changed = false;
  if (manifest.version !== version) {
    manifest.version = version;
    changed = true;
  }
  if (versions[version] !== manifest.minAppVersion) {
    versions[version] = manifest.minAppVersion;
    changed = true;
  }

  if (changed) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
    writeFileSync(versionsPath, `${JSON.stringify(versions, null, "\t")}\n`);
  }
  return changed;
}
