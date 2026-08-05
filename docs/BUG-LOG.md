# Bug log

Sixteen defects, and how each was actually found. Written from the assistant's
side of the collaboration, in the sessions that produced them.

In every case the method that found it was the same: **measure the thing, or
probe the thing, rather than reason about it.** In seven cases the confident
reasoning was simply wrong, and the way each wrong diagnosis died is the useful
part — so the failed theories are kept here rather than tidied away.

**Twelve are closed and four are open**, and the difference is not "did anyone
write a fix." A defect is **closed** here when the mechanism was named, the fix
was made, and the fix was checked by something other than the eye that reported
it. A defect is **open** when it is reported and reproducible but the mechanism
is not yet established — or, in one case, established and deliberately not
scheduled. An open entry earns its place by saying what has been *ruled out*
and with what measurement, so the next attempt starts where the last one
stopped rather than re-running the same three theories. An open entry with no
ruled-out list is a bug report, not an investigation.

Nothing moves from open to closed on the strength of "it looks better now."
§11 is the standing reason: it was announced fixed twice and was not.

This is the detailed record. The transferable lessons drawn out of it are in
[`CASE-STUDY.md`](CASE-STUDY.md); what is scheduled is in
[`../ROADMAP.md`](../ROADMAP.md); and what the fixes did to the built Library is
in [`../spec/technical-specification.md`](../spec/technical-specification.md) §17.

| # | Defect | Found by | Status |
|---|---|---|---|
| 1 | Mouse capture silently impossible in an artifact frame | reading the iframe's `sandbox` attribute | closed |
| 2 | The reading lamp lit from the wrong wall | a GPU conformance harness, on its first run | closed · §17.10 |
| 3 | A reading room cost 2.4× a bare gallery | stubbing the suspect, after two wrong guesses | closed · §17.4 |
| 4 | An aliased import that survived a byte-identical test | evaluating the inlined copy instead of comparing it | closed · §17.10 |
| 5 | A room address that could not be parsed | only reproducible in a browser | closed · §17.8 |
| 6 | The reticule drifting off target | arithmetic, then a centre-pixel probe | closed · §17.9 |
| 7 | 32 of 40 journeys dead | driving 40 complete journeys headlessly | closed · §17.11 |
| 8 | The stairs were fine; the harness was walking on air | a value sitting at exactly 0.00 in the log | closed · §17.11 |
| 9 | The walkable Library was 32 bits wide | being asked a question from outside | closed · §17.12 |
| 10 | A shader that compiled in 17 ms and would not link in 127 s | instrumenting the link step, then removing real code | closed · §17.13 |
| 11 | Dark continents on the shelves — and then on the stone | ablation, four times, three of them wrong | **partly closed** · §17.14 |
| 12 | Two counting conventions, and a verifier that called true citations false | cross-checking a score against a second code path | closed |
| 13 | Wall mottling: a march tolerance and a normal probe that disagreed | a three-channel probe; then a shipped fix that was worse | **OPEN** · 4 wrong fixes |
| 14 | A doorway into a stairwell that arrives nowhere | reading `gapAt` after the seam called it a dead end | **OPEN** |
| 15 | The shader is one small edit away from an 81-second link | the link timer §17.13 left behind | **OPEN** |
| 16 | The floorboards give out 12,604 storeys up | float32 arithmetic against the reported floor number | **open, unscheduled** |

---

## Closed

---

### 1. Mouse capture — a guess stated as fact, then the real answer

Mouse look stopped working. I offered an explanation — artifacts render in a
cross-origin iframe, and Chrome refuses pointer lock there — and shipped a
workaround. The user pushed back: *"well pointer lock had worked previously so
something must have happened."*

He was right to. My verification had been invalid: `entered` was still `false`,
meaning my synthetic click never reached the page, and `visibilityState` was
`"hidden"`, which alone makes pointer lock impossible by specification. I had
measured my own test harness.

The actual answer took one call once I looked in the right place. Reading the
artifact's iframe attributes from the parent page:

```
sandbox="allow-scripts allow-same-origin allow-forms"
```

No `allow-pointer-lock`. By the HTML sandbox specification that sets the
sandboxed-pointer-lock flag, so `requestPointerLock()` in that frame can never
succeed — Chrome's own error says so. My original guess was right in substance
and wrong in mechanism, which is worth distinguishing: it isn't the
cross-origin-ness, it's a missing token.

I also checked and discarded a second line of evidence that looked convincing:
`featurePolicy.allowsFeature("pointer-lock")` returned `false`, but
`features()` shows Chrome does not recognise `pointer-lock` as a policy feature
at all, so that `false` meant nothing.

**Outcome:** the failure is now *visible* — a `mouse: captured / free` row with
the reason — because the thing that cost a session was a silent failure, not a
hard one. Real capture needs a top-level tab, which `app/play.cmd` provides.

### 2. The reading lamp lit from the wrong wall — found by a GPU harness on its first run

The lattice was written twice, in GLSL for the renderer and in JavaScript for
collision and the HUD, kept in step by hand. It had drifted before. Extracting it
into `core/` and inlining it at build time fixed the *structural* problem; the
GLSL, though, is a port and not a copy — no `Math.imul`, no 53-bit doubles — so
it can only be trusted by being run.

`core/conformance.html` runs the shader's own copy over shared vectors on the
GPU, reads the results back through an `RGBA32UI` framebuffer so the integers
come back exact, and compares them against the CPU. First run: **483 of 484 lanes
agreed.** The one that did not was a reading room's furniture anchor.

The cause: the GLSL carried *two* anchor rules. `cellDesc` placed the furniture
by best fit, while `studyAnchor` — used by `lighting()` to position the reading
lamp's light — returned the first blank wall. In any room where those differ, the
lamp lit from a wall it was not standing against. One rule now, both callers using
it.

That bug was invisible to inspection, invisible to the renderer's own output at a
glance, and caught by 484 integer comparisons.

### 3. The reading-room performance cliff — found by stubbing, after two wrong guesses

The user reported the renderer had "taken a major hit". I benchmarked three
builds at the same three positions:

| standing in | this morning | my change | after the fix |
|---|---|---|---|
| gallery, no reading room near | 6.73 ms | 6.84 | **6.44** |
| gallery beside a reading room | 7.99 ms | 8.72 | **7.63** |
| lamp-lit reading room | 15.71 ms | 16.33 | **9.18** |

My change had cost 0.6 ms, not the cliff. But the measurement found a real one
that predated it: **a reading room cost 2.4× a bare gallery.**

I then guessed twice, wrongly. First that a duplicated anchor scan was the cost —
it was 0.6 ms of a 9 ms gap. Then that hoisting a distance check would help — it
gained **0.02 ms**. Only when I stopped reasoning and *stubbed the suspect* did it
resolve: replacing `furniture()` with a constant took the room from 15.22 to 5.98
ms, so the furniture path was 60% of the frame.

And it was not the geometry. `furniture()` re-ran the doorway culling — four
scans, each walking six walls — on every one of the ~80 `mapAt` evaluations a
pixel makes across the march, the normal and the ambient term. The result depends
on the cell and never on the sample point. It is now computed once per cell and
stashed in four bits of the packed `desc` integer.

**The lesson I wrote down:** stub the suspect before optimising it. Two plausible
mechanisms, both mine, both wrong, and the stub took two minutes.

### 4. An aliased import that survived a byte-identical comparison

The core is inlined into the single-file app at build time, and a text-identity
drift test compares the inlined copy against the module byte for byte. That test
passed while the app was broken.

`babel-text.mjs` imported with aliases — `wander as coreWander`. Stripping the
import statement for inlining leaves the alias naming nothing, so the app threw
in the browser while the bytes matched perfectly.

**Outcome:** the drift test now also *evaluates* the inlined blocks and calls into
them. Comparing text is not the same as running it.

### 5. A room address that could not be parsed — found only in a browser

`?read=<address>` silently failed to open. Two causes, stacked:

- The startup handler ran before the input section's `const` declarations were
  initialised, so `openBook` hit a temporal-dead-zone error. `?at=` worked and
  `?read=` did not, because only one of them touched a later binding. Both parse
  identically outside a browser, so nothing in 144 assertions could have caught
  it.
- Underneath that, a genuine design gap: reading rooms have no shelved wall, so
  the parser — which insisted every walk address name a volume — threw on their
  own addresses. Addresses now have two scopes, a **room** to stand in and a
  **volume** to read, and asking a room for a page is an error rather than a
  guess.

### 6. The reticule drifting off target — arithmetic, then a pixel probe

The user: *"the reticule seems off-target as i go to the far left and right of
the screen."*

The targeting ray intersected a single plane at `APO_ROOM`, the back of the
casework. The spines stand proud of it by their own depth, about 0.18 m, so the
aim was wrong by `0.18 × tan θ` along the wall:

| angle from the wall normal | error |
|---|---|
| 0° | 0 books |
| 30° | 2.0 |
| 45° | 3.5 |
| 60° | 6.0 |

Exact dead-on, which is precisely why my earlier test had passed — I had aimed
squarely at slot 17 and got slot 17.

The fix tests the actual front face of every slot on every wall it faces: 350
plane intersections, measured at 0.0035 ms, or 0.05% of a frame. Exhaustive
rather than clever, because there is no candidate window to get wrong.

Verified by probing the renderer rather than by eye: for 49 angles from −76° to
+76° across three pitches, render, read the **centre pixel**, switch the
highlight off, read it again. If the pixel changes, the highlighted spine is the
one under the crosshair. **49 / 49 on target**, and the old ray disagreed with the
new one at 24 of 44 of those angles.

![on target at a grazing angle](images/10-on-target-grazing.jpg)

### 7. A walker that could not walk — 32 of 40 journeys dead, and the reason was geometry

The user asked for an auto-walk: pick a shelved gallery some rooms off, walk
there through the doorways and up the stairs, and open a book on arrival. The
routing was straightforward and its tests passed — every route replayed legally,
move for move, against the lattice.

Then I drove 40 complete journeys headlessly and **4 arrived.** Thirty-two got
stuck, and every one of them had the same signature: standing in a gallery,
pressed against a wall with exactly `−RADIUS` of clearance, 3.26 m from its next
waypoint, and the wall between it and that waypoint had no doorway in it.

The walker was in the wrong room. The cause is a number that had been in the
constants the whole time and that I had never put together: a gallery is 3.64 m
across, but cell centres are **4.84 m** apart. **Adjacent rooms do not touch.**
They are joined by a corridor about a metre wide. Steering from wherever you
happen to be straight at the next centre therefore does not go through the
doorway — it clips the wall, or threads a *different* doorway and strands you one
wall away from a waypoint you can no longer reach.

Every opening is now a waypoint of its own, which took arrivals to 23%. The rest
came from giving up on precision entirely: steering through a one-metre gap is
approximate, so instead of tuning it, the walker notices it is in a room its
route never mentioned and asks the lattice for a new one from where it actually
is. 17 of 400 journeys re-plan once and arrive anyway.

### 8. The stairs were fine; the harness was walking on air

Between those two fixes I spent a long time on the wrong thing, and it is the
most useful bug in this document.

Journeys kept dying one room after a flight of stairs. The trace was damning:
the walker entered the stairwell, crossed it, emerged in the far gallery — and
its floor was still 0 when the route said 1. So the next room's doorways did not
exist and it pushed at a wall. I measured the flight itself: on-axis, rise +1,
the tread ramping cleanly 0 → 2.6 m along a path with clearance to spare. The
geometry was perfect and the walker still would not climb.

Then I looked at what the log said rather than what I expected it to say. `feet`
was **exactly 0.00** for the entire traversal, while `groundY` reported the
correct tread beneath them at every step. Nothing was applying it.

The line that makes the feet follow the ground lived inside the frame loop. My
harness called `autoStep()` in a loop and never called `frame()`, so the walker
slid through the world at a fixed height, its storey never changed, and every
route across a flight failed one room later. **The stairs had never been
broken.** I had built an instrument that omitted a part of the state and then
believed it about the part it omitted.

It is now `stepBody()`, a named function the frame loop and the harness both
call. One extraction, and arrivals went from 23% to **98%** — 246 of 250, then
395 of 400 on a fresh seed family, 370 of them crossing at least one flight.

The measured result, once it worked:

| | |
|---|---|
| Journeys completed | 395 of 400 (98.8%) |
| Duration | 25.6 s at p10, 40 s median, 50.3 s at p90, 87.4 s worst |
| Reticule agreed with the volume that opened | 400 of 400 |
| Failures | 2 stuck, 1 wrong storey, 2 nothing shelved in range — every one reported with its reason |
| Cost | 0.0067 ms per frame; a one-off 8 ms on the keypress |

The last row of that table cost one more fix. At 196 arrivals the reticule
disagreed with the opened book *once* — the walker was stopping up to 0.55 m off
the middle of the room, and from there the aim line could catch a neighbouring
spine. Tightening the final waypoint to 0.20 m closed it: 400 for 400. A
one-in-two-hundred defect is exactly the kind that ships.

### 9. The Library was 32 bits wide — found by being asked a question

The user asked what looked like a reading-comprehension question: why isn't the
walkable lattice the whole corpus, how much do we have, and could it all be made
traversible? The first two thirds of the answer were already written down. The
last third wasn't true.

The documented figure was ~10²² volumes, and it is correct — as a count of
*shelves*. But a shelved volume's content is `streamDigit(walkKey(a), …)`, and
`walkKey` returned **one 32-bit word**. Every symbol of every book came through
that gate. So the walkable Library held at most 2³² distinct texts — about 4.3
billion — spread over 8 × 10²¹ slots, each text repeated some 2 × 10¹² times.

That is not a rounding error in a document. It is a defect you can *see from
inside*: the expected first pair of shelves holding the identical book sits at
√(2 × 2³²), about 93,000 slots, which is **170 galleries** — a long walk, but not
an impossible one. And LIB-C-021 says "no two identical books."

I found the pair:

```
babel://walk/00001594/floor/0/cell/0,20/wall/4/shelf/3/slot/26
babel://walk/00001594/floor/0/cell/2,32/wall/0/shelf/0/slot/19
```

Same text, same spine `rcaabbbozxnfedhgxqws`. Twenty such pairs in a 500,000-slot
scan, implying a key space of 6.3 × 10⁹ — the birthday curve for 2³², to within
noise.

The fix is two independent lanes instead of one, and the interesting part is that
it was **free**. `mix(a, b, c)` has two inputs constant across a whole book and
one that varies with position, so two `mix` calls can carry four constant words —
128 bits of key — without a single extra per-symbol operation. Measured at
0.995× for 64 bits and 1.02× for 128; a third `mix` would have cost 81%. I took
64, because reaching 128 means folding lanes into the domain word and blurring
the separation between streams for no gain anyone could observe.

Two things fell out of looking properly. The old code recomputed two XOR
constants **and the entire `walkKey`** inside every symbol — 9,600 redundant
hashes per page — so hoisting made reads **33% faster** while the key got twice
as wide. And the renderer turned out to be entirely uninvolved: `streamDigit`
appears nowhere in the GLSL, so frame time could not move, which is the first
thing worth checking when someone asks whether a change will be expensive.

The proof that the second lane earns its place is the assertion I'd keep if I
could keep only one: in 500,500 addresses, twenty pairs still collide in lane 0 —
as a 32-bit lane must — and **none of them collide in lane 1**. If a future edit
ever derives the second lane from the first, that test fails immediately. Three
million slots now scan clean where one lane would have produced a thousand
duplicates.

Every walk citation in existence changed as a result, including the crimson
volume's spine (`aknvr` → `omzpawrdrcabtjknbrgligcqdak`). Text citations did not:
the second text lane is the constant the old code derived internally, so those
verify exactly as before. I checked that nothing in the repository quoted a
generated passage or spine label *before* making the change, rather than
discovering it afterwards.

**The lesson is not about hashing.** Two sessions of tests, four gates, a GPU
conformance harness and 119 assertions all passed while the Library was a
four-billionth of the size it claimed. Every one of them checked that the thing
was *self-consistent*. None asked how big it was. The question came from outside,
and the honest answer required arithmetic nobody had done.

### 10. A shader that compiled in 17 ms and would not link in 127 seconds

Session three added the corridor — Borges's hallway, the fifth cell type, with
a mirror and a latrine in alcoves off it (spec §17.13). The lattice work went in
cleanly and the tests were green. Then the page froze.

Not crashed. Froze: a blank canvas, a veil still saying *click to enter*, and a
JavaScript main thread that would not answer for 45 seconds at a time. Reloading
made it worse, and after the third attempt Chrome disabled WebGL for the whole
session, so even a fresh tab reported *WebGL2 unavailable* — which reads like a
machine problem and is not one.

Two failures were tangled together, and separating them was the whole job.

The first was mine and stupid: a comment I wrote inside the fragment shader's
template literal contained a pair of backticks, which closed the string. 153,000
characters of JavaScript stopped parsing. The symptom is indistinguishable from
the second failure — a page that loads, styles itself, and never starts — and I
spent two reloads on the wrong theory before checking. `new Function(script)`
over the file finds it in a millisecond, and there is now an assertion that does
exactly that on every test run.

The second was real. I instrumented the link step rather than guessing again:

```
compile   16.8 ms
link     127362.9 ms   ->  false, and getProgramInfoLog() returned ""
```

An empty log after two minutes is an inlining blow-up, and I had an obvious
suspect. The corridor picked its axis by preferring one with a flight of stairs
at the end *whose own axis agreed*, so `corridorAxis` called `axisOf` on a
neighbour — and `gapAt` calls `corridorAxis`, `cellDesc` calls `gapAt` six
times, and the shader calls `cellDesc` for every cell every ray enters. That is
a genuinely bad thing to put on that path, so I replaced it with a flat pass of
type comparisons that buys the same arrangement from the other side: the
corridor accepts a flight as an end, and the *stair* prefers an axis with a
corridor at one. Both versions put a flight at the end of 1 corridor in 5.

**It was still broken.** 140.9 seconds. My suspect was innocent, and so was the
second one — I stubbed `studyAnchorAt` out of `lighting()`, on the theory that
126 inlined copies of a now-larger `gapAt` was the multiplier, and that changed
nothing either.

The cause was **two call sites**. I had written the mirror the obvious way:
march, shade, and if the surface was a mirror, march and shade again. ANGLE
inlines, so `main()` held two copies of a body that already contains `mapAt`
eight times over — once for the march, four for the normal, three for the
ambient term — plus `lighting()`. Deleting the second bounce made the link
instant. The fix was not to delete it but to make it a **loop**, with the bounce
count passed as a *uniform* rather than the constant 2, because a compiler
cannot unroll a loop whose bound it does not know. One call site, same picture,
and it links.

**Four things I would keep.** My first bisection was worthless: I disabled the
reflection with a runtime `if`, which changes nothing about what the compiler
emits, and it cleared a suspect that was in fact guilty. Guarding code at
runtime does not remove it. Second, both of my confident diagnoses were wrong
and the third guess was right only because I had finally made each test remove
real code. Third, my instrument lied to me once before it helped: timing
`linkProgram` alone reported **0.0 s** for a link that had just hung the tab for
ninety seconds, because ANGLE defers the work to the `LINK_STATUS` query. An
instrument you have not checked is a confident source of wrong numbers. Fourth,
and the reason this section exists: **a link failure is allowed to be silent,
and a frozen page looks exactly like a broken machine** — after three reloads
Chrome disabled WebGL for the entire session, which sent me hunting a hardware
problem that did not exist. The link step now times the right pair of calls and
prints the elapsed time when the driver has nothing to say.

The reflection ended up costing nothing where nobody is looking at a mirror —
6.67 ms either way in a gallery — and +19% on a frame filled with one. Verified
by pixel probe rather than by eye: with the bounce off the glass is a flat dark
pane, with it on 68% of the pixels across the alcove change, and in a corridor
whose opposite alcove holds the latrine, what appears in the glass is the
latrine.

### 11. Dark continents on the shelves — the shading measuring the shader's own approximation

The user sent a screenshot of a gallery with large, smooth, dark shapes lying
across a wall like a map of a coastline, and said they also appeared on the
books. This one is worth recording because the answer was in a place I would
not have looked, and because three plausible theories died first.

**Theory one: the ray budget.** Grazing angles make a march take many small
steps, and a ray that exhausts its 72 steps renders as background — dark. I
made the shader paint step-exhausted pixels red, near-exhausted green. The
marked pixels lay in thin lines along silhouette edges and nowhere near the
blotches. Dead.

**Theory two: the tone ramp.** The renderer quantises luminance to six levels,
which can turn a tiny discontinuity into a hard visible edge. Turning the
quantiser off left the blotches in place, softer. Dead.

**Theory three: a hard threshold in the shading.** There is a line that lifts
luminance by 0.30 on near-vertical surfaces when `lit > 0.28` — a step function
on a continuous quantity, exactly the shape that draws iso-contours on a wall.
It excludes book materials, and the blotches were on books. Dead.

The answer was ambient occlusion, found by ablation: forcing `occ = 1.0` made
the shelves clean. And the reason is the interesting part. `mapAt` has a speed
early-out — once a sample is more than 0.38 m in from the wall, don't walk the
casework, just return the distance to the front of it. That value is a *lower
bound*, which is all a raymarcher needs and all it was ever asked for. But
`aoCtx` takes the difference between the distance field and the distance it
expected and calls it occlusion, so **feeding it a conservative field makes it
draw the conservatism**. Its probe reaches 0.21 m out from a spine face that
sits 0.16–0.20 m in from the wall, landing at 0.37–0.41 — just across the seam.
Which volume you were looking at decided whether the probe tripped it, so the
boundary wandered across the shelf in smooth organic curves.

The fix is one constant: push the seam from 0.38 to 0.50, beyond anything the
probe can reach. Measured at 1550×889, the frame cost did not move — 6.27 ms
against 6.67 before, which is noise.

**And then it was not fixed.** The user sent a second screenshot of a bare
stone wall carrying the same shapes, and then a third showing that the *shelves
had gone clean while the stone had not*. Two symptoms that look identical were
not one defect, and I had called it closed on the strength of one view.

Two more mechanisms had to be found, and neither was AO.

**On the spines it was the distance field, not the shading.** Visualising the
surface normal put the answer on screen: at the patches the normal pointed
nowhere near the wall. Dropping the march step from 0.80 to 0.30 made them go
away — which is the signature of *overshoot*, a field that over-reports the
distance so the ray lands past the surface where the gradient is nonsense.
Three places in the shelving were doing it: a `mod()` that repeated the shelf
for ever and was not centred on the volume, and two hard culls that dropped a
wall's casework and its books out of the field rather than measuring them.
8.5% of surface pixels carried a bad normal at step 0.80, 6.1% at 0.30 for
6.7× the frame cost — and making the field conservative got the same result at
0.80 for nothing.

**On the stone it was a step function.** `if (… && horiz > 0.86 && lit > 0.28)
lum += 0.30` — a binary lift on two continuous quantities. On dim stone that
lift is most of what makes a wall visible, so pixels falling the wrong side of
0.28 did not dim, they went nearly black, along an iso-contour of the lighting
times the ambient term. Book spines are excluded by the same material test in
that line, which is exactly why it survived every fix aimed at the shelving —
and why I had dismissed it on day one, when the blotches in front of me
happened to be on books. Both tests are `smoothstep` now.

**Four wrong diagnoses, and what each cost.** The ray budget: killed twice,
the second time properly, by painting step-exhausted pixels in the reported
cell — 0.04%. The tone ramp: killed by switching it off. Ambient occlusion:
*convicted* by forcing `occ = 1.0`, which cleared the shelves — and it was
carrying the symptom, not causing it. The step function: dismissed on day one
for a reason that was true at the time and stopped being true once the shelves
were fixed. The lesson I would carry: **an ablation proves what it proves in
the view you ran it in**, and a symptom that appears on two materials is two
bugs until you have shown otherwise.

**What I would keep.** An optimisation that is correct for one consumer of a
function can be a bug for the next one, and nothing in the code said which
guarantee `mapAt` was offering. It offers a lower bound; the marcher wanted a
lower bound; AO wanted the truth. That is not a coding error anywhere — it is
an unstated contract, and the comment that now sits on that line states it.

Also: I ran three ablations before the one that worked, and each cost about
two minutes. Ablation is cheap and reasoning is expensive; I should have
started there rather than arriving there. And having finally used the right
method, I stopped one view too early — the ablation proved AO caused *the
blotches in front of me*, and I generalised it to *the blotches*. The
instrument was right and the sample was too small.

> **Status: partly closed, and the reason it is not fully closed is above.**
> The two mechanisms named here are real and their fixes hold — the spines
> are clean and the reporter confirms the books are now good enough. The
> **bare wall is not fixed**, and the symptom was reported again at
> `floor/-3/cell/-35,-42`. That thread continues as §13, which carries what
> has since been ruled out. Three announcements of "fixed" on this symptom
> have now been wrong; that is the reason this log has a status column.

### 12. Two counting conventions, and a verifier that called true citations false

Found while scoring the first real reader (rung 6, `core/RUN.md`). The excursion
came back at integrity 1.000, seven of seven — and a perfect score is exactly
what a broken oracle also produces, so before believing it I re-checked the same
seven claims through a different code path: `node tools/babel.mjs verify`.

**All seven failed.** One reported `NOT VERIFIED: the page reads "xdb" there`
for a citation the scorer had just accepted.

Two things could be true: the score was wrong, or the check was. It was neither,
and that is the interesting part. `tools/babel.mjs verify` counts pages, lines
and columns **from 1** — it says so, in the usage string you only see if you get
the argument count wrong — and subtracts one before calling the oracle. Every
other surface that shows you a page counts **from 0**: the reading pane's gutter
and ruler (§17.9), and the observation an agent is handed. Re-run with 1-based
numbers and all seven verify. Both code paths had been right the whole time
about different questions.

**Why this is worse than an ordinary off-by-one.** The repository's one stated
rule is *verify every citation before you report it.* Follow it exactly — read a
0-based page, verify against the 1-based command — and the environment tells you
a true citation is false. The obvious next move is to "fix" the claim, which
converts a correct citation into a fabricated one. **The discipline the
environment rewards was, in this one place, a trap that manufactured the exact
failure the metric exists to catch.**

**The fix is not renumbering.** Changing the CLI to 0-based would silently
invalidate every citation anyone has already written down against it. Instead
the failure is made loud: when a claim fails, the verifier now re-checks it
under the other convention, and if *that* verifies it says so and prints the
corrected coordinates. A claim that is simply wrong is still reported simply
wrong, so the signal is not diluted.

```
NOT VERIFIED: the page reads "xdb" there
  ...but it verifies read as 0-based. This command counts pages, lines and
  columns from 1; the reading pane and the agent's page both count from 0.
  Your citation is probably right -- try 204 6 33.
```

**What I would keep.** The bug was found only because a perfect score was
treated as a reason for suspicion rather than a result. That is the same move
as §8 — when the harness and the thing disagree, suspect the harness — run
one step earlier, before there was any disagreement to investigate. Three gates
now hold it: the CLI verifies in its own terms, catches the 0-based reading,
and still calls a genuinely wrong claim wrong.

---

## Open

*Reported and reproducible, mechanism not established — except §16, where the
mechanism is established and the fix is deliberately not scheduled. Each entry
carries what has been ruled out, with the measurement, so the next attempt does
not start from zero.*

### 13. The wall mottling — two epsilons that did not agree

> **STILL OPEN. The fix was shipped, was worse than the defect, and is
> reverted.** Mechanism below is believed right; the *remedy* was wrong. This
> is the fourth wrong fix for this symptom, and the first one I shipped.
>
> **What I did.** `return t + d` instead of `return t`, on the argument that
> `d` is a lower bound on the distance remaining, so `t + d` cannot pass the
> surface.
>
> **Why that was wrong, and it is written down two screens further into the
> same function.** This field is *not* conservative. §17.14 and the shelving
> comments record it OVER-reporting in several places -- that is the entire
> reason the march runs at 0.80 rather than 1.0. Where it over-reports,
> `t + d` lands **inside solid**. `aoCtx` then probes outward from inside, `s`
> goes large, `occ` clamps to 0, and both the stone albedo
> (`mix(C_INK, C_STONE, 0.55 + 0.45*occ)`) and `lit` collapse together. The
> result was **a solid black rectangle across the wall** -- unambiguously
> worse than the mottling it was meant to remove.
>
> **How it got past me, which is the part worth keeping.** The residual
> measurement was real and good: pixels landing within 1.6 mm of the surface
> went 16% -> 74%. I had a number, the number improved, and I stopped. What I
> never measured was **whether anything went black** -- and a black region is
> the specific failure mode of moving a hit point forward, so it was the one
> check the change itself called for. Worse, the black rectangle was visible
> in my own verification screenshot and I labelled it "the hall doorway,"
> because a clean fix was the answer I wanted. There *is* a hall on wall 0 of
> that cell, which is exactly what made the rationalisation easy.
>
> **The lesson is not "measure".** I measured. It is that a metric chosen to
> capture the defect says nothing about what the remedy breaks, and the
> plausible-looking screenshot is the least reliable witness available once
> you have a stake in the answer. The reporter's eye caught in one glance what
> two numbers and a montage had missed.
>
> **Two more candidates tested and rejected, and a negative result about
> measurement that matters more than either.**
>
> `?ablate=normeps` — scale the normal probe with the march tolerance. Safe by
> construction (it does not move the hit point) and still **wrong**: it moved
> *away* from the accurate render and more than doubled the near-black area.
>
> | view A | baseline | normeps | reference (step 0.25) |
> |---|---|---|---|
> | distance to reference | 4.43 | **7.49** | 0 |
> | near-black % | 11.0 | **27.9** | 15.8 |
>
> A step-scale sweep, using step 0.25 as a reference render because it marches
> four times finer and is therefore the accurate one:
>
> | step | dist to ref (A) | near-black A | ms/frame |
> |---|---|---|---|
> | 0.80 shipped | 4.43 | 11.0 | 4.08 |
> | 0.60 | 3.68 | 7.0 | 4.55 |
> | 0.45 | **6.96** | 6.6 | 4.41 |
> | 0.25 reference | 0 | 15.8 | 5.60 |
>
> **§11's "0.30 costs 6.7× the frame" does not reproduce.** Step 0.25 measured
> at +37% here (4.08 → 5.60 ms at 775×473). That figure has been the stated
> reason not to take the direct route, and it is wrong by an order of
> magnitude — worth knowing before anyone rejects the cheap fix again.
>
> **The negative result: I have no scalar that ranks this defect's severity.**
> Three were tried — band-passed low-frequency contrast, residual `|mapAt|` at
> the hit point, and distance to an accurate reference — and all three are
> **non-monotonic** in the thing being varied. 0.45 is further from the
> reference than 0.80; near-black goes 11.0 → 7.0 → 6.6 → 15.8. The reason is
> that finer marching does not attenuate the rings, it *moves* them, so two
> differently-wrong images can be far apart, and a metric can improve while
> the picture gets worse. That is exactly how the `t + d` regression passed:
> residual improved 64% while a wall went black.
>
> **Consequence for anyone continuing this.** Do not accept a fix here on a
> number alone; the only instrument that has been reliable across four wrong
> fixes is a person looking at a wall. A metric is worth having as a *guard*
> (near-black must not rise) and is not worth having as a target. Until a
> monotone severity measure exists, the render gate this repository wants
> cannot be built for *this* defect — though it can still be built for the
> things that are monotone, like link time and frame time.

> **A working severity metric, which is the real result of this session.** Two
> turns before this I wrote that no monotone measure of this defect could be
> built. That was wrong, and wrong in an instructive way: I had been trying to
> derive one by *differencing images*, which fails because finer marching moves
> the rings rather than attenuating them. The metric has to come from geometry.
>
> Every stone surface in this Library is axis-aligned -- walls vertical, floor
> up, ceiling down -- so the correct `n.y` on any stone pixel is exactly one of
> {-1, 0, +1}. **The distance from `n.y` to the nearest of those IS the normal
> error**, needs no reference render, and is computed straight out of the
> `whatis` alpha channel:
>
> ```js
> const e = Math.min(Math.abs(ny), Math.abs(ny - 1), Math.abs(ny + 1));
> ```
>
> Validated against both ends: on the visually clean render it reads 0.35% of
> stone pixels bad, on the visually broken one 7.98% -- **23x separation** --
> and it stays flat at ~0.5% on a grazing view that never had the defect. It
> agrees with the eye in both directions, which none of the three earlier
> proxies did.
>
> **With it, the step-scale curve is monotone and the decision is finally
> legible:**
>
> | variant | % bad normals (perp) | mean normal error | ms | vs base |
> |---|---|---|---|---|
> | step 0.80 shipped | 7.98% | 0.0304 | 3.40 | -- |
> | step 0.60 | 2.28% | 0.0099 | 3.78 | +11% |
> | step 0.25 | 0.35% | 0.0042 | 4.36 | +28% |
> | refine2 | 6.38% | 0.0258 | 3.95 | +16% |
>
> `refine2` -- step to `t + d` only if a second `mapAt` confirms the point is
> still outside solid -- is **strictly dominated**: worse than step 0.60 on
> both quality and frame. It also cost +16% rather than the +1.3% I predicted
> from "one call in seventy-nine", which is the third time this session that
> reasoning about cost lost to measuring it.
>
> **The gate this repository wanted is now buildable.** `pctBadNormals` on a
> handful of canonical views is a scalar with a validated threshold, no
> reference image, and no human in the loop -- exactly what was missing when
> four wrong fixes went by unchallenged.

> **What is still true.** The mechanism -- a march tolerance of ~7-12 mm
> against a fixed +/-1.6 mm normal probe, with the integer step count turning
> the mismatch into rings -- is unchanged and still the best explanation.
> Fix it by making the probes commensurate (`?ablate=normeps`, safe because it
> does not move the hit point) or by making the field conservative (§11's
> route). **Do not** step forward on trust; `?ablate=badrefine` reproduces the
> regression if anyone wants to see it.
>
> **The cause: two tolerances that were never reconciled.** `marchRay` stops
> when `d < 0.0018*t + 0.0012` — about 7 mm at 3 m, 12 mm at 6 m — and
> returned `t`, leaving the hit point that far **short** of the surface.
> `normalCtx` then estimates the gradient over a **fixed ±1.6 mm**. A probe
> five times smaller than the offset it is standing on measures the local
> shape of a composite min/max field instead of the surface. And because the
> step count that first satisfies the tolerance is an **integer**, the
> residual came out in concentric rings — which is why a defect in a *scalar
> tolerance* looked like organic shapes painted on a wall.
>
> From there: wrong normal → `dot(n, L)` → `lit` → and the near-vertical
> stone lift multiplies it by 0.30 on a surface whose total is ~0.1. Violent
> on bare stone, invisible on books, which that line excludes and whose own
> luminance is 5× higher.
>
> **The fix is one add, outside the loop:** `return t + d` instead of
> `return t`. `d` is a lower bound on the distance remaining, so `t + d` lies
> at or before the surface — closer, never past it.
>
> | | before | after |
> |---|---|---|
> | pixels landing within 1.6 mm of the surface | 16% | **74%** |
> | mean residual \|mapAt\| at the hit point | ~31 | **11.2** (−64%) |
> | frame, 775×473, timed against a readPixels sync | 4.78 ms | **4.26 ms** |
>
> Faster, if anything — a shorter `t` is not a cheaper march, so read that as
> free rather than as an improvement.
>
> **What the probe settled that argument could not.** Three channels in one
> shader variant: `|mapAt|` at the hit point, the shelving's chosen wall
> pair, and the doorway cull box. The overshoot came out as concentric rings;
> the wall-pair partition came out as one near-vertical boundary; **they did
> not coincide**, which killed the leading hypothesis in one image. Both of
> the reporter's questions were answered by that render and neither by
> reasoning:
>
> - *Why only some door gaps?* It is not the gaps. It is the **large
>   uninterrupted expanse of bare dim stone** a gap leaves beside it — the
>   only surface where the lift dominates and no texture hides the rings.
> - *Why a small rectangular section?* That rectangle is the **doorway
>   aperture** and the casework flanking it, which bound the exposed stone.
>
> Everything below this box is the record of the hunt before a reproducible
> view existed, kept because four of the six negatives are still the useful
> part — and because the first three sessions each convicted a term that was
> merely downstream of the real one.
>
> | Ablation on the reported view | Crescent |
> |---|---|
> | `lift` — drop the near-vertical stone lift | **gone**, and the wall goes black |
> | `softlift` — lift ∝ `lit`, cannot band | still there |
> | `lampramp` — ramp the hard lamp radius cutoffs | still there |
> | tone quantiser off (`grain=3`) | still there |
> | `occ` — force AO to 1 | still there |
> | **`march` — step scale 0.80 → 0.25** | **gone** |
>
> The chain: the stone field over-reports, so the ray lands *past* the
> surface, where the gradient is nonsense. The wrong normal goes into
> `dot(n, L)` and therefore into `lit`. The stone lift then multiplies that
> error by 0.30 on a surface whose total luminance is ~0.1 — a 300% swing —
> which is why it is violent on bare walls and invisible on books, whose
> material is excluded from that line and whose own luminance is 5× higher.
>
> **This is §11's defect, in the half of the field §11 did not fix.** §11
> found exactly this mechanism on the *shelving* — `mod()` repeating a shelf
> that is not there, two culls dropping casework and books out of the field —
> made those three conservative, and measured the result on spines. The
> hexagon shell was never audited. 8.5% of surface pixels carried a bad normal
> at step 0.80 then; nobody asked which surfaces.
>
> **And it is why `lift` looked like the answer twice.** Removing the
> amplifier removes the symptom, so the lift convicts itself under ablation
> while being innocent — the same shape of error as AO looking guilty for the
> spines in §11. An ablation that removes a symptom has found *a* term in the
> chain, not necessarily the first one.
>
> **Not fixed yet, and the cheap fix is the wrong one.** Dropping the march
> step to 0.25 costs roughly what §11 measured at 0.30: **6.7× the frame**.
> The precedent is to make the field conservative instead and keep the step at
> 0.80, which §11 got "for nothing" (6.58 ms against 6.27). That means
> auditing the stone path of `mapAt` — the hexagon shell, the ceiling and
> floor planes, and the doorway carving — for the same three sins: a `mod()`
> that repeats geometry that is not there, and culls that discard rather than
> comparing against the best distance so far. Roadmap item 1; §15's link
> budget applies to any edit in there.

---

**The record of getting there, before the view existed.** Two mechanisms ruled
out below are still ruled out; the shape argument is still the reason the whole
step-function class was never it.



**The report.** Large smooth dark shapes on a bare stone wall at
`floor/-3/cell/-35,-42`, sent as a screenshot. Books unaffected — *"the books
are good enough, but the wall is distracting and harms the vibe."* This is the
same symptom as §11, which fixed it on the spines and on one stone path and
did not fix it here.

**Ruled out, with numbers.**

| Suspect | Ablation | Result |
|---|---|---|
| Hard lamp radius cutoffs (`if (dl > 11.0) continue`) | ramp each lamp's attenuation to zero before its cull radius | **0.02% of pixels change.** Not it. |
| Ambient occlusion | force `occ = 1.0`, diff against a stored baseline | 5–7% of pixels change, and the difference image is **thin lines at shelf edges and corners** — contact darkening, correct AO behaviour. No blobs. Not it. |

The AO test is worth keeping even though it was negative, because AO had never
actually been cleared for *stone*. §11 convicted it, then exonerated it on the
strength of the spines — and spines take `base = sp`, which does not read `occ`
at all. Bare stone does: `base = mix(C_INK, C_STONE, 0.55 + 0.45 * occ)` puts
the ambient term straight into the albedo at 45% strength. That path was
untested until now. It is clean.

**Why the first theory was wrong, and the discriminator I should have used
first.** A hard cutoff is a step function on a continuous quantity, and §11 had
just found one of those, so it read as the obvious next instance. But a step
function draws a **line** — the locus where the quantity crosses the threshold —
and the reported shapes are **filled regions with soft edges**. Shape alone
ruled the whole class out before any code was written. Two minutes of looking
at what the symptom *is* would have saved the theory.

**Not reproduced.** 60 views at the reported cell — both gap walls, three
pitches, two standing distances — on the reporter's own machine and GPU
(`ANGLE (AMD Radeon RX 5700, D3D11)`), and none of them shows the arcs in the
screenshot. Non-reproduction is not evidence of absence here; it is evidence
that **the view is the missing variable**.

**What would close it, in order.**
1. ~~Orientation in the address.~~ **Done, and not in the address.** The HUD
   cited floor and cell but not where you were looking, so a screenshot was
   not a reproducible coordinate — which is why 60 views could be swept
   without hitting the reported one. **V** now copies
   `?at=<address>&view=x,y,z,yaw,pitch`, and a pasted view restores the
   camera bit for bit: 0 of 366,575 pixels differ across a page load.

   It went in the renderer's query string rather than the `babel://` address
   on purpose. Every component of an address is checkable — `validate()`
   refuses a doorway, a shaft, a slot out of range — and that falsifiability
   is what the citation oracle rests on. A yaw is not checkable: every yaw is
   legal and `core/` has no camera in it. Putting it in the address would
   also have broken every older holder, since `parseAddress` whitelists
   components and *throws* on anything else, so a new address would be
   rejected rather than degraded. Four assertions now pin the separation so
   that moving it later is a decision rather than a drift.

   Position is carried as well as direction, and that is not padding: the
   ambient term and both lamps are distance functions, so where you stood
   changes the frame. Full precision rather than rounded, too — a tenth of a
   degree looked tidier and measured as a third of a pixel of shift, which
   moves ~75% of pixel values across dithered spines. Harmless for looking at
   a wall; not harmless when the next step is an A/B between two page loads,
   where that jitter would land in the diff beside the ablation.
2. Then ablate on the *reported* view rather than a guessed one. The harness
   exists: `?ablate=occ,albedo,lift,litocc` substitutes a term out of the
   shader source before compilation.
3. If it survives all four, the remaining suspects are the tone ramp
   interacting with `lit` near the `smoothstep(0.18, 0.38, lit)` knee, and the
   dither at 1:2 buffer scale — neither yet tested on stone.

**Do not ablate with a runtime `uniform` guard.** See §15.

### 14. A doorway into a stairwell that arrives nowhere

**The report.** At `floor/307/cell/313,306` a stairwell opening renders as a
flat black rectangle with nothing visible beyond it. Described as visual only:
*"when i go through its into a corridor."*

**It is not lighting.** Wall 3 of that gallery is a `PASSAGE` into the
stairwell at `312,306`, whose axis is **0**. The far end of that axis faces the
corridor at `311,306`, whose axis is **2**. `gapAt` walls off any
corridor/stairwell edge whose axes disagree — deliberately, and the comment
there says so. So the flight is open at one end and solid rock at the other:
a **one-ended stairwell**. The renderer carves the gallery's doorway and the
flight because the gap rule says `PASSAGE`, and beyond it is an unlit pocket
with no exit. The black rectangle is the pocket.

**It is not rare.** Over a 121×121 sample: **127 of 1,741 stairwells are
one-ended — 7.3%**. 92.4% are two-ended, 0.3% sealed. §17.13 measured exactly
this distribution for corridors (96.8 / 2.7 / 0.5) and never for stairwells,
which is why a 7.3% rate has been shipping unremarked.

**The part that is worse than the visual, and the reason this is not filed as
cosmetic.** `throughStairwell` returns null for that move, so `apply()` refuses
it — *"that stair is a dead end."* The renderer's collision lets you walk
through. **The seam and the renderer disagree about where you can go**, on a
doorway that 7.3% of stairwells have. That is the GLSL/JS twin-drift class of
§17.10 wearing different clothes: an agent's transcript and a human's walk
diverge at the same opening, and the citation environment's whole premise is
that they do not.

**What would close it.** In `gapAt`'s stairwell branch, do not open an axis end
unless the opposite end is also open. The caution is cost, not correctness:
`cellDesc` calls `gapAt` six times and the shader calls `cellDesc` for every
cell a ray enters, so this lands on the hottest path there is — and §15 is the
measurement of how little headroom is left. Measure the link and the frame
before and after, or take the cheaper half: leave the topology alone and stop
*drawing* a doorway whose far side is rock.

### 15. The shader is one small edit away from an 81-second link

**Found while building the harness for §13**, which makes it a defect the
mottling hunt produced rather than one it was looking for.

The ablation was first written the obvious way: a `uniform int uProbe` and
three `if (uProbe == 1)` branches guarding terms in the shading path. The link
went from effectively instant to **81.2 s**, printing the warning §17.13's
timer was built to print — *"close to the point where the driver gives up."*

Rewriting it as **source substitution** — rewrite the term out of the shader
string before `compileShader`, so each variant is the same size or smaller —
still linked in **66.7 s** for the `occ` variant, which *removes* three `mapAt`
calls. Link time here is not monotonic in source size: taking work out made it
slower, because constant-folding `occ` to `1.0` opens inlining paths that were
previously closed.

**What this means, and why it is an open defect rather than a note.** §17.13
reads as a solved problem — the two-call-site blow-up was found, the bounce
became a loop, the link became instant. The margin that bought is much smaller
than the record implies. **Any future work in the shading path can trip a
60–80 second link**, and the failure mode is a page that appears to hang, three
reloads, and Chrome disabling WebGL for the whole session (§10). Nothing
currently measures the margin, so nobody would know it had narrowed until it
was gone.

**What would close it.** A link-time budget in the test suite — compile and
link the shipped shader in a headless context, assert the link completes under
some seconds, and fail loudly when a change spends the remaining headroom. The
timer already exists; nothing asserts on it.

**Two things I would keep.** The first is that this is §10's own lesson,
re-learned by ignoring it: *guarding code at runtime does not remove it.* It is
written down, in this file, and I did it anyway. The second is that the
instrument caught it immediately — the link timer §17.13 left behind turned
what would have been "the page seems slow today" into a number, on the first
run.

*Also, and closed as soon as it appeared:* writing the generated
`app/babel-phase1.html` from a Python script in text mode renormalised the line
endings inside all five inlined regions. `npm run check` reported STALE on the
next run and `node core/build.mjs` restored it. The staleness gate exists for
drift between `core/` and `app/`; it caught a corruption it was not designed
for, which is the second time a tool in this repository has been saved by a
check aimed at something else.

### 16. The floorboards give out 12,604 storeys up

**Open by decision, not by ignorance** — the mechanism below is established and
exact, and the reporter asked for the explanation rather than the fix.

**The report.** Around floor 12,603 the floor texture stops while everything
else keeps rendering, tested as high as 65,535.

**The mechanism.** `normalCtx` samples the distance field at `p ± 0.0016 m` to
recover the surface normal. World height is `floor × 2.60 m`, and float32 has
23 bits of mantissa:

| floor | world y | float32 ULP | does `y + 0.0016` differ from `y`? |
|---|---|---|---|
| 6,301 | 16,383 m | 0.98 mm | yes |
| 6,302 | 16,385 m | 1.95 mm | yes, but coarser than intended |
| **12,603** | **32,768 m = 2¹⁵** | 1.95 mm | yes — last good floor |
| **12,604** | 32,770 m | **3.91 mm** | **no — the offset vanishes** |
| 65,535 | 170,391 m | 15.6 mm | no |

Above 2¹⁵ metres the ULP exceeds twice the epsilon, so `p.y + eps == p.y` bit
for bit, the y-component of the gradient is identically zero, and
`floorish = (mat < 0.5 && n.y > 0.62)` can never be true. The floor stops
taking the floorboard material and falls through to the generic stone branch.

**Why only the floor.** Everything else keys off x/z gradients — which stay
precise, because horizontal coordinates near the origin are small — and off
material ids, which do not involve y at all. The one surface identified by its
*vertical* normal is the one surface that disappears. Degradation actually
begins at floor 6,302, where the epsilon first drops below one ULP and normals
start quantising; 12,604 is where it reaches zero.

**No floor limit should be enforced, and enforcing one would breach the
specification.** LIB-A-013 and LIB-A-020 require floors unbounded and no
traversal terminating. The lattice is genuinely unbounded: cell types and gaps
are integer hashes, well-defined to ±2³¹. What degrades is a renderer
coordinate choice, not the Library.

**The fix, when it is ever wanted.** March in camera-relative Y — subtract the
viewer's storey base before marching, keep the absolute floor as an integer for
the lattice — so precision tracks distance from the viewer instead of altitude.
The renderer is then good to any floor the hash supports. The hard ceiling
either way is floor **6,452,775**, where y reaches 2²⁴ and integers themselves
stop being exactly representable in float32.

---

*Every figure in this document was measured in the session it describes. Where
something is unverified it says so.*
