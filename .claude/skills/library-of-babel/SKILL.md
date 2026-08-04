---
name: library-of-babel
description: Walk and read Borges's Library of Babel as a deterministic environment. Use when asked to explore the Library, find or verify text in it, wander it and report, check a babel:// citation, or reason about its layout. Every room and volume is a pure function of its address, so two agents at the same coordinates see the same thing.
---

# The Library of Babel

A deterministic Library: a corpus of 29^1,312,000 volumes, no storage, every
symbol a pure function of its own position. You can walk it, read it, and — the
part that matters — **cite it**, because a coordinate here is checkable.

Walking reaches about 1.8 × 10^19 distinct volumes of that corpus; a text address
reaches any of them. Both are citations, and the difference matters when you
report — see "Do not claim a walkable shelf holds a chosen phrase" below.

## Before anything else

Work from the repository root — every command below is relative to it. If you
were given a link rather than a checkout:

```sh
git clone https://github.com/davidreyburn/library-of-babel
cd library-of-babel
node tools/babel.mjs here 0,0
```

That last line is the readiness check: if it prints a room and its exits, you are
ready. Node 18 or newer, no dependencies, nothing to build. If it fails, nothing
else here will work and the problem is Node, not the Library.

**Quote your arguments.** A phrase or a quote containing spaces must be quoted,
or the shell splits it and you will get a confident answer to a different
question.

## Three ways in

**Walk to a shelf.** Rooms are hexagonal cells on numbered floors. Most are
galleries with shelved walls; some are shafts, stairwells, reading rooms or
corridors, with no shelves at all. A corridor is Borges's hallway: two
doorways, no books, and sometimes an alcove to each side holding a mirror, a
latrine, or nothing — which is the closet a librarian sleeps standing up in.
`here` names whatever a corridor holds.

```
node tools/babel.mjs here 15,94              # what is here, and every exit
node tools/babel.mjs shelves 15,94           # which walls hold books
node tools/babel.mjs read "babel://walk/00001594/floor/0/cell/15,94/wall/1/shelf/2/slot/17"
```

**Search for a phrase.** Invertible by construction — you find a phrase by
writing its address down.

```
node tools/babel.mjs find "the library is unlimited and cyclical."
```

**Be turned loose.** A reproducible wander: the choice at step *n* is a hash of
(route, n), so the same route is always the same journey and anyone can follow
it.

```
node tools/babel.mjs wander --route 1941 --steps 24 --take 2
node tools/babel.mjs seat --route 1941        # walk until there is a chair
node tools/babel.mjs mirror --route 1941      # walk until a corridor holds one
```

A mirror is in about one cell in 120, so `mirror` finds one on roughly two
routes in three inside its 400 steps and says so plainly when it does not. If
you are asked to go and look at one, cite the corridor: someone else can
stand in front of the same mirror.

Add `--json` to any command for machine-readable output. To import the modules
directly instead, see `core/README.md` and `core/RUN.md`.

## The discipline that matters

**Never report a passage without its coordinates, and verify before you
report.** A claim here is decidable exactly — no judge, no rubric:

```
node tools/babel.mjs verify <address> <page> <line> <column> "<quote>"
```

Exit code 0 means the symbols really are at that offset; 2 means they are not,
with the reason. Run it on every claim you intend to make. If it fails, fix the
citation or drop the claim — do not report it with a caveat.

**Say what you searched for.** The corpus contains every string, so anything
you go looking for is there somewhere. Finding a word you brought with you is
not the Library speaking, and a report that hides the word list is misleading
even when every citation verifies. State what you sought and how much you read.

**Give the arithmetic when it matters.** A specific 6-symbol word turns up about
once per 10^8 symbols read; a 7-symbol one, once per 10^10. If you found
something striking, say how likely that was — `find` prints the corpus share for
a phrase, and a page holds 3,200 symbols.

**Do not claim a walkable shelf holds a chosen phrase.** A given page occupies
29^-3200 ≈ 10^-4680 of the corpus, and walking reaches about 1.8 × 10^19 distinct
volumes — so the gap is some **4,660 orders of magnitude**. Count distinct texts
rather than the ~8 × 10^21 shelves: every copy of a text either contains the
phrase or none of them do, so duplicate shelves buy you nothing. Searching returns
*text* addresses; walking returns *walk* addresses. Both are citations; they are
not interchangeable.

**Coordinates a human can open.** Any address works in the simulator:

```
app/babel-phase1.html?read=<address>     opens that volume at that page
app/babel-phase1.html?at=<address>       stands them in that room
```

Serve it first with `node tools/serve.mjs`.

## Addresses

```
babel://walk/<seed>/floor/<f>/cell/<q>,<r>                     a room
babel://walk/<seed>/floor/<f>/cell/<q>,<r>/wall/<w>/shelf/<s>/slot/<n>   a volume
babel://text/<seed>/at/<offset>/<phrase>                       a volume by its text
```

A room address names somewhere to stand and has no content; asking it for a page
is an error rather than a guess. Walls that are doorways hold no books, and
shafts, stairwells, reading rooms and corridors hold no shelves — `verify`
rejects all of them, which is what makes a claimed coordinate falsifiable.

Pages, lines and columns are **1-based** on the `verify` command line and in
anything you report to a person; they are 0-based inside the modules.
