/* ====================================================================
 * agent-play -- the seam, one step at a time, for a reader that is
 * already in the loop.
 *
 * policy-model.mjs asks a model over the network. This asks whoever runs
 * it: an agent with a shell, or a person. Same actions(), same apply(),
 * same observation, same oracle, same transcript -- the only difference
 * is where the decision comes from, which is the whole point of having a
 * seam.
 *
 * It exists because the measurement should not be gated on a credential.
 * An agent handed this repository can produce a scored, citeable
 * excursion from a clean clone with no install and no API key, which is
 * the same promise the rest of the environment makes.
 *
 *   node core/agent-play.mjs start --route 1941 --budget 40
 *   node core/agent-play.mjs do   '{"kind":"pull","wall":1,"shelf":2,"slot":17}'
 *   node core/agent-play.mjs do   '{"kind":"cite","uri":"...","page":0,"line":3,"column":12,"quote":"..."}'
 *   node core/agent-play.mjs score --save runs/model-1941.json
 *
 * State lives in one JSON file between calls, because a shell has no
 * memory between them. The file is the episode; deleting it abandons the
 * run.                                                                 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { uhash, u32, CORE_VERSION } from "./babel-core.mjs";
import { initialState, isTerminal, actions, apply, score,
         runEpisode, transcriptPolicy } from "./babel-run.mjs";
import { observe, DEFAULT_TASK } from "./policy-model.mjs";
import { cellAddress } from "./babel-text.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const STATE = arg("state", "core/.play-state.json");

const load = () => {
  if (!existsSync(STATE))
    die(`no episode in progress (${STATE}). Start one:\n  node core/agent-play.mjs start --route 1941`);
  return JSON.parse(readFileSync(STATE, "utf8"));
};
const save = f => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(f, null, 1) + "\n");
};
function die(msg){ console.error(msg); process.exit(2); }

/* The same spread of start points harness.mjs draws from, so a hand-played
   episode lands where a scored one would and the rows compare. */
function startPoint(route){
  const h = uhash(u32(route * 0x9E3779B9));
  return { q: (h & 0x1FF) - 256, r: ((h >>> 9) & 0x1FF) - 256,
           floor: ((h >>> 18) & 3) - 1 };
}

function show(s, note){
  if (note) console.log(note + "\n");
  if (isTerminal(s)){
    console.log(`the excursion is over (${s.ending ?? "budget"}). ` +
                `Score it:\n  node core/agent-play.mjs score`);
    return;
  }
  console.log(observe(s));
}

switch (cmd){

case "start": {
  const route = parseInt(arg("route", "1941"), 10);
  const budget = parseInt(arg("budget", "40"), 10);
  const task = arg("task", DEFAULT_TASK);
  const at = startPoint(route);
  const s = initialState({ ...at, budget });
  save({ version: CORE_VERSION, route, task, opts: { ...at, budget },
         state: s, decisions: [] });
  console.log(`route ${route}   core ${CORE_VERSION}   budget ${budget} steps`);
  console.log(`set down at ${cellAddress(at.q, at.r, at.floor, s.seed)}\n`);
  console.log(`TASK: ${task}\n`);
  console.log(observe(s));
  break;
}

case "do": {
  const f = load();
  let action;
  try { action = JSON.parse(argv[1]); }
  catch { die(`could not read that action as JSON: ${argv[1]}`); }
  if (isTerminal(f.state)) die("the excursion is over -- score it");

  const before = f.state;
  const next = apply(before, action);
  f.decisions.push({ step: before.steps, at: { ...before.at }, action,
                     refused: next.refused ?? null });
  f.state = next;
  save(f);

  /* A refusal is answered with its reason rather than swallowed: the
     reader is owed the same account the renderer gives a visitor who
     tries to open a wall (§17.11). */
  show(next, next.refused
    ? `REFUSED: ${next.refused}   (it cost a step anyway)`
    : `ok: ${action.kind}`);
  break;
}

case "moves": {
  const f = load();
  console.log(JSON.stringify(actions(f.state), null, 1));
  break;
}

case "score": {
  const f = load();
  const t = { version: f.version,
              run: { ...f.opts, seed: f.state.seed, budget: f.state.budget,
                     policy: arg("policy", "agent") },
              decisions: f.decisions,
              report: { visited: f.state.visited, opened: f.state.opened,
                        claims: f.state.claims, seated: f.state.seated,
                        ending: f.state.ending ?? "budget",
                        at: cellAddress(f.state.at.q, f.state.at.r,
                                        f.state.at.floor, f.state.seed) } };
  const m = score(t);

  /* The transcript is the evidence, so it is checked as evidence before
     the number is printed: replaying it must reproduce the same score, or
     what is saved is not what happened. */
  const replay = score(runEpisode(transcriptPolicy(t), t.run));
  const faithful = replay.integrity === m.integrity && replay.claims === m.claims;

  console.log(`\ncore ${t.version}   policy ${t.run.policy}   route from ${t.run.q},${t.run.r} floor ${t.run.floor}`);
  console.log("  " + "-".repeat(72));
  const row = (k, v) => console.log(`  ${String(k).padEnd(22)} ${v}`);
  row("integrity", m.integrity === null ? "  --  " : m.integrity.toFixed(3));
  row("claims / verified", `${m.claims} / ${m.accurate}`);
  row("valid coordinates", `${m.valid} of ${m.claims}`);
  row("cited without opening", m.citedWithoutOpening);
  row("steps / refusals", `${m.steps} / ${m.refusals}`);
  row("rooms / volumes", `${m.roomsVisited} / ${m.volumesOpened}`);
  row("symbols read", m.symbolsRead.toLocaleString());
  row("seated", m.seated);
  row("ending", m.ending);
  row("replays to same score", faithful ? "yes" : "NO -- the transcript is not the run");
  if (m.failures.length){
    console.log("\n  claims that did not check out:");
    for (const f2 of m.failures) console.log(`    ${f2.uri}\n      ${f2.why}`);
  }

  const out = arg("save", null);
  if (out){
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ version: t.version, task: f.task,
                                        episodes: [{ transcript: t, score: m }] }, null, 1) + "\n");
    console.log(`\n  transcript written to ${out}`);
  }
  console.log();
  break;
}

default:
  console.log(`the Library, one decision at a time

  node core/agent-play.mjs start --route <n> [--budget 40] [--task "..."]
  node core/agent-play.mjs moves                 the affordance list, as JSON
  node core/agent-play.mjs do '<action json>'    take one action
  node core/agent-play.mjs score [--save f.json] the readout

actions: {"kind":"walk","dir":0}  {"kind":"pull","wall":1,"shelf":2,"slot":17}
         {"kind":"turn","page":203}  {"kind":"shelve"}  {"kind":"sit"}
         {"kind":"cite","uri":"babel://...","page":0,"line":0,"column":0,"quote":"..."}
         {"kind":"report","found":"..."}
`);
}
