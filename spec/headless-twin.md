---
# spec v2 (markdown profile) — meta + machine-checkable lists in frontmatter,
# prose kernel in the body. Companion to spec-web-game-engine.md (that spec is
# this pattern's ground-up instantiation; this spec is the general form, with a
# retrofit path for systems that already exist).
templateVersion: 2.0.0
id: headless-twin
title: The Headless Twin — Closing the Iterative Loop on Existing Systems
version: 1.0.0
status: active
summary: >
  A general framework for making any decision-bearing system simulable at
  scale: draw a seam between decisions and effects, tame nondeterminism at the
  boundaries, record real runs as replayable transcripts, plug synthetic
  policies into the same seam humans use, and gate changes on invariants,
  coverage, replay, and metrics. Includes a staged retrofit ladder for legacy
  systems where each rung delivers standalone value. Extracted from the
  Barrowlands TCG project, where the loop ran feedback→shipped-fix same-day
  and simulation overturned an "obvious" fix before it shipped.
category: methodology
controlBoundary: internal
mode: normative
created: 2026-07-08
updated: 2026-07-08
author: David Reyburn
contributors: [Claude]
provenance:
  workflow: >
    Pattern proven end-to-end in barrowlands-tcg (pure engine, 4-gate CI,
    recorded internet play replaying bit-identically, A/B dial sims); codified
    here for transfer to existing industry projects not built for simulation.
tags: [simulation, deterministic-replay, testing, feedback-loops, retrofit, ux-research]
relationships:
  - { type: instantiates, target: spec-web-game-engine }
  - { type: motivated-by, target: barrowlands vision.md — the same idea applied to industry }
prose: markdown

constraints:
  must:
    - Define the Run before anything else — one bounded episode with a start state, a decision sequence, an end, and at least one metric you actually care about.
    - Put every decision through one seam; policies (human, heuristic, random, recorded) are interchangeable behind it.
    - Make a run reproducible from (version, initial state, inputs, decision log) — exactly or within a declared tolerance.
    - Version-stamp every transcript; replays run against the version that produced them.
    - Record real usage through the same seam simulation uses — production traces must be valid simulation inputs.
    - Keep the metric attached to the harness; a simulation without a readout is heat, not light.
  mustNot:
    - Do not require a rewrite — retrofit by wrapping and strangling; each rung must ship value alone.
    - Do not let the core reach ambient nondeterminism (wall clock, RNG, network, global mutable state) except through injected, recordable boundaries.
    - Do not treat simulation results as verdicts — sim proposes, reality disposes; ship on triangulation, not on sim alone.
    - Do not simulate below the decision level (that is unit testing) or above it (that is flaky e2e); the seam is where choices happen.
    - Do not skip the coverage question — a green harness cannot prove a feature does anything unless every feature marks its firing.

validation:
  invariants:
    - "replay: a recorded run re-executed on its own version reproduces the outcome (bit-identical, or within declared tolerance)."
    - "parity: transcripts recorded from the deployed system replay identically on the development copy — proof the twin and the real thing share one brain."
    - "closure: from every reachable non-terminal state, the harness can enumerate or generate at least one valid next input (no stuck states)."
    - "coverage: across a generated corpus, every declared feature/effect fires at least once; never-fired = presumed dead."
    - "conservation: domain-specific bookkeeping invariants hold at every step (define per binding: money sums, card counts, inventory, message ordering)."
    - "metric-sensitivity: a deliberately injected regression moves the metric — the readout is proven capable of detecting what it exists to detect."
  failureModes:
    - Partial determinism lies — one Date.now() or unordered map iteration in a corner silently breaks replay; enforce with the replay invariant in CI, not code review (Barrowlands found a hidden global-counter bug only because replay demanded determinism).
    - Policy too weak to exercise the interesting paths — a greedy bot undervalued the game's hidden-information moat, so sim numbers understated exactly the mechanics that mattered; know what your policies can't see and weight their data accordingly.
    - Metric-less simulation — thousands of runs, nothing learned; the Run definition must name the readout first.
    - Wrong seam altitude — too low reinvents unit tests, too high inherits UI/network flake; the seam belongs where decisions are made.
    - Unstamped transcripts — a rules change broke replay of three recorded games before version stamps existed; every boundary crossing gets a version.
    - The obvious fix shipped unsimulated — raising life totals to curb aggro made the aggro deck stronger (life was its fuel); the counterintuitive backfire is the pattern's core economic argument.
    - Recording without redaction/consent boundaries — production traces are data; treat capture, retention, and PII like the production data it is.
    - Simulation drift — the twin quietly diverges from production config/data shape; the parity invariant exists to catch this, run it on real traces continuously.
---

# The Headless Twin

## Kernel

### Thesis

Any system whose behavior flows through discrete decisions can be given a
headless twin: a pure core that runs without its display or its
infrastructure, driven through one seam by interchangeable policies — a human
in production, a heuristic bot, a random fuzzer, or a recorded transcript.
Once the twin exists, iteration cost collapses: thousands of runs per minute,
A/B experiments in scratch copies, real usage that doubles as a regression
suite, and answers to "what if" before anything ships. The framework's power
is not simulation itself but **closing the loop**: the same seam that lets
bots play lets you record humans, and the same recordings that debug the past
gate the future.

### Definitions

- **Run** — one bounded episode: initial state → decision sequence → terminal
  state, with at least one metric. (A game; a checkout session; a support
  ticket's lifecycle; an agent task; a pipeline execution.)
- **Seam** — the single interface where decisions enter: given the current
  state, what inputs are valid, and how does one input transform state? The
  seam is where policies plug in.
- **Policy** — anything that chooses the next input at the seam: production
  users, synthetic users (heuristics), fuzzers (random), adversaries,
  or transcripts (recorded runs replayed).
- **Transcript** — the serialized record of a run: version + initial
  state/seed + ordered decisions (+ outcome). The atomic unit of replay,
  debugging, regression, and analytics.
- **Twin** — the headless, deterministic execution of the core: same rules,
  no rendering, no I/O, no infrastructure.
- **Gate** — an automated check the twin makes cheap: invariant fuzzing,
  feature coverage, golden replay, metric stats.
- **Dial** — a parameter-level change (reversible, one number) as opposed to
  surgery (structural change); dials are what the loop tunes.

### Principles

1. **The Run is the unit of thought** (`run-first`). Before any engineering:
   what is one episode, when does it end, and what number tells you it went
   well? If you cannot answer, no harness will help. *Rationale: every later
   artifact — transcript, gate, metric — is defined relative to the Run.*
2. **One seam, many policies** (`policy-pluggability`). Humans and bots must
   be indistinguishable to the core. *Rationale: this is the whole trick —
   the fuzzer, the load test, the regression suite, and the user are one
   interface; build it once, get four consumers.*
3. **Determinism is purchased at the boundaries** (`boundary-taming`). The
   core never touches clock/RNG/network directly; those are injected and
   recordable. Full purity is the ideal; *declared tolerance* is the
   pragmatic floor (exact replay for logic; statistical replay where
   genuine concurrency remains). *Rationale: replay is the foundation every
   other gate stands on.*
4. **Record reality through the simulation seam** (`production-as-corpus`).
   Real usage, captured as transcripts, is the highest-value test corpus you
   will ever own: it exercises what users actually do, and it proves the twin
   matches production (parity). *Rationale: in Barrowlands, strangers' games
   from the public internet replayed bit-identically locally and became
   permanent regression tests the same day.*
5. **Gates before content** (`instrument-first`). Build invariants, coverage,
   replay, and stats before scaling the feature surface; every later change
   inherits the checks. *Rationale: a silently-dead feature shipped and passed
   every invariant test; only a coverage gate caught the class.*
6. **Sim proposes, reality disposes** (`triangulation`). Simulation results
   are evidence, not verdicts: ship on sim + real usage + expert judgment
   converging, and write down the rationale when you act early. *Rationale:
   gates are evidence thresholds, not calendars.*

### Mechanism — the retrofit ladder

For systems that already exist. Each rung ships standalone value; stop
climbing whenever the value stops justifying the cost. State advances
rung by rung; nothing requires a rewrite.

**Rung 0 — Name the loop.**
Pick the decision loop you keep paying to answer slowly ("does this flow
convert better?", "does this policy reduce escalations?", "does this change
break long-tail cases?"). Define the Run and its metric. *Done when: one
sentence names the episode, its end, and its readout.*

**Rung 1 — Record.**
At the existing decision points, log structured transcripts of real runs:
version, initial context, ordered decisions, outcome. No behavior change; a
logging patch. *Done when: yesterday's production activity exists as N
replayable-shaped records. Value shipped: analytics, funnel truth,
debugging-by-transcript.*

**Rung 2 — Tame the boundaries.**
Inventory nondeterminism touching the loop (clock, RNG, network calls, DB
reads, concurrency). Inject or record/replay each — stub clocks, seeded RNG,
captured responses at the boundary. Declare the replay tolerance. *Done when:
one recorded run re-executes to its recorded outcome. Value shipped:
replay-debugging — any production incident in the loop can be re-run on a
laptop.*

**Rung 3 — Strangle out the core.**
Move the loop's rules behind the seam into pure state+input→state functions,
feature by feature, validating each extraction in **shadow mode**: run legacy
and twin on the same recorded transcripts, diff outcomes until silent. *Done
when: the twin executes the full Run headlessly and the parity invariant holds
on production traces. Value shipped: the twin exists; logic is testable
without infrastructure.*

**Rung 4 — Plug in policies.**
Random policy first (it is the fuzzer, and it hardens the seam), then a
cheap heuristic (the synthetic user), then transcripts-as-policy (regression).
Where valid inputs can be enumerated, enumerate — affordances, fuzzing, and
bots fall out of one function; where not, write generators. *Done when:
`run(policy, seed) × 10,000` completes in minutes with invariants checked.
Value shipped: volume.*

**Rung 5 — Build the gates.**
Invariant fuzz, feature coverage, golden replay (seeded runs + curated real
transcripts), metric stats. Wire into CI; intended changes regenerate goldens
*with a stated reason*, unintended breakage gets caught. *Done when: the four
gates run on every change to the loop.*

**Rung 6 — Close the loop operationally.**
A/B candidate changes in scratch copies of the twin on identical seeds before
shipping; version-stamp everything; triage findings from real usage with IDs
and statuses; prefer dials to surgery; feed shipped changes back to Rung 1's
recorder. *Done when: the cycle "real-usage finding → A/B in twin → shipped
dial → redeployed → next drop verifies" has run once end-to-end.*

**Termination:** the ladder has no top — Rung 6 is a loop, not a destination.
**Edge cases:** genuinely concurrent/distributed cores → declare statistical
tolerance and simulate at the orchestration seam (see prior art: FoundationDB/
TigerBeetle simulate the *network* deterministically); ML components inside
the loop → freeze them per-version and treat as boundary; UI-aesthetic
questions → out of scope, this framework tests decisions, not feelings.

### Canonical example

*The life-total backfire (Barrowlands, 2026-07-08) — the loop catching the
obvious-but-wrong fix.*

**Setup:** expert playtester reports aggro decks too strong; the folk fix is
"raise life totals 20→25 so games last longer." A card-change gate exists:
no balance changes on sim data alone.

**Trace:**
1. Real usage (Rung 1 recording) already held the evidence: transcripts
   showed the abusive line (paying life as tempo), and the expert's diagnosis
   named the interaction (life-payment × attacker-chooses-targets).
2. Two scratch copies of the twin (Rung 6): variant A raises life to 25;
   variant B doubles the life-payment rate. Same seeds, 150 runs per matchup,
   ~1 minute each.
3. Result: **variant A made the problem deck *stronger*** (76%→78%) — life
   is the aggro deck's fuel, so more life = bigger budget. Variant B moved
   points precisely from the offending decks to their victims, nothing else.
4. Decision (triangulation): sim + expert testimony + designer's own recorded
   games = threshold met; ship variant B as a version-stamped, reversible
   dial; paper materials updated in the same commit; rationale written down.
5. Next real-usage drop will verify against the same seam that measured it.

**Result:** the intuitive fix would have shipped the exact opposite of its
intent; three minutes of simulation prevented it. Total elapsed time,
finding→shipped fix: same day. This one incident justifies the harness.

## Constraints (tradeoffs deliberately accepted)

- **Building the seam costs more than the first feature it tests.** Accepted:
  the seam amortizes across every future question; the first A/B usually
  repays it (see canonical example).
- **Policies are not users.** Synthetic policies systematically under-explore
  what they weren't taught to value; accepted, and weighted for — the
  framework pairs them with recorded real usage rather than replacing it.
- **Determinism constrains implementation freedom** (no ad-hoc randomness,
  ordered iteration, injected time). Accepted: the discipline is the product.
- **Golden tests break on intended change.** Accepted: that is the alarm
  working; regenerate with a stated reason.
- **Recording reality is a data liability** (privacy, retention). Accepted
  with controls; redact at the seam, treat transcripts as production data.

## Applicability

**Requires:** discrete decision points (clicks, choices, tool calls, branch
points); bounded episodes with nameable outcomes; logic that is (or can
become) separable from rendering/transport; permission to log real usage.

**Strong fits:** onboarding/checkout/form flows (synthetic users × recorded
sessions); pricing/eligibility/routing engines; matchmaking and queues; agent
pipelines (state = task context, decisions = tool calls, transcript = the
run); workflow/approval systems; migration scripts (transcript = before/after
diffs at scale); game-like products, obviously.

**Contraindications:** hard-realtime and physics loops (tick-granular, not
decision-granular); questions of aesthetic feel; ML *training* internals
(treat models as frozen boundaries instead); systems whose only complexity is
integration glue with no decision logic to twin.

## Bindings

| Abstract role | Barrowlands (proven) | Checkout/onboarding funnel | Agent workflow |
|---|---|---|---|
| Run | one game | one session, entry→purchase/abandon | one task, assignment→resolution |
| State | zones, life, counters | cart, form state, user context | conversation + tool state |
| Seam | `legalActions`/`apply` | available UI actions → state transition | tool registry → tool call |
| Policy: real | human via web client | production users | operator/end user |
| Policy: synthetic | greedy AI | persona bots (impatient, thorough, hostile) | scripted personas / adversarial prompts |
| Policy: random | fuzzer | monkey-tester within valid actions | random-valid tool sequences |
| Transcript | seed+actions+version | session event log + variant stamp | full trace + model/version stamps |
| Metric | win rate, game length | completion %, time-to-done, error loops | resolution rate, cost, escalations |
| The A/B | rule dials on same seeds | flow variants on same personas+seeds | prompt/policy dials on same tasks |
| Parity check | deployed games replay locally | prod sessions replay on dev build | prod traces re-run on dev pipeline |

## Derivations

- **retrofit-workflow**: the ladder (mechanism) is the checklist; run Rung 0
  as a one-hour exercise before committing to anything.
- **pitch/essay**: lead with the canonical example (the backfire), then the
  thesis; the ladder is the "how" appendix. One-sentence pitch: *"your
  product, runnable ten thousand times before lunch."*
- **evaluation surface**: for judging an existing project's fitness, score it
  against the six `must` constraints; the gaps are the ladder rungs to climb.

## Validation

Invariants and failure modes live in the frontmatter. Executable embodiments
of every invariant exist in the Barrowlands repo (`engine/sim.js` fuzz/
coverage/replay/stats; `web/server/e2e-test.js` parity; `playtest/` corpus of
internet transcripts, 14/14 replay parity). The metric-sensitivity invariant
is the one Barrowlands has not yet formalized — noted as the pattern's own
open TODO.

## Notes

- **Relationship to the campaign vision** (`design/vision.md`): this is the
  same architecture of thought — author the rule-space, let policies traverse
  it exhaustively, keep human traces as the Golden Path the map is oriented
  around — applied to working software instead of a story. The case-study log
  is itself a Rung-1 transcript of the project.
- **Prior art, honestly named**: functional core/imperative shell (Bernhardt);
  hexagonal architecture; event sourcing; property-based testing
  (QuickCheck/Hypothesis); deterministic simulation testing as practiced by
  FoundationDB, TigerBeetle (VOPR), and Antithesis; digital twins in
  industrial control; session replay in product analytics. The contribution
  here is not any single element but the *closed loop* — production
  transcripts, synthetic policies, and CI gates sharing one seam — plus a
  retrofit ladder where each rung ships value alone.
- **Open questions**: statistical-tolerance replay semantics for concurrent
  cores; transcript schema evolution across many versions (beyond stamping);
  when the seam itself needs versioning; metric-sensitivity gate design.
