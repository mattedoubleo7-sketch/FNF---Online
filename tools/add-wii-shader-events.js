const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MOD_ROOTS = [
  "C:/Users/matth/Downloads/wii_funkin_cleancheck/Wii Funkin' - VS Matt",
  "C:/Users/matth/Downloads/wii_funkin_-_vs_matt_c36aa/Wii Funkin' - VS Matt"
];

function existingModRoot() {
  const root = MOD_ROOTS.find(candidate => fs.existsSync(candidate));
  if (!root) throw new Error("Could not find a Wii Funkin mod root.");
  return root;
}

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function attrsFromTag(tag) {
  const attrs = {};
  for (const attr of tag.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
  return attrs;
}

function parseModchartEvents(modRoot, xmlRelative) {
  const xml = fs.readFileSync(path.join(modRoot, xmlRelative), "utf8");
  const events = [];
  for (const match of xml.matchAll(/<Event\s+([^>]+?)\s*\/>/g)) {
    const attrs = attrsFromTag(match[1]);
    if (attrs.type !== "tweenShaderProperty" || attrs.step == null) continue;
    events.push({
      step: round(attrs.step, 3),
      duration: round(attrs.time, 3),
      name: attrs.name || "",
      property: attrs.property || "",
      value: round(attrs.value, 4),
      startValue: round(attrs.startValue, 4),
      ease: attrs.ease || "linear"
    });
  }
  return events.sort((a, b) => a.step - b.step || a.name.localeCompare(b.name) || a.property.localeCompare(b.property));
}

function readChart(fileName, objectName) {
  const filePath = path.join(PROJECT_ROOT, fileName);
  const text = fs.readFileSync(filePath, "utf8").trim();
  const prefix = `window.${objectName}=`;
  if (!text.startsWith(prefix)) throw new Error(`${fileName} does not start with ${prefix}`);
  return JSON.parse(text.slice(prefix.length).replace(/;$/, ""));
}

function writeChart(fileName, objectName, chart) {
  fs.writeFileSync(path.join(PROJECT_ROOT, fileName), `window.${objectName}=${JSON.stringify(chart)};\n`, "utf8");
}

function attach(fileName, objectName, xmlRelative) {
  const modRoot = existingModRoot();
  const chart = readChart(fileName, objectName);
  chart.shaderEvents = parseModchartEvents(modRoot, xmlRelative);
  writeChart(fileName, objectName, chart);
  console.log(`${fileName}: attached ${chart.shaderEvents.length} Wii shader events`);
}

attach("combat-chart.js", "COMBAT_CHART", "mods/data/combat/modchart.xml");
attach("one-hit-chart.js", "ONE_HIT_CHART", "mods/data/one-hit/modchart.xml");
