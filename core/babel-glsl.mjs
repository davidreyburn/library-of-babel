/* ====================================================================
 * babel-glsl -- the shader's half of the shared layer, kept here rather
 * than in the HTML so there is one place to edit and one place to test.
 *
 * This is a port, not a copy: GLSL has no Math.imul and no 53-bit
 * doubles, so the same arithmetic is written differently. That is
 * exactly why core/test-core.mjs generates vectors from babel-core.mjs
 * and core/conformance.html runs THESE functions on the GPU over the
 * same inputs. A port you cannot test is the hand-synced twin all over
 * again -- and that twin is what put walls where the renderer drew
 * doorways.
 *
 * The two constants blocks interpolate from babel-core.mjs, so a
 * probability can never drift between the CPU and the GPU.
 * ==================================================================== */

import { P_OPEN, P_SHAFT, P_STAIR, P_STUDY } from "./babel-core.mjs";

/* uhash .. sdBox3 -- hashing, cell types, gaps, and the hex helpers */
const TOPOLOGY_GLSL = `
uint uhash(uint x){
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}
uint cellKey(ivec2 c){ return uhash(uint(c.x + 32768) | (uint(c.y + 32768) << 16)); }
uint studyKey(ivec2 c, int fl){ return uhash(cellKey(c) ^ (uint(fl + 32768) * 2654435761u)); }
int cellType(ivec2 c){
  uint h = cellKey(c) >> 16;
  if (h < ${P_SHAFT}u) return 1;
  if (h < ${P_STAIR}u) return 2;
  if (h < ${P_STUDY}u) return 3;      // a reading room: no shelves, some furniture
  return 0;
}
ivec2 dirOf(int i){
  if (i == 0) return ivec2( 1,  0);
  if (i == 1) return ivec2( 1, -1);
  if (i == 2) return ivec2( 0, -1);
  if (i == 3) return ivec2(-1,  0);
  if (i == 4) return ivec2(-1,  1);
  return              ivec2( 0,  1);
}
/* Prefer an axis whose both ends are open ground, or the flight arrives at
   a wall and the stair is a dead end. Both ends must be galleries. */
int axisOf(ivec2 c){
  int base = int(uhash(cellKey(c) ^ 0x5bf03635u) % 3u);
  for (int k = 0; k < 3; k++){
    int a = (base + k) % 3;
    int ta = cellType(c + dirOf(a)), tb = cellType(c + dirOf(a + 3));
    if ((ta == 0 || ta == 3) && (tb == 0 || tb == 3)) return a;
  }
  return base;
}
float riseOf(ivec2 c){ return (uhash(cellKey(c) ^ 0x27d4eb2du) & 1u) == 0u ? 1.0 : -1.0; }

vec2 dirW(int i){
  if (i == 0) return vec2( 0.8660254,  0.5);
  if (i == 1) return vec2( 0.8660254, -0.5);
  if (i == 2) return vec2( 0.0,       -1.0);
  if (i == 3) return vec2(-0.8660254, -0.5);
  if (i == 4) return vec2(-0.8660254,  0.5);
  return             vec2( 0.0,        1.0);
}
uint edgeKey(ivec2 c, int i, int fl){
  ivec2 n = c + dirOf(i);
  ivec2 q = c; int j = i;
  if (n.x < c.x || (n.x == c.x && n.y < c.y)){ q = n; j = (i + 3) % 6; }
  uint packed = uint(q.x + 32768) | (uint(q.y + 32768) << 16);
  return uhash(packed ^ (uint(j) * 0x9E3779B9u) ^ (uint(fl + 32768) * 0x85EBCA6Bu));
}
/* 0 wall . 1 passage . 2 hall . 3 opens onto a shaft */
int gapAt(ivec2 c, int i, int fl){
  ivec2 n = c + dirOf(i);
  int tc = cellType(c), tn = cellType(n);
  if (tc == 1 && tn == 1) return 0;                  // two wells
  if (tc == 2 && tn == 2) return 0;                  // two stairs
  /* A stairwell opens only on the two walls its flight runs between, and
     those doorways are structural -- always there, on every storey -- or
     the stair could climb to a wall.                                    */
  if (tc == 2 || tn == 2){
    if (tc == 1 || tn == 1) return 0;
    ivec2 sc = (tc == 2) ? c : n;
    return (i % 3 == axisOf(sc)) ? 1 : 0;
  }
  uint h = edgeKey(c, i, fl);
  if ((h & 0xFFFFu) >= ${P_OPEN}u) return 0;
  if (tc == 1 || tn == 1) return 3;
  return (((h >> 16) & 3u) == 0u) ? 2 : 1;
}
vec2 worldOf(ivec2 a){
  return vec2(R_CELL * 1.5 * float(a.x),
              R_CELL * (SQ3 * 0.5 * float(a.x) + SQ3 * float(a.y)));
}
ivec2 cellOf(vec2 p){
  float q = (2.0/3.0) * p.x / R_CELL;
  float r = (-p.x/3.0 + SQ3/3.0 * p.y) / R_CELL;
  float x = q;
  float z = r;
  float y = -x - z;
  float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);
  float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);
  if (dx > dy && dx > dz)      rx = -ry - rz;
  else if (dy > dz)            ry = -rx - rz;
  else                         rz = -rx - ry;
  return ivec2(int(rx), int(rz));
}
float sdHexFlat(vec2 p, float apo){
  p = abs(vec2(p.x * 0.8660254 + p.y * 0.5, -p.x * 0.5 + p.y * 0.8660254));
  return max(p.x, dot(p, vec2(0.5, 0.8660254))) - apo;
}
float sdBox3(vec3 p, vec3 b){
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}
`;

/* studyKit .. studyFit -- which furniture a reading room keeps, and
   against which wall. Shared because the collision mesh and the drawn
   mesh must agree; a mismatch here is furniture you can walk through. */
const STUDY_GLSL = `
int studyKit(uint key){
  int i = int(key % 8u);
  if (i == 0) return 1;                    // recliner
  if (i == 1) return 3;                    // recliner, end table
  if (i == 2) return 5;                    // recliner, lamp
  if (i == 3) return 7;                    // recliner, end table, lamp
  if (i == 4) return 8;                    // desk and chair
  if (i == 5) return 12;                   // desk and chair, lamp
  if (i == 6) return 6;                    // end table, lamp
  return 4;                                // lamp alone
}
/* Every doorway axis runs through the middle of the room, so keeping a
   0.55 m corridor clear along each one guarantees the centre is open and
   any door reaches any other. A piece that would stand in one is dropped
   -- anchoring to a blank wall alone still let a recliner reach across a
   neighbouring doorway.                                                 */
bool clearOfDoors(vec2 pos, float rad, int desc){
  for (int i = 0; i < 6; i++){
    if (((desc >> (i * 2)) & 3) == 0) continue;
    vec2 dw = dirW(i);
    if (dot(pos, dw) <= 0.0) continue;
    if (abs(dot(pos, vec2(-dw.y, dw.x))) < rad + 0.55) return false;
  }
  return true;
}
/* how many pieces of a kit survive if the group is anchored to wall i */
int studyFit(int i, int kit, int desc){
  vec2 ax = dirW(i), pv = vec2(-ax.y, ax.x);
  int n = 0;
  if ((kit & 1) != 0 && clearOfDoors(ax * 1.30 + pv * -0.32, 0.44, desc)) n++;
  if ((kit & 2) != 0 && clearOfDoors(ax * 1.32 + pv *  0.40, 0.26, desc)) n++;
  if ((kit & 4) != 0 && clearOfDoors(ax * 1.46 + pv *  0.76, 0.21, desc)) n++;
  if ((kit & 8) != 0 && clearOfDoors(ax * 1.44, 0.60, desc)
                     && clearOfDoors(ax * 1.06, 0.25, desc)) n++;
  return n;
}
/* The blank wall that keeps most of the kit, so a room is rarely left
   bare -- and now the ONLY anchor rule. There used to be two: cellDesc
   placed the furniture by best fit, while this function returned the
   first blank wall, and lighting() used this one to position the reading
   lamp's light. In any room where the two disagreed, the lamp lit from a
   wall it was not standing against. core/conformance.html found it by
   running this against babel-core.mjs -- 483 lanes of 484 agreed, and
   the one that did not was this. Both callers now come here. */
int studyAnchor(int desc, uint key){
  int st = int(key % 6u), kit = studyKit(key);
  int best = st, bestN = -1;
  for (int k = 0; k < 6; k++){
    int i = (st + k) % 6;
    if (((desc >> (i * 2)) & 3) != 0) continue;      // only a blank wall
    int n = studyFit(i, kit, desc);
    if (n > bestN){ bestN = n; best = i; }
  }
  return best;
}
`;

/* studyAnchorAt + cellDesc -- the per-cell facts, packed into one int and
   resolved once per cell the ray enters. This is shared logic and belongs
   here rather than in the HTML: the CPU computes the same packing in
   babel-core.mjs cellDesc(), and core/conformance.html compares all of it,
   including the culled furniture kit that furniture() now reads instead of
   recomputing per sample.

   Bit layout, and both sides must agree on it:
     0-11   six gaps, two bits each
     12-14  stair axis (2) and rise (1)
     15-17  study anchor wall
     18-21  study furniture kit surviving the doorway culling            */
const DESC_GLSL = `
/* The gaps alone, for callers that need the anchor and nothing else. */
int studyAnchorAt(ivec2 c, int fl){
  int packed = 0;
  for (int i = 0; i < 6; i++) packed |= gapAt(c, i, fl) << (i * 2);
  return studyAnchor(packed, studyKey(c, fl));
}
/* two bits per wall, resolved once per cell the ray enters */
int cellDesc(ivec2 c, int fl){
  int packed = 0;
  for (int i = 0; i < 6; i++) packed |= gapAt(c, i, fl) << (i * 2);
  int t = cellType(c);
  if (t == 2){                                 // stash axis and rise, bits 12-14
    packed |= axisOf(c) << 12;
    packed |= (riseOf(c) > 0.0 ? 1 : 0) << 14;
  }
  if (t == 3){                                 // the study anchor, bits 15-17
    /* one rule, from the generated block above -- this used to carry its
       own copy of the best-fit loop while studyAnchor() implemented a
       different rule for the lamp */
    uint key = studyKey(c, fl);
    int anchor = studyAnchor(packed, key);
    packed |= anchor << 15;
    /* and the surviving kit, bits 18-21. Culling here rather than inside
       furniture() is the difference between doing it once per cell and once
       per SDF sample; see the note in furniture(). */
    vec2 ax = dirW(anchor), pv = vec2(-ax.y, ax.x);
    int m = studyKit(key);
    if (!clearOfDoors(ax * 1.30 + pv * -0.32, 0.44, packed)) m &= ~1;
    if (!clearOfDoors(ax * 1.32 + pv *  0.40, 0.26, packed)) m &= ~2;
    if (!clearOfDoors(ax * 1.46 + pv *  0.76, 0.21, packed)) m &= ~4;
    if (!clearOfDoors(ax * 1.44, 0.60, packed) ||
        !clearOfDoors(ax * 1.06, 0.25, packed)) m &= ~8;
    packed |= m << 18;
  }
  return packed;
}
`;

export { TOPOLOGY_GLSL, STUDY_GLSL, DESC_GLSL };
