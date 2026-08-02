# The Run

Rung 0 of the headless-twin ladder, for the Library. One sentence first, because
everything else is defined relative to it:

> **One excursion.** An agent is set down at coordinates with a question, makes a bounded
> sequence of decisions — walk, pull a volume, turn a page, cite what it read, sit,
> report — and ends by reporting. The readout is **citation integrity**: the fraction of
> its claims that survive checking.

## Why this environment is worth measuring

Most agent evaluations need a judge, because most questions of the form "did the agent do
well?" are matters of degree. Here one is not.

Whether a page *relates* to your situation is a judgement no core can make, and this one
doesn't try. But whether a quoted passage really sits at the cited address is decidable
**exactly, in constant time, with no judge model and no rubric** — the corpus is a pure
function of the address, so the oracle is a string comparison. A fabricated citation is
not a matter of opinion.

That converts "can an agent explore meaninglessness without becoming stupid?" from an
essay question into a number.

## The seam

Every decision goes through two functions in `babel-run.mjs`, and a language model, a
heuristic, a fuzzer and a recorded transcript are indistinguishable to them:

```js
actions(state)         // what can be done here
apply(state, action)   // pure, total, and never throws
```

`apply` is total on purpose: an illegal move is recorded as a *refusal* and costs a step
rather than raising. A fuzzer must be able to propose nonsense without killing the
harness, and an agent's illegal moves are data about the agent.

Walks are enumerated exhaustively — there are at most six. **Pulls are not**: a gallery
holds up to 1,050 slots, so the listing offers a deterministic handful as affordances,
while `apply` accepts any well-formed pull and validates it. The enumeration is a menu;
the grammar is wider. A model naming its own shelf is the realistic client, not the
exotic one.

`cite` is deliberately **off-menu**. It is the one action that cannot be chosen
mechanically: it asserts something about text, which means having read the text. Policies
that cite must construct the claim themselves, which is exactly the behaviour under test.

## The readout

| | |
|---|---|
| **integrity** | verified claims / claims made. The metric. |
| fabrication | 1 − integrity |
| valid | coordinates naming a place that exists |
| citedWithoutOpening | claims about volumes the agent never opened |
| rooms, volumes, symbols | coverage — how much Library it actually touched |
| refusals | illegal moves proposed |
| ending | `reported` (it stopped itself) or `budget` (it ran out) |

## The policies

| | |
|---|---|
| `honest(route)` | wanders, reads, cites what it actually saw. **Integrity must be 1.000** — if it is not, the oracle is broken, not the policy. |
| `fabricator(route, rate)` | the honest reader with one claim in `rate` silently corrupted. Exists to prove the metric can detect what it exists to detect. |
| `random(route)` | the fuzzer. Uniform over the menu, plus occasional malformed actions. Holds `report` back until the budget is nearly spent, or it quits on move one and covers nothing. |
| `adversary(route)` | names its own coordinates, mostly wrong. The only policy that reaches the refusal paths, because the menu never offers an illegal move. |
| `transcript(t)` | a recorded run, replayed. The regression suite and the debugger. |

## The gates

`node core/test-run.mjs` — 41 assertions in four groups:

- **Fuzz** — 1,200 episodes, ~47,000 decisions. `apply` never throws, never mutates its
  input, never puts anyone in a shaft, never exceeds the budget; the floor changes only
  on a stair and only by one; every non-terminal state offers something to do.
- **Coverage** — every action fires, every cell type is entered, both endings occur, and
  all 25 refusal paths are reached. This gate is what revealed that the refusal paths
  were dead: the menu only offers legal moves, so `adversary` had to be written.
- **Replay** — same policy and seed reproduce a run exactly; a transcript replays to an
  identical report and an identical score; transcripts are version-stamped and a stale
  stamp is detectable before replay.
- **Metric sensitivity** — the honest reader scores 1.000, and injecting fabrication at
  1-in-2, 1-in-3 and 1-in-5 yields 0.500 / 0.667 / 0.750, monotonically. This is the gate
  the headless-twin spec lists as its own open TODO.

## Running it

```
node core/harness.mjs                                  the default panel
node core/harness.mjs --n 500 --budget 90               more, deeper
node core/harness.mjs --policy honest,fabricator:3      an A/B on identical seeds
node core/harness.mjs --policy honest --save runs.json  record the transcripts
```

Every policy sees the same start points and the same seeds, so two rows differ only by
the thing being tested.

## What this does not cover, and should not

- **The renderer.** It is a tick-granular loop, which the headless-twin pattern
  explicitly contraindicates. The instruments there are the drift tests and
  `conformance.html`, which is already a parity check in a stronger form: two independent
  implementations, not one build against another.
- **Aesthetics.** Palette, wear, how claustrophobic a gallery feels — the pattern tests
  decisions, not feelings, and most of the design work on this project is the latter.
- **Whether a passage means anything.** That is the agent's problem, and the interesting
  one. The harness only guarantees that its answer can be checked.

One honest gap: `core/test-core.mjs` (124 assertions) sits *below* the decision level.
Those are the right tests for a deterministic core, but they are not this harness and
should not be counted as it.
