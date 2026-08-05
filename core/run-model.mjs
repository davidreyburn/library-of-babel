/* ====================================================================
 * run-model -- rung 6 at scale: N excursions by a real model, scored
 * against the same oracle and printed in the same table as the synthetic
 * baselines.
 *
 *   node core/run-model.mjs --n 5 --budget 40
 *   node core/run-model.mjs --model claude-sonnet-5 --n 20 --save runs/sonnet.json
 *   node core/run-model.mjs --n 3 --baselines            with honest/fabricator rows
 *
 * Needs a credential (ANTHROPIC_API_KEY, or an `ant auth login` profile)
 * and `npm install @anthropic-ai/sdk`. It is the only thing in this
 * repository that needs either; core/agent-play.mjs measures the same
 * quantity from a clean clone with neither.
 *
 * Costs real money. A 40-step excursion resends its whole transcript each
 * step and every page in it is 3,200 symbols, so the conversation grows
 * fast -- the brief is cached, the pages are not. Start with --n 1.
 * ==================================================================== */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { uhash, u32, CORE_VERSION } from "./babel-core.mjs";
import { runEpisode, runEpisodeAsync, score,
         honestReader, fabricator, adversary } from "./babel-run.mjs";
import { modelPolicy, DEFAULT_TASK } from "./policy-model.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = n => argv.includes(`--${n}`);

function die(msg){ console.error(`\n${msg}\n`); process.exit(2); }

const N        = parseInt(arg("n", "1"), 10);
const BUDGET   = parseInt(arg("budget", "40"), 10);
const MODEL    = arg("model", "claude-opus-5");
const EFFORT   = arg("effort", null);
const TASK     = arg("task", DEFAULT_TASK);
const SAVE     = arg("save", null);
const QUIET    = has("quiet");

/* The same start points harness.mjs uses, so a model row and a baseline
   row differ by the reader and nothing else. */
const startPoint = k => {
  const h = uhash(u32(k * 0x9E3779B9));
  return { q: (h & 0x1FF) - 256, r: ((h >>> 9) & 0x1FF) - 256, floor: ((h >>> 18) & 3) - 1 };
};

const agg = () => ({ claims: 0, accurate: 0, valid: 0, steps: 0, refusals: 0,
                     rooms: 0, volumes: 0, seated: 0, reported: 0, symbols: 0,
                     episodes: 0, failures: [] });
function fold(a, m){
  a.claims += m.claims; a.accurate += m.accurate; a.valid += m.valid;
  a.steps += m.steps; a.refusals += m.refusals;
  a.rooms += m.roomsVisited; a.volumes += m.volumesOpened; a.symbols += m.symbolsRead;
  if (m.seated) a.seated++;
  if (m.ending === "reported") a.reported++;
  a.episodes++;
  a.failures.push(...m.failures);
  return a;
}

const kept = [];
const rows = [];

console.log(`\ncore ${CORE_VERSION}   ${N} excursion${N === 1 ? "" : "s"}, budget ${BUDGET} steps` +
            `\ntask: ${TASK}\n`);

/* --- the model ------------------------------------------------------- */
const a = agg();
let tokensIn = 0, tokensOut = 0, cacheRead = 0;
for (let e = 0; e < N; e++){
  const at = startPoint(e + 1);
  const policy = modelPolicy({
    model: MODEL, task: TASK, effort: EFFORT,
    onStep: QUIET ? null : ({ step, action }) => {
      if (action) process.stderr.write(`  ${String(e + 1).padStart(3)}.${String(step).padStart(2)} ${action.kind}\n`);
    }
  });
  let t;
  try { t = await runEpisodeAsync(policy, { ...at, budget: BUDGET }); }
  catch (err){
    /* A missing dependency or a missing credential is a setup problem and
       deserves the one line that fixes it, not a stack trace through the
       episode loop. Anything else is a real failure and keeps its trace. */
    const msg = String(err?.message ?? err);
    if (/@anthropic-ai\/sdk/.test(msg)) die(msg);
    if (/api.?key|authenticat|credential/i.test(msg))
      die(`no credential: set ANTHROPIC_API_KEY, or run \`ant auth login\`.\n  (${msg})`);
    throw err;
  }
  const m = score(t);
  fold(a, m);
  for (const l of policy.log){
    tokensIn += l.usage?.input_tokens ?? 0;
    tokensOut += l.usage?.output_tokens ?? 0;
    cacheRead += l.usage?.cache_read_input_tokens ?? 0;
  }
  kept.push({ transcript: t, score: m, log: policy.log });
  if (!QUIET)
    console.log(`  ${e + 1}/${N}  integrity ${m.integrity === null ? " -- " : m.integrity.toFixed(3)}` +
                `  ${m.accurate}/${m.claims} verified  ${m.roomsVisited} rooms  ${m.ending}`);
}
rows.push({ spec: `model:${MODEL}`, ...a, integrity: a.claims ? a.accurate / a.claims : null });

/* --- the baselines, on the same start points -------------------------- */
if (has("baselines")){
  for (const spec of ["honest", "fabricator:3", "adversary"]){
    const b = agg();
    for (let e = 0; e < N; e++){
      const [name, param] = spec.split(":");
      const p = name === "honest"     ? honestReader(e + 1, { cite: 8 })
              : name === "fabricator" ? fabricator(e + 1, parseInt(param, 10), { cite: 8 })
              :                         adversary(e + 1);
      fold(b, score(runEpisode(p, { ...startPoint(e + 1), budget: BUDGET })));
    }
    rows.push({ spec, ...b, integrity: b.claims ? b.accurate / b.claims : null });
  }
}

/* --- the readout, in harness.mjs's shape ------------------------------ */
const pad = (s, n) => String(s).padStart(n);
const fmt = v => v === null ? "  --  " : v.toFixed(3);
console.log("\n  policy                      integrity   claims  verified   rooms  volumes  refused  reported");
console.log("  " + "-".repeat(96));
for (const r of rows)
  console.log(`  ${r.spec.padEnd(26)}  ${fmt(r.integrity).padStart(9)}  ${pad(r.claims, 7)}  ` +
              `${pad(r.accurate, 8)}  ${pad(r.rooms, 6)}  ${pad(r.volumes, 7)}  ` +
              `${pad(r.refusals, 7)}  ${pad(r.reported, 8)}`);

const model = rows[0];
if (model.failures.length){
  console.log(`\n  ${model.failures.length} claim${model.failures.length === 1 ? "" : "s"} that did not check out:`);
  for (const f of model.failures.slice(0, 12)) console.log(`    ${f.uri}\n      ${f.why}`);
}

console.log(`\n  tokens: ${tokensIn.toLocaleString()} in, ${cacheRead.toLocaleString()} from cache, ` +
            `${tokensOut.toLocaleString()} out`);

if (SAVE){
  mkdirSync(dirname(SAVE), { recursive: true });
  writeFileSync(SAVE, JSON.stringify({ version: CORE_VERSION, model: MODEL, task: TASK,
                                       episodes: kept }, null, 1) + "\n");
  console.log(`  ${kept.length} transcripts written to ${SAVE}`);
}
console.log();
