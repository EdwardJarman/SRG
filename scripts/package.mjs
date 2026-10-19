import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

export const PLUGIN_ID = "spaced-repetition-garden";
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function readVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function run(command, args, cwd = ROOT) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function zipFolder(stageDir, zipPath) {
  if (process.platform === "win32") {
    run("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force`,
    ]);
    return;
  }
  run("zip", ["-r", zipPath, PLUGIN_ID], join(ROOT, "dist"));
}

export function packagePlugin() {
  const version = readVersion();
  const dist = join(ROOT, "dist");
  const stage = join(dist, PLUGIN_ID);
  const zipPath = join(dist, `${PLUGIN_ID}-${version}.zip`);

  run(process.execPath, [join(ROOT, "esbuild.config.mjs"), "production"]);

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    const source = join(ROOT, file);
    if (!existsSync(source)) {
      throw new Error(`${file} is missing - the build did not produce it.`);
    }
    cpSync(source, join(stage, file));
  }

  zipFolder(stage, zipPath);
  console.log(`Packaged ${zipPath}`);
  return zipPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  packagePlugin();
}
