const fs = require("fs");
const path = require("path");
const vm = require("vm");

const portalRoot = path.resolve(__dirname, "..");
const manualRoot = path.resolve(portalRoot, "..", "PORTAL_MANUAL_KPIFULL");
const sourcePath = path.join(manualRoot, "app", "manual-data.ts");
const outputPath = path.join(portalRoot, "public", "treinamentos-kpifull-data.js");
const imageSource = path.join(manualRoot, "public", "manual");
const imageOutput = path.join(portalRoot, "public", "treinamentos-assets");

let source = fs.readFileSync(sourcePath, "utf8");
source = source
  .replace(/export type Activity = \{[\s\S]*?\n\};\s*/m, "")
  .replace(/export type ManualModule = \{[\s\S]*?\n\};\s*/m, "")
  .replace("export const manualModules: ManualModule[] =", "globalThis.manualModules =");

const context = {};
vm.createContext(context);
vm.runInContext(source, context);

const modules = JSON.parse(JSON.stringify(context.manualModules));
for (const module of modules) {
  for (const activity of module.activities) {
    if (activity.image) activity.image = activity.image.replace("/manual/", "/treinamentos-assets/");
  }
}

fs.writeFileSync(outputPath, `window.SUEDS_MANUAL_MODULES = ${JSON.stringify(modules, null, 2)};\n`);
fs.mkdirSync(imageOutput, { recursive: true });
fs.cpSync(imageSource, imageOutput, { recursive: true });
console.log(`Manual gerado: ${modules.length} módulos em ${outputPath}`);
