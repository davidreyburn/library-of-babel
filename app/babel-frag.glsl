#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;
uniform mat3  uView;
uniform float uMotion;
uniform ivec3 uCrimCell;
/* the volume the reticule is resting on: cell and floor, then wall, shelf
   and slot. uTgtSlot.x < 0 means nothing is targeted. */
uniform ivec3 uTgtCell;
uniform ivec3 uTgtSlot;
uniform int   uGrain;   // 0 ordered . 1 noise . 2 fine . 3 off
/* How many rays a pixel may cast: 1, plus one off a mirror. It is a uniform
   and not a constant on purpose -- see the loop in main(). */
uniform int   uBounce;

const float PI = 3.14159265;
const float R_CELL    = ${G.R_CELL.toFixed(3)};
const float APO_ROOM  = ${G.APO_ROOM.toFixed(3)};
const float APO_STAIR = ${G.APO_STAIR.toFixed(3)};
const float APO_SHAFT = ${G.APO_SHAFT.toFixed(3)};
const float PASS_HW   = ${G.PASS_HW.toFixed(2)};
const float HALL_HW   = ${G.HALL_HW.toFixed(2)};
const float STAIR_RUN = ${G.STAIR_RUN.toFixed(2)};
const float STAIR_HW  = ${G.STAIR_HW.toFixed(2)};
const float STAIR_EXT = ${G.STAIR_EXT.toFixed(2)};
const float CORR_HW   = ${G.CORR_HW.toFixed(2)};
const float CORR_EXT  = ${G.CORR_EXT.toFixed(2)};
const float ALC_HW    = ${G.ALC_HW.toFixed(2)};
const float ALC_D     = ${G.ALC_D.toFixed(2)};
const float ALC_H     = ${G.ALC_H.toFixed(2)};
const float H_ROOM    = ${G.H_ROOM.toFixed(2)};
const float H_FLOOR   = ${G.H_FLOOR.toFixed(2)};
const float HALF_D    = ${G.HALF_D.toFixed(3)};
const float SQ3       = 1.7320508;
const float BOOK_W    = ${G.BOOK_W.toFixed(4)};
const float RUN_HALF  = ${G.RUN_HALF.toFixed(3)};
const float UP_C      = ${G.UP_C.toFixed(3)};
const float UP_HW     = ${G.UP_HW.toFixed(3)};
const float CASE_HALF = ${G.CASE_HALF.toFixed(3)};
const float BOOK_D    = ${G.BOOK_D.toFixed(2)};
const float CARC_D    = ${G.CARC_D.toFixed(2)};
const float SHELF_P   = ${G.SHELF_P.toFixed(2)};
const float SHELF_BASE= ${G.SHELF_BASE.toFixed(2)};

/* Verdigris Damp (V-01), roles reassigned per E-01 -- pale is paper,
   dark is stone, and the floor and casework are a warmer wood.        */
const vec3 C_PAPER  = vec3(0.549, 0.569, 0.475);
const vec3 C_PAPER2 = vec3(0.373, 0.400, 0.314);
const vec3 C_STONE  = vec3(0.150, 0.163, 0.128);
const vec3 C_INK    = vec3(0.055, 0.062, 0.045);
const vec3 C_WOOD   = vec3(0.330, 0.256, 0.170);
const vec3 C_HIDE   = vec3(0.300, 0.212, 0.150);   // upholstery
const vec3 C_CRIM   = vec3(0.620, 0.106, 0.196);
const vec3 C_LAMP   = vec3(1.000, 0.769, 0.431);

float gMat;    // 0 stone . 1 volume . 2 crimson . 3 structure . 5 wood . 8 mirror . 9 void
float gTgt;    // 1 on the one volume the reticule is resting on
float gTint;   // per-volume colour draw
float gSpineY; // 0 at the tail of the spine, 1 at the head
uint  gKey;    // per-volume hash

/* @glsl-topology:begin */
uint uhash(uint x){
  x ^= x >> 16; x *= 0x7feb352du;
  x ^= x >> 15; x *= 0x846ca68bu;
  x ^= x >> 16; return x;
}
uint cellKey(ivec2 c){ return uhash(uint(c.x + 32768) | (uint(c.y + 32768) << 16)); }
uint studyKey(ivec2 c, int fl){ return uhash(cellKey(c) ^ (uint(fl + 32768) * 2654435761u)); }
uint corrKey(ivec2 c, int fl){ return uhash(cellKey(c) ^ (uint(fl + 32768) * 0x7ed55d16u)); }
int cellType(ivec2 c){
  uint h = cellKey(c) >> 16;
  if (h < 1311u) return 1;
  if (h < 9175u) return 2;
  if (h < 10486u) return 3;      // a reading room: no shelves, some furniture
  if (h >= 58982u) return 4;      // a corridor: mirror, latrine, standing closet
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
/* Both ends must be open ground, or the flight arrives at a wall and the
   stair is a dead end. A corridor counts as open ground; it is the corridor
   that comes looking for the flight, by asking this for its axis. */
bool openGround(int t){ return t == 0 || t == 3 || t == 4; }
int axisOf(ivec2 c){
  int base = int(uhash(cellKey(c) ^ 0x5bf03635u) % 3u);
  for (int k = 0; k < 3; k++){
    int a = (base + k) % 3;
    if (openGround(cellType(c + dirOf(a))) &&
        openGround(cellType(c + dirOf(a + 3)))) return a;
  }
  return base;
}
float riseOf(ivec2 c){ return (uhash(cellKey(c) ^ 0x27d4eb2du) & 1u) == 0u ? 1.0 : -1.0; }

/* A corridor is built like the stairwell -- a cut through the rock, open
   only on its own axis -- but has no rise, so it is a place and not a move.
   Two passes: first an axis with a flight at one end whose own axis agrees,
   because the text puts the stairway in the hallway; then any axis with
   somewhere to walk at both ends.

   The six ends are resolved once into e and both passes read bits. Keep it
   that way: gapAt calls this, cellDesc calls gapAt six times, and the shader
   calls cellDesc for every cell a ray enters, so calling axisEnd twice per
   axis doubles the most-inlined thing in the program. */
int axisEnd(ivec2 c, int a, int i){       // 0 nothing . 1 open ground . 2 a flight
  ivec2 n = c + dirOf(i);
  int t = cellType(n);
  if (t == 0 || t == 3) return 1;
  if (t == 2 && a == axisOf(n)) return 2;
  return 0;
}
int corridorAxis(ivec2 c){
  int base = int(uhash(cellKey(c) ^ 0x1d3f9a7bu) % 3u);
  int e = 0;
  for (int k = 0; k < 3; k++){
    int a = (base + k) % 3;
    e |= axisEnd(c, a, a)     << (k * 4);
    e |= axisEnd(c, a, a + 3) << (k * 4 + 2);
  }
  for (int pass = 0; pass < 2; pass++)
    for (int k = 0; k < 3; k++){
      int e0 = (e >> (k * 4)) & 3, e1 = (e >> (k * 4 + 2)) & 3;
      if (e0 != 0 && e1 != 0 && (pass == 1 || e0 == 2 || e1 == 2))
        return (base + k) % 3;
    }
  return base;
}
/* 0 nothing . 1 mirror . 2 latrine . 3 an empty standing closet.
   Side 0 is +v across the corridor, side 1 is -v. */
int alcoveAt(ivec2 c, int fl, int side){
  uint k = corrKey(c, fl), n = k & 0xFFFFu;
  int count = (n < 39322u) ? 0 : ((n < 58982u) ? 1 : 2);
  if (count == 0) return 0;
  if (count == 1 && side != int((k >> 16) & 1u)) return 0;
  return 1 + int(uhash(k ^ (uint(side + 1) * 0x9E3779B9u)) % 3u);
}

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
  if (tc == 4 && tn == 4) return 0;                  // two corridors
  /* A corridor opens only on its own axis, and always. Where it meets a
     flight both rules are structural, so the edge is open only where the
     two axes agree -- neither ever contradicts the other.               */
  if (tc == 4 || tn == 4){
    if (tc == 1 || tn == 1) return 0;
    ivec2 kc = (tc == 4) ? c : n;
    if (i % 3 != corridorAxis(kc)) return 0;
    ivec2 oc = (tc == 4) ? n : c;
    if (cellType(oc) == 2 && i % 3 != axisOf(oc)) return 0;
    return 1;                                        // narrow, per LIB-P-020
  }
  /* A stairwell opens only on the two walls its flight runs between, and
     those doorways are structural -- always there, on every storey -- or
     the stair could climb to a wall.                                    */
  if (tc == 2 || tn == 2){
    if (tc == 1 || tn == 1) return 0;
    ivec2 sc = (tc == 2) ? c : n;
    return (i % 3 == axisOf(sc)) ? 1 : 0;
  }
  uint h = edgeKey(c, i, fl);
  if ((h & 0xFFFFu) >= 32768u) return 0;
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
/* @glsl-topology:end */

int gFurnMat;
/* An intentional break with the text, which gives its librarians nothing but
   shelves, a latrine and somewhere to sleep standing up.
   Two rules: a room never holds everything, and nothing stands in the way.
   The set is drawn from eight plausible arrangements (at most three pieces,
   and a desk never shares a room with a recliner), and the whole group is
   anchored to a wall with no doorway in it, out at the room's edge -- so the
   middle stays clear and any door still reaches any other.               */
/* @glsl-study:begin */
/* Sixteen arrangements whose first eight are the original eight, so half
   the reading rooms are furnished exactly as they were. Three of sixteen
   are a mirror and nothing else. */
int studyKit(uint key){
  int i = int(key % 16u);
  if (i == 0) return 1;                    // recliner
  if (i == 1) return 3;                    // recliner, end table
  if (i == 2) return 5;                    // recliner, lamp
  if (i == 3) return 7;                    // recliner, end table, lamp
  if (i == 4) return 8;                    // desk and chair
  if (i == 5) return 12;                   // desk and chair, lamp
  if (i == 6) return 6;                    // end table, lamp
  if (i == 7) return 4;                    // lamp alone
  if (i == 8 || i == 9 || i == 10) return 16;   // a mirror, and nothing else
  if (i == 11) return 1;
  if (i == 12) return 3;
  if (i == 13) return 8;
  if (i == 14) return 12;
  return 7;
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
  if ((kit & 16) != 0 && clearOfDoors(ax * 1.79, 0.06, desc)) n++;
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
/* @glsl-study:end */
float furniture(vec2 lp, float fy, uint key, int desc, float dBest){
  vec2 ax = dirW((desc >> 15) & 7);
  vec2 pv = vec2(-ax.y, ax.x);
  vec2 q = vec2(dot(lp, ax), dot(lp, pv));
  /* THE GROUP BOUND, and it is exact rather than an approximation. Every
     piece below is anchored to one wall, so the whole set lies inside
     x [0.87, 1.82], y [0, 1.87], z [-0.69, 0.93] about that anchor -- read
     off the extents of the boxes themselves, and padded outward. A box
     containing the furniture is never further away than the furniture, so if
     the distance to the box already exceeds the best distance the caller has,
     nothing in here can win and the whole body can be skipped. Culling
     against the caller's best rather than a fixed margin is what makes it
     exact: it changes which samples are evaluated, never the field.

     Worth 30.1% of a reading-room frame and 19.2% of a corridor's, because
     mapAt runs 18-29 times a pixel and this used to run in full every time.
     The measurement is in the performance review at the end of the bug log. */
  if (sdBox3(vec3(q.x - 1.34, fy - 0.94, q.y - 0.12),
             vec3(0.50, 0.95, 0.83)) > dBest){ gFurnMat = 5; return 1e5; }
  /* Which pieces survive the doorway culling was worked out once, in
     cellDesc, and stashed in bits 18-21. It used to be recomputed here --
     four clearOfDoors scans, each walking all six walls -- on every one of
     the ~80 map evaluations a pixel makes between the march, the normal and
     the ambient term. It depends on the room, never on where in the room
     you are, so all but the first were waste: measured at 15.2 ms a frame
     inside a furnished room against 6.6 in a bare gallery. */
  int m = (desc >> 18) & 31;
  float d = 1e5;
  gFurnMat = 5;

  if ((m & 16) != 0){                                 // a mirror on the wall
    /* Flat against the anchor wall, which has no doorway in it. Material 8,
       so main()'s bounce treats it exactly as it treats a corridor's --
       three reading rooms in sixteen hold this and nothing else. */
    vec2 r = q - vec2(1.79, 0.00);
    float mr = sdBox3(vec3(r.x, fy - 1.15, r.y), vec3(0.03, 0.72, 0.34));
    if (mr < d){ d = mr; gFurnMat = 8; }
  }

  if ((m & 1) != 0){                                  // recliner
    vec2 r = q - vec2(1.30, -0.32);
    float seat = sdBox3(vec3(r.x, fy - 0.24, r.y), vec3(0.32, 0.13, 0.30));
    float back = sdBox3(vec3(r.x - 0.26, fy - 0.52, r.y), vec3(0.10, 0.40, 0.30));
    float arms = sdBox3(vec3(r.x, fy - 0.38, abs(r.y) - 0.30), vec3(0.32, 0.10, 0.07));
    float up = min(seat, min(back, arms));
    if (up < d){ d = up; gFurnMat = 6; }
  }
  if ((m & 2) != 0){                                  // end table
    vec2 r = q - vec2(1.32, 0.40);
    float t = min(sdBox3(vec3(r.x, fy - 0.46, r.y), vec3(0.22, 0.03, 0.22)),
                  sdBox3(vec3(r.x, fy - 0.22, r.y), vec3(0.05, 0.22, 0.05)));
    if (t < d){ d = t; gFurnMat = 5; }
  }
  if ((m & 4) != 0){                                  // reading lamp
    vec2 r = q - vec2(1.46, 0.76);
    float st2 = min(sdBox3(vec3(r.x, fy - 0.70, r.y), vec3(0.025, 0.70, 0.025)),
                    sdBox3(vec3(r.x, fy - 0.02, r.y), vec3(0.17, 0.02, 0.17)));
    float shade = sdBox3(vec3(r.x, fy - 1.44, r.y), vec3(0.16, 0.13, 0.16));
    if (st2 < d){ d = st2; gFurnMat = 5; }
    if (shade < d){ d = shade; gFurnMat = 7; }
  }
  if ((m & 8) != 0){                                  // desk, chair tucked under
    vec2 r = q - vec2(1.44, 0.00);
    float top = sdBox3(vec3(r.x, fy - 0.73, r.y), vec3(0.28, 0.035, 0.58));
    float ped = sdBox3(vec3(r.x, fy - 0.36, abs(r.y) - 0.47), vec3(0.24, 0.36, 0.06));
    vec2 ch = q - vec2(1.06, 0.00);
    float cs2 = sdBox3(vec3(ch.x, fy - 0.44, ch.y), vec3(0.19, 0.035, 0.19));
    float cb = sdBox3(vec3(ch.x + 0.16, fy - 0.68, ch.y), vec3(0.035, 0.28, 0.19));
    float cp = sdBox3(vec3(ch.x, fy - 0.22, ch.y), vec3(0.05, 0.22, 0.05));
    float dk = min(min(top, ped), min(cs2, min(cb, cp)));
    if (dk < d){ d = dk; gFurnMat = 5; }
  }
  return d;
}

/* What stands in a corridor's two recesses. Which recess holds what was
   settled once, in cellDesc, and travels in bits 24-27 -- the same rule
   that took the furniture cull out of the SDF.

   An empty closet is the recess and nothing else: Borges's librarian sleeps
   standing up in it, and there is nothing to draw. The latrine is a plain
   bored block, unglazed, and the mirror is a bare plate set into the back
   face, framed by the rock it is let into rather than by any joinery
   (LIB-P-021, LIB-P-023; D-50 forbids ornament).                         */
float alcoveFixtures(vec2 lp, float fy, int desc, float dBest){
  vec2 ax = dirW((desc >> 23) & 3);
  float u = dot(lp, ax), v = dot(lp, vec2(-ax.y, ax.x));
  /* The same exact bound the furniture gets, and it bites harder here: a
     corridor is long in u and every fixture sits within 0.30 of the alcove
     centre, so most of its length culls on the first compare. |u| <= 0.30,
     |v| <= CORR_HW + ALC_D = 1.24, fy in [0, 1.82], padded outward. A box
     containing the fixtures is never further than the fixtures, so exceeding
     the caller's best distance means none of them can win. */
  if (sdBox3(vec3(u, fy - 0.91, v), vec3(0.32, 0.93, 1.27)) > dBest){
    gFurnMat = 3; return 1e5;
  }
  float d = 1e5;
  gFurnMat = 3;
  for (int s = 0; s < 2; s++){
    int a = (desc >> (25 + s * 2)) & 3;
    if (a < 2) continue;                        // nothing, or a mirror: below
    float sv = (s == 0) ? v : -v;
    if (a == 2){                                // the latrine
      vec2 q = vec2(u, sv - 0.94);
      float blk = sdBox3(vec3(q.x, fy - 0.21, q.y), vec3(0.30, 0.21, 0.28));
      /* The bore stops 0.09 above the floor instead of going through it. As an
         infinite cylinder it subtracted a clean hole out of the corridor's
         floorboards, so looking down a latrine showed you *wood* -- the pale
         disc that made this look like a window rather than a drop. Bounding
         it leaves the block its own pan, in stone, in the deepest shade in
         the room. */
      float bore = max(length(q) - 0.155, 0.09 - fy);
      float lat = max(blk, -bore);
      /* Which face of the block are we on? The bore is a subtraction, so its
         inner wall is the surface where the subtracted term is the active
         one -- bore near zero -- while the seat's outer faces sit at bore
         about +0.145. That one comparison is enough to give the inside of
         the hole its own material, and material 9 shades to nothing. Without
         it the bore wall carried the block's pale stone and the hole read as
         a pale disc: a window, not a drop. */
      if (lat < d){ d = lat; gFurnMat = (abs(bore) < 0.012) ? 9 : 3; }
    }
  }
  /* The mirror last and separately, so its material wins any tie. */
  for (int s = 0; s < 2; s++){
    if (((desc >> (25 + s * 2)) & 3) != 1) continue;
    float sv = (s == 0) ? v : -v;
    float gl = sdBox3(vec3(u, fy - 1.10, sv - (CORR_HW + ALC_D - 0.025)),
                      vec3(0.30, 0.72, 0.025));
    if (gl < d){ d = gl; gFurnMat = 8; }
  }
  return d;
}

float mapAt(vec3 p, ivec2 c, int desc, int ctype, int fl){
  float fy = p.y - float(fl) * H_FLOOR;
  vec2 lp = p.xz - worldOf(c);

  float apo = (ctype == 1) ? APO_SHAFT : APO_ROOM;
  float dv;
  if (ctype == 4){
    /* The corridor: the same cut through solid rock as the stair, level
       instead of climbing, and running past the cell boundary at both ends
       for the same reason -- ending it exactly on the boundary caps it with
       a face you can walk through but not see past. Its two recesses are
       unions with the corridor's own void, so the opening between them is
       seamless and there is no lip to catch on.                          */
    vec2 ax = dirW((desc >> 23) & 3);
    float u = dot(lp, ax), v = dot(lp, vec2(-ax.y, ax.x));
    dv = max(max(abs(u) - (HALF_D + CORR_EXT), abs(v) - CORR_HW),
             max(-fy, fy - H_ROOM));
    for (int s = 0; s < 2; s++){
      if (((desc >> (25 + s * 2)) & 3) == 0) continue;
      float sv = (s == 0) ? v : -v;
      dv = min(dv, max(max(abs(u) - ALC_HW, -sv),
                       max(sv - (CORR_HW + ALC_D), max(-fy, fy - ALC_H))));
    }
  }
  else if (ctype == 2){
    /* One straight flight cut through solid rock, running the whole width
       of the cell and climbing exactly one storey: a narrow hallway, not a
       well. Copies sit every storey, so entering low puts you out one floor
       up, and entering high puts you out one floor down.                */
    vec2 ax = dirW((desc >> 12) & 3);
    float u = dot(lp, ax) * (((desc >> 14) & 1) == 1 ? 1.0 : -1.0);
    float v = dot(lp, vec2(-ax.y, ax.x));
    float t = clamp((u + STAIR_RUN) / (2.0 * STAIR_RUN), 0.0, 1.0);
    float smoothY = t * H_FLOOR;
    float stepY   = ceil(t * 14.0) * (H_FLOOR / 14.0);
    dv = 1e5;
    for (int k = -1; k <= 1; k++){
      float h = p.y - float(fl + k) * H_FLOOR;
      dv = min(dv, max(max(abs(u) - (STAIR_RUN + STAIR_EXT), abs(v) - STAIR_HW),
                       max(stepY - h, h - smoothY - 2.05)));
    }
  } else {
    dv = sdHexFlat(lp, apo);
    if (ctype != 1) dv = max(dv, max(-fy, fy - H_ROOM));
  }

  /* THE REVEAL: the wall you see INSIDE a gap. A distinct architectural
     surface that was being shaded as if it were open wall -- obliquely lit,
     self-occluded, and so green and dark against its warm bright neighbours a
     few centimetres away, which is the patch reported four times over.

     Named POSITIONALLY, not by asking which primitive won. The obvious test,
     "is the doorway box nearer than the room", fails: at a hit point both are
     ~0 and the march stops a fraction short, so the comparison is decided by
     noise and the tag spread over 43-98% of a frame. The wall between two
     cells spans |u| < HALF_D - APO_ROOM = 0.600 m about the gap centre, and
     inside that slab the only surfaces there are belong to the hole. No SDF
     comparison, no epsilon, nothing to go wrong at a grazing angle.

     Costs one compare and no geometry: no topology, no collision, nothing
     core/ believes changes. The test itself lives in shadeHit, NOT here --
     see the note there; putting it in this function cost 2x the frame. */

  float solidAdd = 1e5;
  int   solidMat = 3;

  /* A stair and a corridor cut their own way out past the cell boundary,
     so they must not also punch a doorway box: they meet the opening the
     neighbouring gallery draws on its side. */
  if (ctype != 2 && ctype != 4) for (int i = 0; i < 6; i++){
    int g = (desc >> (i * 2)) & 3;
    if (g == 0) continue;
    vec2 dir = dirW(i);
    vec2 rel = lp - dir * HALF_D;
    float u = dot(rel, dir);
    float v = dot(rel, vec2(-dir.y, dir.x));
    if (abs(u) > 1.6 || abs(v) > 1.9) continue;

    if (g == 1)
      dv = min(dv, sdBox3(vec3(u, fy - 1.02, v), vec3(0.78, 1.02, PASS_HW)));
    else if (g == 2){
      dv = min(dv, sdBox3(vec3(u, fy - H_ROOM*0.5, v), vec3(0.78, H_ROOM*0.5, HALL_HW)));
      dv = min(dv, sdBox3(vec3(u, fy - 0.95, abs(v) - (HALL_HW + 0.30)),
                          vec3(0.32, 0.95, 0.30)));
    }
    else {
      /* A guardrail at the shaft's own lip. Anchoring it to the ray's cell
         put it in two different places depending on which side you looked
         from; the lip is at APO_SHAFT from the shaft's centre, so the offset
         flips sign according to which of the pair is the well.   D-23     */
      dv = min(dv, sdBox3(vec3(u, fy - 1.02, v), vec3(0.78, 1.02, 0.62)));
      float lip = (ctype == 1) ? -(HALF_D - APO_SHAFT) : (HALF_D - APO_SHAFT);
      float top = sdBox3(vec3(u - lip, fy - 0.46, v), vec3(0.045, 0.045, 0.62));
      float mid = sdBox3(vec3(u - lip, fy - 0.26, v), vec3(0.030, 0.030, 0.62));
      float pv  = mod(v + 0.62, 0.2480) - 0.1240;      // six uprights
      float pst = max(sdBox3(vec3(u - lip, fy - 0.23, pv), vec3(0.038, 0.23, 0.038)),
                      abs(v) - 0.62);
      float rail = min(top, min(mid, pst));
      if (rail < solidAdd){ solidAdd = rail; solidMat = 5; }
    }
  }

  float d = -dv;
  gMat = 0.0;
  gTgt = 0.0;

  if (solidAdd < d){ d = solidAdd; gMat = float(solidMat); }
  if (ctype == 2){ if (d > 0.0) gMat = 5.0; return d; }   // treads read as wood
  if (ctype == 1) return d;
  if (ctype == 4){                                        // a corridor
    float f = alcoveFixtures(lp, fy, desc, d);
    if (f < d){ d = f; gMat = float(gFurnMat); }
    return d;
  }
  if (ctype == 3){                                        // a reading room
    float f = furniture(lp, fy, studyKey(c, fl), desc, d);
    if (f < d){ d = f; gMat = float(gFurnMat); }
    return d;
  }

  /* ---- shelving ---------------------------------------------------- *
   * A discrete case per unbroken wall: end uprights, a board under every
   * row, a plinth, all standing proud of the volumes; and the case stops
   * short of the wall ends so corners read as two pieces of furniture,
   * not one continuous band. The two nearest walls are evaluated, or the
   * further of a pair would render as bare stone.                      */
  if (fy < -SHELF_BASE || fy > H_ROOM + SHELF_BASE) return d;
  float dh = sdHexFlat(lp, APO_ROOM);
  /* Well inside the room, skip the casework and return the distance to the
     front of it. That is *conservative* rather than exact -- correct for the
     march, which only needs a lower bound, and wrong for aoCtx, which reads
     the difference between the field and the truth as occlusion.
     The margin has to clear the ambient probe, or the boundary between the
     exact region and this one falls across the shelving and AO paints it
     there: the case front stands CARC_D in from the wall and the probe
     reaches 0.21 further, so 0.12 of margin put the seam at 0.38 and the
     probe at 0.47. That was the mottling on the spines -- organic, because
     which side of the seam a sample fell on depended on the depth of the
     volume under it. 0.24 puts the seam beyond anything the probe can reach.

     THIS DID NOT FIX THE SAME-LOOKING MOTTLING ON BARE STONE WALLS, which is
     still open (§17.13). Do not assume one cause: a probe off a plain wall
     reaches 0.21 and never crosses this seam at either margin, so whatever
     paints the walls is something else. Ablate on a wall before theorising;
     the ablation that convicted AO here was run on a shelf.               */
  if (dh < -(CARC_D + 0.24)) return min(d, -dh - CARC_D);

  int w1 = -1, w2 = -1; float p1 = -1e9, p2 = -1e9;
  for (int i = 0; i < 6; i++){
    if (((desc >> (i * 2)) & 3) != 0) continue;
    float pr = dot(lp, dirW(i));
    if (pr > p1){ p2 = p1; w2 = w1; p1 = pr; w1 = i; }
    else if (pr > p2){ p2 = pr; w2 = i; }
  }

  uint ck = cellKey(c);
  float base = fy - SHELF_BASE;
  /* THE NEAREST OF THE FIVE REAL SHELVES, not the containing one modulo the
     pitch. mod(base, SHELF_P) - 0.167 repeats the shelf up the wall for
     ever and is not centred on the volume, so above the top shelf it
     measured to a book that is not there, and in the upper part of each gap
     it measured to the farther of the two books rather than the nearer.
     Both over-report the distance, and an SDF that over-reports lets the
     march step *through* the surface: the ray lands past the spine, the
     gradient there is nonsense, and the shading paints a dark organic patch.
     That is the mottling, on shelves and -- through the same mechanism at
     the case ends -- on the walls beside them. Measured: at the step scale of
     0.80 this shader marched with at the time, 8.5% of surface pixels carried
     a normal facing no wall; dropping the step to 0.30 took it to 6.1% and
     cost 6.7x the frame. Making the field conservative gets the same result
     for free. Clamping also costs a shade less than mod().

     TWO CORRECTIONS, both measured later (bug log §13). The step scale is now
     0.60, not 0.80. And the 6.7x figure does not reproduce -- 0.25 measures
     +28% and 0.60 measures +11% -- which matters because that number was the
     stated reason not to touch the step for four sessions. Re-measure before
     quoting it.                                                           */
  float shelfIdx = clamp(floor((base - 0.167) / SHELF_P + 0.5), 0.0, 4.0);
  float ys = base - (shelfIdx * SHELF_P + 0.167);
  float yb = mod(base + SHELF_P*0.5, SHELF_P) - SHELF_P*0.5;   // already centred
  float cx = APO_ROOM - CARC_D * 0.5;

  for (int i = 0; i < 6; i++){
    if (i != w1 && i != w2) continue;
    vec2 dir = dirW(i);
    vec2 w = vec2(dot(lp, dir), dot(lp, vec2(-dir.y, dir.x)));
    /* A cull that cannot lie: if the lateral distance to this run already
       exceeds the best distance so far, nothing on the wall can beat it.
       abs(w.y) > CASE_HALF + 0.03 dropped the casework out of the field
       outright, which is what tore the corners. */
    if (abs(w.y) - (CASE_HALF + 0.03) > d) continue;

    float up = sdBox3(vec3(w.x - cx, fy - 1.075, abs(w.y) - UP_C),
                      vec3(CARC_D*0.5, 1.075, UP_HW));
    if (up < d){ d = up; gMat = 5.0; }
    float bd = sdBox3(vec3(w.x - cx, yb, w.y), vec3(CARC_D*0.5, 0.022, CASE_HALF));
    if (bd < d){ d = bd; gMat = 5.0; }
    float pl = sdBox3(vec3(w.x - cx, fy - 0.025, w.y), vec3(CARC_D*0.5, 0.025, CASE_HALF));
    if (pl < d){ d = pl; gMat = 5.0; }

    if (abs(w.y) - RUN_HALF > d) continue;
    /* and the nearest of the thirty-five real slots, clamped rather than
       dropped, for the same reason */
    float bi = clamp(floor((w.y + RUN_HALF) / BOOK_W), 0.0, 34.0);
    uint  bk = uhash(ck ^ uint(i*7919 + int(bi)*31 + int(shelfIdx)*104729));
    float hh = float(bk & 0xFFFFu) / 65536.0;
    float ch = float((bk >> 16) & 0xFFFFu) / 65536.0;
    if (hh < 0.035) continue;                    // a gap the Purifiers left  D-42
    float depth = BOOK_D * (0.80 + 0.20 * hh);
    float bc = -RUN_HALF + (bi + 0.5) * BOOK_W;
    float db = sdBox3(vec3(w.x - (APO_ROOM - depth*0.5), ys, w.y - bc),
                      vec3(depth*0.5, 0.145, BOOK_W*0.45));
    if (db < d){
      d = db; gMat = 1.0; gTint = ch; gKey = bk;
      gSpineY = clamp((ys + 0.145) / 0.29, 0.0, 1.0);
      if (c.x == uCrimCell.x && c.y == uCrimCell.y && fl == uCrimCell.z &&
          i == ${CRIM.wall} && int(shelfIdx) == ${CRIM.shelf} && int(bi) == ${CRIM.slot})
        gMat = 2.0;                              // the one appearance  V-09 / E-06
      /* Which slot the reticule is on is worked out on the CPU, by the same
         ray against the same shelf plane that pulling a volume uses -- so
         the book that lights up is the book that opens. */
      gTgt = (uTgtSlot.x >= 0 && c.x == uTgtCell.x && c.y == uTgtCell.y &&
              fl == uTgtCell.z && i == uTgtSlot.x &&
              int(shelfIdx) == uTgtSlot.y && int(bi) == uTgtSlot.z) ? 1.0 : 0.0;
    }
  }
  return d;
}

/* @glsl-desc:begin */
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
    if (!clearOfDoors(ax * 1.79, 0.06, packed)) m &= ~16;
    packed |= m << 18;
  }
  if (t == 4){                                 // the corridor, bits 23-28
    /* Which alcove holds what is a fact about the cell, not about the
       sample point, so it is resolved here rather than inside mapAt --
       the same rule that took the furniture cull out of the SDF. */
    packed |= corridorAxis(c) << 23;
    packed |= alcoveAt(c, fl, 0) << 25;
    packed |= alcoveAt(c, fl, 1) << 27;
  }
  return packed;
}
/* @glsl-desc:end */

vec3 normalCtx(vec3 p, ivec2 c, int desc, int ct, int fl){
  vec2 e = vec2(1.0, -1.0) * 0.0016;
  return normalize(e.xyy * mapAt(p + e.xyy, c, desc, ct, fl) +
                   e.yyx * mapAt(p + e.yyx, c, desc, ct, fl) +
                   e.yxy * mapAt(p + e.yxy, c, desc, ct, fl) +
                   e.xxx * mapAt(p + e.xxx, c, desc, ct, fl));
}
float aoCtx(vec3 p, vec3 n, ivec2 c, int desc, int ct, int fl){
  float s = 0.0, w = 1.0;
  for (int i = 1; i <= 3; i++){
    float h = 0.07 * float(i);
    s += w * (h - mapAt(p + n * h, c, desc, ct, fl));
    w *= 0.68;
  }
  return clamp(1.0 - 3.2 * s, 0.0, 1.0);
}

/* Two lamps per gallery and per stairwell, transversally placed. Shafts
   have none of their own -- only what spills in. No shadow term.       */
vec3 lighting(vec3 p, vec3 n, out float lit){
  vec3 sum = vec3(0.0);
  ivec2 c0 = cellOf(p.xz);
  int fl0 = int(floor(p.y / H_FLOOR));
  for (int i = -1; i < 6; i++){
    ivec2 c = (i < 0) ? c0 : c0 + dirOf(i);
    int ct = cellType(c);
    if (ct == 1) continue;                       // a shaft has none of its own
    vec2 wc = worldOf(c);

    if (ct == 2){
      /* A stairwell's lamps have to climb with the flight. Fixed at a
         storey height they ended up above the sloping ceiling, outside the
         corridor, and a downward-facing ceiling then takes dot(n,L) < 0 --
         which is why the top of a stair went black.                     */
      vec2 axv = dirW(axisOf(c));
      float sgn = riseOf(c);
      for (int m = -1; m <= 1; m += 2){
        float uu = 1.20 * float(m);
        float tt = clamp((uu + STAIR_RUN) / (2.0 * STAIR_RUN), 0.0, 1.0);
        vec2 lxz = wc + axv * (uu * sgn);
        for (int f = -1; f <= 1; f++){
          float ly = float(fl0 + f) * H_FLOOR + tt * H_FLOOR + 1.78;
          vec3 L = vec3(lxz.x, ly, lxz.y) - p;
          float dl = length(L);
          if (dl > 11.0) continue;
          float att = 1.0 / (1.0 + (dl / 1.35) * (dl / 1.35));
          sum += C_LAMP * att * max(dot(n, L / dl), 0.0);
        }
      }
      continue;
    }

    /* A corridor keeps the gallery's transverse pair rather than getting
       lamps down its length. Down the length would be better placed -- at
       1.24 m wide, an offset drawn from the cell's hash usually lands in
       the rock -- but it needs corridorAxis(), and this loop runs it for
       seven cells on every shaded pixel. Nothing is shadowed here, so what
       the placement really changes is where the pool of light falls; the
       ends of a corridor read a little darker for it, which LIB-P-012 is
       not going to complain about. */

    if (ct == 3){
      for (int f = -1; f <= 1; f++){           // the reading lamp is a real source
        int flf = fl0 + f;
        /* Reject on the room before working out where its lamp is. Whatever
           wall the lamp is anchored to it sits 1.646 m from the room's
           centre, so beyond 7 + 1.646 it cannot reach us. Without this the
           anchor scan ran three times per neighbouring room -- once per
           storey -- and the dl > 7.0 test below then threw two of them away.
           That scan is the most expensive thing in this function. */
        vec3 mid = vec3(wc.x, float(flf) * H_FLOOR + 1.40, wc.y);
        if (distance(p, mid) > 8.65) continue;
        uint k = studyKey(c, flf);
        if ((studyKit(k) & 4) == 0) continue;
        /* The anchor, and only the anchor. Going through cellDesc would also
           pay for the furniture culling, which the lamp's position does not
           need -- measured at +0.9 ms a frame when standing beside a
           furnished room. Same studyAnchor either way, so one rule still. */
        vec2 ax = dirW(studyAnchorAt(c, flf));
        vec2 lw = wc + ax * 1.46 + vec2(-ax.y, ax.x) * 0.76;
        vec3 L = vec3(lw.x, float(flf) * H_FLOOR + 1.40, lw.y) - p;
        float dl = length(L);
        if (dl > 7.0) continue;
        float att = 1.0 / (1.0 + (dl / 0.85) * (dl / 0.85));
        sum += C_LAMP * att * 0.9 * max(dot(n, L / dl), 0.0);
      }
    }
    float a = float(cellKey(c) & 0xFFFu) / 4096.0 * PI;
    vec2 off = vec2(cos(a), sin(a)) * 0.95;
    for (int f = -1; f <= 1; f++){
      float fy = float(fl0 + f) * H_FLOOR + H_ROOM * 0.86;
      for (int s = -1; s <= 1; s += 2){
        vec3 L = vec3(wc.x + off.x * float(s), fy, wc.y + off.y * float(s)) - p;
        float dl = length(L);
        if (dl > 11.0) continue;
        float att = 1.0 / (1.0 + (dl / 1.35) * (dl / 1.35));
        sum += C_LAMP * att * max(dot(n, L / dl), 0.0);
      }
    }
  }
  lit = clamp(length(sum) * 0.62, 0.0, 1.0);
  return sum;
}

/* Ordered dither to a short tone ramp: an early indexed display. The
   buffer is an integer fraction of the canvas and upscaled by nearest
   neighbour, so the pattern stays on whole pixels.                     */
float bayer8(ivec2 c){
  int x = c.x & 7, y = c.y & 7, v = 0;
  for (int i = 0; i < 3; i++){
    int s = 2 - i;
    v = (v << 2) | (((y >> s) & 1) << 1) | (((x ^ y) >> s) & 1);
  }
  return float(v) / 64.0;
}
/* Interleaved gradient noise: three constants, no texture, and it scatters
   without the visible weave an ordered matrix leaves on a flat wall. */
float ign(vec2 c){
  return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715))));
}

/* The march, lifted out of main() so a second ray can be sent through it.
   Cells are resolved once each rather than per step: cellDesc is the
   expensive call and consecutive samples are almost always in the cell the
   last one was in.                                                       */
/* The bound is the constant 72 with an early break rather than the
   parameter itself, so the step budget cannot make this loop a candidate
   for unrolling. Belt and braces: the thing that actually stopped this
   shader linking was call sites, not loop bounds (§17.13). */
float marchRay(vec3 ro, vec3 rd, int steps){
  float t = 0.03;
  ivec2 cc = ivec2(16777216, 16777216);
  int cfl = 16777216, desc = 0, ct = 0;
  for (int i = 0; i < 72; i++){
    if (i >= steps) break;
    vec3 p = ro + rd * t;
    int fl = int(floor(p.y / H_FLOOR));
    ivec2 c = cellOf(p.xz);
    if (any(notEqual(c, cc)) || fl != cfl){
      cc = c; cfl = fl; ct = cellType(c); desc = cellDesc(c, fl);
    }
    float d = mapAt(p, c, desc, ct, fl);
    /* THE TOLERANCE IS THE MOTTLING, and it was the last knob anyone turned.
       It used to read 0.0018 * t + 0.0012 -- about 5.5 mm at 2.4 m, 12 mm at
       6 m. The residual offset it leaves at the hit point is what corrupts
       normalCtx's gradient, and because the step count that first satisfies
       it is an integer, the error came out as CONCENTRIC RINGS centred on
       wherever the view is perpendicular to a surface. Rendered as a
       normal-error map it is a bullseye, which is what finally identified it
       (bug log §13).
       Four sessions went at the step scale instead. That controls how fast
       the march approaches; this controls where it stops, and the residual is
       set by this. 10x tighter, measured over the wall the reporter
       photographed by the share of stone pixels whose n.y is more than 0.15
       from the nearest of {-1, 0, +1}:

                                       bad normals   mean error
         step 0.60, tolerance 0.0018      46.04%       0.1669
         step 0.80, tolerance 0.00018      0.34%       0.0178

       A factor of 135 on that surface, and 0.36% on a plain stone wall.
       Frame cost is NEUTRAL -- within +/-2% across three views at a matched
       775x445 buffer. An earlier draft of this comment claimed -30%, and that
       was an artefact of the probe rather than the shader: bug log §13 records
       the two harness faults behind it. Do not restate this as free speed.
       The step scale went back to 0.80 with it. */
    /* DO NOT "refine" this by returning t + d. It was tried, it measured well
       -- hit points within 1.6 mm of the surface went 16% -> 74% -- and it
       put a solid BLACK RECTANGLE on the wall it was meant to clean, which
       is worse than the defect. The reasoning behind it was that d is a
       lower bound on the distance remaining, so t + d could not pass the
       surface. That is true of a conservative field and this one is not:
       §17.14 and the shelving comments below record it OVER-reporting in
       several places, which is the whole reason the march runs at 0.80. Step
       t + d where it over-reports and the hit point lands INSIDE solid;
       aoCtx then probes outward from inside, s goes large, occ clamps to 0,
       and stone albedo plus lit both collapse. Bug log §13.
       The residual offset that motivated it is now gone -- the tolerance above
       is 10x tighter and the hit point sits on the surface. If a future change
       reopens this, make the probes commensurate or make the field
       conservative; do not step forward on trust. */
    if (d < 0.00018 * t + 0.00012) return t;
    /* 0.80, restored. Four sessions treated this as the mottling knob; it is
       not. It sets how fast the march approaches, and the tolerance above sets
       where it stops -- and the residual offset the tolerance leaves is what
       corrupts the normal. Tightening the tolerance 10x beat step 0.25 on
       quality while being faster than step 0.60, so the step came back up. */
    t += d * 1.00;
    if (t > 70.0) break;
  }
  return -1.0;
}

/* Everything that turns a hit into a tone. Lifted out for the same reason:
   a reflection shaded by a second code path is a reflection that does not
   match the room, and "faithfully duplicates all appearances" (LIB-P-023)
   is the one thing the mirror is specified to do. Hands back the surface
   normal and the material so the caller can decide whether to bounce. */
void shadeHit(vec3 ro, vec3 rd, float hit,
              out vec3 sub, out float lum, out float matOut,
              out vec3 nOut, out vec3 pOut){
  sub = C_INK; lum = 0.02; matOut = 0.0; nOut = -rd; pOut = ro + rd * hit;
  {
    vec3 hp = ro + rd * hit;
    int fl = int(floor(hp.y / H_FLOOR));
    ivec2 c = cellOf(hp.xz);
    int ct2 = cellType(c);
    int d2  = cellDesc(c, fl);

    mapAt(hp, c, d2, ct2, fl);
    float mat = gMat, tint0 = gTint, spy = gSpineY, tgt = gTgt;
    uint  key0 = gKey;   // captured now: normalCtx and aoCtx overwrite these
    /* 35 spines across a 1.82 m wall fall below a pixel at a few metres, and
       their per-volume colours then beat into moire. Converge the detail on
       its mean with distance -- the procedural equivalent of a mip level. */
    float detail = clamp(1.0 - (hit - 2.5) / 7.0, 0.0, 1.0);
    tint0 = mix(0.5, tint0, detail);

    /* THE REVEAL, named here and deliberately NOT in mapAt. The wall between
       two cells spans |u| < HALF_D - APO_ROOM = 0.600 m about a gap centre,
       and inside that slab the only surfaces are the ones the hole was cut
       through -- so the test is positional and needs no SDF comparison. The
       obvious alternative, asking which primitive the field says is nearest,
       fails: at a hit point both are ~0 and the march stops a fraction short,
       so noise decides and the tag spread over 43-98% of a frame.

       The cost is why it is here rather than in mapAt, which runs 10-21 times
       a pixel on the march against this once. In its current place it is
       FREE: ?ablate=noreveal removes the whole loop and the frame does not
       move (-1% mean, i.e. noise, across five cell types).

       An earlier note here claimed "2x the frame, 5.8 ms against 3.3" and a
       commit message accepted 16-36% knowingly. **Both were harness, not
       shader.** Those figures paid a gl.readPixels stall on EVERY frame and
       compared across page loads at different canvas sizes; the stall alone
       presented as 1.4 ms of fixed cost that does not exist. Amortise the
       sync over the batch and A/B two ablations of one build, and the cost
       disappears. Same lesson as the 30% frame-time claim retracted in bug
       log §13: in this renderer, measure by ablation within a single load.

       It runs AFTER the normal because it has to exclude the floor. The
       threshold under a doorway is boards like the rest of the floor, and
       floorish -- the rule that paints them -- requires material 0, so
       tagging the whole throat turned the sill to stone. Reported the moment
       it shipped: "the only thing that doesn't read right is that the floors
       are no longer wood in the gap." The same n.y > 0.62 test floorish uses,
       so the two can never disagree about what counts as floor. */
    vec3 n = normalCtx(hp, c, d2, ct2, fl);
    if (mat < 0.5 && n.y <= 0.62){
      vec2 rl = hp.xz - worldOf(c);
      for (int i = 0; i < 6; i++){
        if (((d2 >> (i * 2)) & 3) == 0) continue;
        vec2 rdir = dirW(i);
        vec2 rrel = rl - rdir * HALF_D;
        if (abs(dot(rrel, rdir)) < HALF_D - APO_ROOM - 0.01 &&
            abs(dot(rrel, vec2(-rdir.y, rdir.x))) <= 1.9){ mat = 4.0; break; }
      }
    }
    /* No bias term here, and that was measured rather than assumed. The old
       loose tolerance left the hit point up to 5.5 mm SHORT of the surface,
       so every ambient probe started outside it, mapAt over-reported, and
       occ clamped to 1 -- AO was effectively OFF wherever the march stopped
       early. Tightening the tolerance switched it on, which is why walls
       that used to be uniformly bright now carry real occlusion. A 4 mm
       explicit bias was tried on the theory that a flat wall was reading
       its own surface: it moved occ by 0.006 and was reverted. Flat stone
       already reads occ 0.946 unbiased -- the low readings are real
       occlusion in enclosed places, not self-occlusion. */
    float occ = aoCtx(hp, n, c, d2, ct2, fl);

    float lit;
    vec3 lightSum = lighting(hp, n, lit);
    /* A shaft has no lamps, only spill -- but it is the one place with
       sightlines up and down many storeys, so it gathers a little from
       every opening. Without this the well is unreadably black.        */
    if (ct2 == 1) lightSum += vec3(0.155, 0.130, 0.092) * (0.40 + 0.60 * max(n.y, 0.0));
    /* A stairwell needs the same courtesy, biased the other way. The shaft's
       term favours UP-facing surfaces because a well is lit from the openings
       around it; a stairwell's problem is the opposite, and specific: every
       one of its lamps sits above the flight, so the soffit -- the underside
       of the ascending flight, which is most of what you see through the
       doorway from a gallery -- is the one surface none of them can reach.
       It was 0.055 flat and undirected, a quarter of the shaft's, which is
       how a doorway into stairs came to render as a hole. ?ablate=dimstair
       puts the old value back. */
    if (ct2 == 2) lightSum += vec3(0.155, 0.130, 0.092) * (0.40 + 0.60 * max(-n.y, 0.0));
    lit = clamp(length(lightSum) * 0.62, 0.0, 1.0) * occ;

    /* FLOORBOARDS BELONG ON THE FLOOR. This used to be "up-facing stone",
       with no height test at all, so every up-facing stone surface in the
       Library got the board pattern -- including ledges inside a doorway.
       Reported twice as "gap walls with wood texture", and measured: up-facing
       stone at 0.83 m and 1.20 m above the floor, three metres away, framed by
       the reveal on both sides. The pattern is keyed on hp.x/hp.z, so it tiles
       horizontally at any height and reads as a wooden shelf let into the
       stone. The floor of a storey is fy = 0 exactly; fract() handles negative
       floors, so this works below ground as well as above.
       ?ablate=boardsanywhere puts the old rule back. */
    bool floorish = (mat < 0.5 && n.y > 0.62 && fract(hp.y / H_FLOOR) < 0.02);
    vec3 base;
    if (mat > 1.5 && mat < 2.5) base = C_CRIM;
    else if (mat > 0.5 && mat < 1.5){
      /* One flat colour per volume, keyed to the volume. Wear is what a
         spine really gets: darkening at head and tail, and on some books
         a paler label band -- no random blotching.                      */
      vec3 sp = mix(C_PAPER2, C_PAPER, 0.15 + 0.85 * tint0);
      float drift = tint0 - 0.5;
      sp *= vec3(1.0 + 0.10 * drift, 1.0 + 0.02 * drift, 1.0 - 0.11 * drift);
      sp *= mix(1.0, 0.78 + 0.22 * smoothstep(0.0, 0.16, min(spy, 1.0 - spy)), detail);
      float lab = float((key0 >> 8) & 0xFFu) / 255.0;
      if (lab > 0.60 && spy > 0.20 && spy < 0.42) sp = mix(sp, C_PAPER * 1.06, 0.5 * detail);
      base = sp;
    }
    else if (floorish){
      /* Boards, not tiles: seams run one way only, with butt joints
         staggered board to board and a little tone between them.      */
      const float PW = 0.19;                          // board width
      float row  = floor(hp.z / PW);
      float acr  = fract(hp.z / PW);
      uint  rk   = uhash(uint(int(row) + 8192));
      float seam = smoothstep(0.0, 0.055, min(acr, 1.0 - acr));
      float blen = 1.9 + 1.4 * float(rk & 0xFFu) / 255.0;             // board length
      float shift = float((rk >> 8) & 0xFFu) / 255.0;                 // stagger
      float alng = fract((hp.x + shift * blen) / blen);
      float butt = smoothstep(0.0, 0.010, min(alng, 1.0 - alng));
      float tone = 0.84 + 0.16 * float((rk >> 16) & 0xFFu) / 255.0;
      base = C_WOOD * tone * (0.80 + 0.20 * min(seam, butt));
    }
    else if (mat > 8.5) base = vec3(0.014);                     // down the latrine
    /* A mirror only reaches this line when it is the far end of a bounce --
       one mirror seen in another. The regress terminates in a dark pane
       rather than continuing, which is what a facing pair really looks like
       a few reflections in, and is as much as LIB-P-024 lets it settle. */
    else if (mat > 7.5) base = mix(C_INK, C_STONE, 0.22);
    else if (mat > 6.5) base = vec3(0.86, 0.80, 0.62);          // a lit shade
    else if (mat > 5.5) base = C_HIDE;
    else if (mat > 4.5) base = C_WOOD * 0.62;
    /* The reveal: dressed stone, and deliberately FLAT. Its albedo does not
       ride on occ the way open wall does, because the reveal is occluded by
       construction -- it is the inside of a hole -- and letting occ darken it
       is half of what made it read as a different material from the wall it
       is cut into. A door surround being smoother and paler than the rough
       wall around it is also what a mason would do. */
    else if (mat > 3.5) base = mix(C_INK, C_STONE, 0.78);
    else if (mat > 2.5) base = mix(C_INK, C_STONE, 0.85);
    else                base = mix(C_INK, C_STONE, 0.55 + 0.45 * occ);

    /* The cold end pulled toward neutral, and this is what actually closed the
       patch of wall standing in a gap. The two surfaces were never far apart
       in BRIGHTNESS -- measured luma 18.9 against 21.1, a contrast of 1.12 --
       they differed in HUE: this ramp tints stone green when lit is low and
       warm when it is high, the reveal sits at lit 0.17 and the wall beside it
       at 0.90, so a green panel sat inside a warm-grey wall. Dominant colours
       16,21,12 against 24,23,15.

       0.82 -> 0.94 on red halves the R/G gap between them, 0.250 -> 0.143,
       and moves a bright wall by 1.5%. It is a palette change and should be
       read as one: dim stone is less green than V-01 Verdigris Damp specified.
       ?ablate=tintgreen restores the original cold end. */
    vec3 tint = mix(vec3(0.94, 1.00, 0.80), vec3(1.06, 0.94, 0.78), lit);
    sub = base * tint;

    vec3 shaded = sub * (0.045 + lightSum * 0.55);
    lum = clamp(dot(shaded, vec3(0.299, 0.587, 0.114)) * 1.60, 0.0, 1.0);
    /* The targeted volume, picked out. Deliberately small: enough to find
       the spine you are pointing at along a run of thirty-five, not enough
       to light the room. The dither quantises luminance to a short ramp, so
       a lift this size lands on the next step and reads cleanly. */
    if (tgt > 0.5){
      sub = mix(sub, vec3(0.86, 0.88, 0.74), 0.30);
      lum = min(1.0, lum + 0.26);
    }

    float horiz = 1.0 - abs(n.y);
    /* ---- ONE RULE ---------------------------------------------------
     * Stone gets a lift. That is the whole of it.
     *
     * There used to be two, keyed on which way the surface faced: one for
     * near-vertical stone (horiz > 0.80, so |n.y| < 0.20) and one for
     * near-horizontal (|n.y| > 0.70). Between them sat every surface
     * inclined more than 12 degrees off vertical and less than 45 -- and
     * those got NEITHER. Four separate reports of black regions were
     * surfaces in that gap or just outside one of the gates:
     *
     *   a stairwell soffit          n.y -0.86 to -0.99   caught by neither
     *                                                    until the second
     *                                                    lift was added
     *   a ledge inside a doorway    n.y  0.88 to 0.96    painted as floor
     *                                                    boards instead
     *   the treads of a flight      n.y  0.83 to 0.95    up-facing, so the
     *                                                    -n.y bounce read 0
     *   the wall inside a gap       n.y  0.00            below the lit knee
     *
     * Each fix closed one hole and left the shape that made it. The shape
     * is that ORIENTATION WAS ALWAYS A PROXY. What the lifts were really
     * compensating for is that the lamp model under-serves a surface --
     * two lamps a cell, no bounce, no shadow -- and which way a thing faces
     * only correlates with that. Compensate for the thing itself and there
     * is nothing left to fall between.
     *
     * It is additive rather than proportional because that is what the old
     * vertical lift was, and that lift is, by its own note, "most of what
     * makes a wall visible at all". A proportional lift dims every wall in
     * the Library to fix a staircase.
     *
     * ?ablate=threegates puts the orientation gates back. */
    if (mat < 0.5 || mat > 2.5)
      lum = min(1.0, lum + 0.30);

    /* And the reveal gets a FLOOR rather than a lift. Everything above is a
       lighting model, and the reveal is the one surface where the lighting
       model has nothing useful to say: it is the inside of a hole, so every
       lamp is oblique to it and the six-level quantiser has no step between
       "lit" and "black". Pin it to a step instead. That is what makes it read
       as a flat plane of dressed stone at any range -- which is the whole
       point of naming it a material, and is what the reporter asked for when
       they suggested covering the patch with something that reads flat. */
    if (mat > 3.5 && mat < 4.5) lum = max(lum, 0.34);

    matOut = mat; nOut = n; pOut = hp;
  }
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uView * vec3(uv, 0.78));
  vec3 ro = uCam;

  vec3 sub = C_INK;
  float lum = 0.02;

  /* The mirror's bounce is a LOOP, and uBounce is a uniform rather than the
     constant 2, which is the whole reason this shader links.

     Written the obvious way -- march, shade, and if it was a mirror march
     and shade again -- there are two textual call sites, the compiler
     inlines both, and main() ends up holding two copies of a body that
     already contains mapAt eight times over (the march, four for the
     normal, three for the ambient term) plus lighting(). ANGLE compiled it
     in 17 ms and then spent 141 seconds in the D3D backend before returning
     false with an empty info log. A loop the compiler cannot unroll -- and
     it cannot unroll one whose bound it does not know -- has one call site.
     Nothing else about the render changed.

     One bounce, so a mirror facing a mirror shows the corridor doubled and
     then stops at the far mirror's own dark pane: LIB-P-024 asks that the
     thing not settle the question, and this is the arithmetic that keeps
     that promise rather than a decision about taste. */
  vec3 ro2 = ro, rd2 = rd;
  float atten = 1.0;
  for (int b = 0; b < uBounce; b++){
    float hit = marchRay(ro2, rd2, (b == 0) ? 72 : 48);
    if (hit < 0.0){ sub = C_INK; lum = (b == 0) ? 0.02 : 0.015; break; }
    float mat; vec3 n, hp;
    shadeHit(ro2, rd2, hit, sub, lum, mat, n, hp);
    if (mat < 7.5) break;
    /* Polished, not perfect: a little is lost at the surface. Faithful is
       the requirement, so the loss is in level and not in hue. */
    atten *= 0.90;
    ro2 = hp + n * 0.02;
    rd2 = reflect(rd2, n);
  }
  lum *= atten;

  lum *= 1.0 - 0.42 * length(uv * vec2(0.72, 1.0));

  float L   = (uGrain == 2) ? 10.0 : 6.0;
  float amp = (uGrain == 2) ? 0.85 : 1.15;
  float dth = (uGrain == 1 || uGrain == 2) ? ign(gl_FragCoord.xy) - 0.5
                                           : bayer8(ivec2(gl_FragCoord.xy)) - 0.5;
  float q = (uGrain == 3) ? lum
          : clamp(floor(lum * (L - 1.0) + 0.5 + dth * amp) / (L - 1.0), 0.0, 1.0);
  vec3 final = clamp(sub * (0.050 + 1.35 * q), 0.0, 1.0);

  if (uMotion > 0.5){
    float tq = floor(uTime * 10.0) / 10.0;
    for (int i = 0; i < 10; i++){
      float h1 = float(uhash(uint(i * 977))  & 0xFFFFu) / 65536.0;
      float h2 = float(uhash(uint(i * 3121)) & 0xFFFFu) / 65536.0;
      vec2 sp2 = vec2(mod(h1 * uRes.x + tq * (7.0 + 9.0 * h1), uRes.x),
                      mod(h2 * uRes.y - tq * (3.0 + 5.0 * h2), uRes.y));
      if (distance(gl_FragCoord.xy, sp2) < 1.2) final += vec3(0.14, 0.13, 0.10);
    }
  }
  outColor = vec4(final, 1.0);
}