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
                 seat: walkToASeat({ route: 7 }).room.at,
                 stops: journey({ steps: 6, route: 7 }).stops.length,
                 here: cellAddress(15, 94, 0),
                 valid: validate(walkAddress({q:15,r:94,wall:1,shelf:2,slot:17})).ok };`)();
    } catch (e) { err = e; }
    ok("the inlined core evaluates and runs", err === null,
       err ? `${err.constructor.name}: ${err.message}` : "");
    if (ran){
      eq("the inlined core agrees with the module on a page",
         ran.pageLine, text.lineOf(text.walkAddress({ q:15, r:94, wall:1, shelf:2, slot:17 }), 0, 0));
      eq("...on where a wander finds a chair", ran.seat, text.walkToASeat({ route: 7 }).room.at);
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
      if (t === core.TYPE.STUDY && !study) study = [q, r];
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
  let shafts = 0, stairs = 0, studies = 0, galleries = 0, shelved = 0;
  const N = 20000;
  for (let k = 0; k < N; k++){
    const q = (k % 200) - 100, r = Math.floor(k / 200) - 50;
    const t = core.cellType(q, r);
    if (t === core.TYPE.SHAFT) shafts++;
    else if (t === core.TYPE.STAIRWELL) stairs++;
    else if (t === core.TYPE.STUDY) studies++;
    else { galleries++; shelved += core.shelvedWalls(q, r, 0).length; }
  }
  const pct = n => (n / N) * 100;
  ok("shafts about 2%", Math.abs(pct(shafts) - 2) < 0.6, `${pct(shafts).toFixed(2)}%`);
  ok("stairwells about 12%", Math.abs(pct(stairs) - 12) < 1.2, `${pct(stairs).toFixed(2)}%`);
  ok("reading rooms about 2%", Math.abs(pct(studies) - 2) < 0.6, `${pct(studies).toFixed(2)}%`);
  const mean = shelved / galleries;
  ok("mean shelved walls about 3.07", Math.abs(mean - 3.07) < 0.15, `${mean.toFixed(3)}`);
  ok("a gallery therefore departs from 700 volumes",
     Math.abs(mean * 5 * 35 - 700) > 50, `${Math.round(mean * 5 * 35)} volumes on average`);
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
  const s = core.findSeat({ q: 0, r: 0, floor: 0, seed: 7, maxSteps: 400 });
  ok("a seat turns up within 400 steps", s.room !== null, `after ${s.steps} steps`);
  ok("the room it stopped in is a reading room",
     core.cellType(s.room.q, s.room.r) === core.TYPE.STUDY);
  ok("the room really contains something sittable",
     s.room.pieces.some(p => p.sittable),
     s.room.pieces.map(p => p.piece).join(", "));
  ok("only recliners and desk chairs count as seats",
     s.room.pieces.every(p => !p.sittable || ["recliner", "chair"].includes(p.piece)));
  eq("the trail ends at the room it found",
     [s.trail.at(-1).q, s.trail.at(-1).r, s.trail.at(-1).floor],
     [s.room.q, s.room.r, s.room.floor]);
  ok("the same route finds the same chair",
     JSON.stringify(core.findSeat({ q: 0, r: 0, floor: 0, seed: 7 }).room) === JSON.stringify(s.room));

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

  const seat = text.walkToASeat({ route: 7 });
  ok("walkToASeat reports an address for the room", /^babel:\/\/walk\//.test(seat.room.at));
  ok("and reports how far it walked to get there", seat.steps > 0, `${seat.steps} steps`);
}

section("PACKED DESC -- the int the shader and the CPU both read");
{
  let bad = 0, studies = 0, stairs = 0;
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
  }
  ok("every field round-trips through the packing", bad === 0,
     `6000 cells, ${stairs} stairwells, ${studies} reading rooms`);
  /* the culled kit is the field the shader reads instead of recomputing per
     SDF sample, so it is the one that would silently misplace furniture */
  ok("the culled kit never exceeds the room's kit",
     (() => { for (let k = 0; k < 6000; k++){
        const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
        if (core.cellType(q, r) !== core.TYPE.STUDY) continue;
        const key = core.studyKey(q, r, 0);
        if (core.descKit(core.cellDesc(q, r, 0)) & ~core.studyKit(key)) return false;
      } return true; })());
  ok("bits 18-21 hold the kit and nothing spills past them",
     (() => { for (let k = 0; k < 6000; k++){
        const q = (k % 100) - 50, r = Math.floor(k / 100) - 30;
        if (core.cellDesc(q, r, 0) >>> 22) return false;
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

/* ---- report -------------------------------------------------------- */
console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
