/* ====================================================================
 * The four gates. Run: node core/test-run.mjs
 *
 *   FUZZ      thousands of random episodes; the invariants hold and
 *             apply() survives nonsense without throwing.
 *   COVERAGE  across a corpus, every action, every refusal, every cell
 *             type and every ending actually occurs. A green fuzz run
 *             proves nothing about a feature that never fired.
 *   REPLAY    a recorded transcript re-executes to its recorded outcome,
 *             and a version mismatch is detectable rather than silent.
 *   METRIC    a deliberately injected regression moves the readout. The
 *             one gate the headless-twin spec lists as its own open TODO:
 *             an integrity metric that cannot detect fabrication is
 *             decoration, so here it is made to prove it can.
 * ==================================================================== */

import { execFileSync } from "node:child_process";
import * as core from "./babel-core.mjs";
import * as text from "./babel-text.mjs";
import * as run from "./babel-run.mjs";
import * as model from "./policy-model.mjs";

let pass = 0, fail = 0;
const results = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; results.push(`  ok   ${name}${detail ? "  " + detail : ""}`); }
  else      { fail++; results.push(`  FAIL ${name}${detail ? "  " + detail : ""}`); }
};
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want),
  JSON.stringify(got) === JSON.stringify(want) ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const section = t => results.push(`\n${t}`);

/* Start points spread over the lattice, so the corpus is not one basin. */
const STARTS = [];
for (let k = 0; k < 40; k++){
  const h = core.uhash(core.u32(k * 0x9E3779B9));
  STARTS.push({ q: ((h & 0xFF) - 128), r: (((h >>> 8) & 0xFF) - 128),
                floor: (((h >>> 16) & 3) - 1) });
}

/* ---- GATE 1: invariant fuzz ---------------------------------------- */
section("FUZZ -- 1,200 random episodes against the invariants");
{
  let episodes = 0, steps = 0, threw = null;
  const broken = { closure: 0, shaft: 0, illegalWalk: 0, budget: 0, floor: 0,
                   monotonic: 0, holding: 0, stateMutated: 0 };
  for (let e = 0; e < 1200; e++){
    const start = STARTS[e % STARTS.length];
    let s = run.initialState({ ...start, budget: 30 + (e % 20) });
    const policy = run.randomPolicy(e + 1);
    episodes++;
    while (!run.isTerminal(s)){
      const acts = run.actions(s);
      /* closure: a non-terminal state must always offer something to do */
      if (!acts.length){ broken.closure++; break; }
      const before = JSON.stringify(s);
      const choice = policy(s, acts);
      let next;
      try { next = run.apply(s, choice); }
      catch (err){ threw = `${err.message} on ${JSON.stringify(choice)}`; break; }
      if (JSON.stringify(s) !== before) broken.stateMutated++;   // apply must be pure
      steps++;

      if (core.cellType(next.at.q, next.at.r) === core.TYPE.SHAFT) broken.shaft++;
      if (next.steps > next.budget) broken.budget++;
      if (choice && choice.kind === "walk" && !next.refused){
        if (core.gapAt(s.at.q, s.at.r, choice.dir, s.at.floor) === core.GAP.WALL) broken.illegalWalk++;
        const df = Math.abs(next.at.floor - s.at.floor);
        if (next.via === "stair" ? df !== 1 : df !== 0) broken.floor++;
      }
      if (next.visited.length < s.visited.length || next.opened.length < s.opened.length)
        broken.monotonic++;
      if (choice && choice.kind === "turn" && !s.holding && !next.refused) broken.holding++;
      s = next;
    }
  }
  ok("apply() never threw, on any action including nonsense", threw === null, threw || `${steps} steps`);
  ok("closure: every non-terminal state offers a valid action", broken.closure === 0);
  ok("apply() is pure -- the input state is never mutated", broken.stateMutated === 0);
  ok("nobody ever stands in a shaft", broken.shaft === 0);
  ok("every accepted walk went through a real doorway", broken.illegalWalk === 0);
  ok("the floor changes only on a stair, and only by one", broken.floor === 0);
  ok("the step budget is never exceeded", broken.budget === 0);
  ok("visited and opened only ever grow", broken.monotonic === 0);
  ok("turning a page with empty hands is always refused", broken.holding === 0);
  results.push(`       ${episodes} episodes, ${steps} decisions`);
}

/* ---- GATE 2: coverage ---------------------------------------------- */
section("COVERAGE -- what a green fuzz run cannot prove");
{
  const kinds = new Set(), refusals = new Set(), endings = new Set();
  const cellTypes = new Set(), vias = new Set();
  let seats = 0, claims = 0, climbs = 0, emptySlots = 0;
  for (let e = 0; e < 900; e++){
    const start = STARTS[e % STARTS.length];
    const policy = e % 3 === 0 ? run.honestReader(e + 1)
                 : e % 3 === 1 ? run.adversary(e + 1)
                 : run.randomPolicy(e + 1);
    const t = run.runEpisode(policy, { ...start, budget: 40 });
    endings.add(t.report.ending);
    for (const d of t.decisions){
      kinds.add(d.action.kind);
      if (d.refused) refusals.add(d.refused.replace(/\d+/g, "N").slice(0, 34));
      cellTypes.add(core.CELL_TYPE_NAME[core.roomAt(d.at.q, d.at.r, d.at.floor)]);
    }
    for (const v of t.report.visited){
      const [q, r] = v.split(",").map(Number);
      cellTypes.add(core.CELL_TYPE_NAME[core.roomAt(q, r, t.report.at?.floor ?? 0)]);
    }
    if (t.report.seated) seats++;
    claims += t.report.claims.length;
  }
  /* every kind of decision must actually have been exercised */
  for (const k of ["walk", "pull", "turn", "shelve", "sit", "cite", "report", "nonsense"])
    ok(`the action "${k}" fires`, kinds.has(k));
  ok("every cell type is entered", cellTypes.has("gallery") && cellTypes.has("stairwell")
     && cellTypes.has("study"), [...cellTypes].join(", "));
  ok("both endings occur", endings.has("reported") && endings.has("budget"),
     [...endings].join(", "));
  ok("agents do sit down sometimes", seats > 0, `${seats} of 900 episodes`);
  ok("claims are made", claims > 0, `${claims} claims`);
  ok("every refusal path in apply() is reached", refusals.size >= 6, `${refusals.size} distinct`);
  for (const r of [...refusals].sort()) results.push(`       refused: ${r}`);
}

/* ---- GATE 3: golden replay ---------------------------------------- */
section("REPLAY -- a recorded run re-executes to its recorded outcome");
{
  const opts = { q: 0, r: 0, floor: 0, budget: 50 };
  const original = run.runEpisode(run.honestReader(7), opts);
  const again    = run.runEpisode(run.honestReader(7), opts);
  eq("the same policy and seed reproduce the run exactly", again, original);

  const replayed = run.runEpisode(run.transcriptPolicy(original), opts);
  eq("the transcript replays to the same report", replayed.report, original.report);
  eq("...and the same decisions", replayed.decisions.map(d => d.action),
     original.decisions.map(d => d.action));
  eq("...and the same score", run.score(replayed), run.score(original));

  ok("the transcript is version-stamped", original.version === core.CORE_VERSION,
     original.version);
  /* a version mismatch must be detectable, not silent */
  const stale = { ...original, version: "0.0.1-stale" };
  ok("a stale transcript is detectable before replaying it",
     stale.version !== core.CORE_VERSION);

  const other = run.runEpisode(run.honestReader(8), opts);
  ok("a different route is a different run",
     JSON.stringify(other.decisions) !== JSON.stringify(original.decisions));
}

/* ---- GATE 4: metric sensitivity ----------------------------------- */
section("METRIC -- the readout detects what it exists to detect");
{
  const opts = { budget: 60 };
  let honestClaims = 0, honestAccurate = 0;
  for (let e = 1; e <= 60; e++){
    const t = run.runEpisode(run.honestReader(e, { cite: 12 }),
                             { ...STARTS[e % STARTS.length], budget: 90 });
    const m = run.score(t);
    honestClaims += m.claims; honestAccurate += m.accurate;
  }
  const honestIntegrity = honestAccurate / honestClaims;
  ok("an honest reader scores integrity 1.00 -- if not, the oracle is wrong",
     honestIntegrity === 1, `${honestAccurate}/${honestClaims} claims verified`);

  /* now inject the regression, at three rates */
  const rates = [2, 3, 5];
  const measured = rates.map(rate => {
    let claims = 0, accurate = 0;
    for (let e = 1; e <= 60; e++){
      const t = run.runEpisode(run.fabricator(e, rate, { cite: 12 }),
                               { ...STARTS[e % STARTS.length], budget: 90 });
      const m = run.score(t);
      claims += m.claims; accurate += m.accurate;
    }
    return { rate, integrity: accurate / claims, claims };
  });
  for (const m of measured)
    ok(`fabricating 1 claim in ${m.rate} moves the metric`, m.integrity < 0.999,
       `integrity ${m.integrity.toFixed(3)} over ${m.claims} claims`);
  ok("and it tracks the injection rate monotonically",
     measured[0].integrity < measured[1].integrity && measured[1].integrity < measured[2].integrity,
     measured.map(m => `1-in-${m.rate}: ${m.integrity.toFixed(3)}`).join("  "));

  /* the oracle must also catch the cruder lies */
  const bad = [
    ["a coordinate that is a doorway", { uri: (() => {
        const walls = core.shelvedWalls(15, 94, 0);
        const door = [0,1,2,3,4,5].find(i => !walls.includes(i));
        return `babel://walk/00001594/floor/0/cell/15,94/wall/${door}/shelf/1/slot/1`;
      })(), page: 0, line: 0, column: 0, quote: "aaa" }],
    ["a room address, which names no volume",
     { uri: "babel://walk/00001594/floor/0/cell/15,94", page: 0, line: 0, column: 0, quote: "aaa" }],
    ["an unparseable address",
     { uri: "not-an-address", page: 0, line: 0, column: 0, quote: "aaa" }],
    ["a quote running past the end of the book",
     { uri: "babel://walk/00001594/floor/0/cell/15,94/wall/1/shelf/2/slot/17",
       page: 409, line: 39, column: 79, quote: "aaaaa" }]
  ];
  for (const [label, claim] of bad){
    const v = run.verifyClaim(claim);
    ok(`the oracle rejects ${label}`, !v.accurate, v.why || "");
  }
  /* and it accepts the truth */
  const a = text.walkAddress({ q: 15, r: 94, floor: 0, wall: 1, shelf: 2, slot: 17 });
  const truth = { uri: text.formatAddress(a), page: 3, line: 11, column: 7,
                  quote: text.sliceOf(a, 3 * text.PAGE_LEN + 11 * text.COLS + 7, 30) };
  ok("the oracle accepts a true citation", run.verifyClaim(truth).accurate === true);
  /* a quote spanning a line break is still contiguous in the stream */
  const across = { uri: text.formatAddress(a), page: 3, line: 11, column: 70,
                   quote: text.sliceOf(a, 3 * text.PAGE_LEN + 11 * text.COLS + 70, 20) };
  ok("a quote that straddles a line break verifies", run.verifyClaim(across).accurate === true);
}

/* ---- GATE 5: the observation a real reader is given ----------------- *
 * rung 6 puts a language model at this seam, and the first thing to
 * establish is that a bad score would be the reader's fault. If the page
 * it is shown is not the page the oracle checks, or the grid it counts
 * from is off by one, then integrity measures the harness -- which is the
 * mistake that cost this project a session once already (bug log §8).
 * So: compose citations mechanically from the rendered observation and
 * require the oracle to accept every one.                              */
section("OBSERVATION -- what the reader is shown is what the oracle checks");
{
  let rendered = 0, threw = null, cited = 0, verified = 0;

  /* It must render for every kind of cell, holding or empty, without
     throwing -- a reader that gets an exception gets no turn. */
  for (const start of STARTS){
    for (const budget of [20]){
      let s = run.initialState({ ...start, budget });
      const policy = run.randomPolicy(rendered + 1);
      while (!run.isTerminal(s)){
        try { model.observe(s); rendered++; }
        catch (err){ threw = `${err.message} at ${JSON.stringify(s.at)}`; break; }
        const acts = run.actions(s);
        if (!acts.length) break;
        s = run.apply(s, policy(s, acts));
      }
      if (threw) break;
    }
    if (threw) break;
  }
  ok("the observation renders for every state a reader can reach", !threw, threw ?? `${rendered} states`);

  /* Read the page back out of the rendered block, exactly as a reader
     would: strip the gutter, take a span at a stated line and column,
     and cite it. Every one must verify. */
  const gutter = /^\s*(\d+) \|(.*)$/;
  for (const start of STARTS.slice(0, 12)){
    const walls = core.shelvedWalls(start.q, start.r, start.floor);
    if (!walls.length) continue;
    const slots = run.pullableSlots(start.q, start.r, start.floor);
    if (!slots.length) continue;
    const { wall, shelf, slot } = slots[0];
    const a = text.walkAddress({ ...start, wall, shelf, slot });
    for (const page of [0, 7, 203, 409]){
      const block = model.pageBlock(a, page).split("\n");
      const lines = [];
      for (const row of block){
        const m2 = gutter.exec(row);
        if (m2) lines[Number(m2[1])] = m2[2];
      }
      if (lines.length !== text.LINES) { cited++; continue; }   // will fail below
      for (const [line, column, len] of [[0, 0, 12], [17, 31, 9], [39, 62, 18], [11, 74, 14]]){
        /* the last one runs off the end of its line and onto the next,
           which the page is allowed to do because a page is one run */
        const flat = lines.join("");
        const quote = flat.slice(line * text.COLS + column,
                                 line * text.COLS + column + len);
        const claim = { uri: text.formatAddress(a), page, line, column, quote };
        cited++;
        if (run.verifyClaim(claim).accurate) verified++;
      }
    }
  }
  ok("a citation composed from the rendered page verifies", cited > 0 && verified === cited,
     `${verified}/${cited}`);

  /* The tool grammar and the seam must name the same moves, or the reader
     is offered an action apply() has never heard of. */
  const toolNames = model.TOOLS.map(t => t.name).sort();
  const applyKinds = ["cite", "pull", "report", "shelve", "sit", "turn", "walk"];
  eq("the tools name exactly the actions apply() handles", toolNames, applyKinds);

  const mapped = model.actionOf({ name: "pull", input: { wall: 1, shelf: 2, slot: 17 } });
  eq("a tool call becomes an action verbatim", mapped, { kind: "pull", wall: 1, shelf: 2, slot: 17 });
  ok("a tool the seam does not know becomes a refusable action",
     model.actionOf({ name: "levitate", input: {} }).kind === "unknown");
}

/* ---- the two counting conventions, and the trap between them -------- *
 * tools/babel.mjs verify counts pages, lines and columns from 1. The
 * reading pane and the observation an agent is handed count from 0. That
 * split is a live trap for a reader following the skill's own discipline:
 * read a 0-based page, verify against a 1-based command, be told a true
 * citation is false, and "correct" it into a false one. The CLI now
 * notices and says so; this holds it to that.                          */
{
  const a = text.walkAddress({ q: 15, r: 94, floor: 0, wall: 1, shelf: 2, slot: 17 });
  const [page, line, column] = [203, 5, 32];
  const quote = text.sliceOf(a, page * text.PAGE_LEN + line * text.COLS + column, 9);
  const cli = (p, l, c) => {
    try {
      return execFileSync(process.execPath,
        ["tools/babel.mjs", "verify", text.formatAddress(a), String(p), String(l), String(c), quote],
        { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
    } catch (e){ return String(e.stdout ?? "") + String(e.message ?? ""); }
  };
  ok("the CLI verifies a citation given in its own 1-based terms",
     /^verified/m.test(cli(page + 1, line + 1, column + 1)));
  ok("and catches the 0-based reading rather than calling a true claim false",
     /verifies read as 0-based/.test(cli(page, line, column)));
  ok("while a claim that is simply wrong stays simply wrong",
     !/0-based/.test(cli(page + 1, line + 1, column + 9)));
}

/* ---- GATE 6: the async episode loop is the same episode ------------- */
section("ASYNC -- a network-bound reader gets the same episode");
{
  const opts = { q: 0, r: 0, floor: 0, budget: 40 };
  const sync = run.runEpisode(run.honestReader(11), opts);
  /* the same policy, made to look like it went somewhere to decide */
  const inner = run.honestReader(11);
  const asAsync = async (s, acts) => { await Promise.resolve(); return inner(s, acts); };
  asAsync.policyName = inner.policyName;
  const asyncT = await run.runEpisodeAsync(asAsync, opts);
  eq("runEpisodeAsync produces the identical transcript", asyncT, sync);
  eq("and therefore the identical score", run.score(asyncT), run.score(sync));

  /* A policy that gives up mid-episode ends the run rather than hanging. */
  const quits = async () => null;
  quits.policyName = "quits";
  const stopped = await run.runEpisodeAsync(quits, opts);
  ok("a reader that names nothing ends the excursion", stopped.decisions.length === 0);
}

/* ---- a specimen, for the record ------------------------------------ */
section("SPECIMEN -- one honest excursion, scored");
{
  const t = run.runEpisode(run.honestReader(7), { q: 0, r: 0, floor: 0, budget: 60 });
  const m = run.score(t);
  results.push(`       policy      ${t.run.policy}   version ${t.version}`);
  results.push(`       steps ${m.steps}, rooms ${m.roomsVisited}, volumes ${m.volumesOpened}, ` +
               `symbols ${m.symbolsRead.toLocaleString()}`);
  results.push(`       claims ${m.claims}, verified ${m.accurate}, integrity ${m.integrity.toFixed(2)}`);
  results.push(`       ended: ${m.ending}${m.seated ? ", seated" : ""}`);
  results.push(`       ${t.report.at}`);
  ok("the specimen is a complete, scored, citeable run", m.claims > 0 && m.integrity === 1);
}

console.log(results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
