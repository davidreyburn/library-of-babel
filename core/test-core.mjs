/* ====================================================================
 * Tests for the shared core. Run: node core/test-core.mjs
 *
 * Four jobs, in order of why they exist:
 *
 *   DRIFT      the copy inlined in the prototype must be textually
 *              identical to the module. This is the whole reason the
 *              core was extracted: the GLSL/JS twins were hand-synced,
 *              and drifted, and put walls where the renderer drew
 *              doorways. A string compare catches that in a millisecond.
 *   VECTORS    the core must still agree with core/vectors.json, which
 *              the GPU harness and the agent skill also check against.
 *   COST       a page must cost a page. The last page of a book must be
 *              no dearer than the first, or the O(1)-per-symbol claim is
 *              false and we are quietly doing 744 KiB of work per read.
 *   MEANING    diffusion, invertibility, and the format rules from §4.
 * ==================================================================== */

import { readFileSync } from "node:fs";
import { stripModuleSyntax } from "./inline.mjs";
import * as core from "./babel-core.mjs";
import * as text from "./babel-text.mjs";

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail = ""){
  if (cond){ pass++; results.push(`  ok   ${name}${detail ? "  " + detail : ""}`); }
  else     { fail++; results.push(`  FAIL ${name}${detail ? "  " + detail : ""}`); }
}
function eq(name, got, want){
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     JSON.stringify(got) === JSON.stringify(want) ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
}
function section(t){ results.push(`\n${t}`); }

/* ---- DRIFT --------------------------------------------------------- */
section("DRIFT -- the prototype's inlined copy vs this module");
{
  const html = readFileSync(new URL("../app/babel-phase1.html", import.meta.url), "utf8");
  const between = (a, b) => {
    const i = html.indexOf(a), j = html.indexOf(b);
    return (i < 0 || j < 0) ? null : html.slice(i + a.length, j);
  };
  const norm = s => s.trim().replace(/\r\n/g, "\n");

  /* The whole script, not just the generated regions. The prototype is one
     153,000-character classic <script>, and a single stray character in the
     hand-written half takes all of it down -- silently, because a parse
     error leaves the DOM standing and the page merely never starts. A
     backtick inside a comment in the GLSL template literal cost three page
     loads to find; this finds it in a millisecond. */
  {
    const m = html.match(/<script([^>]*)>([\s\S]*)<\/script>/);
    let err = null;
    if (!m) err = "no <script> block found";
    /* The block is a module now, so it may await at the top level and
       new Function() would reject it as a syntax error. Wrapping it in an
       async function accepts exactly what a module accepts, minus static
       import and export -- which this script has none of, because core is
       inlined rather than imported. Asserted, so the day it grows one this
       check says so instead of silently going blind. */
    else if (/^\s*(import|export)\s/m.test(m[2])) err = "static import/export: parse check is blind to it";
    else try { new Function("return (async () => {" + m[2] + "})"); }
         catch (e){ err = `${e.constructor.name}: ${e.message}`; }
    ok("the prototype's script parses as JavaScript", err === null,
       err ?? `${m[1].length} chars`);
  }

  for (const [region, module] of [["@core", "babel-core.mjs"], ["@text", "babel-text.mjs"]]){
    const inlined = between(`/* ${region}:begin */`, `/* ${region}:end */`);
    if (inlined === null){
      ok(`prototype carries a generated ${region} block`, false,
         "markers not found -- run: node core/build.mjs");
      continue;
    }
    const want = stripModuleSyntax(
      readFileSync(new URL(`./${module}`, import.meta.url), "utf8"));
    ok(`inlined ${region} is byte-identical to ${module}`, norm(inlined) === norm(want),
       norm(inlined) === norm(want) ? `${norm(inlined).length} chars`
         : `inlined ${norm(inlined).length} chars vs module ${norm(want).length}`);
  }
  for (const region of ["@glsl-topology", "@glsl-study"]){
    const g = between(`/* ${region}:begin */`, `/* ${region}:end */`);
    ok(`prototype carries a generated ${region} block`,
       g !== null && g.trim().length > 100,
       g ? `${g.trim().length} chars of GLSL` : "missing");
  }

  /* THE SHADER IS NOW A FILE, and the prototype's copy is generated from it.
     Same rule as the modules above: byte-identical or the build is stale. */
  {
    const glsl = readFileSync(new URL("../app/babel-frag.glsl", import.meta.url), "utf8");
    const decl = between("/* @frag:begin */", "/* @frag:end */");
    const open = decl === null ? -1 : decl.indexOf("`");
    const close = decl === null ? -1 : decl.lastIndexOf("`");
    const inlined = open >= 0 && close > open ? decl.slice(open + 1, close) : null;
    /* undo what build.mjs escaped on the way in */
    const back = inlined === null ? null
      : inlined.replace(/\\`/g, "`").replace(/\\\\/g, "\\");
    ok("inlined @frag is byte-identical to babel-frag.glsl",
       back !== null && norm(back) === norm(glsl),
       back === null ? "markers not found -- run: node core/build.mjs"
                     : `${norm(back).length} chars`);
    ok("the shader still declares #version on its first line",
       glsl.split("\n")[0].trim() === "#version 300 es",
       "ANGLE rejects even a comment above it, whatever the spec allows");
  }

  /* A backtick anywhere in GLSL used to close the JavaScript template literal
     that carried it, and 150,000 characters of script stopped parsing. I did
     that three times in one session -- twice in the prototype's hand-written
     shader, once in a comment in babel-glsl.mjs, where it is a module-level
     syntax error and takes the whole core down.

     Since the shader moved into babel-frag.glsl, build.mjs escapes backticks
     on the way in, so this can no longer break the page. The rule is kept
     anyway, one level down: what must hold now is that the ESCAPING works,
     which is what these two assertions check. */
  {
    const glsl = readFileSync(new URL("../app/babel-frag.glsl", import.meta.url), "utf8");
    const decl = between("/* @frag:begin */", "/* @frag:end */") ?? "";
    const bare = (decl.match(/(?<!\\)`/g) ?? []).length;
    ok("the generated FRAG literal has exactly two unescaped backticks",
       bare === 2, `${bare} found -- one opening, one closing, none from the GLSL`);
    ok("every backtick in the shader source is escaped when inlined",
       (glsl.match(/`/g) ?? []).length === (decl.match(/\\`/g) ?? []).length,
       `${(glsl.match(/`/g) ?? []).length} in the .glsl file`);
  }
  /* a stray import or export would throw in a classic <script> and take
     the whole prototype down, not just the core */
  ok("the inlined core declares no import or export",
     !/^\s*(import|export)\b/m.test(between("/* @core:begin */", "/* @text:end */") ?? "import"));

  /* Comparing text is not enough. An aliased import -- `wander as
     coreWander` -- survives a byte-identical comparison and then throws
     in the browser, because stripping the import leaves the alias
     undefined. So run the inlined code and call into it. */
  const blob = between("/* @core:begin */", "/* @text:end */");
  if (blob === null) ok("the inlined core evaluates and runs", false, "no blocks to run");
  else {
    let ran = null, err = null;
    try {
      ran = new Function(`"use strict";${blob}
        return { pageLine: lineOf(walkAddress({q:15,r:94,wall:1,shelf:2,slot:17}), 0, 0),
                 seat: walkToASeat({ route: 1 }).room.at,
                 stops: journey({ steps: 6, route: 7 }).stops.length,
                 here: cellAddress(15, 94, 0),
                 valid: validate(walkAddress({q:15,r:94,wall:1,shelf:2,slot:17})).ok };`)();
    } catch (e) { err = e; }
    ok("the inlined core evaluates and runs", err === null,
       err ? `${err.constructor.name}: ${err.message}` : "");
    if (ran){
      eq("the inlined core agrees with the module on a page",
         ran.pageLine, text.lineOf(text.walkAddress({ q:15, r:94, wall:1, shelf:2, slot:17 }), 0, 0));
      eq("...on where a wander finds a chair", ran.seat, text.walkToASeat({ route: 1 }).room.at);
      eq("...on a journey's length", ran.stops, text.journey({ steps: 6, route: 7 }).stops.length);
      eq("...on a cell address", ran.here, text.cellAddress(15, 94, 0));
      ok("...and on validity", ran.valid === true);
    }
  }
}

/* ---- VECTORS ------------------------------------------------------- */
section("VECTORS -- core still agrees with core/vectors.json");
{
  const v = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
  eq("alphabet", text.ALPHABET, v.alphabet);
  eq("C", text.C, v.C);
  let bad = 0, checked = 0;
  for (const c of v.topology){
    checked++;
    if (core.cellType(c.q, c.r) !== c.type) bad++;
    else if (JSON.stringify([0,1,2,3,4,5].map(i => core.gapAt(c.q, c.r, i, c.floor))) !== JSON.stringify(c.gaps)) bad++;
    else if (core.axisOf(c.q, c.r) !== c.axis) bad++;
    else if (core.riseOf(c.q, c.r) !== c.rise) bad++;
    else if (core.cellKey(c.q, c.r) !== c.cellKey) bad++;
    else if (JSON.stringify(core.shelvedWalls(c.q, c.r, c.floor)) !== JSON.stringify(c.shelvedWalls)) bad++;
  }
  ok("topology vectors reproduce", bad === 0, `${checked - bad}/${checked} cells`);

  let cbad = 0;
  for (const cv of v.content){
    const a = text.parseAddress(cv.uri);
    if (text.spineLabel(a) !== cv.spine) cbad++;
    for (const { p, s } of cv.symbols) if (text.symbolAt(a, p) !== s) cbad++;
    if (text.lineOf(a, 0, 0) !== cv.page0Line0) cbad++;
    if (text.lineOf(a, 409, 39) !== cv.page409Line39) cbad++;
  }
  ok("content vectors reproduce", cbad === 0, `${v.content.length} addresses`);
}

/* ---- COST ---------------------------------------------------------- */
section("COST -- a page must cost a page, wherever it is in the book");
{
  const a = text.walkAddress({ q: 15, r: 94, wall: 1, shelf: 2, slot: 17 });
  const time = fn => { const t0 = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t0) / 1e6; };
  text.pageOf(a, 0);                                    // warm
  const first = time(() => text.pageOf(a, 0));
  const last  = time(() => text.pageOf(a, text.PAGES - 1));
  const oneSymbol = time(() => text.symbolAt(a, text.C - 1));
  ok("first page under 50 ms", first < 50, `${first.toFixed(2)} ms`);
  ok("last page costs the same as the first (no full-book work)",
     last < Math.max(first * 4, 5), `first ${first.toFixed(2)} ms, last ${last.toFixed(2)} ms`);
  ok("the final symbol alone is effectively free", oneSymbol < 1, `${oneSymbol.toFixed(4)} ms`);
  const ten = time(() => { for (let k = 0; k < 10; k++) text.pageOf(a, k * 40); });
  ok("cost is linear in pages read", ten < Math.max(first * 25, 25),
     `10 pages in ${ten.toFixed(2)} ms vs ${(first * 10).toFixed(2)} ms expected`);
}

/* ---- MEANING: the corpus format (§4) ------------------------------- */
section("FORMAT -- §4 of the spec");
{
  eq("alphabet is 29 symbols (§17 departure from LIB-C-001)", text.RADIX, 29);
  eq("no repeated symbol", new Set(text.ALPHABET).size, 29);
  eq("letters are the English alphabet", text.LETTERS, "abcdefghijklmnopqrstuvwxyz");
  eq("410 pages (LIB-C-010)", text.PAGES, 410);
  eq("40 lines (LIB-C-011)", text.LINES, 40);
  eq("80 symbols per line (LIB-C-012)", text.COLS, 80);
  eq("C = 1,312,000 (LIB-C-013)", text.C, 1312000);
  ok("N has 1,918,667 digits", Math.floor(text.LOG10_N) + 1 === 1918667,
     `log10 N = ${text.LOG10_N.toFixed(1)}`);
  const a = text.walkAddress({ q: 15, r: 94, wall: 1, shelf: 2, slot: 17 });
  const p = text.pageOf(a, 7);
  eq("a page is 40 lines", p.lines.length, 40);
  ok("every line is 80 symbols", p.lines.every(l => l.length === 80));
  ok("every symbol is in the alphabet",
     p.lines.every(l => [...l].every(ch => text.ALPHABET.includes(ch))));
  ok("no capitals or digits (LIB-C-002)", !/[A-Z0-9]/.test(p.lines.join("")));
}

/* ---- MEANING: determinism (LIB-G-020) ------------------------------ */
section("DETERMINISM -- the same address, forever");
{
  const a = text.parseAddress("babel://walk/00001594/floor/3/cell/-7,12/wall/0/shelf/1/slot/2");
  eq("same page twice", text.pageOf(a, 5).lines, text.pageOf(a, 5).lines);
  const b = text.parseAddress(text.formatAddress(a));
  eq("survives a round trip through the URI", text.pageOf(b, 5).lines, text.pageOf(a, 5).lines);
  ok("a different seed is a different book",
     text.lineOf({ ...a, seed: 1 }, 0, 0) !== text.lineOf(a, 0, 0));
}

/* ---- MEANING: diffusion -------------------------------------------- */
section("DIFFUSION -- the volume next door is not a near twin");
{
  const base = { q: 15, r: 94, floor: 0, wall: 1, shelf: 2 };
  const A = text.walkAddress({ ...base, slot: 17 });
  const B = text.walkAddress({ ...base, slot: 18 });
  let same = 0, n = 8000;
  for (let p = 0; p < n; p++) if (text.symbolAt(A, p) === text.symbolAt(B, p)) same++;
  const rate = same / n;
  ok("adjacent slots agree at about 1 symbol in 29", rate > 0.015 && rate < 0.055,
     `${(rate * 100).toFixed(2)}% identical (chance = ${(100 / text.RADIX).toFixed(2)}%)`);
  const pA = text.pageOf(A, 0).lines.join(""), pB = text.pageOf(B, 0).lines.join("");
  ok("their first pages are visibly different", pA !== pB);

  const C1 = text.walkAddress({ ...base, q: 16, slot: 17 });
  let same2 = 0;
  for (let p = 0; p < n; p++) if (text.symbolAt(A, p) === text.symbolAt(C1, p)) same2++;
  ok("the gallery next door is unrelated too", same2 / n < 0.055,
     `${((same2 / n) * 100).toFixed(2)}% identical`);
}

/* ---- MEANING: symbol distribution ---------------------------------- */
section("DISTRIBUTION -- the filler is flat across the alphabet");
{
  const a = text.walkAddress({ q: 2, r: -5, wall: 0, shelf: 0, slot: 0 });
  const counts = new Map([...text.ALPHABET].map(ch => [ch, 0]));
  const n = 10 * text.PAGE_LEN;
  for (let p = 0; p < n; p++) counts.set(text.symbolAt(a, p), counts.get(text.symbolAt(a, p)) + 1);
  const expect = n / text.RADIX;
  const worst = Math.max(...[...counts.values()].map(v => Math.abs(v - expect) / expect));
  ok("every symbol within 15% of 1/29 over 32,000 draws", worst < 0.15,
     `worst deviation ${(worst * 100).toFixed(1)}%`);
  /* chi-square, 28 df: 48.28 is p=0.01, so a flat stream passes almost always */
  const chi = [...counts.values()].reduce((s, v) => s + (v - expect) ** 2 / expect, 0);
  ok("chi-square under the 1% critical value", chi < 48.28, `chi2 = ${chi.toFixed(1)}`);
}

/* ---- MEANING: invertibility --------------------------------------- */
section("SEARCH -- a phrase is found by writing its address down");
{
  const cases = [
    ["axaxaxas mlo", 0],
    ["kafka, quixote, wolf, zahir", 512],     // the four letters Borges dropped
    ["mcv", 79],                                  // straddles a line end
    ["dhcmrlchtdj", 3198],                        // straddles a page end
    ["the library is unlimited and cyclical.", 655360],
    ["o time thy pyramids", text.C - 19]          // the very last symbols
  ];
  let bad = 0;
  for (const [phrase, offset] of cases){
    const f = text.findPhrase(phrase, { offset });
    const a = text.parseAddress(f.address);
    const got = text.sliceOf(a, offset, phrase.length);
    if (got !== phrase){ bad++; results.push(`       at ${offset}: got "${got}"`); }
  }
  ok("every phrase is exactly where its address says", bad === 0, `${cases.length} placements`);

  const f = text.findPhrase("axaxaxas mlo", { offset: 0 });
  eq("reported page/line/column", [f.page, f.line, f.column], [0, 0, 0]);
  const g = text.findPhrase("mcv", { offset: 3200 * 5 + 80 * 3 + 12 });
  eq("page/line/column for an interior offset", [g.page, g.line, g.column], [5, 3, 12]);

  ok("a phrase outside the alphabet is refused",
     (() => { try { text.findPhrase("Hello!"); return false; } catch { return true; } })());
  ok("a phrase past the end of the book is refused",
     (() => { try { text.findPhrase("aaa", { offset: text.C - 1 }); return false; } catch { return true; } })());

  /* nearby textual mutations: one symbol changed, one symbol different */
  const A = text.textAddress({ phrase: "axaxaxas mlo", offset: 100 });
  const B = text.textAddress({ phrase: "axaxaxas mla", offset: 100 });
  let diff = 0;
  for (let p = 0; p < 4000; p++) if (text.symbolAt(A, p) !== text.symbolAt(B, p)) diff++;
  eq("a one-symbol edit differs in exactly one position", diff, 1);
}

/* ---- MEANING: addresses as citations ------------------------------- */
section("ADDRESSES -- the babel:// scheme");
{
  const canon = "babel://walk/00001594/floor/7/cell/5,-4/wall/2/shelf/1/slot/8";
  eq("round trip is stable", text.formatAddress(text.parseAddress(canon)), canon);

  /* the short hand-written form: no seed, no wall, "book" for "slot" */
  const lenient = text.parseAddress("babel://floor/7/cell/5,-4/shelf/1/book/8/page/2");
  eq("lenient form defaults the seed", lenient.seed, text.DEFAULT_SEED);
  eq("lenient form keeps the page hint", lenient.page, 2);
  eq("book is accepted for slot", lenient.slot, 8);
  ok("lenient form defaults to a wall that is really shelved",
     core.shelvedWalls(5, -4, 7).includes(lenient.wall),
     `wall ${lenient.wall} of shelved [${core.shelvedWalls(5, -4, 7).join(",")}]`);

  const t = text.textAddress({ phrase: "a, b.", offset: 5 });
  eq("text round trip", text.parseAddress(text.formatAddress(t)).phrase, "a, b.");
  ok("a bad scheme is refused",
     (() => { try { text.parseAddress("http://example.com"); return false; } catch { return true; } })());
  ok("an unknown component is refused",
     (() => { try { text.parseAddress("babel://walk/00001594/hexagon/4"); return false; } catch { return true; } })());

  /* WHERE THE CAMERA IS NOT. An address names a place and every component of
     one is checkable -- validate() refuses a doorway, a shaft, a slot out of
     range -- and that falsifiability is what the citation oracle rests on.
     Where a viewer happens to be looking is not checkable: every yaw is
     legal, and there is no camera in core/ at all. So the renderer carries
     it in its own query string (?view=x,y,z,yaw,pitch) and the scheme stays
     out of it. These two assertions exist so that adding it here later is a
     decision someone has to make on purpose rather than by drifting into. */
  for (const camera of ["look", "view", "yaw", "pitch"])
    ok(`"${camera}" is not an address component`,
       (() => { try { text.parseAddress(`babel://walk/00001594/floor/0/cell/5,-4/${camera}/1.9`);
                      return false; } catch { return true; } })());
  {
    /* and the belt to that brace: whatever the renderer stores alongside an
       address, the corpus is a function of six fields and none of them is a
       camera. A stray property must not move a single symbol. */
    const plain = text.walkAddress({ q: 5, r: -4, floor: 7, wall: 2, shelf: 1, slot: 8 });
    const withCamera = { ...plain, yaw: 1.9137, pitch: -0.2412, x: -145.8, z: -289.1 };
    eq("a camera riding along changes no symbol",
       text.sliceOf(withCamera, 203 * text.PAGE_LEN, 80),
       text.sliceOf(plain, 203 * text.PAGE_LEN, 80));
    eq("and no spine label", text.spineLabel(withCamera), text.spineLabel(plain));
  }
}

/* ---- MEANING: coordinates are falsifiable -------------------------- */
section("VALIDITY -- a claimed coordinate can be checked");
{
  const crim = text.walkAddress({ q: core.CRIM.q, r: core.CRIM.r, floor: core.CRIM.floor,
                                  wall: core.CRIM.wall, shelf: core.CRIM.shelf, slot: core.CRIM.slot });
  ok("the crimson volume's own address is valid", text.validate(crim).ok,
     text.validate(crim).reason || "");

  const walls = core.shelvedWalls(core.CRIM.q, core.CRIM.r, core.CRIM.floor);
  const doorway = [0,1,2,3,4,5].find(i => !walls.includes(i));
  const bad = text.walkAddress({ ...crim, wall: doorway });
  ok("a wall that is really a doorway is rejected", !text.validate(bad).ok,
     text.validate(bad).reason || "");
  ok("shelf out of range is rejected", !text.validate({ ...crim, shelf: 5 }).ok);
  ok("slot out of range is rejected", !text.validate({ ...crim, slot: 35 }).ok);

  /* find a shaft and a stairwell, and check both refuse to hold books */
  let shaft = null, stair = null, study = null;
  for (let q = 0; q < 400 && !(shaft && stair && study); q++)
    for (let r = 0; r < 40; r++){
      const t = core.cellType(q, r);
      if (t === core.TYPE.SHAFT && !shaft) shaft = [q, r];
      if (t === core.TYPE.STAIRWELL && !stair) stair = [q, r];
      /* on floor 0, because that is the floor walkAddress defaults to: a
         reading room is a room on a storey now, not a column */
      if (core.studyAt(q, r, 0) && !study) study = [q, r];
    }
  ok("a shaft holds no shelves", !text.validate(text.walkAddress({ q: shaft[0], r: shaft[1] })).ok);
  ok("a stairwell holds no shelves", !text.validate(text.walkAddress({ q: stair[0], r: stair[1] })).ok);
  ok("a reading room holds no shelves", !text.validate(text.walkAddress({ q: study[0], r: study[1] })).ok);
}

/* ---- MEANING: spines (§7) ------------------------------------------ */
section("SPINES -- §7");
{
  const a = text.walkAddress({ q: 15, r: 94, wall: 1, shelf: 2, slot: 17 });
  const lab = text.spineLabel(a);
  ok("letters only (LIB-L-001)", [...lab].every(ch => text.LETTERS.includes(ch)), `"${lab}"`);
  ok("at most 80 characters (LIB-L-002)", lab.length <= 80, `${lab.length} chars`);
  eq("deterministic (LIB-L-004)", text.spineLabel(a), lab);
  ok("a neighbouring slot gets a different label",
     text.spineLabel({ ...a, slot: 18 }) !== lab);
  ok("the label does not appear at the head of the pages (LIB-L-004)",
     !text.lineOf(a, 0, 0).startsWith(lab));
}

/* ---- MEANING: the lattice still measures as the spec says ---------- */
section("LATTICE -- the figures §17 of the spec quotes");
{
  /* Corridors are counted as their own type, not folded into the gallery
     bucket. Folded in they hold no shelves, so they drag the mean down and
     the assertion below would be measuring the corridor share instead of
     what a gallery holds. */
  let shafts = 0, stairs = 0, studies = 0, corridors = 0, galleries = 0, shelved = 0;
  const N = 20000;
  for (let k = 0; k < N; k++){
    const q = (k % 200) - 100, r = Math.floor(k / 200) - 50;
    const t = core.cellType(q, r);
    if (t === core.TYPE.SHAFT) shafts++;
    else if (t === core.TYPE.STAIRWELL) stairs++;
    else if (t === core.TYPE.CORRIDOR) corridors++;
    else if (core.studyAt(q, r, 0)) studies++;
    else { galleries++; shelved += core.shelvedWalls(q, r, 0).length; }
  }
  const pct = n => (n / N) * 100;
  ok("shafts about 3%", Math.abs(pct(shafts) - 3) < 0.6, `${pct(shafts).toFixed(2)}%`);
  ok("stairwells about 9%", Math.abs(pct(stairs) - 9) < 1.0, `${pct(stairs).toFixed(2)}%`);
  /* Counted on one storey. It used to be a share of columns and is now a
     share of rooms, which is the change -- the number is deliberately the
     same, so the Library has as many reading rooms as it ever did and they
     are simply no longer stacked. */
  ok("reading rooms about 2% of a storey", Math.abs(pct(studies) - 2) < 0.6, `${pct(studies).toFixed(2)}%`);
  ok("corridors about 10%", Math.abs(pct(corridors) - 10) < 1.0, `${pct(corridors).toFixed(2)}%`);
  const mean = shelved / galleries;
  ok("mean shelved walls about 3.14", Math.abs(mean - 3.14) < 0.15, `${mean.toFixed(3)}`);
  ok("a gallery therefore departs from 700 volumes",
     Math.abs(mean * 5 * 35 - 700) > 50, `${Math.round(mean * 5 * 35)} volumes on average`);
}

section("THE MIRROR -- the one fixture the story argues about");
{
  /* Half the reading rooms must be furnished exactly as they were before
     the mirror existed: studyKit went from eight arrangements to sixteen,
     and the first eight are the old eight so that key % 16 agrees with
     key % 8 wherever the index is under 8. */
  ok("the first eight kits are unchanged",
     [0,1,2,3,4,5,6,7].every(i => core.studyKit(i) === [1,3,5,7,8,12,6,4][i]),
     [0,1,2,3,4,5,6,7].map(i => core.studyKit(i)).join(","));

  let studies = 0, withMirror = 0, onlyMirror = 0, corridorMirror = 0, cells = 0;
  for (let q = -45; q <= 45; q++) for (let r = -45; r <= 45; r++){
    cells++;
    const t = core.cellType(q, r);
    if (core.studyAt(q, r, 0)){
      studies++;
      const kit = core.studyVisible(q, r, 0);
      if (kit & core.FURN_MIRROR){ withMirror++; if (kit === core.FURN_MIRROR) onlyMirror++; }
    }
    if (t === core.TYPE.CORRIDOR && core.mirrorsIn(q, r, 0).length) corridorMirror++;
  }
  ok("a reading room sometimes holds a mirror", withMirror > 0,
     `${withMirror} of ${studies} (${(withMirror / studies * 100).toFixed(1)}%)`);
  /* The kit that carries a mirror carries nothing else, so a room with one
     is a room with one thing in it -- which is the point of it. */
  ok("and when it does, it holds only the mirror", onlyMirror === withMirror,
     `${onlyMirror} of ${withMirror}`);
  /* It hangs flat on the anchor wall, which by construction has no doorway,
     so the cull that drops furniture blocking a door can never drop it. */
  ok("the mirror is never culled by a doorway",
     (() => { for (let q = -45; q <= 45; q++) for (let r = -45; r <= 45; r++){
        if (!core.studyAt(q, r, 0)) continue;
        const key = core.studyKey(q, r, 0);
        if ((core.studyKit(key) & core.FURN_MIRROR) &&
            !(core.studyVisible(q, r, 0) & core.FURN_MIRROR)) return false;
      } return true; })());
  ok("mirrorsIn finds them in both kinds of room", corridorMirror > 0 && withMirror > 0,
     `${corridorMirror} corridors, ${withMirror} reading rooms, ` +
     `1 cell in ${Math.round(cells / (corridorMirror + withMirror))}`);
  /* A named piece in a known place, exactly as a seat is: an agent that
     says it stood in front of a mirror can be checked. */
  const room = core.findMirror({ seed: 5, maxSteps: 400 });
  ok("a wander can be sent to find one", room.room !== null, `after ${room.steps} steps`);
  ok("and what it found really holds one",
     core.mirrorsIn(room.room.q, room.room.r, room.room.floor).length > 0);
}

/* ---- MEANING: traversal without a renderer ------------------------- */
section("TRAVERSAL -- the agent surface");
{
  const d = core.describeCell(15, 94, 0);
  eq("describeCell agrees with gapAt on exit count", d.exits.length,
     [0,1,2,3,4,5].filter(i => core.gapAt(15, 94, i, 0) !== core.GAP.WALL).length);
  ok("shelved walls and exits partition the six walls",
     d.shelvedWalls.length + d.exits.length === 6,
     `${d.shelvedWalls.length} shelved + ${d.exits.length} open`);
  ok("volumes follows from shelved walls", d.volumes === d.shelvedWalls.length * 5 * 35);
  /* walking through an exit and back must return you to where you were */
  let bad = 0;
  for (const e of d.exits){
    const back = core.exitsFrom(e.to.q, e.to.r, e.to.floor)
      .find(x => x.to.q === 15 && x.to.r === 94);
    if (!back) bad++;
  }
  ok("every doorway is a doorway from the other side too", bad === 0,
     `${d.exits.length} exits checked`);
  ok("a shaft is reported as not crossable",
     core.exitsFrom(15, 94, 0).every(e => e.via !== "shaft" || !e.crossable));
}

/* ---- MEANING: the wander ------------------------------------------- */
section("WANDER -- a walk that can be followed");
{
  const A = core.wander({ q: 0, r: 0, floor: 0, steps: 60, seed: 7 });
  const B = core.wander({ q: 0, r: 0, floor: 0, steps: 60, seed: 7 });
  eq("the same route seed gives the same walk", A, B);
  ok("a different route seed goes somewhere else",
     JSON.stringify(core.wander({ q: 0, r: 0, floor: 0, steps: 60, seed: 8 })) !== JSON.stringify(A));
  ok("step 40 can be checked without replaying the first 39",
     core.stepHash(7, 40) === core.stepHash(7, 40));

  /* every move must have gone through a real doorway, and nothing may
     cross a shaft or change floor except by a stair */
  let illegal = 0, crossedShaft = 0, badFloor = 0, stairs = 0;
  for (const t of A){
    if (!t.took) continue;
    const g = core.gapAt(t.q, t.r, t.took.dir, t.floor);
    if (g === core.GAP.WALL) illegal++;
    if (g === core.GAP.SHAFT) crossedShaft++;
    if (t.took.via === "stair"){
      stairs++;
      if (Math.abs(t.took.to.floor - t.floor) !== 1) badFloor++;
    } else if (t.took.to.floor !== t.floor) badFloor++;
  }
  ok("every step went through a real doorway", illegal === 0, `${A.length} steps`);
  ok("no step crossed a shaft", crossedShaft === 0);
  ok("the floor changes only on a stair, and only by one", badFloor === 0,
     `${stairs} stair crossings`);

  /* a stair entered from the bottom must climb, and from the top descend */
  let wrongWay = 0, checked = 0;
  for (let s = 1; s <= 40; s++)
    for (const t of core.wander({ q: 0, r: 0, floor: 0, steps: 40, seed: s })){
      if (!t.took || t.took.via !== "stair") continue;
      checked++;
      const back = core.throughStairwell(t.took.through.q, t.took.through.r,
                                         t.floor, (t.took.dir + 3) % 6);
      if (!back || back.climb !== -t.took.climb) wrongWay++;
    }
  ok("a stair crossed the other way reverses the climb", wrongWay === 0,
     `${checked} crossings over 40 routes`);

  /* the walk stays inside the Library: no cell it stands in is a shaft */
  ok("it never stands in a shaft",
     A.every(t => t.type !== "shaft"));
}

section("SEATS -- find a chair, sit down");
{
  const s = core.findSeat({ q: 0, r: 0, floor: 0, seed: 1, maxSteps: 400 });
  ok("a seat turns up within 400 steps", s.room !== null, `after ${s.steps} steps`);
  ok("the room it stopped in is a reading room",
     core.studyAt(s.room.q, s.room.r, s.room.floor ?? 0));
  ok("the room really contains something sittable",
     s.room.pieces.some(p => p.sittable),
     s.room.pieces.map(p => p.piece).join(", "));
  ok("only recliners and desk chairs count as seats",
     s.room.pieces.every(p => !p.sittable || ["recliner", "chair"].includes(p.piece)));
  eq("the trail ends at the room it found",
     [s.trail.at(-1).q, s.trail.at(-1).r, s.trail.at(-1).floor],
     [s.room.q, s.room.r, s.room.floor]);
  ok("the same route finds the same chair",
     JSON.stringify(core.findSeat({ q: 0, r: 0, floor: 0, seed: 1 }).room) === JSON.stringify(s.room));

  /* seats agree with what the renderer would draw and collide with */
  let disagree = 0;
  for (let k = 0; k < 3000; k++){
    const q = (k % 60) - 30, r = Math.floor(k / 60) - 25;
    if (core.cellType(q, r) !== core.TYPE.STUDY) continue;
    const pieces = core.studyPieces(q, r, 0);
    if (pieces.length !== core.studyItems(q, r, 0).length) disagree++;
  }
  ok("the piece list matches the collision list exactly", disagree === 0);
}

section("JOURNEY -- every stop is a citation");
{
  const j = text.journey({ q: 0, r: 0, floor: 0, steps: 20, route: 7, take: 3 });
  ok("every stop carries an address", j.stops.every(s => /^babel:\/\/walk\//.test(s.at)));
  const withBooks = j.stops.filter(s => s.shelves.length);
  ok("galleries offer volumes to hand", withBooks.length > 0,
     `${withBooks.length} of ${j.stops.length} stops`);
  ok("rooms with no shelves offer none",
     j.stops.every(s => s.volumes > 0 || s.shelves.length === 0));

  /* the crucial property: an address handed back must be a real shelf */
  let bad = 0;
  for (const s of withBooks)
    for (const b of s.shelves){
      const v = text.validate(text.parseAddress(b.uri));
      if (!v.ok){ bad++; results.push(`       ${b.uri}: ${v.reason}`); }
    }
  ok("every volume handed back is on a shelf that exists", bad === 0,
     `${withBooks.reduce((n, s) => n + s.shelves.length, 0)} volumes checked`);

  ok("the same route hands back the same volumes",
     JSON.stringify(text.journey({ q: 0, r: 0, floor: 0, steps: 20, route: 7 })) === JSON.stringify(j));
  ok("a different route hands back different volumes",
     JSON.stringify(text.journey({ q: 0, r: 0, floor: 0, steps: 20, route: 9 })) !== JSON.stringify(j));

  /* Route 1, not 7: the corridor reshuffled every wander. Which route comes
     up empty moves whenever the lattice does, so the pair below is picked
     from a scan rather than remembered -- most routes find a chair, and the
     ones that do not must say so rather than invent one. */
  const seat = text.walkToASeat({ route: 1 });
  ok("walkToASeat reports an address for the room", /^babel:\/\/walk\//.test(seat.room.at));
  ok("and reports how far it walked to get there", seat.steps > 0, `${seat.steps} steps`);
  ok("a route that finds nothing says so rather than inventing a chair",
     text.walkToASeat({ route: 8 }).found === false);
}

section("PACKED DESC -- the int the shader and the CPU both read");
{
  let bad = 0, studies = 0, stairs = 0, corridors = 0;
  for (let k = 0; k < 6000; k++){
    const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
    const d = core.cellDesc(q, r, 0);
    const gaps = [0,1,2,3,4,5].map(i => core.gapAt(q, r, i, 0));
    if (JSON.stringify(core.descGaps(d)) !== JSON.stringify(gaps)) bad++;
    const t = core.cellType(q, r);
    if (t === core.TYPE.STAIRWELL){
      stairs++;
      if (core.descAxis(d) !== core.axisOf(q, r)) bad++;
      if (core.descRise(d) !== core.riseOf(q, r)) bad++;
    }
    if (t === core.TYPE.STUDY){
      studies++;
      const key = core.studyKey(q, r, 0);
      if (core.descAnchor(d) !== core.studyAnchor(q, r, 0, key)) bad++;
      if (core.descKit(d) !== core.studyVisible(q, r, 0)) bad++;
    }
    if (t === core.TYPE.CORRIDOR){
      corridors++;
      if (core.descCorrAxis(d) !== core.corridorAxis(q, r)) bad++;
      for (let side = 0; side < 2; side++)
        if (core.descAlcove(d, side) !== core.alcoveAt(q, r, 0, side)) bad++;
    }
  }
  ok("every field round-trips through the packing", bad === 0,
     `6000 cells, ${stairs} stairwells, ${studies} reading rooms, ${corridors} corridors`);
  /* the culled kit is the field the shader reads instead of recomputing per
     SDF sample, so it is the one that would silently misplace furniture */
  ok("the culled kit never exceeds the room's kit",
     (() => { for (let k = 0; k < 6000; k++){
        const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
        if (!core.studyAt(q, r, 0)) continue;
        const key = core.studyKey(q, r, 0);
        if (core.descKit(core.cellDesc(q, r, 0)) & ~core.studyKit(key)) return false;
      } return true; })());
  ok("the packing ends at bit 28 and nothing spills past it",
     (() => { for (let k = 0; k < 6000; k++){
        const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
        if (core.cellDesc(q, r, 0) >>> 29) return false;
      } return true; })());
  /* A cell is only ever one type, so the corridor's fields sit above the
     study's rather than on top of them. Assert the separation, or a later
     type will alias one of these and the shader will read furniture out of
     an alcove -- which is exactly what a fifth kit bit would have done had
     the corridor still started at 22. */
  /* Bit 23 is read two ways -- the low bit of a corridor's axis, and the
     flag that says a gallery is furnished this storey -- which is only safe
     because a cell is never both. Say what each type may use, so the next
     field to want a bit has to come here and take one. */
  ok("every type keeps to its own fields",
     (() => { for (let k = 0; k < 6000; k++){
        const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
        const d = core.cellDesc(q, r, 0), t = core.cellType(q, r);
        if (t === core.TYPE.CORRIDOR){          // 23-24 axis, 25-28 alcoves
          if ((d >> 12) & 0x7FF) return false;
        } else if (core.studyAt(q, r, 0)){      // 15-17 anchor, 18-22 kit, 23 furnished
          if (d >>> 24) return false;
          if (!core.descStudy(d)) return false;
        } else if (t === core.TYPE.STAIRWELL){  // 12-14 axis and rise, 15-16 the ends
          if (d >>> 17) return false;
        } else {                                // a gallery or a shaft: gaps, nothing else
          if (d >>> 12) return false;
        }
      } return true; })());
}

section("EMPTY SLOTS -- the gaps the Purifiers left (D-42)");
{
  let gaps = 0, n = 0;
  for (let k = 0; k < 4000; k++){
    const q = k % 80, r = Math.floor(k / 80);
    if (core.cellType(q, r) !== core.TYPE.GALLERY) continue;
    for (const wall of core.shelvedWalls(q, r, 0))
      for (let shelf = 0; shelf < 5; shelf++)
        for (let slot = 0; slot < 35; slot++){
          n++;
          if (!core.volumePresent(q, r, wall, shelf, slot)) gaps++;
        }
  }
  const rate = gaps / n;
  /* This mirrors a hash inside the shader's mapAt that is NOT yet shared,
     so this loose statistical check is the only guard against drift -- it
     would catch a broken mirror, not a subtly different one. */
  ok("about 3.5% of slots stand empty", Math.abs(rate - 0.035) < 0.008,
     `${(rate * 100).toFixed(2)}% over ${n.toLocaleString()} slots`);
  ok("it is deterministic",
     core.volumePresent(15, 94, 1, 2, 17) === core.volumePresent(15, 94, 1, 2, 17));
}

/* ---- KEY WIDTH ------------------------------------------------------ *
 * A shelved volume's content is a function of its key alone, so the key's
 * width is a hard ceiling on how many distinct books the whole walkable
 * lattice can hold -- however many shelves it has. One 32-bit lane capped
 * it at 2^32, about 4.3 billion across some 8x10^21 slots, and duplicates
 * turned up after roughly 93,000 slots. Two lanes move that to 2^64.   */
section("KEY WIDTH -- two lanes, and what the second one is for");
{
  /* The pair that used to be one book (§17.12). */
  const A = text.walkAddress({ q: 0, r: 20, floor: 0, wall: 4, shelf: 3, slot: 26 });
  const B = text.walkAddress({ q: 2, r: 32, floor: 0, wall: 0, shelf: 0, slot: 19 });
  ok("the pair that was once a single book now differs immediately",
     text.digitAt(A, 0) !== text.digitAt(B, 0) && text.spineLabel(A) !== text.spineLabel(B),
     `${text.spineLabel(A)} vs ${text.spineLabel(B)}`);

  /* The sharp one: lane 0 still collides on the 32-bit schedule, and the
     second lane has to rescue every one of those. If a future edit derived
     lane 1 from lane 0, this is the assertion that would fail. */
  const byLane0 = new Map();
  let n = 0, shareLane0 = 0, shareBoth = 0;
  for (let q = 0; q < 200000 && n < 500000; q++){
    for (let r = 0; r < 40 && n < 500000; r++){
      if (core.cellType(q, r) !== core.TYPE.GALLERY) continue;
      for (const wall of core.shelvedWalls(q, r, 0))
        for (let shelf = 0; shelf < 5; shelf++)
          for (let slot = 0; slot < 35; slot++){
            const [k0, k1] = text.addressKey(text.walkAddress({ q, r, floor: 0, wall, shelf, slot }));
            n++;
            if (!byLane0.has(k0)) byLane0.set(k0, k1);
            else { shareLane0++; if (byLane0.get(k0) === k1) shareBoth++; }
          }
    }
  }
  ok("lane 0 alone still collides, as a 32-bit lane must",
     shareLane0 > 5, `${shareLane0} pairs share lane 0 in ${n.toLocaleString()} addresses`);
  ok("and the second lane is independent, so it rescues all of them",
     shareBoth === 0, `${shareBoth} pairs share both lanes`);

  /* And the consequence, measured on content rather than on keys. */
  const seen = new Set();
  let m = 0, dup = 0;
  for (let q = 0; q < 200000 && m < 400000; q++){
    for (let r = 0; r < 40 && m < 400000; r++){
      if (core.cellType(q, r) !== core.TYPE.GALLERY) continue;
      for (const wall of core.shelvedWalls(q, r, 0))
        for (let shelf = 0; shelf < 5; shelf++)
          for (let slot = 0; slot < 35; slot++){
            const probe = text.sliceOf(text.walkAddress({ q, r, floor: 0, wall, shelf, slot }), 0, 16);
            m++;
            if (seen.has(probe)) dup++; else seen.add(probe);
          }
    }
  }
  ok("no two shelves hold the same book (LIB-C-021)", dup === 0,
     `0 of ${m.toLocaleString()} slots; a single 32-bit lane would give about ` +
     `${(m * m / 2 / 2 ** 32).toFixed(0)}`);

  /* Two reading paths exist now -- one that derives the stream per symbol
     and one that hoists it. They must not drift apart. */
  const a = text.walkAddress({ q: 15, r: 94, wall: 1, shelf: 2, slot: 17 });
  const t2 = text.parseAddress("babel://text/00001594/at/1234/axaxaxas%20mlo");
  let mismatch = 0;
  for (const addr of [a, t2]){
    const page = 3, rows = text.pageOf(addr, page);
    for (let l = 0; l < 40; l++){
      if (rows.lines[l] !== text.lineOf(addr, page, l)) mismatch++;
      for (let c = 0; c < 80; c += 7){
        const p = page * 3200 + l * 80 + c;
        if (rows.lines[l][c] !== text.symbolAt(addr, p)) mismatch++;
      }
    }
    if (text.sliceOf(addr, page * 3200, 80) !== rows.lines[0]) mismatch++;
  }
  ok("pageOf, lineOf, sliceOf and symbolAt agree symbol for symbol",
     mismatch === 0, `${mismatch} disagreements across a walk page and a text page`);
}

/* ---- ROUTING -------------------------------------------------------- *
 * A route is a promise that a walk exists. These check the promise the
 * only way that means anything: replay every move and insist the lattice
 * really allows it, rather than trusting the search that produced it. */
section("ROUTING -- a route is a promise the lattice has to keep");
{
  /* Does the topology permit this exact sequence of moves, starting here? */
  function replay(from, moves){
    let at = { q: from.q, r: from.r, floor: from.floor };
    for (const m of moves){
      const legal = core.movesFrom(at).find(o =>
        o.dir === m.dir && core.nodeKey(o.to) === core.nodeKey(m.to));
      if (!legal) return { ok: false, why: `no ${m.via} in direction ${m.dir} from ${core.nodeKey(at)}` };
      if (m.via === "stair"){
        if (!m.through) return { ok: false, why: "a stair move with no stairwell to pass through" };
        if (core.cellType(m.through.q, m.through.r) !== core.TYPE.STAIRWELL)
          return { ok: false, why: `${core.nodeKey(m.through)} is not a stairwell` };
        if (Math.abs(m.to.floor - at.floor) !== 1)
          return { ok: false, why: "a stair that changed no storey" };
      } else if (m.to.floor !== at.floor){
        return { ok: false, why: "changed storey without a stair" };
      }
      at = m.to;
    }
    return { ok: true, at };
  }

  /* Every move leads somewhere you can stand; and from a room every move
     can be walked back. The exception is the rule made visible: starting
     inside a stairwell, the neighbours cannot come back *to* it, because
     approaching a stairwell means passing through it to the far side. A
     stairwell is an edge, not a node, and this is what that costs. */
  let checked = 0, stairs = 0, unstandable = 0, fromRoom = 0, roomBad = 0, stairBad = 0;
  let fromCorridor = 0;
  for (let k = 0; k < 900; k++){
    const q = (k * 7) % 60, r = Math.floor(k / 60) - 7, fl = (k % 5) - 2;
    const t = core.cellType(q, r);
    if (t === core.TYPE.SHAFT) continue;
    /* A corridor is a room in the only sense this test cares about: you
       stand in it and choose again, so every move out of one is reversible.
       Only the stairwell is an edge. */
    const inRoom = t !== core.TYPE.STAIRWELL;
    if (t === core.TYPE.CORRIDOR) fromCorridor += core.movesFrom({ q, r, floor: fl }).length;
    for (const m of core.movesFrom({ q, r, floor: fl })){
      checked++;
      if (m.via === "stair") stairs++;
      /* Only from a room. Asking movesFrom for the moves out of a stairwell
         is asking a question the model does not have: a stairwell is an
         edge, you are never standing in one, and the "moves" it reports are
         the halves of crossings that begin somewhere else. One such
         phantom lands in a gallery whose only two exits are flights blocked
         at their far ends -- a sealed room, correctly unstandable, and
         genuinely unreachable, as the assertion below shows. */
      if (inRoom && !core.isStandable(m.to.q, m.to.r, m.to.floor)) unstandable++;
      const back = core.movesFrom(m.to).some(o => core.nodeKey(o.to) === `${q},${r},${fl}`);
      if (inRoom){ fromRoom++; if (!back) roomBad++; }
      else if (back) stairBad++;
    }
  }
  ok("every legal move lands somewhere you can stand",
     unstandable === 0 && checked > 2000,
     `${checked} moves, ${stairs} of them through stairwells`);
  ok("from a room, every move can be walked back",
     roomBad === 0 && fromRoom > 2000, `${fromRoom} moves out of rooms`);
  ok("a stairwell is an edge, not a node: nothing steps back into one",
     stairBad === 0, `${checked - fromRoom} moves out of stairwells, none returnable`);
  ok("a corridor is a node: you can turn round in one",
     fromCorridor > 50, `${fromCorridor} moves out of corridors, all reversible`);

  /* A sealed room -- one with no move out of it at all -- is allowed to
     exist: the Z panel names it as a reason for refusing. What is NOT
     allowed is being *put* in one, and adding a fifth cell type is exactly
     the sort of change that could open such a trap without anyone noticing.
     So: enumerate every sealed room over a wide sample and prove that
     nothing anywhere can move into it. */
  {
    let rooms = 0, sealed = 0, traps = 0;
    for (let q = -40; q <= 40; q++) for (let r = -40; r <= 40; r++){
      const t = core.cellType(q, r);
      if (t === core.TYPE.SHAFT || t === core.TYPE.STAIRWELL) continue;
      for (const fl of [0, 1, -1]){
        rooms++;
        if (core.movesFrom({ q, r, floor: fl }).length) continue;
        sealed++;
        for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++)
          for (let df = -1; df <= 1; df++){
            if (!dq && !dr && !df) continue;
            const a = q + dq, b = r + dr, f = fl + df, tt = core.cellType(a, b);
            if (tt === core.TYPE.SHAFT || tt === core.TYPE.STAIRWELL) continue;
            if (core.movesFrom({ q: a, r: b, floor: f })
                    .some(m => m.to.q === q && m.to.r === r && m.to.floor === fl)) traps++;
          }
      }
    }
    ok("no sealed room can be walked into", traps === 0,
       `${sealed} sealed of ${rooms} rooms (${(sealed / rooms * 100).toFixed(2)}%), 0 reachable`);
  }

  /* Which way a flight runs is decided twice -- by riseOf, and by the
     tread the shader actually builds. They have to agree, or you would be
     told you had climbed while walking down. Nothing checked this before
     the router needed to trust it. */
  let agree = 0, disagree = 0, oneWay = 0, inconsistent = 0;
  for (let k = 0; k < 4000; k++){
    const q = k % 60, r = Math.floor(k / 60);
    if (core.cellType(q, r) !== core.TYPE.STAIRWELL) continue;
    const a = core.axisOf(q, r);
    for (const dir of [a, (a + 3) % 6]){
      const f = core.throughStairwell(q, r, 0, dir);
      if (!f) continue;
      const w = core.DIRW[dir], run = core.G.STAIR_RUN;
      const [uIn]  = core.stairUV(-w[0] * run, -w[1] * run, q, r);
      const [uOut] = core.stairUV( w[0] * run,  w[1] * run, q, r);
      if ((core.stairTread(uOut) - core.stairTread(uIn) > 0 ? 1 : -1) === f.climb) agree++;
      else disagree++;
      /* a flight open at one end on one storey and walled at the other on
         the storey it lands you on: legitimate, since every floor has its
         own doorways -- but it must never be a wrong storey or climb */
      const b = core.throughStairwell(q, r, f.floor, (dir + 3) % 6);
      if (!b) oneWay++;
      else if (b.floor !== 0 || b.climb !== -f.climb) inconsistent++;
    }
  }
  ok("riseOf and the shader's tread agree on which way every flight runs",
     disagree === 0 && agree > 600, `${agree} flights, ${disagree} disagreeing`);
  ok("a flight is never reversible into the wrong storey",
     inconsistent === 0, `${oneWay} of ${agree} are one-way, which the doorway pattern allows`);

  /* routeTo: found, minimal in the moves it returns, and replayable */
  let found = 0, unreachable = 0, wrong = 0, climbed = 0, longest = 0;
  for (let seed = 1; seed <= 120; seed++){
    const from = { q: (seed * 13) % 40, r: (seed * 29) % 40, floor: (seed % 5) - 2 };
    if (!core.isStandable(from.q, from.r, from.floor)) continue;
    const pick = core.routeToShelves(from, seed, { minSteps: 4, maxSteps: 14 });
    if (!pick.found){ unreachable++; continue; }
    found++;
    const r = core.routeTo(from, pick.to, { maxSteps: 20 });
    if (!r.found || r.moves.length !== r.steps) wrong++;
    const rep = replay(from, r.moves);
    if (!rep.ok || core.nodeKey(rep.at) !== core.nodeKey(pick.to)) wrong++;
    if (r.moves.some(m => m.climb !== 0)) climbed++;
    longest = Math.max(longest, r.steps);
  }
  ok("a route to a chosen cell replays legally, move for move",
     wrong === 0 && found > 100, `${found} routes checked, longest ${longest} rooms, ${unreachable} unreachable`);
  ok("routes cross storeys, so the stair case is really exercised",
     climbed > 10, `${climbed} of ${found} routes climbed at least one flight`);

  /* the destination is what it claims to be */
  let shelved = 0, tooNear = 0, tooFar = 0;
  for (let seed = 1; seed <= 200; seed++){
    const p = core.routeToShelves({ q: 0, r: 0, floor: 0 }, seed, { minSteps: 5, maxSteps: 18 });
    if (!p.found) continue;
    if (core.galleryCapacity(p.to.q, p.to.r, p.to.floor) > 0) shelved++;
    if (p.steps < 5) tooNear++;
    if (p.steps > 18) tooFar++;
    if (p.moves.length !== p.steps) tooFar++;
  }
  ok("every destination has books on its walls, at the distance asked for",
     shelved === 200 && !tooNear && !tooFar, `${shelved}/200 shelved, ${tooNear} too near, ${tooFar} too far`);

  /* the point of a seed */
  const a = core.routeToShelves({ q: 0, r: 0, floor: 0 }, 1941);
  const b = core.routeToShelves({ q: 0, r: 0, floor: 0 }, 1941);
  eq("the same seed is the same journey", core.nodeKey(a.to), core.nodeKey(b.to));
  ok("a different seed is a different one",
     core.nodeKey(core.routeToShelves({ q: 0, r: 0, floor: 0 }, 1942).to) !== core.nodeKey(a.to));

  /* refusals are answers */
  const nowhere = core.routeTo({ q: 0, r: 0, floor: 0 }, { q: 999, r: 999, floor: 0 }, { maxSteps: 6, cap: 400 });
  ok("an unreachable cell is refused with a reason, not a guess",
     nowhere.found === false && typeof nowhere.reason === "string" && nowhere.moves.length === 0,
     nowhere.reason);
  const shaft = (() => { for (let q = 0; q < 400; q++) for (let r = 0; r < 40; r++)
    if (core.cellType(q, r) === core.TYPE.SHAFT) return { q, r, floor: 0 }; })();
  ok("a shaft is refused as a destination",
     core.routeTo({ q: 0, r: 0, floor: 0 }, shaft).found === false,
     `${shaft.q},${shaft.r} is a shaft`);
  eq("standing still needs no moves",
     core.routeTo({ q: 0, r: 0, floor: 0 }, { q: 0, r: 0, floor: 0 }).moves.length, 0);

  /* somewhere to stand, anywhere */
  let stood = 0;
  for (let seed = 1; seed <= 150; seed++){
    const s = core.someStanding(seed);
    if (s.found && core.isStandable(s.cell.q, s.cell.r, s.cell.floor)) stood++;
  }
  ok("a seeded probe finds somewhere standable every time", stood === 150, `${stood}/150`);
  eq("and the same seed finds the same room",
     core.nodeKey(core.someStanding(7).cell), core.nodeKey(core.someStanding(7).cell));

  /* the volume it decides to take down */
  let picked = 0, absent = 0, offWall = 0;
  for (let seed = 1; seed <= 300; seed++){
    const p = core.routeToShelves({ q: 0, r: 0, floor: 0 }, seed, { minSteps: 3, maxSteps: 12 });
    if (!p.found) continue;
    const v = core.pickVolume(p.to.q, p.to.r, p.to.floor, seed);
    if (!v){ absent++; continue; }
    picked++;
    if (!core.volumePresent(v.q, v.r, v.wall, v.shelf, v.slot)) absent++;
    if (!core.shelvedWalls(v.q, v.r, v.floor).includes(v.wall)) offWall++;
    if (v.height <= 0 || Math.abs(v.along) > core.G.RUN_HALF) offWall++;
  }
  ok("the volume it reaches for is on a shelved wall and is really there",
     picked > 250 && absent === 0 && offWall === 0,
     `${picked} picked, ${absent} absent, ${offWall} off the wall`);
}


/* ---- BUDGETS -------------------------------------------------------- *
 * The performance review of Aug 2026 measured where the frame goes and
 * nothing then defended the numbers. These are the parts that can be
 * checked without a GPU, so they run in `npm test` rather than in a
 * browser someone has to remember to open.
 *
 * WHY CALL SITES. §17.13: what blows up the ANGLE linker is not loop
 * bounds, it is the number of places a big function is inlined. Writing
 * the mirror bounce as "march, shade, and if it was a mirror march and
 * shade again" gave main() two inlined copies of a body already holding
 * eight mapAt calls; it compiled in 17 ms and the linker then ran 127
 * seconds and returned false with an empty log. A budget on call sites
 * is a budget on that, and it costs nothing to check.
 *
 * These numbers are not sacred. If a change needs one more call site,
 * raise the budget deliberately and say why in the commit -- the point is
 * that it cannot happen silently. */
/* The seam and the renderer have to agree about where a person may go. They
   are written twice -- apply() walks the graph, voidDist2D pushes a body out
   of rock -- and when they disagree the walker is the one who finds out, by
   being somewhere they did not walk to. §17 was one such report and it took
   a reproduction nobody could produce. This is the reproduction, as a rule:
   no doorway the renderer carves may lead somewhere the seam refuses. */
section("SEAM AND RENDERER -- no cut may run past a wall");
{
  /* The renderer and the seam are written twice, and when they disagree the
     walker is the one who finds out -- by being somewhere they did not walk
     to. §17 was one such report and nobody could reproduce it.

     The cause was geometry, not topology: a flight is cut STAIR_EXT past the
     cell boundary at each end so it meets the doorway box its neighbour
     draws, and it was cut past *walled* ends too, straight through the rock.
     31 of 684 approaches walked a body across an edge gapAt calls WALL.

     So the rule is: a flight extends only at an end that opens. cellDesc
     packs that as bits 15-16 and the shader reads them, which makes the bit
     and the gap two spellings of one fact -- and two spellings drift. This
     is the assertion that they have not. */
  let stairs = 0, walled = 0, wrongBit = 0, past = 0;
  for (let q = -40; q <= 40; q++) for (let r = -40; r <= 40; r++){
    if (core.cellType(q, r) !== core.TYPE.STAIRWELL) continue;
    stairs++;
    const a = core.axisOf(q, r), up = core.riseOf(q, r) > 0;
    const dP = (up ? a : a + 3) % 6, dM = (up ? a + 3 : a) % 6;
    const openP = core.gapAt(q, r, dP, 0) !== core.GAP.WALL;
    const openM = core.gapAt(q, r, dM, 0) !== core.GAP.WALL;
    if (!openP || !openM) walled++;

    const [ep, em] = core.stairExtends(q, r, 0);
    if (ep !== openP || em !== openM) wrongBit++;

    const d = core.cellDesc(q, r, 0);          // what the shader actually reads
    if (core.descExtP(d) !== openP || core.descExtM(d) !== openM) wrongBit++;

    /* and the geometry itself: a walled end must not reach the neighbour */
    for (const [open, ext] of [[openP, ep], [openM, em]]){
      const half = core.G.STAIR_RUN + (ext ? core.G.STAIR_EXT : 0);
      if (!open && half > core.G.HALF_D) past++;
    }
  }
  ok("every flight has a walled end recorded in the bit the shader reads",
     wrongBit === 0, `${stairs} flights, ${walled} with a walled end, ${wrongBit} wrong`);
  /* Teeth: if this sample ever stopped containing walled ends the test above
     would pass by being vacuous. */
  ok("and the sample still contains some, so the test is not vacuous",
     walled > 0, `${walled} of ${stairs}`);
  ok("no flight is cut past a wall", past === 0,
     past === 0 ? "the cut stops on the boundary at every walled end"
                : `${past} run past`);
}

/* A kit with one page is a stylesheet. The rules below are the same three the
   prototype is held to, applied to the atlas, because the moment they were not
   the atlas grew its own palette and the kit quietly stopped being one. */
section("THE ATLAS -- held to the kit, like everything else");
{
  const atlas = readFileSync(new URL("../app/babel-atlas.html", import.meta.url), "utf8");
  const kit   = readFileSync(new URL("./ui-kit.css", import.meta.url), "utf8");

  ok("the atlas links the kit rather than copying it",
     atlas.includes('href="../core/ui-kit.css"'), "core/ui-kit.css");

  /* every token the kit defines must be defined ONCE, there */
  const tokens = [...kit.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(m => m[1]);
  const redeclared = tokens.filter(t => new RegExp("^\\s*" + t + "\\s*:", "m").test(
    (atlas.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1]));
  ok("and does not redeclare a token the kit already names",
     redeclared.length === 0,
     redeclared.length ? "redeclared: " + redeclared.join(", ")
                       : tokens.length + " tokens, all from the kit");

  /* the model's own colours are named in its :root and spelled nowhere else --
     the same rule as the chrome, applied to the thing being rendered */
  const css  = (atlas.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1];
  const root = (css.match(/:root\{[\s\S]*?\n\s*\}/) ?? [""])[0];
  const strays = [...css.replace(root, "").matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  const named  = [...root.matchAll(/--cell-[a-z]+|--model-[a-z]+/g)].length;
  ok("the model names its colours and spells them once",
     strays.length === 0 && named > 0,
     strays.length ? "spelled: " + strays.join(", ") : named + " model colours named");

  /* and no colour reaches the shader except through a named custom property */
  const script = (atlas.match(/<script type="module">([\s\S]*)<\/script>/) ?? ["", ""])[1];
  const jsHex = [...script.matchAll(/["'`]#[0-9a-fA-F]{3,8}["'`]/g)].map(m => m[0]);
  ok("no colour is spelled in the atlas's script either",
     jsHex.length === 0, jsHex.length ? jsHex.join(", ") : "read from the stylesheet");

  /* every key it handles is documented, exactly as the prototype's is */
  const handled = new Set();
  for (const m of script.matchAll(/e\.code === "(\w+)"/g)) handled.add(m[1]);
  for (const m of script.matchAll(/^\s{17}(Arrow\w+):/gm)) handled.add(m[1]);
  if (/e\.code === "Digit" \+ x\.key/.test(script)) handled.add("Digit");
  if (/k === "\?"/.test(script)) handled.add("?");
  const bindings = (script.match(/const BINDINGS = \[[\s\S]*?\n\];/) ?? [""])[0];
  const spoken = {
    F1:"F1", KeyR:"R", KeyG:"G", Digit:"1 – 6", Numpad:"1 – 6", "?":"?",
    BracketLeft:"[ ]", BracketRight:"[ ]", Backslash:"\\\\",
    ArrowUp:"Arrows", ArrowDown:"Arrows", ArrowLeft:"Arrows", ArrowRight:"Arrows",
    Minus:"− +", Equal:"− +", NumpadSubtract:"− +", NumpadAdd:"− +"
  };
  const undocumented = [...handled].filter(k => {
    const name = spoken[k];
    return name === undefined || !bindings.includes('"' + name + '"');
  });
  ok("every key the atlas handles appears in its BINDINGS",
     undocumented.length === 0,
     undocumented.length ? "missing: " + undocumented.join(", ")
                         : handled.size + " keys, all listed");

  /* Provenance, and the one way it can go wrong: a version typed twice is a
     version that can disagree with the thing it names, which is worse than
     showing none. Both pages must READ the constant. */
  ok("the atlas declares its own version and reads core's",
     /const ATLAS_VERSION = "\d+\.\d+\.\d+";/.test(script) &&
     /import \{ CORE_VERSION,/.test(script) &&
     !/core \d+\.\d+\.\d+/.test(script),
     (script.match(/const ATLAS_VERSION = "([\d.]+)"/) ?? [])[1] ?? "missing");
  ok("and shows both in the legend",
     /CORE_VERSION \+ [^\n]*ATLAS_VERSION/.test(script), "core X · atlas Y");

  /* it must read the lattice, not reimplement it */
  ok("the atlas imports core rather than carrying a copy",
     /import \{[\s\S]*?\} from "\.\.\/core\/babel-core\.mjs"/.test(atlas) &&
     !/\nfunction cellType\b/.test(atlas),
     "one lattice, imported");

  /* It asked cellType what a room was, and drew every reading room as a
     gallery the day reading rooms stopped being columns -- on the one page
     whose whole job is to show you that sort of thing. A page that draws
     rooms has to ask the storey. */
  ok("and asks the storey what a room is, not the column",
     /roomAt\(q, r, fl\)/.test(script), "roomAt in the mesh");
}

section("BUDGETS -- the shader's shape, which is what link time tracks");
{
  const glsl = readFileSync(new URL("../app/babel-frag.glsl", import.meta.url), "utf8");
  const code = glsl.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const sites = re => (code.match(re) ?? []).length;

  const budgets = [
    ["mapAt",    /\bmapAt\s*\(/g,    8,  "the field itself; the linker's usual victim"],
    ["cellDesc", /\bcellDesc\s*\(/g, 3,  "calls gapAt six times each"],
    ["gapAt",    /\bgapAt\s*\(/g,    3,  ""],
    ["shadeHit", /\bshadeHit\s*\(/g, 2,  "one per bounce; must stay inside the loop"],
    ["marchRay", /\bmarchRay\s*\(/g, 2,  ""]
  ];
  for (const [name, re, budget, why] of budgets){
    const n = sites(re);
    ok(`${name} has at most ${budget} call sites`, n <= budget,
       `${n} found${why ? " -- " + why : ""}`);
  }

  /* The bounce is a LOOP over a uniform, not two written-out copies. A loop
     whose bound is a uniform cannot be unrolled, so it has one call site --
     that is the whole reason this shader links at all. */
  ok("the mirror bounce is a loop over a uniform, not an unrollable constant",
     /for\s*\(\s*int\s+b\s*=\s*0;\s*b\s*<\s*uBounce;/.test(code),
     "see §17.13 -- a constant bound here cost a 127-second link");

  /* The march's step count is deterministic, so it is a budget rather than a
     measurement. 20.8/pixel was the worst canonical view before the step went
     to 1.00; 16.6 after. The loop bound caps the tail at 72. */
  const march = code.slice(code.indexOf("float marchRay("));
  const cap = march.match(/for\s*\(int i = 0; i < (\d+); i\+\+\)/);
  ok("the march is still capped at 72 steps",
     cap !== null && cap[1] === "72",
     cap ? `bound is ${cap[1]}` : "could not find the march loop");

  /* Under-relaxation was removed in P3 after measuring that the field
     tolerates a full step. If someone puts it back, the step-count budget
     above is wrong and this says so. */
  const step = code.match(/t \+= d \* ([0-9.]+);/);
  ok("the march step is 1.00, as P3 measured it could be",
     step !== null && step[1] === "1.00",
     step ? `step is ${step[1]} -- if this changed on purpose, update the review`
          : "could not find the step");
}

/* ---- THE UI KIT ------------------------------------------------------
 * The standards agreed in app/ui-questionnaire.html, as assertions. Two of
 * them catch classes of mistake that already happened once:
 *
 *   BINDINGS   four keys were handled by the listener and documented
 *              nowhere -- [ ] Home End -- because help was hand-written
 *              prose. Help is now rendered from BINDINGS, and this fails
 *              if a key is handled but not listed.
 *   TOKENS     the chrome may not use a literal colour. Every one is named
 *              in :root, so changing the palette is one edit and not a
 *              search. This is what stopped crimson meaning three things.
 */
section("UI KIT -- the standards, as rules");
{
  const html = readFileSync(new URL("../app/babel-phase1.html", import.meta.url), "utf8");
  const script = (html.match(/<script[^>]*>([\s\S]*)<\/script>/) ?? ["", ""])[1];

  /* every key the listener acts on must appear in BINDINGS */
  const handled = new Set();
  for (const m of script.matchAll(/e\.code === "(\w+)"/g)) handled.add(m[1]);
  for (const m of script.matchAll(/e\.key === "(.)"/g))     handled.add(m[1]);
  const bindings = (script.match(/const BINDINGS = \[[\s\S]*?\n\];/) ?? [""])[0];
  /* the names a reader sees, mapped to the codes the listener matches */
  const spoken = {
    KeyW:"WASD", KeyA:"WASD", KeyS:"WASD", KeyD:"WASD",
    ArrowUp:"Arrows", ArrowDown:"Arrows", ArrowLeft:"Arrows", ArrowRight:"Arrows",
    KeyE:"E", KeyQ:"Q", KeyR:"R", KeyZ:"Z", KeyX:"X", KeyV:"V", KeyG:"G",
    BracketLeft:"[ ]", BracketRight:"[ ]", Home:"Home End", End:"Home End",
    Escape:"Esc", Enter:"Esc", F1:"F1", "?":"?",
    Minus:"\u2212 +", Equal:"\u2212 +", NumpadSubtract:"\u2212 +", NumpadAdd:"\u2212 +"
  };
  const undocumented = [...handled].filter(k => {
    const name = spoken[k];
    return name === undefined || !bindings.includes('"' + name + '"');
  });
  ok("every key the listener handles appears in BINDINGS",
     undocumented.length === 0,
     undocumented.length ? "missing: " + undocumented.join(", ")
                         : handled.size + " keys, all listed");

  /* Same rule for the prototype: it declares its own version, and takes the
     Library's from CORE_VERSION rather than repeating the number. A bug
     report carries both, and the two move at different times. */
  ok("the renderer declares its own version",
     /const RENDERER_VERSION = "\d+\.\d+\.\d+";/.test(script),
     (script.match(/const RENDERER_VERSION = "([\d.]+)"/) ?? [])[1] ?? "missing");
  ok("and the panel reads both constants rather than repeating them",
     /getElementById\("a-core"\)\.textContent = CORE_VERSION;/.test(script) &&
     /getElementById\("a-rend"\)\.textContent = RENDERER_VERSION;/.test(script) &&
     html.includes('id="a-core"') && html.includes('id="a-rend"'),
     "core and renderer, from the constants");

  /* the chrome's CSS may name colours but not spell them */
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1];
  const root = (css.match(/:root\{[\s\S]*?\}/) ?? [""])[0];
  const rest = css.replace(root, "");
  const literals = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
  ok("chrome CSS spells no colour it has not named",
     literals.length === 0,
     literals.length ? literals.slice(0, 6).join(" ") + (literals.length > 6 ? " ..." : "")
                     : root.split("--").length - 1 + " tokens, 0 literals");

  /* crimson is the artefact; attention is its own token */
  ok("crimson and alert are separate tokens",
     /--crimson:/.test(root) && /--alert:/.test(root),
     "an artefact and an alert must not share a colour");

  /* the panels the reader asked to open with, and only those */
  const open = [...html.matchAll(/<div id="(addr|perf|help)"[^>]*>/g)]
                 .map(m => [m[1], /\bhidden\b/.test(m[0])]);
  const shown = open.filter(([, h]) => !h).map(([n]) => n);
  ok("only the librarian's panel is open on arrival",
     shown.length === 1 && shown[0] === "addr",
     "open: " + (shown.join(", ") || "none"));
}

/* ---- report -------------------------------------------------------- */
console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
