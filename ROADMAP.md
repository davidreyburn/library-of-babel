# Roadmap

What is open, in rough order of value, and what would say each one is done.

This is the only document that schedules work. The specification says what the
Library is and what was built ([`spec/technical-specification.md`](spec/technical-specification.md));
the bug log says how each defect was found ([`docs/BUG-LOG.md`](docs/BUG-LOG.md));
the case study says how the whole thing was made ([`docs/CASE-STUDY.md`](docs/CASE-STUDY.md)).
Where one of those records an unresolved gap, the item below carries the decision.

---

## Where it stands

Green: **144 core assertions**, **52 gates**, 500 GPU integers, build current
against `core/`. `CORE_VERSION` is **0.5.0**. Walking somewhere on purpose
arrives 197 times in 200 and says why when it does not.

The corridor closed §9.3, the last part of the specification that had been
written and not built: the hallway is a cell type, about 1 cell in 11, with a
mirror, a latrine or a standing closet in alcoves off it, and a flight of
stairs at the end of 1 in 5. LIB-P-020, 021, 023 and 024 are met. LIB-P-022 —
the stairway *inside* the hallway — remains deviated for the same reason
stairs got their own cells in the first place (§17.1, T-4).

Nothing in the specification is now specified-and-unbuilt. What follows is
defects, unmeasured costs, and reach.

**The wall mottling is fixed** and item 1 has closed after four sessions on the
wrong knob. `marchRay`'s termination tolerance was ten times too loose — the
step scale, which every previous attempt adjusted, controls how fast the march
*approaches*; the tolerance controls where it *stops*, and the residual the
normal probe stands on is set by that. One literal, `0.0018 * t + 0.0012` →
`0.00018 * t + 0.00012`, with the step restored from the interim 0.60 to 0.80.
Bad normals on the reported wall **46.04% → 0.34%**, cost neutral within ±2%.
`?ablate=looseeps` brings the defect back. Bug log §13 is now in Closed, with
the two harness faults that made its earlier numbers untrustworthy and the
retraction of a "−30% frame time" that was one of them.

**And the wall patch is signed off too** — *"what I am seeing currently looks
pretty good; the gaps appear dark."* It took two further mechanisms after the
tolerance, neither of them brightness: downward-facing stone had no path to
light at all, and the reveal differed from the wall beside it in **hue** rather
than luminance (contrast 1.12, but green against warm-grey). What finally
located it was the reporter saying which surface every screenshot had been of.
`?ablate=where` and `?ablate=nydist` now render geometry instead of shading, so
that question costs one page load.

---

## Open

### 1b. A doorway into a stairwell that arrives nowhere

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

**Rejected on cost, kept on branch `reveal-material`:** tagging the reveal as
its own material (option A). It works and the tag lands correctly, but costs
**16–36%** of a frame for a render that is visually indistinguishable at the
views it was built for. Its findings outlive it — see bug log §14, particularly
that hoisting the test out of `mapAt` into `shadeHit` made it *dearer*, at the
call site that runs fifty times less often.

**What actually located it:** the reporter saying that every screenshot had been
of the same surface. Four sessions of image-differencing never established what
the camera was pointed at. `?ablate=where` now answers that in one page load.

</details>

### 1c. The shader has almost no link-time headroom left

Adding three `uniform`-guarded branches to the shading path took the link from
instant to **81.2 s**; a source-substitution variant that *removes* three
`mapAt` calls still took 66.7 s. Link time is not monotonic in source size.
§17.13 reads as solved; the margin it bought is much thinner than the record
implies, and nothing measures it. Bug log §15.

**Why it gates other work:** items 1b and 3 both touch the shading or gap
path. A 60–80 s link presents as a hung page, and three reloads make Chrome
disable WebGL for the session.
**Lever:** assert on it — link the shipped shader headlessly in the test suite
and fail when the budget is spent. The timer exists; nothing checks it.
**Done when:** a change that narrows the margin breaks a test instead of a
session.

### 1d. Bad normals rise with range, cause unknown

**0.72% at 0–3 m against 3.45% at 3–6 m**, measured with `?ablate=nydist` on a
single view. Real, reproducible, and unexplained.

**The obvious theory is wrong and is already tested.** The march tolerance is
proportional to range (`0.00018 * t + 0.00012`) while `normalCtx` probes a fixed
±1.6 mm, so the two cross over at about 8 m — but at 3–6 m the tolerance is
0.84–1.20 mm and the probe is still the larger of the pair. Scaling the probe to
track the tolerance (`?ablate=normeps`, rewritten against the shipped tolerance)
moves 3.45% to **3.35%**. Not the cause.

**Lever:** `?ablate=nydist` bins bad normals by range in one page load. Find a
view with a long sightline — everything measured so far is under 6 m, so the
crossover region has never actually been sampled.
**Done when:** the curve has a named cause, or a longer sightline shows the rise
is an artefact of what happens to be at 3–6 m in that one view.

### 2. A 160 ms worst frame, uncharacterised

Seen on the reporter's own panel while the mean sat at 8.1 ms. This
repository's own method says a mean is the wrong instrument for a stutter, and
here we have only the mean explained.

**Lever:** measure the distribution before theorising — the panel already
carries worst-beside-mean. Find what the spike correlates with (entering a
reading room, first sight of a mirror, a shader recompile).
**Done when:** the spike has a named cause, or a frame-time histogram shows it
was a one-off.

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

### 4. Rippled chunks missing from a book's cover, seen from the side

At a grazing angle the edge of a volume tears into ripples. This may already
be gone — same overshoot signature as the spine mottling, which the
conservative shelving field fixed — but nobody has checked.

**Lever:** one look at a shelf edge-on, then the normal-visualisation mode if
it is still there.
**Done when:** checked either way. It is cheap and it has been open longest.

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

### 7. The last hand-written mirror

The hash deciding which slots the Purifiers emptied lives inside the shader's
`mapAt`, too entangled with the SDF to extract as it stands, so
`volumePresent()` in `core/babel-core.mjs` is a hand-written twin guarded only
by a statistical test (3.52% empty over 1.8 million slots). That test would
catch a broken mirror, not a subtly different one — and a subtly different one
is exactly what the GLSL/JS split produced twice before (§17.10).

**Lever:** extract it the next time `mapAt` is opened for any other reason.
**Done when:** `volumePresent` is single-sourced and appears in
`core/vectors.json`, so the GPU conformance harness covers it.

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

*Items 1b, 1d, 2 and 4 are live defects. 1b's visual half is signed off and what
remains of it is the seam disagreeing with the renderer, which is the one on
this list that can corrupt a citation rather than merely look wrong. 1c gates 1b
and 3: both touch the shading or gap path, and the link budget is nearly spent.
3 and 7 are debts with a known price. 9 is understood and deliberately parked. 5
has started returning numbers, and is the only one that tells us something the
Library itself does not.*

*Every defect here has an entry in [`docs/BUG-LOG.md`](docs/BUG-LOG.md) carrying
what has already been ruled out and with what measurement. Start there, or the
first two theories will be ones that have already died.*
