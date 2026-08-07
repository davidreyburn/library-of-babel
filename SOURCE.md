# The source text is not in this repository

> **On the licence.** `LICENSE` (MIT) covers the work in this repository: the
> code, the specifications, the case study, the documentation. It does not and
> cannot cover Borges's story, which is not included here.

Everything here is derived from Jorge Luis Borges's **"The Library of Babel"**
(*La biblioteca de Babel*, 1941), read as a requirements document. The story
itself is deliberately absent: it remains under copyright — Borges died in 1986,
and the English translation carries its own separate copyright — so it is not
ours to redistribute.

Nothing in the repository needs it. The build, the tests, the simulator and the
agent tools never read it.

## Working with it yourself

Put a copy at `source/the-library-of-babel.md` if you want to follow the
traceability notes with the text beside you. It is gitignored, so it will stay
out of the history.

`notes/to_md.py` is the script used to convert a PDF of the story to Markdown in
the first place.

## How the story is cited

Every requirement in `spec/technical-specification.md` carries a traceability
note: `*[src: "…"]*` quotes the fragment that motivates it, or `*[derived]*`
marks an engineering consequence with no direct source. Across both
specifications that amounts to **27 fragments, 1,155 characters in total, the
longest 91** — citation, not reproduction. The numbers are counted from the
tracked files rather than estimated, and no copy of the story has ever been
committed: `source/` and `notes/*.jsonl` are ignored, and the history has been
checked rather than assumed.

Two examples of what that looks like in practice:

- **LIB-A-020** The lattice MUST be unbounded. *[src: "the corridors and
  stairways and hexagons can conceivably come to an end — which is absurd"]*
- **LIB-A-024** The address→index map MUST be a bijection from one period of the
  lattice onto `[0, N)`. *[derived]*

The interesting claim of this project is that the second kind — the derived
requirements — are almost all forced by the first kind. Borges reasoned out the
consequences himself; the specification mostly writes down what follows.
