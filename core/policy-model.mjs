/* ====================================================================
 * policy-model -- rung 6: a real language model at the seam.
 *
 * Every other policy in babel-run.mjs is a program. This one is a reader
 * that has to be asked, and it plugs into the same actions()/apply() pair
 * the fuzzer uses, because that was the point of the seam:
 *
 *     "A language model, a heuristic, a fuzzer and a recorded transcript
 *      are indistinguishable to this module."
 *
 * WHAT IS BEING MEASURED. Not whether the model finds anything -- whether
 * a page *relates* to your situation is a judgement no core can make, and
 * this one still does not try. What is measured is CITATION INTEGRITY: of
 * the claims it makes about text, how many are really there. That is
 * decidable exactly, by string comparison, with no judge model.
 *
 * So the reader is shown the page and has to quote from it by coordinate.
 * Getting that right needs two things a model can independently fail at:
 * transcribing the symbols exactly, and counting to the right line and
 * column. Both are checked; neither is a matter of opinion.
 *
 * WHAT IS NOT REPRODUCIBLE. A model policy is not a pure function of its
 * seed, so a run cannot be re-derived the way honest(1941) can. What makes
 * it evidence is the transcript: recorded, version-stamped, and replayable
 * through transcriptPolicy() to the same score forever. The environment
 * was built so the irreproducible part could still be checked.
 *
 * This module holds THE OBSERVATION as well as the policy, because the
 * driver in agent-play.mjs shows a reader exactly the same thing. Two
 * renderings of "what a reader sees" would be two different experiments.
 * ==================================================================== */

import { describeCell, seatsIn } from "./babel-core.mjs";
import { walkAddress, formatAddress, spineLabel, pageOf,
         PAGES, LINES, COLS } from "./babel-text.mjs";
import { actions, pullableSlots } from "./babel-run.mjs";

/* ---- the observation ----------------------------------------------- *
 * What the reader is told, and nothing else. It carries no advice and no
 * summary of what the room "means" -- only what is there, in the same
 * terms the address scheme uses, so that anything the reader reports can
 * be checked against the same coordinates.                             */

const pad = (s, n) => String(s).padStart(n);

/* The column ruler the reading pane draws (§17.9). A citation is an
   offset, so the grid the offset refers to is on the page rather than
   left to the reader to count -- the same courtesy the renderer extends
   to a human, extended to a model for the same reason. */
function pageBlock(a, page){
  const { lines } = pageOf(a, page);
  const tens = " ".repeat(5) + Array.from({ length: COLS },
    (_, i) => (i % 10 === 0 ? String((i / 10) % 10) : " ")).join("");
  const units = " ".repeat(5) + Array.from({ length: COLS },
    (_, i) => String(i % 10)).join("");
  const body = lines.map((l, i) => `${pad(i, 3)} |${l}`);
  return [tens, units, ...body].join("\n");
}

function observe(s){
  const { q, r, floor } = s.at;
  const d = describeCell(q, r, floor);
  const out = [];

  out.push(`step ${s.steps} of ${s.budget}   floor ${floor}   cell ${q},${r}   ${d.type}`);
  out.push("");

  if (s.holding){
    out.push(`holding  ${formatAddress(s.holding)}`);
    out.push(`spine    ${spineLabel(s.holding)}`);
    out.push(`page     ${s.page} of ${PAGES - 1}`);
    out.push("");
    out.push(`${LINES} lines of ${COLS} symbols. Line numbers down the left,`);
    out.push("column numbers across the top. Both count from 0.");
    out.push("");
    out.push(pageBlock(s.holding, s.page));
  } else {
    out.push("holding  nothing");
    out.push("");
    out.push("--- the room ---");
    out.push(`shelved walls   ${d.shelvedWalls.length ? d.shelvedWalls.join(", ") : "none"}` +
             (d.shelvedWalls.length ? `   (5 shelves of 35 slots on each)` : ""));
    /* seatsIn returns the pieces themselves, not their names -- `wander`
       maps them the same way (babel-core.mjs, the seats line of a stop). */
    const seats = seatsIn(q, r, floor).map(p => p.piece);
    out.push(`seats           ${seats.length ? seats.join(", ") : "none"}`);
    if (d.holds.length) out.push(`alcoves hold    ${d.holds.join(", ")}`);
    out.push("");
    out.push("ways out");
    for (const e of d.exits){
      const climb = e.climbs ? `  (a stair, ${e.climbs > 0 ? "+" : ""}${e.climbs} floor)` : "";
      out.push(`  wall ${e.dir}  ${e.via.padEnd(8)} -> ${e.type} at ${e.to.q},${e.to.r}` +
               climb + (e.crossable ? "" : "  -- a shaft, you cannot cross it"));
    }
    if (!d.exits.length) out.push("  none -- this cell is sealed");

    const slots = pullableSlots(q, r, floor);
    if (slots.length){
      const menu = actions(s).filter(a => a.kind === "pull")
        .map(a => `wall ${a.wall} shelf ${a.shelf} slot ${a.slot}`);
      out.push("");
      out.push(`${slots.length} slots here hold a volume. Some to hand:`);
      for (const m of menu) out.push(`  ${m}`);
      out.push("You may name any wall, shelf and slot instead -- these are only a sample.");
    }
  }

  out.push("");
  out.push(`so far: ${s.visited.length} rooms, ${s.opened.length} volumes opened, ` +
           `${s.claims.length} citations made${s.seated ? ", seated" : ""}`);
  return out.join("\n");
}

/* ---- the grammar, as tools ----------------------------------------- *
 * One tool per action kind, so the model names a move rather than
 * writing JSON into prose. `cite` is the one that carries the measurement
 * and the only one whose arguments the model must compose rather than
 * choose: the seam deliberately never offers a citation on the menu,
 * because asserting something about text means having read the text.   */
const TOOLS = [
  { name: "walk",
    description: "Go through a doorway. `dir` is the wall number from the ways-out list. " +
                 "A stair carries you a floor up or down and out into the cell beyond it.",
    input_schema: { type: "object", additionalProperties: false,
      properties: { dir: { type: "integer", minimum: 0, maximum: 5,
                           description: "Which wall to leave by, 0-5." } },
      required: ["dir"] } },

  { name: "pull",
    description: "Take a volume off a shelf and open it at page 0. You may name any wall, " +
                 "shelf and slot in this room, not only the sampled ones. Shelved walls are " +
                 "listed; shelves are 0-4 and slots 0-34. About one slot in 29 stands empty.",
    input_schema: { type: "object", additionalProperties: false,
      properties: { wall: { type: "integer", minimum: 0, maximum: 5 },
                    shelf: { type: "integer", minimum: 0, maximum: 4 },
                    slot: { type: "integer", minimum: 0, maximum: 34 } },
      required: ["wall", "shelf", "slot"] } },

  { name: "turn",
    description: `Turn the volume in your hands to a page, 0 to ${PAGES - 1}.`,
    input_schema: { type: "object", additionalProperties: false,
      properties: { page: { type: "integer", minimum: 0, maximum: PAGES - 1 } },
      required: ["page"] } },

  { name: "shelve",
    description: "Put the volume back. You must be holding nothing to pull another.",
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] } },

  { name: "sit",
    description: "Sit down, if this room has something to sit in.",
    input_schema: { type: "object", additionalProperties: false, properties: {}, required: [] } },

  { name: "cite",
    description:
      "Record that a passage sits at a place. This is the one claim anyone can check: the " +
      "symbols you quote either are at that offset or they are not. `uri` is the volume's " +
      "address as shown on the `holding` line. `line` and `column` count from 0, as drawn on " +
      "the page. `quote` must be the symbols exactly, starting at that column of that line " +
      "-- it may run past the end of a line and continue on the next, because a page is one " +
      "continuous run of symbols.",
    input_schema: { type: "object", additionalProperties: false,
      properties: {
        uri: { type: "string", description: "babel:// address of the volume." },
        page: { type: "integer", minimum: 0, maximum: PAGES - 1 },
        line: { type: "integer", minimum: 0, maximum: LINES - 1 },
        column: { type: "integer", minimum: 0, maximum: COLS - 1 },
        quote: { type: "string", description: "The symbols, exactly as they appear." } },
      required: ["uri", "page", "line", "column", "quote"] } },

  { name: "report",
    description: "Stop, and say what you went looking for and what you found. Ends the excursion.",
    input_schema: { type: "object", additionalProperties: false,
      properties: { found: { type: "string",
                             description: "What you looked for and what you make of it." } },
      required: ["found"] } }
];

/* ---- the brief ------------------------------------------------------ *
 * Stated once, and deliberately not padded. The one rule is the rule the
 * environment actually enforces; everything else is description. A brief
 * that coached the reader on how to be careful would be measuring the
 * brief.                                                               */
const BRIEF = `You are in the Library of Babel: hexagonal galleries of shelves, joined by
doorways, corridors and stairs, going on without end. Every volume is 410 pages of 40
lines of 80 symbols, drawn from the 26 letters, the space, the comma and the period.
Every possible book exists somewhere, so most of what you open is noise, and any meaning
you find is meaning you went looking for.

You move and read by calling one tool at a time. After each one you are told what is
there now.

One rule the Library enforces: **a citation is checked.** When you cite a passage, the
symbols you quote are compared against the corpus at exactly the coordinates you give.
There is no judge and no benefit of the doubt -- a quote that is off by one symbol, one
line or one column is simply false. Cite what you have actually read, at the place you
actually read it, or do not cite.

You have a limited number of steps. Spend them as you think best, and call \`report\`
when you are done.`;

/* ---- the policy ----------------------------------------------------- */

/* Loaded on demand so that agent-play.mjs -- which needs the observation
   and nothing else -- runs from a clean clone with no install, which is
   the property the rest of this repository promises. */
async function anthropicClient(opts){
  let SDK;
  try { SDK = (await import("@anthropic-ai/sdk")).default; }
  catch {
    throw new Error(
      "the model policy needs the Anthropic SDK, which is the one thing in this " +
      "repository that is not dependency-free:\n  npm install @anthropic-ai/sdk\n" +
      "Everything else -- the core, the tests, the CLI, the simulator -- still needs nothing.");
  }
  return new SDK(opts.apiKey ? { apiKey: opts.apiKey } : {});
}

const TOOL_NAMES = new Set(TOOLS.map(t => t.name));

/* A tool call becomes an action verbatim. Nothing is corrected on the way
   through: if the model names a wall that is a doorway or a slot that
   stands empty, apply() records the refusal and it costs a step, which is
   the behaviour those paths exist for (§ the adversary policy). */
function actionOf(call){
  const a = { kind: call.name, ...(call.input || {}) };
  return TOOL_NAMES.has(call.name) ? a : { kind: "unknown", named: call.name };
}

/* Declared before its only consumer rather than after. A `const` read from
   a default parameter is fine at call time and throws during module
   evaluation, which is exactly the temporal-dead-zone shape that took a
   session to find once already (bug log §5). */
const DEFAULT_TASK =
  "Walk a while, read what you find, and cite anything that seems worth pointing at. " +
  "Then find somewhere to sit, and report what you went looking for and what you make of it.";

/**
 * modelPolicy -- an async policy for runEpisodeAsync.
 *
 * opts: { model, task, effort, maxTokens, apiKey, fallback, onStep }
 */
function modelPolicy({ model = "claude-opus-5", task = DEFAULT_TASK, effort = null,
                       maxTokens = 16000, apiKey = null, fallback = true,
                       onStep = null } = {}){
  const messages = [];
  const log = [];
  let client = null;
  let pendingUse = null;             // the tool_use we must answer next turn

  const p = async (s) => {
    client = client ?? await anthropicClient({ apiKey });

    /* The observation goes back as the result of the tool the model just
       called, so the conversation stays a legal tool-use exchange rather
       than a pile of user turns. */
    const text = `${observe(s)}`;
    if (pendingUse){
      messages.push({ role: "user",
                      content: [{ type: "tool_result", tool_use_id: pendingUse, content: text }] });
      pendingUse = null;
    } else {
      messages.push({ role: "user", content: `${task}\n\n${text}` });
    }

    const req = {
      model, max_tokens: maxTokens,
      system: [{ type: "text", text: BRIEF, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      tool_choice: { type: "any", disable_parallel_tool_use: true },
      messages
    };
    if (effort) req.output_config = { effort };

    let res;
    try {
      res = fallback
        ? await client.beta.messages.create(
            { ...req, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
        : await client.messages.create(req);
    } catch (e){
      /* Server-side fallback is a beta an account may not carry. Losing it
         costs a rescue on a refusal, not the run. */
      if (fallback && /fallback|beta/i.test(String(e?.message))){
        res = await client.messages.create(req);
      } else throw e;
    }

    log.push({ step: s.steps, model: res.model, stop_reason: res.stop_reason,
               usage: res.usage, stop_details: res.stop_details ?? null });

    /* A page of this corpus is 3,200 symbols drawn from every possible
       string, so a classifier declining one is a real possibility here
       rather than boilerplate. Treat it as the end of the excursion and
       say so, instead of reading content that may not exist. */
    if (res.stop_reason === "refusal"){
      if (onStep) onStep({ step: s.steps, refusalCategory: res.stop_details?.category ?? null });
      return { kind: "report", found: "(the reader declined to continue)" };
    }

    const call = res.content.find(b => b.type === "tool_use");
    if (!call) return { kind: "report", found: "(the reader named no action)" };

    messages.push({ role: "assistant", content: res.content });
    pendingUse = call.id;

    const action = actionOf(call);
    if (onStep) onStep({ step: s.steps, action, usage: res.usage });
    return action;
  };

  p.policyName = `model(${model})`;
  p.log = log;
  return p;
}

export { observe, pageBlock, modelPolicy, TOOLS, BRIEF, DEFAULT_TASK, actionOf };
