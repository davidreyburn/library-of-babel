# Building the Library of Babel

*A record of two working sessions, 1–2 August 2026, written from the assistant's
side of the collaboration. It is deliberately weighted toward what went wrong,
because that is where the method shows.*

---

## What was asked for, and what exists

The opening request was small: convert a copy of Borges's *The Library of Babel*
to Markdown, and derive from it a technical specification for implementing the
Library as described. It grew, over two sessions, into six things:

| | |
|---|---|
| the story, converted to Markdown | the input to everything below; not redistributed here, see `SOURCE.md` |
| `spec/technical-specification.md` | 18 sections, ~200 numbered requirements, each traced to a passage or marked as derived |
| `spec/design-specification.md` | tone, mood, texture and setting, translated into visual terms |
| `app/babel-phase1.html` | a walkable WebGL Library: hexagonal galleries, shafts, stairwells, furnished reading rooms, readable volumes |
| `core/` | one implementation of the lattice and the corpus, shared by the renderer, an agent, and the tests |
| `core/babel-run.mjs`, `core/RUN.md` | the Library as a decision environment for agents, with an exact citation oracle |

The organising idea, which everything follows from, is in the story: the corpus
is every possible book, so nothing can be stored — **a book's address is its
content**. That single constraint decides the architecture. It also proves the
catalogue impossible, because an address is exactly as large as the book it
names.

![the first walkable render](images/01-first-render.jpg)

*The first render. Books are banded stacks, there are no shelf carcasses, the
palette is one pale green, the controls are still "ascend/descend", and the HUD
is showing mojibake. Two sessions of iteration separate this from the images at
the end.*

---

## Part one — the specification

Treating a short story as a requirements document turned out to be the most
productive framing available. The narrator is a domain expert: authoritative on
intent, informal in expression, internally inconsistent in places, and silent on
several load-bearing details. That is an ordinary specification review.

Three things fell out of it that mattered later.

**The impossibility proofs are in the text.** Borges states that the Library is
"unlimited and cyclical" and that no two books are identical. Those are not
decoration; they are the reconciliation of a finite corpus with an endless
building, and they are what let §5.3 of the spec resolve into `index modulo N`.
He did the hard part in prose in 1941.

**Contradictions were registered, not resolved silently.** Four shelved walls ×
five shelves × thirty-five books is 700 volumes per hexagon, which conflicts with
two other passages in the source. §13 records the conflict and says which reading
was adopted and why, rather than picking one and moving on.

**The arithmetic is the feasibility argument.** At one bit per book — a bit that
could record only whether the book exists — the corpus needs about 10^1,834,097
bits against roughly 10^80 baryons in the observable universe. Writing that down
early is what made "compute, never store" obviously the only option rather than a
design preference.

---

## Part two — the prototype, and what iteration actually looked like

Phase 1 was a single self-contained HTML file: a WebGL2 fragment shader ray
marching a signed distance field, with the whole Library as a pure function of
integer hashes. No assets, no geometry, no server.

The user drove it hard, in short specific notes: *the passages are too
claustrophobic; the shelves run together at the corner; I can't see up or down
the stairs; the books have weird banding on their spines; the recliner is facing
backwards which looks creepy; the shafts need guardrails.* Each of those is a
small request that turned out to require a real change to the model rather than a
tweak.

![the gap grammar arrives](images/02-gap-grammar.jpg)

Two deviations from the source were taken deliberately and are recorded in §17:

- **Wall degree is variable, not exactly two.** Strict fidelity to "all sides
  except two" makes the floor plan 2-regular, and every component of a 2-regular
  graph is a cycle — so you get disjoint circuits and can never get a network.
  Openness was set to 0.50, which measures at a gallery giant component of 0.90
  and a mean of 3.07 shelved walls against the text's four.
- **Stairs and shafts occupy whole cells.** A 2.60 m rise needs more run than the
  1.20 m of wall between cavities; as an edge feature it punched 0.7 m into both
  galleries.

The cost of the second is the reason for the first: a stairwell is a *vertical*
link and carries no same-floor traffic, so the galleries have to percolate on
their own. That trade is written down, with the number attached, rather than
being an accident.

---

## Part three — eleven bugs, and how each was actually found

This is the useful part of the record. In every case the method that found it was
the same: **measure the thing, or probe the thing, rather than reason about it.**
In five cases my confident reasoning was simply wrong.

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
stone wall carrying the same shapes. The fix had cleared the spines and done
nothing for the walls, and I had called the defect closed on the strength of
one view. The arithmetic says why, and I could have run it before claiming
anything: an AO probe off a plain wall reaches 0.21 m and never crosses that
seam at *either* margin, so the mechanism I found could never have explained
the walls. **Two symptoms that look identical are not therefore one defect.**
The wall case is open, recorded in §17.13 with the two coordinates that
reproduce it and with a note that the ruled-out list was established on a
shelf and must be re-run on a wall.

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

## Part four — the design decisions worth defending

### 29 symbols, not 25

The user's call, and the reasoning is his: a total library that cannot spell is
missing books. Borges's twenty-two letters are fewer than English has, so four
would be absent — and with them every word using one, every phrase containing
such a word, and every page and book containing such a phrase. That is a
strange hole in a corpus whose whole definition is *all the possible
combinations*, and depending on which four you drop it is not a small one. The
property worth having is that **any English word or phrase can exist here in
principle**. So the alphabet is the one people actually write in: 26 letters,
space, comma, period.

The cost is paid entirely in cardinality — the corpus goes from 1,834,098 decimal
digits to 1,918,667, and each index from 744 KiB to 778 KiB — and nowhere else,
because no index is ever materialised. It matters enormously to any
implementation that tries to store the corpus, where the numbers were already
hopeless.

### Content per symbol, not per book

§6.2 of the spec constructs a book as its index written out in base 29. Taken
literally, every read is a full-width radix conversion of a 778 KiB integer:
about 1.7 × 10^12 word operations naively, and even done well you must compute
the whole book to see one page.

Instead every symbol is a pure function of its own position — `symbolAt(address,
p)`, O(1) — so a page costs its own 3,200 symbols and nothing else. There is no
bignum anywhere in the system, and the spec's arbitrary-precision requirement is
**withdrawn** rather than satisfied. The test asserts it: the last page of a book
is no dearer than the first.

### Two coordinate systems, because one cannot do both jobs

- A **walk** address is a shelf you can stand in front of. The position is hashed
  before it is used, so the volume in the next slot is unrelated rather than a
  near twin — the failure mode of any Library that shelves in index order, since
  consecutive integers have near-identical expansions.
- A **text** address is a volume chosen for what it says, and is invertible by
  construction: you find a phrase by writing its address down.

Search can only ever answer in the second system, and that is arithmetic rather
than a limitation. A chosen 3,200-symbol page occupies 29^-3200 ≈ 10^-4680 of the
corpus; walking reaches about 1.8 × 10¹⁹ distinct volumes. The gap is some 4,660
orders of magnitude. Count distinct texts rather than the ~8 × 10²¹ shelves —
every copy of a text either has the phrase or none of them does, so duplicates are
not extra chances.

### How big it actually is, before and after

Three numbers, because two of them are easy to confuse and the third is the one
that settles the argument.

| | distinct books | share of the corpus |
|---|---|---|
| Walkable, one 32-bit lane | 4,294,967,296 — 4.3 **billion** | 10^−1,918,657 |
| Walkable, two lanes (shipped) | 18,446,744,073,709,551,616 — 18.4 **quintillion** | 10^−1,918,647 |
| The corpus | 29^1,312,000 — a number **1,918,667 digits** long | 1 |

**4.3 billion is a small number, and that was the whole problem.** It is about
thirty times every book ever published. Abandon compute-don't-store and write
them all out at 778 KiB each and the entire walkable Library came to **3.4
petabytes** — a large but unremarkable data centre. Worse: 2³² is *enumerable*.
You could iterate every distinct book the Library contained, on a laptop, over a
weekend. Borges's Library is precisely the thing that cannot be catalogued, and
that one was a catalogue with a hexagonal front end.

**18.4 quintillion is about two and a half times the grains of sand on Earth.**
Stored, 14.7 yottabytes — roughly **eighty years of all human data production** at
current rates. Read at a thousand symbols a second, 7.7 × 10¹⁴ years, some
**56,000 times the age of the universe**. Nobody enumerates it.

**And the fraction barely moved.** The gain is a factor of 4.3 billion, which is
9.63 decimal orders against a denominator with 1.9 million digits — removing ten
zeros from a number that has 1,918,657 of them. Unimaginably small became
unimaginably small.

That is worth sitting with, because it is the honest shape of the thing. **The
widening bought no coverage and was never going to.** Any address short enough to
walk to can only reach a vanishing sliver; to name an arbitrary book you need
6,373,671 bits of coordinate, which is 778 KiB, which *is the book*. What the
second lane bought is that the sliver no longer visibly repeats itself:

| | first duplicate expected after |
|---|---|
| One lane | ~93,000 shelves — **173 galleries** |
| Two lanes | ~6.1 billion shelves — **11.3 million galleries**, about ten months of continuous walking |

A reader who opens a thousand books now expects 2.7 × 10⁻¹⁴ duplicate pairs.
Before, an energetic afternoon could turn one up. The Library is no more complete
than it was; it has stopped being a four-billion-book loop pretending otherwise.

### The pane shows the coordinate system

Every other reading surface hides the grid. Here the address *is* an offset, so
the grid is drawn: line numbers down the gutter, a column ruler pinned across the
top, and a cited passage marking both its line number and its column. You can see
"line 33, column 17" rather than take it on trust. The gutter is unselectable, so
a quote copied off the page still matches the corpus exactly.

![ink on paper](images/07-ink-on-paper.jpg)

---

## Part five — the Library as an agent environment

The user supplied a methodology specification from another project — the
*headless twin* pattern: draw a seam between decisions and effects, tame
nondeterminism at the boundaries, record real runs as replayable transcripts,
plug synthetic policies into the same seam humans use, and gate changes on
invariants, coverage, replay and metrics.

Two rungs of its retrofit ladder came free, because the fiction had already paid
for them: `LIB-G-021` forbids the core from touching a clock or a random source,
so the core was already pure and already deterministic.

**What the environment contributes is an exact oracle.** Most agent evaluation
needs a judge, because most questions of "did it do well?" are matters of degree.
Here one is not. The corpus is a pure function of the address, so whether a quoted
passage really sits at the cited offset is decidable exactly, in constant time,
with no judge model and no rubric. **A fabricated citation is not a matter of
opinion.**

That turns "can an agent explore meaninglessness without becoming stupid?" from
an essay question into a number: citation integrity, verified claims over claims
made.

Four gates, 41 assertions:

```
policy            integrity   claims  verified   rooms  volumes  refused
honest                1.000      896       896    1482     1448        4
fabricator:3          0.625      896       560    1482     1448        4
random                 --          0         0    1805     2471       82
adversary             0.000     1167         0    1150      332     4522
```

Two things the pattern caught that I would not have:

- **The coverage gate earned itself immediately.** Fuzzing was green and 25
  refusal paths had never fired — because the affordance list only offers *legal*
  moves, so a fuzzer picking from the menu can never reach a refusal. That forced
  an `adversary` policy, which models the realistic client: a language model
  naming its own coordinates and sometimes getting them wrong. The primary use
  case was untested.
- **The policy-too-weak failure mode showed up on the first run.**
  Uniform-over-actions picks "report" about one time in eight, so the fuzzer's
  first episode was one step long and covered nothing.

The pattern's own open TODO — metric sensitivity — is closed here: injecting
fabrication at 1-in-2, 1-in-3 and 1-in-5 yields 0.500 / 0.667 / 0.750,
monotonically. An integrity metric that cannot detect fabrication is decoration.

### One excursion, walked and scored

The user asked me to go in myself. Route 1941, 1,422 decisions, 10 rooms, 4
volumes, 1,393 pages, **4,457,600 symbols read**, ending seated in a reading room
two floors down. Eight citations, all eight verified.

I went in carrying 172 words written down first. The tally: 607 four-letter hits,
12 five-letter, one six — and the six-letter one was **`random`**, at page 204,
line 33, column 17 of one volume.

The honest accounting matters more than the coincidence. Expected count for that
class of word over 4.46 M symbols was 0.12, and the chance of at least one was
11%: lucky, once, and I would have found nothing four times in five. To expect a
single `library` I would have needed about 5.4 million pages — 3,900 volumes
cover to cover, against the four I managed.

And every hit came from a list I brought with me. The Library did not say
`random` to me; I asked 172 questions 4.46 million times and one came back yes.
What the address does is remove the difference between *finding* and *making*: I
chose where to look, but not what was there. In an environment where meaning is
guaranteed to exist somewhere, a citation is the only thing separating a
discovery from a claim — not the interpretation, the offset.

---

## Part six — what the method was

Stated plainly, because it is the transferable part.

1. **Probe the thing, do not reason about it.** The GPU harness found the lamp
   bug. Stubbing found the furniture cost. A centre-pixel read found the
   reticule error. Each took minutes; each replaced an argument I would have
   lost.
2. **Measure before optimising, and stub before measuring.** Three of my
   performance hypotheses were wrong, including two I was confident about. The
   cost of checking was always smaller than the cost of being wrong.
3. **A silent failure is worse than a loud one.** Pointer lock failing quietly
   cost a session. The fix was not making it work — it cannot work there — but
   making it *say so*.
4. **Text identity is not behavioural identity.** A byte-identical inlined copy
   still threw in a browser. Tests should run the artifact, not just compare it.
5. **A mean is the wrong instrument for a stutter.** An fps counter averaged over
   half a second reported 200 while the page felt terrible. The panel now shows
   the worst frame beside the mean, which is what turned "laggy as hell" into two
   numbers.
6. **A clean local profile proves nothing about someone else's machine.** I
   measured 5.9 ms p50 and no hitches while the user was suffering. Ship the
   instrument and ask for the number.
7. **Write departures down with their cost.** Every deviation from the spec is in
   §17 with the measurement that justified it. That is what made it possible to
   change the alphabet in one session without breaking anything.
8. **Never state a diagnosis as fact without the probe.** The one time I did, the
   user caught it, and he was right to.
9. **When the harness and the thing disagree, suspect the harness first.** A test
   that leaves out part of the state will confidently indict the part it left
   out. Mine drove the walker without the step that makes feet follow the
   ground, and then reported that the stairs were broken — which sent me
   measuring flights that were fine. The tell was in the log the whole time: a
   number that never changed at all. **A quantity that is *exactly* constant
   through a test is usually not being computed, not being conserved.**
10. **A feature is not finished when it runs, it is finished when it is
   measured.** The auto-walk worked the first time I tried it by hand. Driven
   400 times it arrived 10% of the time. One trial tells you a thing is
   possible; a distribution tells you whether it works.

### Where I was wrong, listed

- Claimed pointer lock was refused for cross-origin reasons, without checking.
  Right conclusion, wrong mechanism, asserted too strongly.
- "Verified" that behaviour with a test whose click never reached the page.
- Blamed a doubled anchor scan for a 9 ms performance cliff. It cost 0.6 ms.
- Expected a hoisted distance check to help. It gained 0.02 ms.
- Corrupted two files during the final cleanup by writing a PowerShell script
  with nested arrays, which the shell flattened into character-level string
  replacements. Recovered both intact from Claude Code's file history, and the
  drift test then proved the recovery byte-exact. The lesson is the same one as
  everywhere else: use the precise tool, not the clever script.
- Spent a long stretch measuring stair geometry that was correct, because my own
  harness omitted the step that makes feet follow the ground. Two wrong
  hypotheses along the way — that stairwells were being entered off-axis (they
  never are, 0 of 234 sampled), and that a per-floor doorway pattern was closing
  behind the walker. Both plausible, both measured, both wrong. The evidence
  that mattered was a value sitting at exactly 0.00 in my own log.
- Built the auto-walk on cell centres without noticing that adjacent galleries
  are 4.84 m apart and only 3.64 m wide, so they do not touch. The number was in
  `G` the whole time.

---

## Part seven — what it cost

Measured from the two session transcripts rather than from an invoice. Claude Code
writes a `usage` block on every model turn; these are those numbers summed across
1,977 turns, then priced at Claude Opus 5 list rates — $5/M input, $25/M output,
$0.50/M cache read, and $10/M cache write at the one-hour cache TTL these sessions
used. Both sessions ran on a subscription, so **this is an API-equivalent cost and
not a bill.** Output includes thinking tokens, which the API reports as output.
Writing this section is itself adding to the totals, so treat them as a snapshot
taken at 21:40 UTC on 2 August.

### The two sessions

| | 1–2 Aug | 2 Aug | total |
|---|---|---|---|
| elapsed | 11 h 39 m | 6 h 55 m | 18 h 34 m |
| prompts a human typed | 26 | 29 | **55** |
| model turns | 755 | 1,222 | 1,977 |
| tool calls | 370 | 700 | 1,070 |
| output tokens | 1.87 M | 1.70 M | 3.56 M |
| cache writes | 2.92 M | 3.82 M | 6.74 M |
| cache reads | 379.0 M | 545.7 M | 924.7 M |
| uncached input | 1,406 | 2,288 | 3,694 |
| API-equivalent | $265 | $353 | **$619** |

Of the 18 h 34 m elapsed, the model was generating for 7 h 53 m; the rest was the
user reading, walking the Library, and — for one 5 h 50 m stretch — asleep.

Sixty messages carry the `user` role, but five are machinery: four skill documents
the harness injected and one compaction summary. The 55 that remain are what a
person actually typed, and they come to **2,062 words**, about 12 KB. Against that
the model emitted 3.56 M output tokens — roughly **1,700 output tokens per word
typed**.

### Where the money went

| | tokens | of all tokens | cost | of all cost |
|---|---|---|---|---|
| cache reads | 924.7 M | 98.9% | $462 | 75% |
| output, incl. thinking | 3.56 M | 0.38% | $89 | 14% |
| cache writes | 6.74 M | 0.72% | $67 | 11% |
| uncached input | 3,694 | — | $0.02 | — |

The shape of that is the finding, and it held steady as the project tripled in
length. **Almost nothing was spent writing the Library; nearly all of it went on
re-reading the conversation about writing it.** Each of the 1,977 turns re-read an
average of **468,000 tokens** of cached context in order to emit an average of
**1,800**. Caching is the only reason that is affordable — at the uncached input
rate the same traffic would have cost about $4,750, so the cache cut the bill
**7.7×**.

The same arithmetic explains why identical instructions get dearer as a session
runs. "proceed with fixes" cost **2¢** at 19:15 on the first evening. "go, do
both together" — four words, the same brevity — cost **$35.04** at 15:35 the next
afternoon, because by then each turn re-read a large context, and that particular
instruction bought 174 turns and 107 tool calls. The project's first five prompts
cost $6 between them; its last five cost $73. The prompting did not change. The
context did.

### Cost per unit of work

- **$11.25 per prompt** mean, $10.37 median.
- **5.8¢ per line** across the 10,632 lines of hand-authored tracked text — code,
  specifications, documentation, skill — in 32 files, excluding generated fixtures
  and images. About 190 kept lines per prompt.
- The two most expensive prompts were "go, do both together" ($35.04: the shared
  core, the `babel://` scheme, the agent skill) and "this is a good place to pause
  and clean up" ($33.83: the case study, the repository, the licence and privacy
  audit — and the file corruption plus its recovery).
- The cheapest useful prompts were the steering ones. "run step 0 first, then
  report back" cost $1.60 and set the frame for a four-part implementation. The
  378-word message explaining what the shared core was *for* cost $0.65, because
  it asked for thinking rather than doing.

### Prompting efficiency, as I'd rate it

| | | evidence |
|---|---|---|
| signal per word | excellent | median prompt 23 words; 19 of 55 under 15 words; exactly one over 100 |
| words spent where they matter | excellent | the single long message is the one that shaped the architecture |
| bug reports | excellent | named the axis and condition ("off-target as i go to the far left and right"), or the contradiction ("says 200fps but its laggy as hell") |
| willingness to overturn me | excellent | 11 words killed a wrong diagnosis I had stated as fact |
| decision throughput | good | five decisions settled in 47 words; others correctly delegated back ("make a recommendation") |
| mid-flight checkpoints | mixed | one explicit checkpoint, high value; otherwise long autonomous runs |
| instrument-backed reports | improvable | "laggy as hell" needed a round trip to become 7.7 ms / 11.8 worst |
| front-loading model-shaping constraints | improvable | the 29-symbol alphabet arrived after the 25-symbol core was built and tested |

Overall: **efficient, and efficient in the way that actually matters** — brevity
where brevity was enough, length exactly where the design was at stake, and
corrections delivered early rather than politely deferred. The highest-value
prompt in the log is "well pointer lock had worked previously so something must
have happened". Eleven words, $10.69, and it stopped a confident wrong
explanation from reaching this document.

But the honest accounting is that **prompt phrasing was not the binding
constraint on cost — context size was, and my own wrong turns were.** Three
performance hypotheses of mine were wrong, one diagnosis was asserted without a
probe, one test compared bytes when it should have run code, and I corrupted two
files with a shell script during cleanup. Reading the per-prompt profile, I'd put
$60–100 of the $619 on those and their repair. That is an estimate rather than a
measurement, because the same intervals also contain the work that succeeded.

### What I would change

Mine to fix:

1. **`git init` in the first ten minutes.** The repository was created in the last
   hour of the second session. Had it existed on day one, the file corruption
   would have been `git checkout` instead of a recovery scramble through Claude
   Code's file history. This is the single change with the largest expected saving.
2. **Offer a checkpoint on any multi-part instruction.** "wwwwall of it" and "go,
   do both together" were good value, but the mechanism that makes them good —
   an hour of unsupervised work — is the same one that makes a wrong assumption
   cost an hour. The one time a checkpoint was requested it paid for itself.

Worth doing from the other side:

3. **Quote the instrument.** The HUD now prints mean and worst frame time; naming
   those two numbers in the first message about a stutter removes an exchange.
   This is only fair to say in hindsight — the readout did not exist when the
   report was made, and building it was the response.
4. **State the machine once, at the top.** Nine performance exchanges happened
   without me knowing the GPU or the refresh rate, and I twice concluded nothing
   was wrong from a clean local profile.
5. **Give data-model constraints before the data model exists.** Changing the
   alphabet cost a rebuild of the vectors and the conformance fixtures. It was
   cheap only because the core was well factored.

---

## Where it stands, and what is left

Green: 137 core assertions, 41 gates, 500 GPU integers, build current. Walking
somewhere on purpose arrives 197 times in 200 and says why when it does not.

The corridor closes §9.3, the last part of the specification that was written
and not built: the hallway is now a cell type, 1 in 22, with a mirror, a latrine
or a standing closet in alcoves off it, and a flight of stairs at the end of 1 in
5. LIB-P-020, 021, 023 and 024 are met; LIB-P-022 — the stairway *inside* the
hallway — remains deviated for the same reason stairs got their own cells in the
first place. The mirror hangs in one other place: three reading rooms in
sixteen hold a mirror on the wall and nothing else. Between the two, a mirror
stands in about 1 cell in 80.

Open, in rough order of value:

1. **Mouse capture done properly**, once this lives outside the artifact frame.
   What ships today is an imitation — hidden cursor and edge-turning — and the
   user was right that it "doesn't feel totally legit". When there is a real
   home, delete the imitation rather than build on it.
2. **The last hand-written mirror.** The hash deciding which slots the Purifiers
   emptied lives inside the shader's `mapAt`, too entangled with the SDF to
   extract as it stands, so `volumePresent()` is a hand-written twin guarded only
   by a statistical test. It would catch a broken mirror, not a subtly different
   one.
3. **Rung 6 with a real policy** — point a language model at the seam and read
   its integrity. Everything it needs exists; that number is the first one that
   would say something nobody in this project knows yet.
4. **Mottling on bare stone walls — the original report, still open.** The
   ambient-occlusion fix cleared this on book spines and did nothing for the
   walls; see the end of bug 11. Reproduces at `floor/-1/cell/0,3` and
   `floor/0/cell/-11,0`. The §17.4 mechanism is arithmetically ruled out for
   walls, and the other three suspects were eliminated on a shelf, not a wall,
   so they have to be re-run. **Ablate on a wall first.**
5. **Rippled chunks missing from a book's cover, seen from the side.** At a
   grazing angle the edge of a volume tears into ripples, as though pieces
   were cut out of it. The likely lead is already on record: when the march
   was instrumented to paint step-exhausted pixels, the marked ones lay in
   **thin lines along exactly these silhouette edges**. A ray creeping along a
   surface at a grazing angle either exhausts its 72 steps or oversteps at
   `d * 0.80`, and both would read as chunks missing. Paint exhaustion again
   and look at a book edge. Possibly the same root cause as 4, possibly not —
   do not assume.
6. **Tune how often a mirror turns up.** One cell in 80 is a second guess, not
   a measured answer to anything. Seven of ten wandering routes meet one inside
   400 steps, at a median of 69. The frequencies that decide it are named
   constants and one kit table in `babel-core.mjs`; moving them moves nothing
   else.
7. **The richer corridor-axis rule — measured, and declined.** The version
   dropped while hunting the link failure was innocent of it, and there is
   shader budget for it now. What it buys is exact: one-ended corridors fall
   from 27 in 376 to 5, which is **21 fewer dead ends per 8,281 cells**, one
   per ~390. What it costs is a *second* reshuffle of the lattice — 1.5% of
   gallery wall slots change verdict, touching 8.1% of galleries — so every
   walk citation would have to be re-checked again for a difference almost
   nobody would walk into. Declined on those numbers, not forgotten.
8. A Three.js port, if a durable build is ever wanted.

---

*Every figure in this document was measured in the session it describes. Where
something is unverified it says so.*
