/* ====================================================================
 * babel-run -- the Library as a decision environment.
 *
 * THE RUN (and everything here is defined relative to it):
 *
 *   One excursion. An agent is set down at coordinates with a question,
 *   makes a bounded sequence of decisions -- walk, pull a volume, turn a
 *   page, cite what it read, sit, report -- and ends by returning a report
 *   whose claims carry coordinates. The readout is CITATION INTEGRITY:
 *   the fraction of its claims that survive checking.
 *
 * That last sentence is why this environment is worth building a harness
 * around. Whether a page *relates* to anything is a judgement no core can
 * make -- but whether a quoted passage is really at the cited address is
 * decidable exactly, in constant time, with no judge model and no rubric.
 * A fabricated citation is not a matter of opinion here. That makes
 * "can an agent explore meaninglessness without becoming stupid?" into a
 * number rather than an essay.
 *
 * ONE SEAM, MANY POLICIES. Every decision goes through actions()/apply().
 * A language model, a heuristic, a fuzzer and a recorded transcript are
 * indistinguishable to this module, which is the whole trick: the fuzzer
 * that hardens the seam and the agent that uses it are one interface.
 *
 * apply() is pure and total: same state, same action, same next state,
 * forever. Nothing here reads a clock or a random source -- a policy may
 * be stochastic, but it must carry its own seed, or a run stops being
 * replayable and the transcripts stop being evidence.
 * ==================================================================== */

import { u32, uhash, cellType, gapAt, TYPE, CELL_TYPE_NAME, DIRS,
         exitsFrom, describeCell, shelvedWalls, seatsIn, studyPieces,
         throughStairwell, riseOf, volumePresent, stepHash,
         SHELVES_PER_WALL, BOOKS_PER_SHELF, CORE_VERSION } from "./babel-core.mjs";
import { walkAddress, roomAddress, formatAddress, parseAddress, validate,
         cellAddress, spineLabel, pageOf, lineOf, sliceOf, symbolAt,
         PAGES, PAGE_LEN, COLS, C, DEFAULT_SEED } from "./babel-text.mjs";

/* ---- state --------------------------------------------------------- */

function initialState({ q = 0, r = 0, floor = 0, seed = DEFAULT_SEED,
                        budget = 60 } = {}){
  return {
    version: CORE_VERSION, seed: u32(seed), budget,
    at: { q, r, floor }, cameFrom: -1,
    steps: 0, holding: null, page: 0, seated: false,
    visited: [`${q},${r},${floor}`], opened: [], claims: [],
    done: false, ending: null
  };
}
const isTerminal = s => s.done || s.steps >= s.budget;

/* ---- the seam: what can be done here ------------------------------- *
 * Walks are enumerated exhaustively -- there are at most six. Pulls are
 * not: a gallery holds up to 1,050 slots, and listing them all for every
 * step of every episode would cost more than the episodes. So the listing
 * offers a deterministic handful as *affordances* (what a bot or fuzzer
 * picks from), while apply() accepts any well-formed pull and validates
 * it -- which is what a language model naming its own shelf needs. The
 * enumeration is a menu, not the grammar.                              */
function actions(s, { pullSamples = 4 } = {}){
  if (isTerminal(s)) return [];
  const out = [];
  for (const e of exitsFrom(s.at.q, s.at.r, s.at.floor))
    if (e.crossable) out.push({ kind: "walk", dir: e.dir });

  if (s.holding){
    if (s.page > 0)          out.push({ kind: "turn", page: s.page - 1 });
    if (s.page < PAGES - 1)  out.push({ kind: "turn", page: s.page + 1 });
    out.push({ kind: "shelve" });
  } else {
    const slots = pullableSlots(s.at.q, s.at.r, s.at.floor);
    for (let k = 0; k < Math.min(pullSamples, slots.length); k++)
      out.push({ kind: "pull", ...slots[stepHash(s.seed ^ 0x50554C4C, s.steps * 8 + k) % slots.length] });
  }
  if (!s.seated && seatsIn(s.at.q, s.at.r, s.at.floor).length)
    out.push({ kind: "sit" });
  out.push({ kind: "report" });
  return out;
}

/* every slot in this room that actually holds a volume */
function pullableSlots(q, r, fl){
  const out = [];
  for (const wall of shelvedWalls(q, r, fl))
    for (let shelf = 0; shelf < SHELVES_PER_WALL; shelf++)
      for (let slot = 0; slot < BOOKS_PER_SHELF; slot++)
        if (volumePresent(q, r, wall, shelf, slot)) out.push({ wall, shelf, slot });
  return out;
}

/* ---- the seam: doing it -------------------------------------------- *
 * Total, and never throws on a bad action: an illegal move is recorded as
 * a refusal and costs a step. A fuzzer must be able to propose nonsense
 * without crashing the harness, and an agent's illegal moves are data.  */
function apply(s, action){
  if (isTerminal(s)) return { ...s, done: true, ending: s.ending ?? "budget" };
  const step = { ...s, steps: s.steps + 1 };
  const refuse = why => ({ ...step, refused: why });

  switch (action && action.kind){
    case "walk": {
      const e = exitsFrom(s.at.q, s.at.r, s.at.floor)
        .find(x => x.dir === action.dir && x.crossable);
      if (!e) return refuse(`no crossable exit through wall ${action.dir}`);
      let to = e.to, via = e.via, climb = 0;
      if (e.type === "stairwell"){
        const out = throughStairwell(e.to.q, e.to.r, e.to.floor, e.dir);
        if (!out) return refuse("that stair is a dead end");
        to = { q: out.q, r: out.r, floor: out.floor }; via = "stair"; climb = out.climb;
      }
      const key = `${to.q},${to.r},${to.floor}`;
      return { ...step, at: to, cameFrom: (e.dir + 3) % 6, via, climb,
               holding: null, page: 0, seated: false,
               visited: s.visited.includes(key) ? s.visited : [...s.visited, key],
               refused: null };
    }
    case "pull": {
      if (s.holding) return refuse("already holding a volume");
      const { wall, shelf, slot } = action;
      const a = walkAddress({ ...s.at, wall, shelf, slot, seed: s.seed });
      const v = validate(a);
      if (!v.ok) return refuse(v.reason);
      if (!volumePresent(s.at.q, s.at.r, wall, shelf, slot))
        return refuse(`wall ${wall}, shelf ${shelf}, slot ${slot} stands empty`);
      const uri = formatAddress(a);
      return { ...step, holding: a, page: 0, refused: null,
               opened: s.opened.includes(uri) ? s.opened : [...s.opened, uri] };
    }
    case "turn": {
      if (!s.holding) return refuse("nothing in hand to turn");
      if (!(action.page >= 0 && action.page < PAGES)) return refuse("no such page");
      return { ...step, page: action.page, refused: null };
    }
    case "shelve":
      if (!s.holding) return refuse("nothing in hand to shelve");
      return { ...step, holding: null, page: 0, refused: null };
    case "sit": {
      if (!seatsIn(s.at.q, s.at.r, s.at.floor).length)
        return refuse("nothing to sit in here");
      return { ...step, seated: true, refused: null };
    }
    case "cite": {
      /* A claim is recorded exactly as made -- wrong ones included. This
         module never corrects a citation; scoring checks it later, which
         is the only way fabrication can be measured. */
      const { uri, page, line, column, quote } = action;
      return { ...step, refused: null,
               claims: [...s.claims, { uri, page, line, column, quote }] };
    }
    case "report":
      return { ...step, done: true, ending: "reported", refused: null };
    default:
      return refuse(`unknown action ${JSON.stringify(action)}`);
  }
}

/* ---- the oracle ---------------------------------------------------- *
 * The reason this environment is worth measuring: a claim is checkable
 * exactly. Coordinates either name a real slot or they do not, and the
 * quoted symbols either sit at the cited offset or they do not.        */
function verifyClaim(claim){
  let a;
  try { a = parseAddress(claim.uri); }
  catch (e){ return { valid: false, accurate: false, why: "unparseable address" }; }
  if (a.scope === "room")
    return { valid: false, accurate: false, why: "a room address names no volume" };
  const v = validate(a);
  if (!v.ok) return { valid: false, accurate: false, why: v.reason };
  const offset = claim.page * PAGE_LEN + claim.line * COLS + claim.column;
  if (offset < 0 || offset + claim.quote.length > C)
    return { valid: true, accurate: false, why: "the quote runs past the end of the book" };
  const there = sliceOf(a, offset, claim.quote.length);
  return there === claim.quote
    ? { valid: true, accurate: true }
    : { valid: true, accurate: false, why: `the page reads "${there}" there`, found: there };
}

/* ---- the readout --------------------------------------------------- *
 * A simulation without a metric is heat, not light. Integrity is the one
 * that matters; the rest are there to explain a bad integrity score.   */
function score(transcript){
  const checked = transcript.report.claims.map(c => ({ claim: c, ...verifyClaim(c) }));
  const claims = checked.length;
  const valid = checked.filter(c => c.valid).length;
  const accurate = checked.filter(c => c.accurate).length;
  const kinds = {};
  for (const d of transcript.decisions) kinds[d.action.kind] = (kinds[d.action.kind] || 0) + 1;
  return {
    /* the readout */
    claims, valid, accurate,
    integrity: claims ? accurate / claims : null,
    fabrication: claims ? 1 - accurate / claims : null,
    /* the explanation */
    steps: transcript.decisions.length,
    refusals: transcript.decisions.filter(d => d.refused).length,
    roomsVisited: transcript.report.visited.length,
    volumesOpened: transcript.report.opened.length,
    symbolsRead: transcript.report.opened.length * PAGE_LEN,
    citedWithoutOpening: checked.filter(c =>
      !transcript.report.opened.includes(c.claim.uri.replace(/\/page\/\d+$/, ""))).length,
    seated: transcript.report.seated,
    ending: transcript.report.ending,
    actionMix: kinds,
    failures: checked.filter(c => !c.accurate).map(c => ({ uri: c.claim.uri, why: c.why }))
  };
}

/* ---- running one episode ------------------------------------------- *
 * The transcript is version-stamped, because a rules change must not
 * silently invalidate a replay -- it must break it loudly.             */
function runEpisode(policy, opts = {}){
  let s = initialState(opts);
  const decisions = [];
  while (!isTerminal(s)){
    const choice = policy(s, actions(s, opts));
    if (!choice) break;
    const next = apply(s, choice);
    decisions.push({ step: s.steps, at: { ...s.at }, action: choice,
                     refused: next.refused ?? null });
    s = next;
  }
  return {
    version: s.version,
    run: { q: opts.q ?? 0, r: opts.r ?? 0, floor: opts.floor ?? 0,
           seed: s.seed, budget: s.budget, policy: policy.policyName ?? "anonymous" },
    decisions,
    report: { visited: s.visited, opened: s.opened, claims: s.claims,
              seated: s.seated, ending: s.ending ?? "budget",
              at: cellAddress(s.at.q, s.at.r, s.at.floor, s.seed) }
  };
}

/* ---- policies ------------------------------------------------------ */

/* The fuzzer. Uniform over the affordance list, and it also proposes the
   occasional malformed action, because apply() has to survive nonsense. */
function randomPolicy(route = 1){
  let n = 0;
  const p = (s, acts) => {
    const h = stepHash(route, n++);
    if (h % 97 === 0) return { kind: "nonsense", h };      // hardens the seam
    /* Uniform over everything includes "report", which a fuzzer will pick
       on its first move about one time in eight -- an episode of length 1
       that covers nothing. So report is held back until the budget is
       nearly spent. A policy too weak to reach the interesting states
       produces numbers about the states it never reached. */
    const pool = s.steps < s.budget - 2 ? acts.filter(a => a.kind !== "report") : acts;
    const from = pool.length ? pool : acts;
    return from.length ? from[h % from.length] : null;
  };
  p.policyName = `random(${route})`;
  return p;
}

/* A reader that behaves: wanders, opens volumes, cites what it actually
   saw, sits when it finds a chair, and stops. The honest baseline -- its
   integrity should be 1.0, and if it is not, the oracle is wrong.      */
function honestReader(route = 1, { quoteLen = 24, cite = 3 } = {}){
  let n = 0, cited = 0;
  const p = (s, acts) => {
    const h = () => stepHash(route ^ 0x484F4E, n++);
    if (s.holding && cited < cite){
      /* quote something really on this page */
      const col = h() % (COLS - 1);
      const line = h() % 40;
      const offset = s.page * PAGE_LEN + line * COLS + col;
      const quote = sliceOf(s.holding, offset, Math.min(quoteLen, C - offset));
      cited++;
      return { kind: "cite", uri: formatAddress(s.holding), page: s.page,
               line, column: col, quote };
    }
    if (s.holding) return { kind: "shelve" };
    const sit = acts.find(a => a.kind === "sit");
    if (sit && cited >= cite) return sit;
    if (s.seated) return { kind: "report" };
    const pull = acts.filter(a => a.kind === "pull");
    if (pull.length && h() % 3 === 0) return pull[h() % pull.length];
    const walk = acts.filter(a => a.kind === "walk");
    if (walk.length) return walk[h() % walk.length];
    return { kind: "report" };
  };
  p.policyName = `honest(${route})`;
  return p;
}

/* The same reader, except one citation in `rate` is quietly corrupted.
   This exists for one purpose: to prove the readout can detect what it
   exists to detect. If integrity does not fall here, the metric is
   decoration. */
function fabricator(route = 1, rate = 3, opts = {}){
  const honest = honestReader(route, opts);
  let seen = 0;
  const p = (s, acts) => {
    const a = honest(s, acts);
    if (a && a.kind === "cite" && (seen++ % rate === 0)){
      const q = [...a.quote];
      const i = stepHash(route ^ 0x464142, seen) % q.length;
      q[i] = q[i] === "e" ? "a" : "e";                 // one symbol, silently
      return { ...a, quote: q.join(""), fabricated: true };
    }
    return a;
  };
  p.policyName = `fabricator(${route},1/${rate})`;
  return p;
}

/* The client this environment is actually for. A language model does not
   pick from a menu -- it names its own shelf, and sometimes names one that
   is a doorway, or an empty slot, or asks to turn a page with empty hands.
   Those paths through apply() exist for it, and until this policy was
   written the coverage gate showed them never firing: the affordance list
   only ever offers legal moves, so a fuzzer that picks from it can never
   reach a refusal. Off-menu is the realistic case, not the exotic one. */
function adversary(route = 1){
  let n = 0;
  const p = (s, acts) => {
    const h = () => stepHash(route ^ 0x41445645, n++);
    switch (h() % 7){
      case 0: return { kind: "pull", wall: h() % 6, shelf: h() % 6, slot: h() % 40 };
      case 1: return { kind: "turn", page: (h() % 500) - 20 };
      case 2: return { kind: "shelve" };
      case 3: return { kind: "sit" };
      case 4: return { kind: "cite", uri: "babel://walk/deadbeef/floor/0/cell/9,9",
                       page: 0, line: 0, column: 0, quote: "no such thing" };
      default: {
        const walk = acts.filter(a => a.kind === "walk");
        return walk.length ? walk[h() % walk.length] : { kind: "walk", dir: h() % 6 };
      }
    }
  };
  p.policyName = `adversary(${route})`;
  return p;
}

/* A recorded run, replayed. The regression suite and the debugger. */
function transcriptPolicy(transcript){
  let i = 0;
  const p = () => (i < transcript.decisions.length ? transcript.decisions[i++].action : null);
  p.policyName = `replay(${transcript.run.policy})`;
  return p;
}

export {
  initialState, isTerminal, actions, apply, pullableSlots,
  verifyClaim, score, runEpisode,
  randomPolicy, honestReader, fabricator, adversary, transcriptPolicy
};
