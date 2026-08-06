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

/* The fragment shader lives in core/babel-frag.glsl as PLAIN TEXT and is
   escaped on the way in. That is not tidiness, it is bug #10: the shader used
   to be typed directly into a JS template literal in the prototype, so a
   backtick anywhere in 1,200 lines of GLSL -- including inside a comment --
   closed the literal and broke the page. It happened once for real and was
   reproduced by accident during the mottling hunt. Escaping backticks and
   backslashes here makes that impossible by construction.

   `${...}` is deliberately NOT escaped: the shader interpolates geometry
   constants (${G.R_CELL.toFixed(3)} and friends) and must keep doing so. */
const escapeForTemplate = s => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

const FRAG = new URL("./babel-frag.glsl", import.meta.url);

/* TWO STAGES, because the shader is itself part-generated. babel-glsl.mjs owns
   the lattice's GLSL port, which lives inside babel-frag.glsl; babel-frag.glsl
   in turn lives inside the prototype. Build the inner file first or the outer
   one inlines a stale copy. */
const GLSL_REGIONS = [
  ["@glsl-topology", () => TOPOLOGY_GLSL.trim() + "\n"],
  ["@glsl-study",    () => STUDY_GLSL.trim() + "\n"],
  ["@glsl-desc",     () => DESC_GLSL.trim() + "\n"]
];
const HTML_REGIONS = [
  ["@core", () => stripModuleSyntax(readFileSync(new URL("./babel-core.mjs", import.meta.url), "utf8"))],
  ["@text", () => stripModuleSyntax(readFileSync(new URL("./babel-text.mjs", import.meta.url), "utf8"))],
  ["@frag", () => fragDeclaration(readFileSync(FRAG, "utf8"))]
];

/* The region is the WHOLE declaration, not the string inside it, because ANGLE
   requires #version on the literal first line of the shader -- it rejects even
   a comment above it, which the GLSL ES spec would allow. A marker inside the
   literal therefore breaks compilation, and did exactly that once here. */
const fragDeclaration = src =>
  "const FRAG = `" + escapeForTemplate(src).replace(/\s+$/, "") + "`;\n";

const report = [];

function splice(text, where, regions){
  for (const [name, source] of regions){
    const open = `/* ${name}:begin */`, close = `/* ${name}:end */`;
    const i = text.indexOf(open), j = text.indexOf(close);
    if (i < 0 || j < 0) throw new Error(`${where}: missing ${open} .. ${close}`);
    if (j < i) throw new Error(`${name}: end marker precedes begin marker`);
    if (text.indexOf(open, i + 1) >= 0) throw new Error(`${name}: begin marker appears twice`);
    const body = source();
    const was = text.slice(i + open.length, j);
    text = text.slice(0, i + open.length) + "\n" + body + text.slice(j);
    report.push(`  ${name.padEnd(15)} ${body.split("\n").length - 1} lines` +
                (was.trim() === body.trim() ? "" : "   (changed)"));
  }
  return text;
}

const fragBefore = readFileSync(FRAG, "utf8");
const fragAfter  = splice(fragBefore, "core/babel-frag.glsl", GLSL_REGIONS);
if (!check && fragAfter !== fragBefore) writeFileSync(FRAG, fragAfter);

const before = readFileSync(HTML, "utf8");
/* the outer stage must see the freshly built shader, not the one on disk */
const html = splice(before, HTML.pathname, HTML_REGIONS.map(([n, f]) =>
  n === "@frag" ? [n, () => fragDeclaration(fragAfter)] : [n, f]));

if (check){
  const same = html === before && fragAfter === fragBefore;
  console.log(same ? "up to date" : "STALE -- run: node core/build.mjs");
  process.exit(same ? 0 : 1);
}

writeFileSync(HTML, html);
console.log(`built app/babel-phase1.html from core/`);
console.log(report.join("\n"));
console.log(html === before ? "  (no change)" : `  file is now ${html.split("\n").length} lines`);
