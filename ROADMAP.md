# Roadmap

What is open, in rough order of value, and what would say each one is done.

This is the only document that schedules work. The specification says what the
Library is and what was built ([`spec/technical-specification.md`](spec/technical-specification.md));
the bug log says how each defect was found ([`docs/BUG-LOG.md`](docs/BUG-LOG.md));
the case study says how the whole thing was made ([`docs/CASE-STUDY.md`](docs/CASE-STUDY.md)).
Where one of those records an unresolved gap, the item below carries the decision.

---

## Where it stands

**Two of the gates need a browser and `npm test` cannot run them.** It says so
when it finishes. [`core/conformance.html`](core/conformance.html) proves the
GPU and the CPU agree about the lattice;
[`core/pagecheck.html`](core/pagecheck.html) proves the pages *work* — that
they boot, that the panel fills, that the keys do something, that neither
threw. Nothing in the Node suite executes either page, and every browser-side
defect this project has had was found by a person looking at one — until §21,
which no person on this hardware could have seen, and which "neither threw"
does not catch.

**And one gate short: the pages are tested on one GPU backend.** §21 was whole
on Windows and blank on a Mac from the same commit, because an over-read of a
vertex buffer is an error on Metal and a shrug on D3D11. `pagecheck` does not
read `getError()`, so a rejected draw call is invisible to it; and even reading
it would have passed on the machine that wrote the bug. A page gate that fails
on a non-empty `getError()`, run on more than one backend before a release, is
the missing piece — it is [R1](#r1-the-page-gate-reads-geterror-on-two-backends)
and it is the last thing between here and a release. Nothing else in this
document is portability work, which is itself the reason it went unnoticed.

Green: **179 core assertions**, **57 gates**, **29 in the browser on two named
backends**, 500 GPU integers, build current
against `core/`. `CORE_VERSION` is **0.6.0**. Walking somewhere on purpose
arrives 197 times in 200 and says why when it does not.

Nothing in the specification is specified-and-unbuilt. What follows is, first,
the short list that stands between this and a tagged release — and after it the
defects, unmeasured costs and reach that do not.

**The Library gained a map.** [`app/babel-atlas.html`](app/babel-atlas.html)
draws the cluster around a cell — 6 cells in every direction and 6 storeys
either way — as low-poly solids you can orbit, slice by storey and filter by
type. It draws the void rather than the rock, and a flight's top is sloped so
its rise reads at a glance. It imports `core/` instead of inlining it, and it
does not ray-march: an SDF answers "what is in front of me", which is the wrong
question for a map. The kit's palette moved to `core/ui-kit.css`, which the
prototype inlines and the atlas links, and four assertions hold the atlas to
the rules the prototype has.

It earned its place immediately: **every reading room was a column**, visible
at a glance as stacks of pale hexagons, because `cellType` is a function of
`(q,r)` and cannot see a floor. Find one and you had found one on every storey.
That is now fixed — see below — and the atlas is what showed it.

**Four defects closed since the last revision.**

*The atlas drew nothing at all on a Mac (§21), and was found by a different
instance on a different machine from a clean clone.* The mark for an
unreachable room made a vertex nine floats; `STRIDE` followed and the vertex
count did not, so every draw asked for 12.5% more vertices than the buffer
holds. D3D11 reads the overrun back as zeroes and draws; Metal rejects the
call, so the page had been blank on every Metal machine since Aug 7 while
looking perfect on the one it was written on. One character, and two assertions
that hold the three numbers together.

*The warp is found and fixed (bug log §19).* A flight's cut runs `STAIR_EXT`
past the cell boundary at each end to meet the neighbour's doorway — including
past **walled** ends, straight through the rock. That is the stair that climbs
into a black hole, and it walked bodies across a WALL edge in 31 of 684
approaches. A flight now extends only at an end that opens, resolved once per
cell in `cellDesc` and read as a constant bit in `mapAt`. Three earlier entries
blamed the topology; none of them had walked up the stairs.

*The link-time budget was measuring Chrome's shader cache (§20).* Any novel
shader text costs ~89 s cold on the development GPU and any text the driver has
seen ~0.2 s, so every link-time comparison anyone had made was cold against
warm. `?fresh=` now forces a cache miss so the number means something.

*Reading rooms are rooms, not columns.* `studyAt(q, r, fl)` decides per storey
at the same 2.1% of cells. The topology is unchanged — proved over 198,744
edges with zero gaps, axes or rises differing — because `openGround`,
`axisEnd` and `gapAt` all treat a reading room exactly as a gallery. It is the
only cell type that could move.

**And vertical traversal was rebalanced**: flights 12% → 9%, shafts 2% → 3%.
Climbing should be something you go and find. The limit is not taste — a shaft
is impassable, so raising its share fragments a storey, and at 4% shafts some
rooms end up more than thirty rooms from any flight that works. 3% is the
frontier where that number is still zero.

---

## Release

**Everything under this heading is finishing, not building.** This is not an
abandoned idea, it is a finished thing that never shipped, and the two have
completely different costs. 63 commits between 2 and 6 August, one on the 11th,
then nothing. 41,762 lines across 39 files; a technical specification, a design
specification, a headless-twin spec, a bug log, a case study and this document;
running from a clean clone on Node 18 with no dependencies — and no version tag,
so it reads as in progress whatever the code says.

**These five come before every item under Open, and nothing under Open is a
release blocker.** The pattern this project keeps hitting is that a burst of new
work replaces the small unglamorous finishing task. R1 is the only one of the
five that is engineering. R5 is the only one that cannot be done here.

**All five are closed as of 12 September, and none of them started a new
feature.** What is left is one `git push origin v0.6.0`, which is David's.

### R1. The page gate reads `getError()`, on two backends — **done, and the obvious version of it did not work**

This is the item [Where it stands](#where-it-stands) has been naming without a
number since §21 closed. `pagecheck` asserts the pages boot, that the panels
fill, that the keys do something and that nothing threw — and **a rejected draw
call is none of those things.** §21 was whole on Windows and blank on a Mac from
the same commit, because an over-read of a vertex buffer is an error on Metal
and a shrug on D3D11. `gl.getError()` would have held `INVALID_OPERATION` on
every Metal machine since 7 August and nothing was reading it.

**Reading it is not sufficient on its own** — on the machine that wrote the bug
the queue is empty, and the check would have passed. The gate is the pair: read
the error queue, *and* run the page on more than one backend before a release.
The second half is what §21 actually cost, and it is cheap now that ANGLE makes
a second backend a command-line flag rather than a second machine.

**Lever:** after driving the frame, drain `gl.getError()` until `NO_ERROR` and
fail on anything in it — the queue holds the earliest error until read, so one
drain after the first frame covers everything since the context was created.
`__render` already publishes `gl`; `__atlas` publishes
`{ pickAt, solidAt, slice, st, lostAt, REACH }` and does not, which is a
one-line change. Record `UNMASKED_RENDERER_WEBGL` in the output so the report
says which backend it ran on — R2 depends on that string existing.

**The second backend, on this machine:** Chrome takes `--use-angle=`, so
`metal` (the default on macOS) and `swiftshader` are the same binary run twice,
each with its own `--user-data-dir` so the flag takes. SwiftShader was expected
to be the strict one and the slow one and is neither: it is the *permissive*
one, which is what made it the useful second backend rather than a formality.

**Done, 12 September.** `pagecheck` drains the error queue on both pages and
fails on anything in it, names its backend, and publishes `__pagecheck` so the
result can be read back rather than transcribed. **29 assertions, green on
ANGLE Metal (Apple M4) and ANGLE SwiftShader (Vulkan).** `__atlas` publishes
`gl` and `frame`; `frame` is not optional — the atlas draws under rAF and
exports its handle before the first one, so the first version of this gate read
an empty queue on boot and passed on everything.

**And the measurement that shaped it, in bug log 21a.** The obvious companion
check — read the pixels, because blank was the symptom — was added on the
argument that it would catch this class on *any* machine, including the one
that wrote the bug. Put §21 back and run both backends:

| | `getError()` | pixels | verdict |
|---|---|---|---|
| ANGLE Metal | `INVALID_OPERATION` | 1 colour | **2 of 29 fail** |
| ANGLE SwiftShader | `NO_ERROR` | 9 colours | **29 of 29 pass** |

SwiftShader is the D3D11 case: it serves the over-read as zeroes, which adds
degenerate triangles at the origin and leaves the lattice **looking entirely
correct**. Not blank — right. **So the second backend is not redundancy, it is
the mechanism**, which is what this document claimed before anyone had a number
for it. The pixel check stays because it catches a different thing: a page that
draws nothing without erroring, which no `getError()` reports.

**`--use-angle=gl` is not available here** — it yields no WebGL2 context at all
on Apple silicon, and the gate fails loudly rather than skipping, which is
correct. `metal` and `swiftshader` are the pair on this machine.

### R2. The conformance harness is visible without running it — **done**

`core/conformance.html` proves the GPU and the CPU agree about the lattice: 500
integers, four lanes a cell, through an `RGBA32UI` framebuffer so they are the
integers themselves and not pixels inspected by eye. **That is a machine
checking another machine's work, and right now it exists only as a file someone
would have to serve and open.** A reader who will not clone the repository
cannot see the one artifact here that is hardest to fake.

**Lever:** capture the rendered output as something that opens with no build and
no server — a committed self-contained HTML page, and a screenshot for the
README. The page already ends by writing `window.__conformance`; the missing
half is the provenance, which is the backend string from R1, the date, and
`CORE_VERSION`. A report that does not say what it ran on is a claim, not
evidence.

**Done, 12 September.** `conformance.html` now prints its backend, its core
version and a timestamp before the result, and carries all three on
`__conformance`. [`docs/conformance-report.html`](docs/conformance-report.html)
is a recorded run — self-contained, no fetch, no modules, opens from `file://` —
**under both ANGLE Metal and ANGLE SwiftShader, 500 integers, zero mismatches on
each.** [`docs/images/12-conformance.png`](docs/images/12-conformance.png) is
that report cropped to the two results, and sits on the README's first screen.

**The image is the thing that carries, not the HTML.** GitHub renders a
committed `.html` file as source, so a link alone would have shown a reader
markup rather than a result. The page is the artifact; the screenshot of it is
what is actually visible above the fold.

### R3. The README's first screen says what this is — **done**

It currently opens on `29^1,312,000`, which is the corpus size, before it has
established what the thing is or why anybody should care. **A reader who does
not already know the Borges story bounces on line three.** The three-command
quickstart is the best thing on the page and it is below two paragraphs of
arithmetic.

**Lever:** lead with what it is and what is unusual about it, keep the
quickstart where a skimmer meets it early, move the arithmetic below. Link R2's
report from the first screen.

**Note, and it is not a style quibble:** the README carries 21 em dashes and is
agent-written throughout, so it is **inadmissible as voice evidence**. It is a
repo document and it can stay agent-written. If any of it is ever lifted onto a
site it gets rewritten first, and the site copy comes from the content plan
rather than from here.

**Done, 12 September.** The README opens on *a world an agent can be tested
against, where a claim about it is true or false as arithmetic*, followed by the
`verify` one-liner, the three-command quickstart, and the conformance image. The
arithmetic moved to **How big it is**, below all of that. Both directions of the
headline claim were run rather than asserted: a true quote exits 0, a fabricated
one exits 2 and prints what the page actually says.

**Three stale numbers went with it** — `npm test` was advertised as 177
assertions in one place and 144 + 52 in another, against an actual 179 + 57, and
the bug log was described as sixteen defects when it holds twenty-one. Wrong
counts in a README are the same failure as an absent tag: they read as a project
that stopped being maintained.

### R4. Tag a release — **done, local; not pushed**

There is no tag. A repository with a dated release and notes reads as shipped;
one without reads as in progress.

**The number is `v0.6.0`, decided 12 September.** `package.json` and
`CORE_VERSION` both already say 0.6.0, and `CORE_VERSION` is stamped on
transcripts because [item 5](#5-rung-6-with-a-real-policy--first-number-taken-distribution-still-open)
depends on a run replaying only against its own lattice. A `v0.1` tag over a
0.6.0 core would put two numbers on one repository that mean different things
and look like they mean the same thing. One number, and the notes carry the
"first tagged release" that `v0.1` was being asked to signal.

**Done, 12 September.** An annotated `v0.6.0` exists with dated notes: what is
in it, the four known-live defects by number, and the four gate counts with the
two backends they were green on. **It has not been pushed** — that is outward
facing and it is David's to make public.

```sh
git push origin v0.6.0
```

The release notes carry the 21a finding rather than just the green ticks,
because "run on two backends" reads as thoroughness until you know it is the
only thing that works.

### R5. What it is called — **decided: an agent benchmark**

The repository described three things at once: a game, a literary tribute, and
**an agent benchmark**. All three are true, and a thing that is three things is
none of them to a reader giving it forty seconds.

**It leads as a citation environment: a world an agent can be tested against.**
Every room, shelf and symbol is a pure function of its address, so a claim about
it is true or false as arithmetic and there is no judge model in the loop. The
game is how you look at it and the Borges story is where the requirements came
from; neither is the headline.

**That framing is why R1 and R2 are the two engineering items on this list**, and
not, say, the frame-time work. `conformance.html` is a machine checking another
machine's work and `pagecheck` is the gate that says the page a reader is shown
is the page that was checked. Under this framing they are the product, not the
scaffolding.

**Done when:** R3's opening is written to it. The wording for anywhere outside
this repository comes from the content plan, not from the README.

---
## Open

### 1b. A doorway into a stairwell that arrives nowhere — **closed, and the diagnosis was wrong**

**Closed by bug log §19, which found a different cause than this item spent
three entries assuming.** The topology was never the defect. `STAIR_EXT` cuts a
flight 0.75 m past the cell boundary at each end to meet the doorway box its
neighbour draws — including past **walled** ends, straight through the rock.
That is both the black hole at the top of the stairs and the displacement:
walking one put a body in the cell behind the wall, 31 times in 684 approaches.
A flight now extends only at an end that opens. 31 → 0 crossings.

**The one-ended flights remain and are staying.** They are ~7% of stairwells,
they are a stair that climbs into rock, and that is a thing the text allows.
What was wrong was that you could walk through the end of one.

<details><summary>What this item argued before, kept because the reasoning
failed in an instructive way</summary>

**The visual half is signed off; the topology half is untouched and is the
serious one.**

**7.3% of stairwells are one-ended** (127 of 1,741 sampled): open to a gallery,
solid rock at the far end, because the corridor beyond runs on a disagreeing
axis and `gapAt` walls that edge by design. The renderer draws the doorway and
an unlit pocket behind it — reported at `floor/307/cell/313,306`.

**The real cost is not visual.** `apply()` refuses the move as a dead end while
the renderer's collision walks you through it, so the seam and the renderer
disagree about where you can go — the §17.10 twin-drift class, on a doorway
7.3% of stairwells have. An agent's transcript and a human's walk diverge at the
same opening, and the citation environment's whole premise is that they do not.

**Lever:** in `gapAt`'s stairwell branch, do not open an axis end unless the
opposite end is open. This lands on the hottest path in the shader
(`cellDesc` → `gapAt` ×6, per cell per ray), so measure link and frame before
and after — see 1c. Cheaper half: leave the topology and stop *drawing* a
doorway whose far side is rock.
**Done when:** no gallery advertises a passage into a stair that cannot be
crossed, and the seam and renderer agree on every such edge.

<details><summary>The visual half, closed 6 Aug 2026 — three mechanisms, none of them the first diagnosis</summary>

Closing item 1 removed the rings that had been painted over these openings and
left a black rectangle behind them, which turned out to be **three** defects
wearing one coat. None was "a stairwell is dim", which is what it looked like:

1. **Downward-facing stone had no path to light at all.** Every stairwell lamp
   sits above the flight, so `max(dot(n,L), 0)` gives a soffit nothing; the
   near-vertical stone lift is gated `horiz > 0.80` and an underside's is ~0.01;
   and `main()` quantises luminance to **six levels**, so below `lum ≈ 0.1`
   everything floors to step 0, and step 0 is `sub * 0.05`. **There is no dim
   setting in this renderer** — a surface is legible or it is a hole. Fixed with
   a floor bounce tapered on `(1 - lum)` so it cannot flatten a lit ceiling,
   plus the stairwell spill raised to the shaft's magnitude with the bias
   inverted. Doorway interior RGB (1,2,1) → 15–24; frame below luma 6, 21.2% →
   5.2% and 29.2% → 1.1%. `?ablate=nobounce,dimstair`.
2. **The remaining patch was a hue difference, not a brightness one.** The wall
   inside a gap measured luma 18.9 against 21.1 beside it — contrast 1.12 — but
   `tint = mix(green, warm, lit)` put it at `lit` 0.17 against a wall at 0.90.
   Dominant colours 16,21,12 against 24,23,15: a green panel in a warm-grey
   wall. Cold end pulled to `vec3(0.94, 1.00, 0.80)`, R/G gap 0.250 → 0.143.
   **A palette deviation from V-01 Verdigris Damp, recorded as one.**
   `?ablate=tintgreen`.
3. **The lit-knee floor**, which helps dim *near-vertical* stone and could never
   have reached the soffit — `horiz` there is 0.042 and the lift is gated at
   0.80. A four-setting sweep moved the patch by 0.02 luma. `?ablate=hardknee`,
   and the rejected settings as `knee50,kneelow,kneeboth`.

**Shipped after all: the reveal as its own material (option A).** I measured it
at 16-36% of a frame — **a figure the performance review later showed was
harness, not shader: it is free** — judged it visually indistinguishable from my own
screenshots, and moved it to a branch. The reporter had been looking at the
running build while it was live, and it was the version they signed off:
*"the gaps were finally looking good and you changed them back."* Restored to
main. Both halves of my reasoning were wrong: the cost was a harness artefact,
and the judgement that it made no visible difference was mine to make from a
screenshot and should not have been. `?ablate=noreveal` switches it off.

Its findings stand either way, and are in bug log §14 — particularly that
hoisting the test out of `mapAt` into `shadeHit` measured *dearer*, at the call
site that runs fifty times less often. That comparison was taken with the same
faulty harness, so treat it as an open question rather than a result; what is
solid is that removing the loop entirely, A/B'd inside one page load, changes
nothing.

**What actually located it:** the reporter saying that every screenshot had been
of the same surface. Four sessions of image-differencing never established what
the camera was pointed at. `?ablate=where` now answers that in one page load.

</details>

</details>

### 1c. The shader takes 89 seconds to link on a cold cache

**This item used to say the shader had no link-time headroom. It had less than
that: the numbers it was built on were measuring Chrome's program cache** (bug
log §20). Any novel shader text costs ~89 s cold on the development GPU and any
text the driver has already linked ~0.2 s, so the "instant" baseline every
comparison used was a cache hit and every candidate was a miss.

**`?fresh=<anything>`** now appends a unique comment to the fragment source, so
a link can be made cold on purpose and two variants compared honestly — both
fresh, or both warm, never one of each. `window.__linkMs` reports the link
alone rather than `loadEventEnd`.

**Where the 89 seconds goes**, each row a genuine cold link:

| shader | cold link |
|---|---|
| as shipped | **89.2 s** |
| `ablate=nobounce` | 92.6 s |
| `ablate=noshelf` | 66.5 s |
| `ablate=nofurn` | 64.6 s |
| `ablate=noshelf,nofurn` | **40.1 s** |

Shelving and furniture are **55% of the link** between them and compose almost
additively. Both live inside `mapAt`, which ANGLE inlines at **eight** call
sites, so the cost is geometry detail multiplied by how many places the field
is sampled. The mirror's second bounce — §15's original 127-second link — now
costs nothing, which confirms the `uBounce` fix held.

**The frozen tab is fixed even though the wait is not.** The prototype's script
is a module, so it runs deferred and the veil is painted before any shader work
starts; `KHR_parallel_shader_compile` lets the driver link on its own thread
while the page polls a frame at a time. A first load now stays responsive and
says *"Building the Library — 43s. This happens once on a machine; after that
it opens at once."*

**The obvious lever was tried and is not one.** Giving `aoCtx` a coarser field
would remove three of `mapAt`'s eight call sites. Measured before building:
baseline **97.3 s**, `ablate=occ` — AO removed entirely, which is more than a
coarse field would do — **118.5 s**. Removing three of eight call sites makes
the link **22% worse**.

That corrects the model. §15 concluded that link time tracks call sites, from a
case where it did. The bisect says removing *geometry from mapAt's body* helps
and removing *call sites of mapAt* hurts. Neither is a rule; only an A/B
settles it, and `?fresh=` makes an A/B cheap.

**Lever:** P1 below — make the shelving cheaper to express rather than cheaper
to call. It is 41.3% of a gallery frame and roughly a quarter of the link, and
the bounding that closed the furniture half is the shape of it.
**Done when:** a cold link is short enough that a public demo link is honest,
and a change that lengthens it fails a test rather than a session.

### 1d. Bad normals rise with range, cause unknown — **closed: they do not**

**0.72% at 0–3 m against 3.45% at 3–6 m**, measured with `?ablate=nydist` on a
single view. Real, reproducible, and unexplained.

**The obvious theory is wrong and is already tested.** The march tolerance is
proportional to range (`0.00018 * t + 0.00012`) while `normalCtx` probes a fixed
±1.6 mm, so the two cross over at about 8 m — but at 3–6 m the tolerance is
0.84–1.20 mm and the probe is still the larger of the pair. Scaling the probe to
track the tolerance (`?ablate=normeps`, rewritten against the shipped tolerance)
moves 3.45% to **3.35%**. Not the cause.

**Closed on the second of its own two outcomes: the rise is an artefact of the
view.** Ten views were chosen by walking the lattice for galleries with four to
eight open cells in an unbroken run along one axis, so a ray genuinely travels,
and binned with `?ablate=nydist` at a matched 1280×773. **The share falls from
0–3 m to 3–6 m in nine of the ten.** Per view the 3–6 m band ran 0.06% to 4.11%
against a 0–3 m band of 2.31% to 7.57% — the sign of the trend is a property of
the view, not of the range.

**Two caveats kept with it.** The bad-normal test used here is `|n.y|` between
0.12 and 0.88, which is this measurement's definition and not provably the one
that produced 0.72 and 3.45, so only the *trend* is comparable, not the
absolute figures. And it is **not** [§22](docs/BUG-LOG.md): putting the
single-slot shelving field back moves these bands by 0.00–0.42 points. Two real
defects, unrelated. Working in [bug log §23](docs/BUG-LOG.md).

### 1e. What the reader pays, now measured — **first cut taken**

The environment's cost to an agent is **output, not compute**. Measured: a
24-step journey is **1.2 ms** of hashing, behind a 5 ms module import, behind
a ~75 ms Node start. The Library is about 1.5% of the wall clock of a command,
and batching or daemonising the CLI would save time nobody is waiting on.

What is actually spent, and where:

| | bytes | ~tokens |
|---|---|---|
| one `observe()` in a gallery | 621 | 155 |
| one `observe()` **holding a page** | 3,924 | 981 |
| a 24-step journey, as JSON | 7,193 | 1,798 |
| **a 60-step excursion, all 44 observations** | **70,812** | **17,703** |

**The page block is the cost.** A page-holding step is 6× a room, and a model
pays an observation on *every* step while a journey is paid once. It is also
irreducible: the agent has to read the page to cite a line of it, and cutting
it would be cutting the task.

**First cut, taken:** `take` defaults from 3 to 1. A journey offered three
volumes at every stop — 37 candidate addresses over 24 steps, for a task that
cites about 7 — and those addresses were a quarter of a wander's bill whether
or not any was opened. A journey is now 7,193 bytes against 10,762, and the
CLI's text output 3,387 against 5,231. One volume still makes a stop citeable,
which is the job.

**Deliberately not done:** shortening the addresses themselves. The repeated
`babel://walk/00001594/` prefix is 15.6% of a wander's output and stripping it
would make the reader reconstruct an address to cite it — and any slip there
is scored by `verify` as a false citation. That would manufacture integrity
failures with nothing to do with the reader's honesty, in the one environment
whose whole claim is that a false citation means something. Cheaper output is
not worth polluting the measurement.

**Held by budgets, not by intent.** `WHAT THE READER PAYS` in `test-run.mjs`
asserts each of the numbers above stays under a ceiling. They may get cheaper
freely and get dearer only on purpose — without that, "the output got fat" is
something somebody notices a year later, which is exactly how the shader's
link time went unmeasured (§20).

**Open:** the excursion figure is one honest policy on one route. A
distribution across policies would say whether 17,700 tokens is typical or a
best case, and item 5 already wants that harness run for integrity.

### 1f. Corridors are still columns — **measured, costed, not started**

The reading rooms moved; corridors did not, and the same argument applies to
them: a hallway running unbroken through every storey of an infinite building
is an architectural claim nobody made.

**The clustering half of the complaint is not real, and that is worth writing
down before somebody chases it.** Over 58,081 cells at 9.79% corridors, the
mean number of corridor neighbours a corridor has is **0.581 against 0.587
expected** if they were placed independently, and the whole distribution fits
the binomial:

| corridor neighbours | observed | expected |
|---|---|---|
| 0 | 3,098 | 3,064 |
| 1 | 1,957 | 1,994 |
| 2 | 544 | 541 |
| 3 | 82 | 78 |

75% are singletons and the largest cluster anywhere in the sample is 9 cells.
The hash is placing them independently. **What looks like clustering is the
columns**: in a thirteen-storey view the same 10% of positions repeat on every
floor and read as continuous vertical slabs. One cause, two symptoms — which is
convenient, because one fix addresses both.

**The invariant that governs the change: `axisOf` must stay floor-independent,**
or a flight changes direction between storeys and everything about stairs
assumes it does not. Reading rooms were free because `openGround` treats a
study exactly like a gallery; corridors are not, because `axisEnd` returns 0
for a corridor where it returns 1 for a gallery, and `gapAt` has a corridor
branch.

The split that survives it: **`cellType(q, r)` returns the structural class —
shaft, stairwell, or open — and a floor-aware refinement picks gallery, study
or corridor among the open ones.** Then `openGround` is invariant by
construction, `axisOf` never moves, and `gapAt`, `corridorAxis` and `axisEnd`
take the floor they mostly already have. It generalises the reading-room split
by one step.

**§19 already built half of it.** Per-floor stairwell doorways are handled now —
`stairExtends` and `stairCrossable` take a floor and `cellDesc` packs bits 15-16
per cell per storey — so a corridor that exists on one storey and not another no
longer produces the walk-through-a-wall defect it would have a week ago.

**Cost:** `vectors.json` regenerates and routes move, which is a bigger change
to the agent's world than the reading rooms were. `corridorAxis` and `axisEnd`
gain a floor. `marchRay` and `shadeHit` need the refined type rather than
`cellType`, because `ctype == 4` drives a whole geometry branch and the
desc-bit trick that worked for studies will not work here.
**The risk to watch is link time:** `corridorAxis` is the most-inlined function
in the program, and reaching it from `gapAt` is what made §18's topology fix
unaffordable. Threading a floor adds no call sites, so it may be free — measure
cold with `?fresh=`, both fresh.
**Measure before committing:** rooms with no working flight inside thirty and
mean walk to one, the same metric that settled the 3%/9% rebalance; the
stairway-in-the-hallway rate, which LIB-P-022 cares about; and the atlas as
the acceptance test — isolate corridors over thirteen storeys and confirm the
slabs are gone.
**Done when:** a corridor is a fact about a room on a storey, no flight's
doorways vary in a way the seam disagrees with, and nobody is further from a
way upstairs than they were.

### P1. Bound the shelving and the furniture before evaluating them — **furniture done, the two exact wins taken, the casework itself open**

**Shipped: exact group bounds on `furniture()` and `alcoveFixtures()`.** Every
piece is anchored to one wall, so the whole set lies in a known box about that
anchor — `x [0.87, 1.82], y [0, 1.87], z [-0.69, 0.93]` for the furniture,
`|u| <= 0.30, |v| <= 1.24, y [0, 1.82]` for the alcoves. A box containing the
geometry is never further away than the geometry, so if the distance to the box
already exceeds the caller's best, nothing inside can win. Culling against the
caller's `d` rather than a fixed margin is what makes it **exact**: it changes
which samples are evaluated, never the field.

**A reading room is 8.6–12.5% faster and the render is pixel-identical** — FNV
checksums over the whole buffer match on all three test views. The corridor
bound measured within run-to-run noise (its timings vary ~8% between page
loads) and is kept because it is exact and cannot hurt.

**The shelving is now instrumented, which is what this item asked for first.**
`?ablate=shelfwork` renders three counters instead of the scene, accumulated
over every `mapAt` call in a pixel — so the march, the four normal taps and
the three ambient probes are all counted. In a gallery, per pixel:

| | per pixel |
|---|---|
| samples reaching the shelving section | **23.6** |
| ...taking the deep-inside early-out, doing no casework | 8.4 (36%) |
| ...reaching a wall's casework | 9.4 |

**So the early-out is already doing its job and the cost is where this item
predicted: 64% of shelving samples are in the near-wall band and run the full
path.** Better culling is not the lever. Two specific costs are now visible:

1. **The wall-selection loop runs 6 iterations on ~15 samples a pixel** —
   about 91 dot products per pixel — to pick two walls.
2. **The casework loop iterates 6 times to run 2 bodies.** That one is
   exactly replaceable: `for (int k = 0; k < 2; k++){ int i = k == 0 ? w1 : w2; ... }`
   is the same walls, the same work and the same field, in two iterations
   instead of six, with the body written once — so it does not duplicate the
   body the way §15's 127-second link did.

**Done: the casework loop walks two walls instead of six.** The selection loop
has already named the only two that can matter, so walking all six again to
skip four was four iterations of nothing on ~15 samples a pixel. The body is
written once and indexed, not unrolled into two copies — the shape that cost
§15 a 127-second link. `?ablate=sixwalls` restores the old loop.

| | frame, 621×458, div 1 |
|---|---|
| six-wall | 0.814 ms · 0.807 ms |
| **two-wall** | **0.764 ms · 0.757 ms** |

**About 6%, and the buffer is bit-identical** — `b0aa9848` both ways at a
pinned clock, same canvas, same view, two independent runs each.

**Three harness facts this cost, all of which would have produced a wrong
answer.** They belong with the review's own note about the readPixels stall.

1. **`gl.finish()` is not a sync.** It returned in 0.007 ms having stalled on
   nothing, which would have reported the shader at 140,000 fps. One
   `readPixels` per batch of 14 is the stall.
2. **The canvas moved between two measurements** — 565×416 to 621×458 — and
   turned a 6% win into a 17% regression, because 21% more pixels is 21% more
   work. The review says never compare across canvas sizes; this is what that
   looks like when you do.
3. **A checksum across two page loads measures the clock.** `uMotion` drives
   the lamps off `uTime`, so two frames of the SAME build a moment apart
   differ in 22 of 300 tiles. That convicted this change of moving 21 tiles,
   and a control — one build, two timestamps — showed it moved none. **Pin
   the timestamp or the checksum is noise.**

**Done: the wall selection takes three dot products, not six.** The six wall
normals are three opposite pairs — `dirW(i + 3)` is exactly `-dirW(i)`, which
the suite now asserts because it is a property of a table and tables get
edited — so the far wall's projection is the near one negated, and negation is
exact. No approximation, and no angular pick with a fallback for doorways: the
loop still walks 0..5 in order, because `w1`/`w2` are chosen with a strict
`>` and reordering would resolve a tie to a different wall.

| | frame, 621×458, div 1 | checksum |
|---|---|---|
| six-dot | 0.764 ms | `b0aa9848` |
| **three-dot** | **0.721 ms** | `b0aa9848` |

**Bit-identical and about 6%.** `?ablate=sixdots` restores the six.

**The shelving half of P1, end to end: 0.814 → 0.721 ms, about 11%**, in two
exact steps that leave the buffer unchanged. Both medians are separated by
more than the step between them but their ranges overlap, so the confidence
comes from the changes being *exact and strictly fewer instructions* rather
than from the timing alone — which is the right order for this shader, where
removing work has twice measured slower.

**A fourth harness fact, and the one that cost the most.** The browser window
changed size three times mid-experiment, silently, each time invalidating both
the checksum and the timing. Pin the canvas in CSS — `cv.style.width` — rather
than trusting the window: `resize()` computes the backing store from
`clientWidth`, so a fixed CSS size makes a measurement independent of whatever
the window is doing. Flush layout before reading `cv.width`.

**The bound this item was originally about was built, measured, and removed.**
Every piece in the casework loop lies in one slab about `cx` along the wall
normal — the uprights, board and plinth by construction, and the deepest
volume because `BOOK_D` is 0.20 against `CARC_D`'s 0.26 — so a cull in
**depth** is exact, cannot lie, and skips three `sdBox3` and a hash when it
fires. It was the missing axis: the existing cull tests *along* the wall, and
nothing tested across it.

**0.700 ms against 0.700 ms.** Bit-identical, and worth nothing.

That is the third time removing work from this shader has measured neutral or
worse — `onelamp` made every view but one *slower*, `aoCtx` cost 22% more link
time, and now this. The rule that falls out is asymmetric and worth stating:
**a change that ADDS a test to `mapAt` needs a number; a change that removes
work does not.** The two that shipped are strictly fewer instructions and
bit-identical; this one is more instructions on the chance of skipping some,
and the chance did not pay. Reverted, with the reasoning left at the site so
the next person does not rediscover the idea and assume it is untried.

**So the shelving is where the two exact wins left it: 0.814 → 0.721 ms.** The
9.4 casework evaluations a pixel are real geometry, and this shader is
evidently not bound by the arithmetic that count suggests. Anything further
should start by finding out what it *is* bound by — bandwidth, occupancy,
divergence — rather than by removing more instructions, because three
attempts now say instructions are not the currency.

**Still open: the shelving**, which is the larger half at 41.3% of a gallery
frame. Its existing `dh < -(CARC_D + 0.24)` early-out is already the same idea,
so the cost is in samples *near* a wall — where the hit point, its four normal
taps and its three ambient probes all land. Cutting it means making the
near-wall path itself cheaper, not culling more of it.

**The two biggest costs in the renderer, and the same shape.** Measured by
ablation: the shelving case is **41.3% of a gallery frame** and 21.1% of the
mean; furniture and fixtures are **30.1% of a reading room** and 19.2% of a
corridor. Both are evaluated on *every* `mapAt` sample inside a cell, and
`mapAt` runs 18–29 times a pixel — so the multiplier is ~25.

Neither needs to run for most of those samples. A ray crossing the middle of a
gallery is nowhere near a shelved wall, and one crossing a reading room is
usually nowhere near the furniture group, which is anchored to a single wall.

**Lever:** a cheap conservative bound first, the exact case only inside it.
The shelving already has the shape of this — the `dh > 0.24` early-out returns
distance-to-the-front-of-the-case — so the question is why the exact path still
costs what it does; instrument which samples take which branch before widening
anything. For furniture, the group's extent is known per cell and could go in
`desc` (§17.13's packed int) as a bounding radius about the anchor wall.

**Caution, and it is the whole difficulty:** `?ablate=onelamp` *removed* six of
seven lamp cells and made every view except the stairwell **slower**. Removing
work from this shader is not reliably cheaper. Any change here is a hypothesis
until A/B'd inside one page load, and §15's link budget applies to all of it.
**Done when:** a gallery and a reading room are measurably cheaper at a pinned
`st.div`, with the render unchanged pixel-for-pixel outside the intended area.

### P2. The auto-scaler's floor, not the shader, is what fails on a weak device — **done**

**Shipped: the floor is 1:4.** One bound, `st.div < 3` → `st.div < 4`. The
constraint on it was that the dither must land on whole pixels, which needs an
integer divisor — 4 satisfies that as well as 3 did. It buys a slow device
another 1.8× of headroom before the scaler runs out of moves.

**Untested where it matters:** everything below is still measured on one GPU.
The curve is what predicts other devices, not a reading from one.

Frame time is linear in pixels with a negligible intercept — **4.81 ns/px plus
0.39 ms** on the development GPU, so ~4.8 ms at 720p and ~10.4 ms at 1080p at
1:1. The auto-scaler trades resolution against frame time between 1:1 and 1:3.

A device 3× slower therefore holds 60 fps at 1080p by dropping to 1:2, and one
8× slower needs 1:3, which is the current bound. **Below that the scaler has
nothing left to give**, and the bound was chosen so the dither never lands
between pixels rather than for any performance reason.

**Lever:** allow 1:4, and check what the ordered dither does there — the
constraint is integer divisors, which 4 satisfies. Also worth measuring on
something that is not this GPU before assuming the curve holds.
**Done when:** the scaler has been exercised on a genuinely slow device, or the
floor is raised and the dither is verified at 1:4.

### P3. A conservative stone field would cut march steps ~20% — **done, and the premise was wrong**

**Shipped: the march step is 1.00.** The plan was to make the field
conservative *first* and then raise the step. Measuring first showed the field
did not need the work: at a full step the bad-normal share is unchanged or
better on every view tested, including the three the reporter sent, where mean
normal error *fell* (0.0144 → 0.0108, 0.0118 → 0.0086, 0.0091 → 0.0079).

| | steps/pixel at 0.80 | at 1.00 | fewer |
|---|---|---|---|
| shaft | 10.0 | 6.8 | 32% |
| corridor | 15.1 | 11.2 | 26% |
| stairwell | 14.3 | 10.7 | 25% |
| gallery | 18.6 | 14.4 | 23% |
| reading | 20.8 | 16.6 | 20% |

**20–32% fewer `mapAt` calls on the march, for 5.1% of the frame** (2.3–9.9%).
The gap between the two is the fixed 8 shading probes, which do not change, and
the fact that the shader is not purely ALU-bound. `?ablate=march80` restores the
under-relaxation.

**What this retires:** the under-relaxation was there because the field
over-reports somewhere, and four sessions treated the step as the mottling knob.
§13 established the mottling was the tolerance instead; with that fixed, the
margin the step was buying is no longer needed. A conservative `mapAt` is still
the right thing for its own sake — it is what would let the *tolerance* loosen —
but it is no longer blocking a performance win.

The march averages 18.6 `mapAt` calls a pixel in a gallery and 20.8 in a
reading room, against a fixed 8 for the normal, ambient probe and material. It
runs under-relaxed at `t += d * 0.80` because the field over-reports, so roughly
a fifth of those steps are the safety margin.

This is the same "make the stone path of `mapAt` conservative" that §13 has
wanted twice. What the review adds is the size of the prize: **~20% fewer
`mapAt` calls everywhere**, which compounds with P1 rather than competing.

**Done when:** the step scale is back at 1.0 with no overshoot, measured by the
bad-normal share from §13's metric, not by eye.

### 2. A 160 ms worst frame, uncharacterised — **did not reproduce in 6,895 frames**

Seen on the reporter's own panel while the mean sat at 8.1 ms. This
repository's own method says a mean is the wrong instrument for a stutter, and
here we have only the mean explained.

**Measured, and it does not reproduce here. 6,895 frames over three sessions,
worst 22.3 ms.** All three named suspects were visited on purpose — a reading
room, the mirror alcove, a stairwell climb — plus a journey, the reading pane,
and three forced `resize()` reallocations between 1:1 and 1:4. A
`PerformanceObserver` on `longtask` recorded **nothing over 30 ms in any
session**, which strikes off the route BFS, the reading pane and the panel: they
are main-thread work and main-thread work was not happening.

One session's median was **7.9 ms against the report's 8.1 ms mean**, so this is
the same regime and not a faster machine hiding it.

**This stays open, downgraded, and it is not fixed.** A 160 ms gap with no long
task is a GPU or compositor stall, and what produces one — another driver, a
display mode change, another application taking the GPU — is outside what this
harness can see from here.
**Done when:** it is measured on the reporter's machine, or it is agreed in
writing that a spike nobody can reproduce in 6,895 frames is not worth carrying.
Distribution in [bug log §23](docs/BUG-LOG.md).

### 3. The corridor changes cost 13% of a frame

Raising corridors to 10% and restoring the richer axis rule took a gallery
from 6.58 ms to 7.45 ms at 1550×945.

**Lever:** hoist `corridorAxis` out of `cellDesc`'s six `gapAt` calls — but
that means stating the corridor's gap rule twice, which is the thing `core/`
exists to prevent (§17.10). Weigh that before taking it.
**Cheaper alternatives:** fewer corridors, or back to the flat axis rule at
the price of one-ended corridors going 2.7% → 7.2%.
**Done when:** a gallery is back under 7 ms, or the cost is accepted in
writing and this item closes as won't-fix.

### 4. Rippled chunks missing from a book's cover, seen from the side — **fixed**

**It was still there, and it was not the overshoot family this item guessed at.**
`shelfDist` sampled exactly one slot per wall — the nearest by lateral index —
and a book does not fill its slot: it is `BOOK_W*0.90` in a `BOOK_W` pitch, it
stands proud by a depth that varies by up to 0.04 m, and 3.5% of slots are empty
and contribute nothing. So the distance **over-reports**, and `t += d * 1.00` on
an over-reporting field steps a ray past the surface. Head-on that is invisible;
at a grazing angle the ray runs almost parallel to the spines and the same
0.04 m sweeps a long way along the wall, taking a chunk of cover with it.

**Fixed by evaluating the nearest slot and its two neighbours**, min'd. Three is
enough and four is unnecessary: two pitches is 0.104 m, already more than the
largest depth step. Full working in [bug log §22](docs/BUG-LOG.md).

**Measured, matched at 1280×773, medians over 80 driven frames:**

| | long sightline | short | short |
|---|---|---|---|
| one slot, as shipped | 13.10 ms | 6.50 | 6.50 |
| **three slots, shipped now** | **13.70** (+4.6%) | 7.40 (+13.8%) | 7.20 (+10.8%) |
| step scale 0.80 instead | 15.00 (+14.5%) | 6.50 (0%) | 6.50 (0%) |

Both cure it. The step-scale cure was rejected because its cost lands on the
**long** view, which is the one that sets the auto-scaler. `?ablate=book1` puts
the single slot back and the tearing returns.

**The defect was much larger than this item said.** It described the edge of a
volume at a grazing angle; the before-and-after lifts mottling off *every spine
in the room*, including walls being faced squarely. The grazing angle was where
it was visible enough to report, not where it was happening.

**Renderer 1.0.0 → 1.1.0.**

### 5. Rung 6 with a real policy — **first number taken; distribution still open**

Done: `modelPolicy` puts a language model at the same `actions()`/`apply()`
pair the fuzzer uses, `runEpisodeAsync` runs it, and `agent-play.mjs` gets the
same measurement with no key and no install. Two new gates hold the harness to
account — the page a reader is shown is the page the oracle checks (160 of 160
mechanically-composed citations verify), and the async loop produces
byte-identical transcripts to the sync one.

**The first reading: integrity 1.000, 7 claims, 7 verified**, unassisted —
Claude Opus 5 over route 1941, transcript in
[`runs/opus5-route1941.json`](runs/opus5-route1941.json), full caveats in
[`core/RUN.md`](core/RUN.md). One reader, one route, seven claims, and a reader
that knew it was being scored: a ceiling, not a typical case.

> **That transcript is stamped `0.5.0` and the core is now `0.6.0`, so it no
> longer replays** — reading rooms moved off their columns and the shaft and
> stairwell shares changed, which moves the rooms the route passes through.
> It is kept as the historical artefact it is rather than quietly re-recorded,
> because the rule that a run replays only against its own version is the
> reason the version is stamped on it at all. The distribution below should be
> taken under 0.6.0 and will supersede it.

**Still open, and now cheap:**
- **A distribution.** `node core/run-model.mjs --n 20 --baselines` puts a model
  row beside `honest` / `fabricator:3` / `adversary` on identical start points.
  Needs `ANTHROPIC_API_KEY` (or `ant auth login`) and
  `npm install @anthropic-ai/sdk` — the only thing in this repository that
  needs either.
- **The assisted/unassisted gap.** The skill tells a reader to run `verify`
  before claiming. The number above is what happens when it does not. The
  difference between the two is the value of the discipline, and nobody has
  measured it.
- **Weaker readers.** `--model claude-sonnet-5` and `claude-haiku-4-5` on the
  same routes is where a spread would first show up. 1.000 from one reader
  says the oracle works; it does not say the task is hard.

**The four refusals are the finding nobody predicted.** In 36 steps the reader
named a wall with no doorway four times — the `adversary` path, walked into by
a real reader that had the ways-out list in front of it and did not read it.

### 6. Mouse capture done properly

What ships today is an imitation — hidden cursor and edge-turning — and the
user was right that it *"doesn't feel totally legit"*. Real pointer lock is
impossible inside an artifact frame, which is sandboxed without
`allow-pointer-lock`; served at top level it already works.

**Lever:** once this has a durable home outside the artifact frame, delete the
imitation rather than build on it.
**Blocked on:** where this lives.

### 7. The last hand-written mirror — **closed**

The hash deciding which slots the Purifiers emptied lives inside the shader's
`mapAt`, too entangled with the SDF to extract as it stands, so
`volumePresent()` in `core/babel-core.mjs` is a hand-written twin guarded only
by a statistical test (3.52% empty over 1.8 million slots). That test would
catch a broken mirror, not a subtly different one — and a subtly different one
is exactly what the GLSL/JS split produced twice before (§17.10).

**Closed 12 September, on exactly the trigger this item named** — `mapAt` was
opened for item 4, and the shelving loop is where the twin lived.

`core/babel-glsl.mjs` gains a `VOLUME_GLSL` block (`volumeBits`, `volumeHash`,
`volumePresent`, `volumeDepth`, `volumeTint`), spliced into the shader at
`@glsl-volume` like the other three generated regions. `core/vectors.json`
carries **51 shelf slots**, and `core/conformance.html` compares four lanes each
on the GPU: **500 integers → 704**.

**The tint was worse than un-mirrored — it was unknown.** The shader read bits
16–31 of the same hash for a spine's colour and the core did not know the field
existed, so nothing could have checked it even in principle. It has a twin now.

**And the first version of this check was vacuous**, which is recorded in
[bug log §24](docs/BUG-LOG.md) because it rebuilt the very weakness this item
was written about. It passed 700 of 700 on a shader whose threshold had been
moved from `0.035` to `0.0351`: no sampled slot sat near the boundary, so
nothing flipped. Fixed by pinning the two slots closest to the threshold from
either side — 0.034988403 and 0.035003662. A deliberate drift now costs 1
mismatch, named by slot; a one-digit change to a mixing constant costs 118.

**What it does not claim:** "single-sourced" here means what it means elsewhere
in this repository — the GLSL has one home and is checked against the JS. It is
still two spellings. What changed is that neither is hand-typed into the shader,
and every lane is compared on the GPU.

### 8. Tune how often a mirror turns up

One cell in 52 is a third guess, not a measured answer to anything. A wander
meets a mirror on 189 routes in 200, median step 56.

**Lever:** the frequencies are named constants and one kit table in
`babel-core.mjs`; moving them moves nothing else.
**Done when:** somebody decides what rate they want and says why.

### 9. The floorboards give out 12,604 storeys up — understood, not scheduled

Explained rather than fixed, at the reporter's request. Above y = 2¹⁵ m the
float32 ULP exceeds the normal-probe epsilon, `p.y + 0.0016 == p.y`, and the
floor's vertical normal collapses — so the one surface identified by `n.y`
loses its material while everything else, keyed on x/z, carries on. Exact
threshold and table in bug log §16.

**No floor cap should be enforced:** LIB-A-013 and LIB-A-020 require unbounded
floors, and the lattice genuinely is — this is a renderer coordinate choice.
**If it is ever wanted:** march in camera-relative Y, and precision tracks
distance from the viewer rather than altitude. Hard ceiling either way is floor
6,452,775, where y reaches 2²⁴.

### 10. A Three.js port, if a durable build is ever wanted

Not scheduled. Recorded so the question does not have to be re-asked: the
lattice and the corpus are already portable — `core/` has no renderer in it,
and `core/vectors.json` plus `core/conformance.html` are how a second renderer
would prove it agrees. The work is the SDF, not the Library.

---

*This paragraph used to say that 1b, 1d, 2 and 4 were live defects. **None of
them is, and 1b had already been closed by §19 when that sentence was last
rewritten.** 4 is fixed (§22). 1d was measured and the effect it describes does
not exist (§23). 2 did not reproduce in 6,895 frames and stays open only as a
report from another machine (§23). 1b's invariant was re-checked over 73,685
flights across five storeys — zero cuts past a wall, zero disagreements between
the gap and the bit the shader reads — at twenty-five times the sample the test
suite carries.*

*What is actually live: **3 and 7 are debts with a known price. 9 is understood
and deliberately parked. 5 has started returning numbers, and is the only one
that tells us something the Library itself does not.** 1c gates 3, which touches
the gap path, and the link budget is nearly spent.*

*Every defect here has an entry in [`docs/BUG-LOG.md`](docs/BUG-LOG.md) carrying
what has already been ruled out and with what measurement. Start there, or the
first two theories will be ones that have already died.*

*And none of them is a release blocker. R1 through R4 are an afternoon; R5 is a
decision. If work on this repository resumes and the first thing it touches is
an item on the Open list, that is the failure mode this section was written to
name.*
