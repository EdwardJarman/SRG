import { syncManifestVersion } from "./version.mjs";

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/sync-version.mjs <version>");
  process.exit(1);
}

const changed = syncManifestVersion(version);
console.log(changed ? `manifest set to ${version}` : `manifest already at ${version}`);
