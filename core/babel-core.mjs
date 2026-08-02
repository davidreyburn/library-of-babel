/* ====================================================================
 * babel-core -- the single source of truth for the Library of Babel.
 *
 * Everything in here is a pure function of its arguments. No DOM, no
 * clock, no randomness, no I/O (LIB-G-020, LIB-G-021). Three consumers
 * share it and MUST NOT re-implement any of it:
 *
 *   1. the WebGL prototype (app/babel-phase1.html) -- inlined by
 *      core/build.mjs, and its GLSL half emitted from core/babel-glsl.mjs
 *   2. the agent traversal skill -- imports this module directly
 *   3. core/test-core.mjs -- asserts 1 and 2 agree, over shared vectors
 *
 * The layout half below was lifted verbatim out of the prototype, which
 * had carried it as a hand-synced twin of the GLSL. That drift already
 * produced real bugs (walls where the renderer drew doorways), which is
 * why this file exists. Edit here, run the tests, rebuild -- never edit
 * the copy in the HTML.
 * ==================================================================== */

/* Stamped onto every transcript and every vector file. A run recorded
   under one version replays only against that version: a rules change
   must break a replay loudly rather than invalidate it quietly. Bump it
   whenever the lattice, the corpus or the seam changes behaviour. */
const CORE_VERSION = "0.4.0";

/* ---- lattice constants (verbatim from the prototype) --------------- */
const G = {
  BOOK_W:    0.052,   // 35 volumes -> a 1.82 m run
  RUN_HALF:  0.910,
  UP_C:      0.935,   // bookcase end uprights
  UP_HW:     0.025,
  CASE_HALF: 0.960,   // case stops 0.09 short of the wall end, so corners read
  HALF_WALL: 1.050,
  APO_ROOM:  1.819,   // gallery: 3.64 m across
  APO_STAIR: 2.100,   // stairwell: roomier, to take a 3.2 m flight
  APO_SHAFT: 2.300,
  R_CELL:    2.793,
  CENTRE_D:  4.838,
  HALF_D:    2.419,
  PASS_HW:   0.52,
  HALL_HW:   0.80,
  STAIR_RUN: 2.419,   /* exactly the cell radius: the flight then starts at
                         floor level on the cell boundary and ends at the next
                         storey's level on the far one, so both thresholds are
                         flush. At 3.10 it overhung into the galleries, where
                         ground-following does not apply, and you met a 0.56 m
                         step walking in. 4.84 m run for 2.60 m, about 28 deg. */
  STAIR_HW:  0.62,    // the flight is a 1.24 m corridor cut in rock, not a well
  STAIR_EXT: 0.75,    /* the corridor runs past the cell boundary to meet the
                         gallery's doorway. Ending it exactly on the boundary
                         capped it with a face, so from inside the stair the
                         entrance rendered as a wall you could still walk
                         through. The tread is clamped, so the overhang is
                         flat and level with the floor it opens onto. */
  H_ROOM:    2.10,
  H_FLOOR:   2.60,
  EYE:       1.60,
  RADIUS:    0.24,
  /* Shelving depths and pitches. The shader had these as its own literals
     until the reticule needed them: a ray aimed at the case back rather
     than the spine faces is off by 0.18 * tan(angle) along the wall, which
     is three books at 45 degrees and six at 60. */
  BOOK_D:     0.20,   // a spine's depth at full; 0.8x at the shallowest
  CARC_D:     0.26,   // the casework the books stand in
  SHELF_P:    0.40,   // shelf pitch
  SHELF_BASE: 0.05    // the first shelf's height above the floor
};
const P_OPEN  = 32768;   // 0.50 * 65536
const P_SHAFT = 1311;    // 0.02 -- a shaft view in about 1 room in 18
const P_STAIR = 9175;    // 0.02 + 0.12
const P_STUDY = 10486;   // + 0.02 -- a reading room, rarely met
const CRIM = { q: 15, r: 94, floor: 0, wall: 1, shelf: 2, slot: 17 };
const GAP = { WALL:0, PASSAGE:1, HALL:2, SHAFT:3 };
const TYPE = { GALLERY:0, SHAFT:1, STAIRWELL:2, STUDY:3 };

/* ---- hashes: bit-identical mirror of the GLSL --------------------- */
const u32 = x => x >>> 0;
function uhash(x){
  x = u32(x);
  x = u32(x ^ (x >>> 16)); x = u32(Math.imul(x, 0x7feb352d));
  x = u32(x ^ (x >>> 15)); x = u32(Math.imul(x, 0x846ca68b));
  return u32(x ^ (x >>> 16));
}
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const DIRW = [[0.8660254,0.5],[0.8660254,-0.5],[0,-1],
              [-0.8660254,-0.5],[-0.8660254,0.5],[0,1]];
const cellKey = (q,r) => uhash(u32((q + 32768) | ((r + 32768) << 16)));
function cellType(q,r){
  const h = cellKey(q,r) >>> 16;
  if (h < P_SHAFT) return TYPE.SHAFT;
  if (h < P_STAIR) return TYPE.STAIRWELL;
  if (h < P_STUDY) return TYPE.STUDY;
  return TYPE.GALLERY;
}
/* Footprints of whatever this reading room holds, so you cannot walk through
   the furniture. Same kits, same anchor, same order as the shader.       */
/* stair axis and rise, mirroring the shader */
function axisOf(q, r){
  const base = uhash(u32(cellKey(q,r) ^ 0x5bf03635)) % 3;
  for (let k = 0; k < 3; k++){
    const a = (base + k) % 3;
    const ta = cellType(q + DIRS[a][0], r + DIRS[a][1]);
    const tb = cellType(q + DIRS[a+3][0], r + DIRS[a+3][1]);
    if ((ta === TYPE.GALLERY || ta === TYPE.STUDY) &&
        (tb === TYPE.GALLERY || tb === TYPE.STUDY)) return a;
  }
  return base;
}
const riseOf = (q,r) => (uhash(u32(cellKey(q,r) ^ 0x27d4eb2d)) & 1) === 0 ? 1 : -1;

const studyKey = (q,r,fl) => uhash(u32(cellKey(q,r) ^ u32(Math.imul(fl + 32768, 2654435761))));
function studyKit(key){
  return [1,3,5,7,8,12,6,4][key % 8];
}
function studyFit(q, r, fl, i, kit){
  const ax = DIRW[i];
  let n = 0;
  for (const [bit, lx, lz, rad] of FURN){
    if (!(kit & bit)) continue;
    if (clearOfDoors(q, r, fl, lx*ax[0] - lz*ax[1], lx*ax[1] + lz*ax[0], rad)) n++;
  }
  return n;
}
/* the blank wall that keeps most of the kit, so a room is rarely left bare */
function studyAnchor(q, r, fl, key){
  const st = key % 6, kit = studyKit(key);
  let best = st, bestN = -1;
  for (let k = 0; k < 6; k++){
    const i = (st + k) % 6;
    if (gapAt(q, r, i, fl) !== GAP.WALL) continue;
    const n = studyFit(q, r, fl, i, kit);
    if (n > bestN){ bestN = n; best = i; }
  }
  return best;
}
const FURN = [[1, 1.30,-0.32, 0.44],[2, 1.32, 0.40, 0.26],[4, 1.46, 0.76, 0.21],
              [8, 1.44, 0.00, 0.60],[8, 1.06, 0.00, 0.25]];
function clearOfDoors(q, r, fl, px, pz, rad){
  for (let i = 0; i < 6; i++){
    if (gapAt(q, r, i, fl) === GAP.WALL) continue;
    const dw = DIRW[i];
    if (px*dw[0] + pz*dw[1] <= 0) continue;
    if (Math.abs(-px*dw[1] + pz*dw[0]) < rad + 0.55) return false;
  }
  return true;
}
function studyItems(q, r, fl){
  const key = studyKey(q, r, fl);
  let m = studyKit(key);
  const ax = DIRW[studyAnchor(q, r, fl, key)];
  const place = (lx, lz) => [lx*ax[0] - lz*ax[1], lx*ax[1] + lz*ax[0]];
  // same culling as the shader, so what you see is what you collide with
  for (const [bit, lx, lz, rad] of FURN){
    if (!(m & bit)) continue;
    const [px, pz] = place(lx, lz);
    if (!clearOfDoors(q, r, fl, px, pz, rad)) m &= ~bit;
  }
  const out = [];
  for (const [bit, lx, lz, rad] of FURN){
    if (!(m & bit)) continue;
    const [px, pz] = place(lx, lz);
    out.push([px, pz, rad]);
  }
  return out;
}
function studyVisible(q, r, fl){
  const key = studyKey(q, r, fl);
  let m = studyKit(key);
  const ax = DIRW[studyAnchor(q, r, fl, key)];
  for (const [bit, lx, lz, rad] of FURN){
    if (!(m & bit)) continue;
    const px = lx*ax[0] - lz*ax[1], pz = lx*ax[1] + lz*ax[0];
    if (!clearOfDoors(q, r, fl, px, pz, rad)) m &= ~bit;
  }
  return m;
}

function edgeKey(cq, cr, i, fl){
  const nq = cq + DIRS[i][0], nr = cr + DIRS[i][1];
  let q = cq, r = cr, j = i;
  if (nq < cq || (nq === cq && nr < cr)){ q = nq; r = nr; j = (i + 3) % 6; }
  const packed = u32((q + 32768) | ((r + 32768) << 16));
  return uhash(u32(packed ^ u32(Math.imul(j, 0x9E3779B9))
                          ^ u32(Math.imul(fl + 32768, 0x85EBCA6B))));
}
function gapAt(cq, cr, i, fl){
  const nq = cq + DIRS[i][0], nr = cr + DIRS[i][1];
  const tc = cellType(cq,cr), tn = cellType(nq,nr);
  if (tc === TYPE.SHAFT && tn === TYPE.SHAFT) return GAP.WALL;
  if (tc === TYPE.STAIRWELL && tn === TYPE.STAIRWELL) return GAP.WALL;
  // a stairwell opens only on its own axis, and always -- the flight has to
  // arrive at a doorway on every storey, so these cannot be hashed per floor
  if (tc === TYPE.STAIRWELL || tn === TYPE.STAIRWELL){
    if (tc === TYPE.SHAFT || tn === TYPE.SHAFT) return GAP.WALL;
    const sq = (tc === TYPE.STAIRWELL) ? cq : nq;
    const sr = (tc === TYPE.STAIRWELL) ? cr : nr;
    return (i % 3 === axisOf(sq, sr)) ? GAP.PASSAGE : GAP.WALL;
  }
  const h = edgeKey(cq, cr, i, fl);
  if ((h & 0xFFFF) >= P_OPEN) return GAP.WALL;
  if (tc === TYPE.SHAFT || tn === TYPE.SHAFT) return GAP.SHAFT;
  return (((h >>> 16) & 3) === 0) ? GAP.HALL : GAP.PASSAGE;
}

const SQ3 = Math.sqrt(3);
const worldOf = (q,r) => [G.R_CELL*1.5*q, G.R_CELL*(SQ3*0.5*q + SQ3*r)];
function cellOf(x, z){
  const q = (2/3)*x / G.R_CELL;
  const r = (-x/3 + SQ3/3*z) / G.R_CELL;
  let X = q, Z = r, Y = -X - Z;
  let rx = Math.floor(X+0.5), ry = Math.floor(Y+0.5), rz = Math.floor(Z+0.5);
  const dx = Math.abs(rx-X), dy = Math.abs(ry-Y), dz = Math.abs(rz-Z);
  if (dx > dy && dx > dz)      rx = -ry - rz;
  else if (dy > dz)            ry = -rx - rz;
  else                         rz = -rx - ry;
  return [rx, rz];
}
function sdHexFlat(px, py, apo){
  const x = Math.abs(px*0.8660254 + py*0.5);
  const y = Math.abs(-px*0.5 + py*0.8660254);
  return Math.max(x, x*0.5 + y*0.8660254) - apo;
}
const storeyOf = y => Math.floor((y - 0.30) / G.H_FLOOR);
/* u runs along the flight, positive uphill; v across the corridor */
function stairUV(lx, lz, cq, cr){
  const a = axisOf(cq, cr), ax = DIRW[a], sg = riseOf(cq, cr);
  return [(lx*ax[0] + lz*ax[1]) * sg, -lx*ax[1] + lz*ax[0]];
}
function stairTread(u){
  const t = Math.max(0, Math.min(1, (u + G.STAIR_RUN) / (2 * G.STAIR_RUN)));
  return Math.ceil(t * 14) * (G.H_FLOOR / 14);
}

/* ==================================================================== *
 *  Added for the agent side. Nothing above this line was changed when
 *  the core was extracted; everything below is new, and exists so that
 *  a traversal can be described, checked and cited without a renderer.
 * ==================================================================== */

/* ---- what a gallery actually holds --------------------------------- *
 * The prototype departs from "all sides except two" (LIB-A-001) on
 * purpose -- degree is variable, so shelved walls vary too, mean 3.07.
 * Book addresses therefore cannot assume four shelved walls: which
 * walls exist is a property of the generated topology, and an address
 * naming a wall that is a doorway is simply false. That is what makes
 * a claimed coordinate checkable.                                     */
function shelvedWalls(q, r, fl){
  if (cellType(q, r) !== TYPE.GALLERY) return [];
  const out = [];
  for (let i = 0; i < 6; i++) if (gapAt(q, r, i, fl) === GAP.WALL) out.push(i);
  return out;
}
const SHELVES_PER_WALL = 5, BOOKS_PER_SHELF = 35;
/* Where the shelves sit on a wall, mirroring the shader's own indexing so
   that the slot you are looking at and the slot you open are the same one. */
const SHELF_PITCH = G.SHELF_P, SHELF_BASE = G.SHELF_BASE;

/* A few slots stand empty -- the gaps the Purifiers left (D-42). About one
   in twenty-nine, and the reader must agree with the renderer about which,
   or you would pull a volume out of a hole.

   NOT YET CONFORMANCE-CHECKED: this hash lives inside the shader's mapAt(),
   which is too entangled with the SDF to share as it stands, so this is a
   hand-written mirror -- the very thing the rest of core/ exists to abolish.
   Extract it the next time mapAt is opened. Until then the statistical test
   in test-core.mjs is the only guard, and it would only catch gross drift. */
function volumeHash(q, r, wall, shelf, slot){
  return (uhash(u32(cellKey(q, r) ^
          u32(wall * 7919 + slot * 31 + shelf * 104729))) & 0xFFFF) / 65536;
}
const volumePresent = (q, r, wall, shelf, slot) => volumeHash(q, r, wall, shelf, slot) >= 0.035;
/* How far the spine stands out of the case. Needed to aim at it: the front
   face is what you see and what the reticule must hit. */
const volumeDepth = (q, r, wall, shelf, slot) =>
  G.BOOK_D * (0.80 + 0.20 * volumeHash(q, r, wall, shelf, slot));
function galleryCapacity(q, r, fl){
  return shelvedWalls(q, r, fl).length * SHELVES_PER_WALL * BOOKS_PER_SHELF;
}

/* ---- traversal, without a renderer -------------------------------- */
const CELL_TYPE_NAME = ["gallery", "shaft", "stairwell", "study"];
const GAP_NAME = ["wall", "passage", "hall", "shaft"];

/* Every exit from a cell, and what lies through it. A stairwell is a
   vertical link only: its flight climbs one storey, so stepping through
   changes floor as well as cell.                                       */
function exitsFrom(q, r, fl){
  const out = [];
  for (let i = 0; i < 6; i++){
    const g = gapAt(q, r, i, fl);
    if (g === GAP.WALL) continue;
    const nq = q + DIRS[i][0], nr = r + DIRS[i][1];
    const nt = cellType(nq, nr);
    out.push({
      dir: i, via: GAP_NAME[g], to: { q: nq, r: nr, floor: fl },
      type: CELL_TYPE_NAME[nt],
      crossable: g !== GAP.SHAFT,
      climbs: nt === TYPE.STAIRWELL ? riseOf(nq, nr) : 0
    });
  }
  return out;
}
function describeCell(q, r, fl){
  const t = cellType(q, r);
  const walls = shelvedWalls(q, r, fl);
  return {
    cell: { q, r, floor: fl },
    type: CELL_TYPE_NAME[t],
    shelvedWalls: walls,
    volumes: walls.length * SHELVES_PER_WALL * BOOKS_PER_SHELF,
    exits: exitsFrom(q, r, fl),
    furniture: t === TYPE.STUDY ? studyItems(q, r, fl).length : 0
  };
}

/* ---- furniture you can sit in -------------------------------------- *
 * "Find a chair, sit and reflect" has to mean something checkable, so a
 * seat is a named piece at a known spot in a known room, not a vibe. Of
 * the four possible pieces only two are sittable: the recliner, and the
 * chair that comes with a desk.                                        */
const FURN_NAME = { 1: "recliner", 2: "end table", 4: "reading lamp", 8: "desk and chair" };
const SITTABLE = 1 | 8;

/* Every piece actually present, named and placed. Same kits, same anchor
   and same culling as the renderer, so what is listed is what is drawn
   and what you collide with. */
function studyPieces(q, r, fl){
  if (cellType(q, r) !== TYPE.STUDY) return [];
  const key = studyKey(q, r, fl);
  const kept = studyVisible(q, r, fl);          // the kit after doorway culling
  const ax = DIRW[studyAnchor(q, r, fl, key)];
  const out = [];
  for (const [bit, lx, lz, rad] of FURN){
    if (!(kept & bit)) continue;
    const px = lx*ax[0] - lz*ax[1], pz = lx*ax[1] + lz*ax[0];
    const isChair = bit === 8 && rad < 0.4;     // the second entry of the pair
    out.push({
      piece: bit === 8 ? (isChair ? "chair" : "desk") : FURN_NAME[bit],
      bit, sittable: (bit & SITTABLE) !== 0 && (bit !== 8 || isChair),
      local: [+px.toFixed(3), +pz.toFixed(3)], radius: rad
    });
  }
  return out;
}
const seatsIn = (q, r, fl) => studyPieces(q, r, fl).filter(p => p.sittable);

/* ---- the packed per-cell facts ------------------------------------- *
 * The shader resolves these once per cell the ray enters and passes the
 * int around; this is the same packing on the CPU, so the two can be
 * compared lane by lane (core/conformance.html does exactly that).
 *
 *   0-11   six gaps, two bits each
 *   12-14  stair axis (2 bits) and rise (1)
 *   15-17  study anchor wall
 *   18-21  study furniture kit surviving the doorway culling
 *
 * The last field is why this matters beyond tidiness. The culling depends
 * on the cell and never on the sample point, and the shader used to redo
 * it inside the SDF -- about eighty times per pixel, which cost 6.5 ms a
 * frame in a furnished room. It is computed here, once. */
function cellDesc(q, r, fl){
  let packed = 0;
  for (let i = 0; i < 6; i++) packed |= gapAt(q, r, i, fl) << (i * 2);
  const t = cellType(q, r);
  if (t === TYPE.STAIRWELL){
    packed |= axisOf(q, r) << 12;
    packed |= (riseOf(q, r) > 0 ? 1 : 0) << 14;
  }
  if (t === TYPE.STUDY){
    const key = studyKey(q, r, fl);
    packed |= studyAnchor(q, r, fl, key) << 15;
    packed |= studyVisible(q, r, fl) << 18;
  }
  return packed;
}
/* the fields, for anyone who would rather not shift bits by hand */
const descGaps   = d => [0,1,2,3,4,5].map(i => (d >> (i * 2)) & 3);
const descAxis   = d => (d >> 12) & 3;
const descRise   = d => ((d >> 14) & 1) ? 1 : -1;
const descAnchor = d => (d >> 15) & 7;
const descKit    = d => (d >> 18) & 15;

/* ---- a reproducible walk ------------------------------------------- *
 * A wander has to be replayable or it cannot be followed: the point is
 * that an agent reports where it went and someone else stands in the
 * same rooms. So the choice at step n is a hash of (seed, n) -- no
 * generator state, which also means step 400 can be checked without
 * replaying the first 399.                                            */
function stepHash(seed, n){
  return uhash(u32(uhash(u32(seed ^ 0x2545F491)) ^ Math.imul(n + 1, 0x9E3779B9)));
}

/* Walking into a stairwell carries you across it and up or down a storey:
   the flight runs straight through, so you leave by the far doorway. Which
   end is the bottom follows from riseOf, exactly as the shader's tread
   does -- entering at the low end climbs, entering at the high end
   descends. Returns null if the far side is walled and the stair is a
   dead end. */
function throughStairwell(sq, sr, sfl, dir){
  const a = axisOf(sq, sr), sgn = riseOf(sq, sr);
  const lowWall = sgn > 0 ? (a + 3) % 6 : a;
  const wIn = (dir + 3) % 6;                    // the stairwell's own near wall
  if (gapAt(sq, sr, dir, sfl) === GAP.WALL) return null;
  const climb = (wIn === lowWall) ? 1 : -1;
  return { q: sq + DIRS[dir][0], r: sr + DIRS[dir][1], floor: sfl + climb, climb };
}

/* One step at a time, so a caller can stop on its own condition -- "walk
   until you find a chair" is a loop over this, not a flag passed in. */
function walkStep(at, seed, n, cameFrom = -1){
  const exits = exitsFrom(at.q, at.r, at.floor).filter(e => e.crossable);
  if (!exits.length) return null;               // sealed; shouldn't occur at 0.50 openness
  /* Prefer not to turn straight back the way we came, or a wander spends
     its life in two rooms. Allowed when it is the only way out. */
  const onward = exits.filter(e => e.dir !== cameFrom);
  const pool = onward.length ? onward : exits;
  const e = pool[stepHash(seed, n) % pool.length];
  if (e.type === "stairwell"){
    const out = throughStairwell(e.to.q, e.to.r, e.to.floor, e.dir);
    if (!out) return walkStepAvoiding(at, seed, n, cameFrom, e.dir);
    return { to: { q: out.q, r: out.r, floor: out.floor }, via: "stair",
             dir: e.dir, through: { q: e.to.q, r: e.to.r }, climb: out.climb };
  }
  return { to: e.to, via: e.via, dir: e.dir, climb: 0 };
}
function walkStepAvoiding(at, seed, n, cameFrom, banned){
  const exits = exitsFrom(at.q, at.r, at.floor)
    .filter(e => e.crossable && e.dir !== banned);
  const onward = exits.filter(e => e.dir !== cameFrom);
  const pool = onward.length ? onward : exits;
  if (!pool.length) return null;
  const e = pool[stepHash(seed, n) % pool.length];
  if (e.type === "stairwell") return null;      // one retry is enough
  return { to: e.to, via: e.via, dir: e.dir, climb: 0 };
}

/* The whole itinerary. Every entry is a place with coordinates, so the
   trail doubles as a set of citations. */
function wander({ q = 0, r = 0, floor = 0, steps = 24, seed = 1 } = {}){
  const trail = [];
  let at = { q, r, floor }, cameFrom = -1;
  for (let n = 0; n < steps; n++){
    const here = describeCell(at.q, at.r, at.floor);
    const entry = { step: n, q: at.q, r: at.r, floor: at.floor, type: here.type,
                    volumes: here.volumes, shelvedWalls: here.shelvedWalls,
                    seats: seatsIn(at.q, at.r, at.floor).map(s => s.piece) };
    const mv = walkStep(at, seed, n, cameFrom);
    if (!mv){ trail.push({ ...entry, took: null }); break; }
    entry.took = { via: mv.via, dir: mv.dir, climb: mv.climb, to: mv.to };
    if (mv.through) entry.took.through = mv.through;
    trail.push(entry);
    cameFrom = (mv.dir + 3) % 6;
    at = mv.to;
  }
  return trail;
}

/* Walk until there is somewhere to sit. Returns the trail and the room,
   or the trail and null if none turned up inside the budget -- which is
   an honest answer an agent can report rather than wander forever. */
function findSeat({ q = 0, r = 0, floor = 0, seed = 1, maxSteps = 400 } = {}){
  const trail = wander({ q, r, floor, steps: maxSteps, seed });
  const i = trail.findIndex(t => t.seats.length > 0);
  return {
    trail: i < 0 ? trail : trail.slice(0, i + 1),
    steps: i < 0 ? trail.length : i,
    room: i < 0 ? null : { q: trail[i].q, r: trail[i].r, floor: trail[i].floor,
                           pieces: studyPieces(trail[i].q, trail[i].r, trail[i].floor) }
  };
}

/* ---- getting from here to a named there ---------------------------- *
 * A wander asks the topology "where could I go next?" and answers at
 * random. A route asks the same question and searches. So the question
 * is asked in one place: movesFrom().
 *
 * The important thing it encodes is that a stairwell is not a place but
 * a move. You do not stand in one and choose again; you enter it in some
 * direction and come out in the cell beyond, one storey up or down
 * (throughStairwell). Rooms are therefore the nodes and stairwells are
 * edges, which is why a route's waypoints include the stairwell it
 * passes through -- a walker has to be steered into the flight, not
 * teleported past it.                                                  */
function movesFrom(at){
  const out = [];
  for (const e of exitsFrom(at.q, at.r, at.floor)){
    if (!e.crossable) continue;                 // a shaft: you may look, not cross
    if (e.type === "stairwell"){
      const o = throughStairwell(e.to.q, e.to.r, e.to.floor, e.dir);
      if (!o) continue;                         // walled on the far side; a dead end
      out.push({ dir: e.dir, via: "stair", climb: o.climb,
                 through: { q: e.to.q, r: e.to.r, floor: at.floor },
                 to: { q: o.q, r: o.r, floor: o.floor } });
    } else {
      out.push({ dir: e.dir, via: e.via, climb: 0, through: null, to: e.to });
    }
  }
  return out;
}

const nodeKey = c => c.q + "," + c.r + "," + c.floor;
/* Somewhere a person can be: a gallery, a reading room, or a flight of
   stairs. Not a shaft, and not a sealed cell with no way out of it. */
function isStandable(q, r, fl){
  const t = cellType(q, r);
  if (t === TYPE.SHAFT) return false;
  return movesFrom({ q, r, floor: fl }).length > 0;
}

/* Breadth-first over legal moves. `cap` bounds the work, because the
   lattice is unbounded and a caller in a keypress handler cannot afford
   to find that out the hard way; `maxSteps` bounds how far afield a
   destination may be. Returns the search itself -- every room reached,
   with the move that reached it -- so one search can answer both "how do
   I get to this cell" and "pick me somewhere worth walking to". */
function walkGraph(from, { maxSteps = 24, cap = 4000, goal = null } = {}){
  const start = { q: from.q, r: from.r, floor: from.floor };
  const seen = new Map([[nodeKey(start), { cell: start, steps: 0, move: null, prev: null }]]);
  const want = goal ? nodeKey(goal) : null;
  const queue = [start];
  for (let head = 0; head < queue.length && seen.size < cap; head++){
    const at = queue[head], here = seen.get(nodeKey(at));
    if (here.steps >= maxSteps) continue;
    for (const m of movesFrom(at)){
      const k = nodeKey(m.to);
      if (seen.has(k)) continue;
      seen.set(k, { cell: m.to, steps: here.steps + 1, move: m, prev: nodeKey(at) });
      if (k === want) return seen;
      queue.push(m.to);
    }
  }
  return seen;
}
function movesTo(graph, to){
  const out = [];
  for (let k = nodeKey(to); graph.has(k); ){
    const n = graph.get(k);
    if (!n.move) break;
    out.push(n.move);
    k = n.prev;
  }
  return out.reverse();
}

/* The route to a particular cell, or an honest refusal. Unreachable and
   too-far-to-search are different answers and are reported as such. */
function routeTo(from, to, { maxSteps = 24, cap = 4000 } = {}){
  if (nodeKey(from) === nodeKey(to)) return { found: true, from, to, moves: [], steps: 0 };
  if (!isStandable(to.q, to.r, to.floor))
    return { found: false, reason: "nothing to stand on there", moves: [] };
  const g = walkGraph(from, { maxSteps, cap, goal: to });
  const k = nodeKey(to);
  if (!g.has(k))
    return { found: false, moves: [],
             reason: g.size >= cap ? `no route inside ${cap} rooms searched`
                                   : `no route within ${maxSteps} rooms` };
  return { found: true, from, to, moves: movesTo(g, to), steps: g.get(k).steps };
}

/* Somewhere with books on the walls, far enough away to be a journey, and
   reachable -- the pool is the breadth-first frontier itself, so "walk
   there" cannot be a promise the lattice will not keep.
   The choice is a hash of the seed rather than Math.random, because
   LIB-G-021 keeps the core free of clocks and random sources. That is
   also what makes the journey worth citing: the same seed from the same
   room is the same destination, for anyone, for ever. */
function routeToShelves(from, seed, { minSteps = 5, maxSteps = 18, cap = 4000 } = {}){
  const g = walkGraph(from, { maxSteps, cap });
  const pool = [];
  for (const n of g.values()){
    if (n.steps < minSteps) continue;
    if (cellType(n.cell.q, n.cell.r) !== TYPE.GALLERY) continue;
    if (!galleryCapacity(n.cell.q, n.cell.r, n.cell.floor)) continue;
    pool.push(n.cell);
  }
  if (!pool.length)
    return { found: false, moves: [],
             reason: `no shelved gallery between ${minSteps} and ${maxSteps} rooms away` };
  /* sorted, so the seed means the same thing whatever order the search
     happened to reach them in */
  pool.sort((a, b) => a.floor - b.floor || a.q - b.q || a.r - b.r);
  const to = pool[stepHash(seed, 0) % pool.length];
  return { found: true, from, to, moves: movesTo(g, to),
           steps: g.get(nodeKey(to)).steps, considered: pool.length };
}

/* A seeded probe for somewhere to stand, anywhere in the lattice. Bounded
   in tries as well as in extent: the answer "I looked 200 times and found
   nowhere" is better than a loop that never returns. */
function someStanding(seed, { span = 500, floors = 9, tries = 200 } = {}){
  for (let n = 0; n < tries; n++){
    const q  = (stepHash(seed, n * 3)     % (2 * span   + 1)) - span;
    const r  = (stepHash(seed, n * 3 + 1) % (2 * span   + 1)) - span;
    const fl = (stepHash(seed, n * 3 + 2) % (2 * floors + 1)) - floors;
    if (isStandable(q, r, fl)) return { found: true, cell: { q, r, floor: fl }, tries: n + 1 };
  }
  return { found: false, tries, reason: `nowhere standable in ${tries} tries` };
}

/* Which volume to take down, given a seed: a real one, not one of the
   slots the Purifiers emptied. Returns the slot and everything needed to
   look straight at its spine -- the face stands proud of the case by its
   own depth, and aiming at the case back instead is the error that had
   the reticule off by six books at a glancing angle. */
function pickVolume(q, r, fl, seed){
  const walls = shelvedWalls(q, r, fl);
  if (!walls.length) return null;
  for (let n = 0; n < 64; n++){
    const wall  = walls[stepHash(seed, n * 3) % walls.length];
    const shelf = stepHash(seed, n * 3 + 1) % SHELVES_PER_WALL;
    const slot  = stepHash(seed, n * 3 + 2) % BOOKS_PER_SHELF;
    if (!volumePresent(q, r, wall, shelf, slot)) continue;
    return { q, r, floor: fl, wall, shelf, slot,
             depth: volumeDepth(q, r, wall, shelf, slot),
             height: SHELF_BASE + shelf * SHELF_PITCH + 0.167,
             along: -G.RUN_HALF + (slot + 0.5) * G.BOOK_W };
  }
  return null;                                  // 29^-1 odds per try; 64 tries
}

export {
  /* constants */
  CORE_VERSION,
  G, P_OPEN, P_SHAFT, P_STAIR, P_STUDY, CRIM, GAP, TYPE, DIRS, DIRW, SQ3,
  FURN_NAME, SITTABLE,
  /* the packed per-cell facts, shared with the shader */
  cellDesc, descGaps, descAxis, descRise, descAnchor, descKit,
  /* wandering */
  stepHash, throughStairwell, walkStep, wander, findSeat, studyPieces, seatsIn,
  SHELVES_PER_WALL, BOOKS_PER_SHELF, CELL_TYPE_NAME, GAP_NAME,
  SHELF_PITCH, SHELF_BASE, volumeHash, volumePresent, volumeDepth,
  /* hash + topology: the surface that MUST agree with the GLSL */
  u32, uhash, cellKey, cellType, edgeKey, gapAt, axisOf, riseOf,
  studyKey, studyKit, studyAnchor, studyFit, studyItems, studyVisible,
  clearOfDoors, FURN,
  /* geometry */
  worldOf, cellOf, sdHexFlat, storeyOf, stairUV, stairTread,
  /* the agent surface */
  shelvedWalls, galleryCapacity, exitsFrom, describeCell,
  /* routing: the same topology, searched instead of sampled */
  movesFrom, isStandable, walkGraph, routeTo, routeToShelves,
  someStanding, pickVolume, nodeKey
};
