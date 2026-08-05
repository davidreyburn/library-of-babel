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

---

## Open

### 1. The wall mottling — **fixed, pending your sign-off**

`marchRay` returned the tolerance-satisfying `t`, leaving the hit point up to
12 mm short of the surface, while `normalCtx` sampled the gradient over a
fixed ±1.6 mm. Two tolerances that were never reconciled; the integer step
count that first met the threshold is what turned a scalar error into rings.
`return t + d` — one add, outside the loop — takes pixels landing within
1.6 mm of the surface from **16% to 74%** and costs nothing (4.26 ms against
4.78). Bug log §13 has the probe, the numbers, and the four negatives.

It stays here rather than moving to done until you have walked a long way
without meeting it. Three previous announcements of "fixed" on this symptom
were wrong, and none of them had a measurement behind it.

<details><summary>The state before the fix, kept for the record</summary>

### 1 (was). The wall mottling — confirmed still present, mechanism unknown

No longer "not signed off": it recurred, on a wall at
`floor/-3/cell/-35,-42`, and the reporter's priority is fixing it. The spines
*are* fixed — the two mechanisms in bug log §11 are real and hold — so what is
left is bare stone only.

**Ruled out since, by ablation against a stored baseline (bug log §13):** the
lamps' hard radius cutoffs (0.02% of pixels move), and the ambient term (thin
creases at shelf edges, no filled regions — and this finally tests `occ` on
stone, whose albedo reads it at 45%, which the original AO ablation never did).
The whole step-function class is ruled out on shape: a step draws a *line*, and
the reported shapes are *filled regions*.

**Mechanism found.** A reproducible view arrived (`V` now copies one), the
symptom reproduced first try, and six ablations on that view settled it:
**ray-march overshoot on the stone field**, amplified 3× by the stone lift.
The field over-reports, the ray lands past the surface, the normal there is
nonsense, and that normal feeds `dot(n, L)` into `lit`. Dropping the march
step to 0.25 removes it; forcing AO to 1, ramping the lamp cutoffs, softening
the lift's gate and disabling the tone quantiser all do not. Bug log §13.

This is §11's defect in the half of the field §11 did not audit: it made the
*shelving* conservative and measured the result on spines. The hexagon shell
was never looked at.

**Lever:** make the stone path of `mapAt` conservative and keep the step at
0.80 — the same trade §11 took for the shelving and got "for nothing" (6.58 ms
against 6.27). Audit the hexagon shell, the ceiling and floor planes and the
doorway carving for the three sins §11 found: a `mod()` repeating geometry
that is not there, and culls that discard instead of comparing against the
best distance so far.
**Do not** ship the cheap fix: step 0.25 costs about what §11 measured at 0.30,
**6.7× the frame**. §15's link budget applies to any edit in `mapAt`.
**Done when:** the shapes are gone at step 0.80, the frame has not moved, and
a long traverse does not meet them.

*(All three conditions are now met on the reported view and on the previously
reported cell — but the traverse is yours to walk.)*

</details>

### 1b. A doorway into a stairwell that arrives nowhere

**7.3% of stairwells are one-ended** (127 of 1,741 sampled): open to a gallery,
solid rock at the far end, because the corridor beyond runs on a disagreeing
axis and `gapAt` walls that edge by design. The renderer draws the doorway and
an unlit pocket behind it — reported at `floor/307/cell/313,306` as a black
rectangle. Bug log §14.

**The real cost is not visual.** `apply()` refuses the move as a dead end while
the renderer's collision walks through it, so the seam and the renderer
disagree about where you can go — the §17.10 twin-drift class, on a doorway
7.3% of stairwells have.

**Lever:** in `gapAt`'s stairwell branch, do not open an axis end unless the
opposite end is open. This lands on the hottest path in the shader
(`cellDesc` → `gapAt` ×6, per cell per ray), so measure link and frame before
and after — see 1c. Cheaper half: leave the topology and stop *drawing* a
doorway whose far side is rock.
**Done when:** no gallery advertises a passage into a stair that cannot be
crossed, and the seam and renderer agree on every such edge.

### 1c. The shader has almost no link-time headroom left

Adding three `uniform`-guarded branches to the shading path took the link from
instant to **81.2 s**; a source-substitution variant that *removes* three
`mapAt` calls still took 66.7 s. Link time is not monotonic in source size.
§17.13 reads as solved; the margin it bought is much thinner than the record
implies, and nothing measures it. Bug log §15.

**Why it gates other work:** items 1, 1b and 3 all touch the shading or gap
path. A 60–80 s link presents as a hung page, and three reloads make Chrome
disable WebGL for the session.
**Lever:** assert on it — link the shipped shader headlessly in the test suite
and fail when the budget is spent. The timer exists; nothing checks it.
**Done when:** a change that narrows the margin breaks a test instead of a
session.

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

*Items 1, 1b, 2 and 4 are live defects, and 1 is the reporter's priority. 1c
gates the first three: they all touch the shading or gap path, and the link
budget is nearly spent. 3 and 7 are debts with a known price. 9 is understood
and deliberately parked. 5 has started returning numbers, and is the only one
that tells us something the Library itself does not.*

*Every defect here has an entry in [`docs/BUG-LOG.md`](docs/BUG-LOG.md) carrying
what has already been ruled out and with what measurement. Start there, or the
first two theories will be ones that have already died.*
