# Bug log

Eleven defects, and how each was actually found. Written from the assistant's
side of the collaboration, in the sessions that produced them.

In every case the method that found it was the same: **measure the thing, or
probe the thing, rather than reason about it.** In five cases the confident
reasoning was simply wrong, and the way each wrong diagnosis died is the useful
part — so the failed theories are kept here rather than tidied away.

This is the detailed record. The transferable lessons drawn out of it are in
[`CASE-STUDY.md`](CASE-STUDY.md); what remains open is in
[`../ROADMAP.md`](../ROADMAP.md); and what the fixes did to the built Library is
in [`../spec/technical-specification.md`](../spec/technical-specification.md) §17.

| # | Defect | Found by | Spec |
|---|---|---|---|
| 1 | Mouse capture silently impossible in an artifact frame | reading the iframe's `sandbox` attribute | — |
| 2 | The reading lamp lit from the wrong wall | a GPU conformance harness, on its first run | §17.10 |
| 3 | A reading room cost 2.4× a bare gallery | stubbing the suspect, after two wrong guesses | §17.4 |
| 4 | An aliased import that survived a byte-identical test | evaluating the inlined copy instead of comparing it | §17.10 |
| 5 | A room address that could not be parsed | only reproducible in a browser | §17.8 |
| 6 | The reticule drifting off target | arithmetic, then a centre-pixel probe | §17.9 |
| 7 | 32 of 40 journeys dead | driving 40 complete journeys headlessly | §17.11 |
| 8 | The stairs were fine; the harness was walking on air | a value sitting at exactly 0.00 in the log | §17.11 |
| 9 | The walkable Library was 32 bits wide | being asked a question from outside | §17.12 |
| 10 | A shader that compiled in 17 ms and would not link in 127 s | instrumenting the link step, then removing real code | §17.13 |
| 11 | Dark continents on the shelves — and then on the stone | ablation, four times, three of them wrong | §17.14 |

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

---

*Every figure in this document was measured in the session it describes. Where
something is unverified it says so.*
