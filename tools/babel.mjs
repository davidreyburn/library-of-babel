#!/usr/bin/env node
/* ====================================================================
 * The Library from a command line. Everything the renderer knows, without
 * the renderer -- which is the point: an agent should be able to walk the
 * same rooms and read the same volumes with no 3D at all.
 *
 *   node tools/babel.mjs here      [cell]         where am I, what is here
 *   node tools/babel.mjs shelves   <cell>         the shelved walls
 *   node tools/babel.mjs read      <address> [p]  a page
 *   node tools/babel.mjs spine     <address>      the label on the spine
 *   node tools/babel.mjs find      <phrase>       an address that contains it
 *   node tools/babel.mjs verify    <address> <page> <line> <col> <quote>
 *   node tools/babel.mjs wander    [--from q,r,fl] [--route n] [--steps n]
 *   node tools/babel.mjs seat      [--from q,r,fl] [--route n]
 *
 * Addresses are babel:// URIs. A cell is "q,r" or "q,r,floor".
 * Add --json to any command for machine-readable output.
 * ==================================================================== */

import * as core from "../core/babel-core.mjs";
import * as text from "../core/babel-text.mjs";
import * as run from "../core/babel-run.mjs";

const argv = process.argv.slice(2);
const cmd = argv.shift();
const JSONOUT = argv.includes("--json");
const flag = (name, dflt) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));

const out = v => { console.log(JSONOUT ? JSON.stringify(v, null, 1) : v); };
const die = m => { console.error("babel: " + m); process.exit(1); };
const cell = s => {
  const p = String(s || "0,0").split(",").map(Number);
  if (p.some(Number.isNaN) || p.length < 2) die(`"${s}" is not a cell -- use q,r or q,r,floor`);
  return { q: p[0], r: p[1], floor: p[2] || 0 };
};

/* wrapped in a function so the early returns below are legal at all */
function main(){
switch (cmd){

case "here": {
  const c = cell(positional[0] || "0,0");
  const d = core.describeCell(c.q, c.r, c.floor);
  if (JSONOUT) return out({ ...d, address: text.cellAddress(c.q, c.r, c.floor) });
  out(`${text.cellAddress(c.q, c.r, c.floor)}
  a ${d.type}${d.volumes ? `, ${d.volumes} volumes on ${d.shelvedWalls.length} shelved walls` : ", no shelves"}
${d.furniture ? "  furniture: " + core.studyPieces(c.q, c.r, c.floor).map(p => p.piece + (p.sittable ? " (you can sit)" : "")).join(", ") + "\n" : ""}${d.alcoves.length ? "  alcoves: " + d.alcoves.map(a => `${a.holds} on the ${a.side}`).join(", ") + "\n" : ""}  exits:
${d.exits.map(e => `    wall ${e.dir}  ${e.via.padEnd(8)} to ${e.to.q},${e.to.r}` +
   `  a ${e.type}${e.climbs ? ` (a flight ${e.climbs > 0 ? "up" : "down"})` : ""}` +
   `${e.crossable ? "" : "  -- cannot be crossed"}`).join("\n") || "    none"}`);
  break;
}

case "shelves": {
  const c = cell(positional[0]);
  const walls = core.shelvedWalls(c.q, c.r, c.floor);
  if (JSONOUT) return out({ cell: c, shelvedWalls: walls, volumes: core.galleryCapacity(c.q, c.r, c.floor) });
  if (!walls.length) return out(`${c.q},${c.r} floor ${c.floor} holds no shelves ` +
    `(it is a ${core.CELL_TYPE_NAME[core.cellType(c.q, c.r)]})`);
  out(`${c.q},${c.r} floor ${c.floor}: walls ${walls.join(", ")} are shelved, ` +
      `${core.galleryCapacity(c.q, c.r, c.floor)} volumes\n` +
      `  every address here: babel://walk/${(0x1594).toString(16).padStart(8, "0")}` +
      `/floor/${c.floor}/cell/${c.q},${c.r}/wall/<${walls.join("|")}>/shelf/<0-4>/slot/<0-34>`);
  break;
}

case "read": {
  const uri = positional[0] || die("which address?");
  const page = Number(positional[1] ?? 0);
  let a;
  try { a = text.parseAddress(uri); } catch (e) { die(e.message); }
  if (a.scope === "room") die(`${uri} names a room, not a volume -- add /wall/<w>/shelf/<s>/slot/<n>`);
  const v = text.validate(a);
  if (!v.ok) die(v.reason);
  const p = text.pageOf(a, a.page ?? page);
  if (JSONOUT) return out({ address: text.formatAddress(a, a.page ?? page),
                            spine: text.spineLabel(a), ...p });
  out(`${text.spineLabel(a)}\n${text.formatAddress(a, a.page ?? page)}` +
      `   page ${(a.page ?? page) + 1} of ${text.PAGES}\n\n` +
      p.lines.map((l, i) => String(i + 1).padStart(3) + " | " + l).join("\n"));
  break;
}

case "spine": {
  const a = text.parseAddress(positional[0] || die("which address?"));
  out(JSONOUT ? { address: text.formatAddress(a), spine: text.spineLabel(a) } : text.spineLabel(a));
  break;
}

case "find": {
  /* Join the words rather than taking the first: an unquoted
     `find the library is unlimited` used to answer about "the", quietly and
     wrongly, which is the worst way for a tool to be wrong. */
  const phrase = positional.join(" ") || die("find what?");
  let f;
  try { f = text.findPhrase(phrase, { offset: Number(flag("at", 0)) }); } catch (e) { die(e.message); }
  if (JSONOUT) return out(f);
  out(`"${phrase}"\n  ${f.address}\n  page ${f.page + 1}, line ${f.line + 1}, column ${f.column + 1}` +
      `\n  spine ${f.spine}\n  this phrase occupies 10^${f.rarity.fractionLog10.toFixed(1)} of the corpus`);
  break;
}

case "verify": {
  const [uri, page, line, column, ...rest] = positional;
  if (!uri || rest.length === 0)
    die("verify <address> <page> <line> <col> <quote>   -- pages, lines and columns are 1-based here");
  const claim = { uri, page: Number(page) - 1, line: Number(line) - 1,
                  column: Number(column) - 1, quote: rest.join(" ") };
  const r = run.verifyClaim(claim);
  if (JSONOUT) return out({ claim, ...r });
  out(r.accurate ? `verified: those symbols are at that address`
                 : `NOT VERIFIED: ${r.why}`);
  if (!r.accurate) process.exitCode = 2;
  break;
}

case "wander": {
  const c = cell(flag("from", "0,0,0"));
  const j = text.journey({ ...c, route: Number(flag("route", 1)),
                           steps: Number(flag("steps", 24)), take: Number(flag("take", 2)) });
  if (JSONOUT) return out(j);
  out(`route ${j.route}, from ${j.from}\n`);
  for (const s of j.stops){
    const took = s.took ? `-> ${s.took.via}${s.took.climb ? (s.took.climb > 0 ? " up" : " down") : ""}` : "(stopped)";
    out(`${String(s.step).padStart(3)}  ${s.type.padEnd(9)} ${(s.cell.q + "," + s.cell.r).padEnd(9)} ` +
        `fl ${String(s.cell.floor).padStart(3)}  ${String(s.volumes).padStart(4)} vols` +
        `${s.seats.length ? "  [" + s.seats.join(",") + "]"
          : s.holds.length ? "  [" + s.holds.join(",") + "]" : "        "}  ${took}`);
    for (const b of s.shelves) out(`       ${b.uri}\n         spine ${b.spine}`);
  }
  break;
}

case "seat": {
  const c = cell(flag("from", "0,0,0"));
  const s = text.walkToASeat({ ...c, route: Number(flag("route", 1)) });
  if (JSONOUT) return out(s);
  if (!s.found) return out(`no seat within ${s.trail.length} steps on route ${s.route}`);
  out(`a seat after ${s.steps} steps\n  ${s.room.at}\n  the room holds ` +
      s.room.pieces.map(p => p.piece + (p.sittable ? " (you can sit)" : "")).join(", "));
  break;
}

case "mirror": {
  const c = cell(flag("from", "0,0,0"));
  const m = text.walkToAMirror({ ...c, route: Number(flag("route", 1)) });
  if (JSONOUT) return out(m);
  if (!m.found) return out(`no mirror within ${m.trail.length} steps on route ${m.route}`);
  out(`a mirror after ${m.steps} steps\n  ${m.room.at}\n  ` +
      (m.room.alcoves.length
        ? "the corridor holds " + m.room.alcoves.map(a => `${a.holds} on the ${a.side}`).join(", ")
        : `a ${m.room.type}, holding ${m.room.holds.join(", ")} and nothing else`));
  break;
}

default:
  out(`the Library of Babel, from a command line

  here     [q,r[,floor]]              what is in this cell, and the way out
  shelves  <q,r[,floor]>              which walls are shelved, and how many volumes
  read     <babel://...> [page]       a page, 40 lines of 80 symbols
  spine    <babel://...>              the label on the spine
  find     <phrase> [--at offset]     the address of a volume containing it
  verify   <babel://...> <page> <line> <col> <quote>
  wander   [--from q,r,fl] [--route n] [--steps n] [--take n]
  seat     [--from q,r,fl] [--route n]
  mirror   [--from q,r,fl] [--route n]     walk until a corridor holds one

  --json on any command for machine-readable output.

  Coordinates are the point: everything above returns or accepts a babel://
  address, and the same address opens in the simulator --
  app/babel-phase1.html?read=<address>  or  ?at=<address>`);
}
}
main();
