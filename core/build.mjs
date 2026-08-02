/* ====================================================================
 * Regenerates the generated regions of app/babel-phase1.html
 * from the core modules. Run after editing anything in core/:
 *
 *     node core/build.mjs
 *
 * The prototype is a single self-contained file -- it has to be, to be
 * publishable as an artifact -- so the core is inlined rather than
 * imported. That is the one thing that could quietly rot, which is why
 * core/test-core.mjs compares the inlined text against the module and
 * fails on any difference. Build, then test.
 *
 * --check exits non-zero if the file is not what a build would produce,
 * without writing anything.
 * ==================================================================== */

import { readFileSync, writeFileSync } from "node:fs";
import { stripModuleSyntax } from "./inline.mjs";
import { TOPOLOGY_GLSL, STUDY_GLSL, DESC_GLSL } from "./babel-glsl.mjs";

const HTML = new URL("../app/babel-phase1.html", import.meta.url);
const check = process.argv.includes("--check");

const REGIONS = [
  ["@core",          () => stripModuleSyntax(readFileSync(new URL("./babel-core.mjs", import.meta.url), "utf8"))],
  ["@text",          () => stripModuleSyntax(readFileSync(new URL("./babel-text.mjs", import.meta.url), "utf8"))],
  ["@glsl-topology", () => TOPOLOGY_GLSL.trim() + "\n"],
  ["@glsl-study",    () => STUDY_GLSL.trim() + "\n"],
  ["@glsl-desc",     () => DESC_GLSL.trim() + "\n"]
];

let html = readFileSync(HTML, "utf8");
const before = html;
const report = [];

for (const [name, source] of REGIONS){
  const open = `/* ${name}:begin */`, close = `/* ${name}:end */`;
  const i = html.indexOf(open), j = html.indexOf(close);
  if (i < 0 || j < 0) throw new Error(`${HTML.pathname}: missing ${open} .. ${close}`);
  if (j < i) throw new Error(`${name}: end marker precedes begin marker`);
  if (html.indexOf(open, i + 1) >= 0) throw new Error(`${name}: begin marker appears twice`);
  const body = source();
  const was = html.slice(i + open.length, j);
  html = html.slice(0, i + open.length) + "\n" + body + html.slice(j);
  report.push(`  ${name.padEnd(15)} ${body.split("\n").length - 1} lines` +
              (was.trim() === body.trim() ? "" : "   (changed)"));
}

if (check){
  const same = html === before;
  console.log(same ? "up to date" : "STALE -- run: node core/build.mjs");
  process.exit(same ? 0 : 1);
}

writeFileSync(HTML, html);
console.log(`built app/babel-phase1.html from core/`);
console.log(report.join("\n"));
console.log(html === before ? "  (no change)" : `  file is now ${html.split("\n").length} lines`);
