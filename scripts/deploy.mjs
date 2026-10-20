import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { PLUGIN_ID, ROOT } from "./package.mjs";

function vaultFromArgs() {
  const index = process.argv.indexOf("--vault");
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  if (process.env.SRG_VAULT) return process.env.SRG_VAULT;
  return null;
}

const vault = vaultFromArgs();
if (!vault) {
  console.error("No vault given. Use: npm run deploy -- --vault \"<path to vault>\"");
  console.error("Or set SRG_VAULT to the vault path.");
  process.exit(1);
}

const target = join(vault, ".obsidian", "plugins", PLUGIN_ID);
if (!existsSync(join(vault, ".obsidian"))) {
  console.error(`${vault} does not look like an Obsidian vault.`);
  process.exit(1);
}

execFileSync(process.execPath, [join(ROOT, "esbuild.config.mjs"), "production"], {
  cwd: ROOT,
  stdio: "inherit",
});

mkdirSync(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  cpSync(join(ROOT, file), join(target, file));
}

console.log(`Deployed to ${target}`);
console.log("Reload Obsidian (Ctrl+R) to pick up the change.");
