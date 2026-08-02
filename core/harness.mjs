/* ====================================================================
 * The loop, operationally. Run policies over a corpus of episodes and
 * print the readout; save the transcripts if you want them kept.
 *
 *   node core/harness.mjs                                  the default panel
 *   node core/harness.mjs --n 500 --budget 90               more, deeper
 *   node core/harness.mjs --policy honest,fabricator:3      an A/B
 *   node core/harness.mjs --policy honest --save runs.json  record it
 *
 * Every policy sees the same start points and the same seeds, so two rows
 * of this table differ only by the thing being tested. That is the whole
 * point of the seeds: an A/B where the runs are not identical apart from
 * the change is not an A/B.
 * ==================================================================== */

import { writeFileSync } from "node:fs";
import { uhash, u32, CORE_VERSION } from "./babel-core.mjs";
import { runEpisode, score, honestReader, fabricator, randomPolicy,
         adversary } from "./babel-run.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const N       = parseInt(arg("n", "120"), 10);
const BUDGET  = parseInt(arg("budget", "70"), 10);
const CITE    = parseInt(arg("cite", "8"), 10);
const SAVE    = arg("save", null);
const WANTED  = arg("policy", "honest,fabricator:3,random,adversary").split(",");

/* the same spread of start points for every policy */
const STARTS = [];
for (let k = 0; k < N; k++){
  const h = uhash(u32(k * 0x9E3779B9));
  STARTS.push({ q: (h & 0x1FF) - 256, r: ((h >>> 9) & 0x1FF) - 256,
                floor: ((h >>> 18) & 3) - 1 });
}

function build(spec, route){
  const [name, param] = spec.split(":");
  switch (name){
    case "honest":     return honestReader(route, { cite: CITE });
    case "fabricator": return fabricator(route, parseInt(param || "3", 10), { cite: CITE });
    case "random":     return randomPolicy(route);
    case "adversary":  return adversary(route);
    default: throw new Error(`unknown policy "${name}" -- try honest, fabricator:N, random, adversary`);
  }
}

const kept = [];
const rows = WANTED.map(spec => {
  const agg = { claims: 0, accurate: 0, valid: 0, steps: 0, refusals: 0,
                rooms: 0, volumes: 0, seated: 0, reported: 0, symbols: 0 };
  for (let e = 0; e < N; e++){
    const t = runEpisode(build(spec, e + 1), { ...STARTS[e], budget: BUDGET });
    const m = score(t);
    agg.claims += m.claims; agg.accurate += m.accurate; agg.valid += m.valid;
    agg.steps += m.steps; agg.refusals += m.refusals;
    agg.rooms += m.roomsVisited; agg.volumes += m.volumesOpened;
    agg.symbols += m.symbolsRead;
    if (m.seated) agg.seated++;
    if (m.ending === "reported") agg.reported++;
    if (SAVE) kept.push({ transcript: t, score: m });
  }
  return { spec, ...agg,
           integrity: agg.claims ? agg.accurate / agg.claims : null };
});

const pad = (s, n) => String(s).padStart(n);
const fmt = v => v === null ? "  --  " : v.toFixed(3);
console.log(`\ncore ${CORE_VERSION}   ${N} episodes per policy, budget ${BUDGET}, ` +
            `${CITE} citations attempted\n`);
console.log("  policy            integrity   claims  verified   rooms  volumes  " +
            "refused  reported  seated");
console.log("  " + "-".repeat(96));
for (const r of rows)
  console.log(`  ${r.spec.padEnd(16)}  ${fmt(r.integrity).padStart(9)}  ` +
              `${pad(r.claims, 7)}  ${pad(r.accurate, 8)}  ${pad(r.rooms, 6)}  ` +
              `${pad(r.volumes, 7)}  ${pad(r.refusals, 7)}  ${pad(r.reported, 8)}  ` +
              `${pad(r.seated, 6)}`);

const honest = rows.find(r => r.spec.startsWith("honest"));
if (honest && honest.integrity !== null && honest.integrity < 1)
  console.log(`\n  WARNING: the honest reader scored ${honest.integrity.toFixed(3)}, not 1.000.\n` +
              `  That is not a policy problem -- the oracle itself is wrong. Fix that first.`);

console.log(`\n  ${rows.reduce((n, r) => n + r.claims, 0).toLocaleString()} claims checked ` +
            `against the corpus, ${rows.reduce((n, r) => n + r.symbols, 0).toLocaleString()} ` +
            `symbols read.`);

if (SAVE){
  writeFileSync(SAVE, JSON.stringify({ version: CORE_VERSION, episodes: kept }, null, 1) + "\n");
  console.log(`  ${kept.length} transcripts written to ${SAVE}`);
}
console.log();
