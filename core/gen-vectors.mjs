/* Generates core/vectors.json from babel-core.mjs -- the shared ground
 * truth for every consumer. Deterministic: the sample cells come from a
 * fixed integer walk, not a random source, so the file only changes when
 * the core's behavior does. Regenerate deliberately, never to make a
 * failing test pass. */

import { writeFileSync } from "node:fs";
import * as core from "./babel-core.mjs";
import * as text from "./babel-text.mjs";

/* A fixed spread of cells: some near the origin, some far, plus the
   crimson volume's own gallery and a few cells of each type. */
function sampleCells(n){
  const out = [];
  let q = 0, r = 0, fl = 0;
  for (let k = 0; k < n; k++){
    out.push({ q, r, floor: fl });
    /* a deterministic scatter, wide enough to leave the origin's basin */
    const h = core.uhash(core.u32(k * 0x9E3779B9));
    q += ((h & 0xFF) - 128);
    r += (((h >>> 8) & 0xFF) - 128);
    fl = (((h >>> 16) & 7) - 3);
  }
  return out;
}

/* A scatter of 120 cells contains about six corridors and, at these odds,
   very likely no mirror at all -- so the lanes that carry the alcoves would
   go unchecked on the GPU. Pin one of each deliberately, by scanning
   outwards from the origin and taking the first that qualifies. */
function firstCell(match, span = 60){
  for (let ring = 0; ring <= span; ring++)
    for (let q = -ring; q <= ring; q++)
      for (let r = -ring; r <= ring; r++){
        if (Math.max(Math.abs(q), Math.abs(r)) !== ring) continue;
        for (const fl of [0, 1, -1, 2, -2]) if (match(q, r, fl)) return { q, r, floor: fl };
      }
  throw new Error("no cell matched while generating vectors");
}
const isCorridor = (q, r) => core.cellType(q, r) === core.TYPE.CORRIDOR;
const landmarks = [
  { q: core.CRIM.q, r: core.CRIM.r, floor: core.CRIM.floor },
  firstCell((q, r, fl) => isCorridor(q, r) && core.alcovesIn(q, r, fl).length === 0),
  firstCell((q, r, fl) => isCorridor(q, r) &&
                          core.alcovesIn(q, r, fl).some(a => a.holds === "mirror")),
  firstCell((q, r, fl) => isCorridor(q, r) &&
                          core.alcovesIn(q, r, fl).some(a => a.holds === "latrine")),
  firstCell((q, r, fl) => isCorridor(q, r) && core.alcovesIn(q, r, fl).length === 2)
];
const cells = [...landmarks, ...sampleCells(120)];

const topology = cells.map(c => ({
  ...c,
  type: core.cellType(c.q, c.r),
  gaps: [0,1,2,3,4,5].map(i => core.gapAt(c.q, c.r, i, c.floor)),
  axis: core.axisOf(c.q, c.r),
  rise: core.riseOf(c.q, c.r),
  studyKeyMod8: core.studyKey(c.q, c.r, c.floor) % 8,
  studyKit: core.studyKit(core.studyKey(c.q, c.r, c.floor)),
  studyAnchor: core.cellType(c.q, c.r) === core.TYPE.STUDY
    ? core.studyAnchor(c.q, c.r, c.floor, core.studyKey(c.q, c.r, c.floor)) : -1,
  shelvedWalls: core.shelvedWalls(c.q, c.r, c.floor),
  corridorAxis: core.cellType(c.q, c.r) === core.TYPE.CORRIDOR
    ? core.corridorAxis(c.q, c.r) : -1,
  alcoves: [0,1].map(s => core.cellType(c.q, c.r) === core.TYPE.CORRIDOR
    ? core.alcoveAt(c.q, c.r, c.floor, s) : 0),
  desc: core.cellDesc(c.q, c.r, c.floor),
  cellKey: core.cellKey(c.q, c.r),
  edgeKeys: [0,1,2,3,4,5].map(i => core.edgeKey(c.q, c.r, i, c.floor))
}));

/* Content vectors: a handful of addresses, with symbols at positions
   chosen to cover the first page, a page boundary, and the last symbol. */
const POSITIONS = [0, 1, 79, 80, 3199, 3200, 655999, 1311999];
const addresses = [
  text.walkAddress({ q: core.CRIM.q, r: core.CRIM.r, floor: core.CRIM.floor,
                     wall: core.CRIM.wall, shelf: core.CRIM.shelf, slot: core.CRIM.slot }),
  text.walkAddress({ q: 0, r: 0, floor: 0, wall: 0, shelf: 0, slot: 0 }),
  text.walkAddress({ q: 0, r: 0, floor: 0, wall: 0, shelf: 0, slot: 1 }),
  text.walkAddress({ q: -7, r: 12, floor: -2, wall: 3, shelf: 4, slot: 34 }),
  text.textAddress({ phrase: "axaxaxas mlo", offset: 0 }),
  text.textAddress({ phrase: "the library is unlimited and cyclical.", offset: 12345 })
];

const content = addresses.map(a => ({
  uri: text.formatAddress(a),
  spine: text.spineLabel(a),
  symbols: POSITIONS.map(p => ({ p, s: text.symbolAt(a, p) })),
  page0Line0: text.lineOf(a, 0, 0),
  page409Line39: text.lineOf(a, 409, 39)
}));

/* Volume vectors: the last twin to be single-sourced (roadmap item 7).
 * Presence is 3.5% empty, so a handful of slots would very likely contain
 * no empty one at all and the lane that matters most would go unchecked --
 * the same trap the corridor landmarks above exist to avoid. So: a spread
 * across walls, shelves and slots, plus the first empty slot found and the
 * crimson volume itself, and the RAW 32-bit hash rather than the derived
 * float, because a hash that is off by one bit is the whole failure mode. */
const volumeSamples = (() => {
  const out = [];
  const push = (q, r, wall, shelf, slot) =>
    out.push({ q, r, wall, shelf, slot, bits: core.volumeBits(q, r, wall, shelf, slot) });
  push(core.CRIM.q, core.CRIM.r, core.CRIM.wall, core.CRIM.shelf, core.CRIM.slot);
  /* a deterministic scatter over the whole (wall, shelf, slot) space */
  for (let k = 0; k < 48; k++){
    const h = core.uhash(core.u32(k * 0x85EBCA6B + 17));
    push(((h & 0x3F) - 32), (((h >>> 6) & 0x3F) - 32),
         (h >>> 12) % 6, (h >>> 15) % core.SHELVES_PER_WALL,
         (h >>> 18) % core.BOOKS_PER_SHELF);
  }
  /* An empty slot, and -- the part that matters -- the two slots that sit
     CLOSEST TO THE THRESHOLD from either side.

     The first version of this scanned for any empty slot and stopped, and
     the resulting check was very nearly vacuous: moving the GLSL threshold
     from 0.035 to 0.0351 flipped no sampled slot, so 700 integers agreed on
     a shader that had drifted. A presence test is only tested by a slot
     whose presence the drift would CHANGE, and with a 1e-4 move that is a
     1-in-10,000 window. Scanning 420,000 slots pins the gap either side to
     a few parts per million, so any edit to the threshold flips one of
     these two and the harness says so.

     This is the same trap the item being closed here was about: a
     statistical test that catches a broken twin and not a subtly different
     one. It is easy to rebuild by accident. */
  let below = null, above = null;
  for (let q = -10; q < 10; q++) for (let r = -10; r < 10; r++)
    for (let wall = 0; wall < 6; wall++)
      for (let shelf = 0; shelf < core.SHELVES_PER_WALL; shelf++)
        for (let slot = 0; slot < core.BOOKS_PER_SHELF; slot++){
          const h = core.volumeHash(q, r, wall, shelf, slot);
          const rec = { q, r, wall, shelf, slot, h };
          if (h < 0.035){ if (!below || h > below.h) below = rec; }
          else          { if (!above || h < above.h) above = rec; }
        }
  for (const b of [below, above]) push(b.q, b.r, b.wall, b.shelf, b.slot);
  return out;
})();
const volumes = volumeSamples.map(v => ({
  ...v,
  hash: +core.volumeHash(v.q, v.r, v.wall, v.shelf, v.slot).toFixed(9),
  present: core.volumePresent(v.q, v.r, v.wall, v.shelf, v.slot),
  depth: +core.volumeDepth(v.q, v.r, v.wall, v.shelf, v.slot).toFixed(9),
  tint: +core.volumeTint(v.q, v.r, v.wall, v.shelf, v.slot).toFixed(9)
}));

const vectors = {
  note: "Generated by core/gen-vectors.mjs. Shared ground truth for the JS core, "
      + "the GLSL port (core/conformance.html) and the agent skill. Do not hand-edit.",
  alphabet: text.ALPHABET,
  C: text.C, pages: text.PAGES, lines: text.LINES, cols: text.COLS,
  probabilities: { P_OPEN: core.P_OPEN, P_SHAFT: core.P_SHAFT,
                   P_STAIR: core.P_STAIR, P_STUDY: core.P_STUDY,
                   P_CORR: core.P_CORR,
                   P_ALC_NONE: core.P_ALC_NONE, P_ALC_ONE: core.P_ALC_ONE },
  topology, content, volumes
};

writeFileSync(new URL("./vectors.json", import.meta.url),
              JSON.stringify(vectors, null, 1) + "\n");
console.log(`wrote vectors.json: ${topology.length} cells, ${content.length} addresses, `
          + `${volumes.length} volume slots (${volumes.filter(v => !v.present).length} empty); `
          + `threshold witnesses at ${volumes.map(v => v.hash).filter(h => h < 0.035).sort((a,b)=>b-a)[0]}`
          + ` and ${volumes.map(v => v.hash).filter(h => h >= 0.035).sort((a,b)=>a-b)[0]}`);
