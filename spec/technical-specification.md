# The Library of Babel — Technical Requirements Specification

**Document ID:** LIB-BABEL-SPEC-001
**Status:** Draft for review; §17 records where the built prototype departs from it
**Derived from:** Borges, "The Library of Babel" (1941; trans. J. E. I.) — not included in this repository, see [`SOURCE.md`](../SOURCE.md)
**Requirement language:** RFC 2119 — MUST, MUST NOT, SHOULD, MAY

---

## 1. Purpose and Scope

This document specifies the requirements for constructing the Library described in the source narrative. It treats the narrator's account as a requirements document written by a domain expert: authoritative on intent, informal in expression, internally inconsistent in places, and silent on several load-bearing details.

**In scope:** the corpus (alphabet, book format, cardinality), the addressing scheme, content generation, the physical plant, habitability, durability, and the acceptance criteria that distinguish a conforming Library from a merely large one.

**Out of scope:** the meaning of the books; the origin of the Library (the source asserts it exists *ab aeterno*, which is a statement about provenance, not a construction requirement); and the wellbeing of the librarians beyond what the source explicitly furnishes (see §10.3, which records this as an unresolved gap rather than resolving it).

Every requirement below carries a traceability note in the form *[src: …]* pointing at the passage that motivates it. Requirements with no such note are engineering consequences, and are marked *[derived]*.

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Symbol** | One of the 25 orthographic characters permitted in book content. |
| **Book** | An ordered sequence of exactly 1,312,000 symbols, plus a spine label. |
| **Slot** | A physical position on a shelf holding exactly one book. |
| **Hexagon** / **Gallery** | The unit room. Six walls, four shelved. |
| **Hallway** | The connecting passage between two hexagons; contains closets, stairway, mirror. Built as the **corridor** cell — see §17.13. |
| **Circuit** | A connected chain of hexagons on one floor. *[src: "circuit fifteen ninety-four"]* |
| **Address** | The tuple that uniquely identifies a slot in the lattice. |
| **Index** | The integer in `[0, N)` naming a book's content. |
| **N** | The cardinality of the corpus; see §4.3. |
| **C** | Symbols per book; `C = 1,312,000`. |

---

## 3. Requirements Notation

Requirement IDs are grouped by area: **C** corpus, **A** addressing, **G** generation, **L** labelling, **S** search, **P** physical plant, **O** operations, **D** durability, **N** non-functional, **X** excluded.

---

## 4. The Corpus

### 4.1 Alphabet

- **LIB-C-001** The content alphabet MUST consist of exactly 25 symbols: the 22 letters of the alphabet, the space, the comma, and the period. *[src: "the space, the period, the comma, the twenty-two letters"]*
- **LIB-C-002** The alphabet MUST NOT include digits or capital letters. *[src: footnote 1]*
- **LIB-C-003** No punctuation beyond the comma and the period MAY appear in book content. *[src: footnote 1]*
- **LIB-C-004** The specific 22-letter inventory is NOT fixed by the source and MUST be declared as a deployment parameter. The narrative's own examples are not a reliable guide: the strings `mcv`, `axaxaxas mlö` and `dhcmrlchtdj` are transcribed into the reader's orthography, and `ö` is outside any 22-letter Latin inventory. *[derived]*
- **LIB-C-005** Content symbols MUST be rendered in black. *[src: "letters which are black in color"]*

### 4.2 Book Format

- **LIB-C-010** Every book MUST have exactly 410 pages. *[src]*
- **LIB-C-011** Every page MUST have exactly 40 lines. *[src]*
- **LIB-C-012** Every line MUST have exactly 80 symbols. The source's "some eighty letters" is approximate; a total Library requires an exact figure, and 80 is adopted. *[src, tightened]*
- **LIB-C-013** Therefore every book MUST contain exactly **C = 410 × 40 × 80 = 1,312,000** symbols. *[derived]*
- **LIB-C-014** All books MUST share a single uniform physical format. *[src: "uniform format"]*
- **LIB-C-015** Every book MUST bear letters on its spine, and those letters MUST NOT indicate or prefigure the content of its pages. See §7. *[src]*

### 4.3 Cardinality

- **LIB-C-020** The corpus MUST comprise every distinct sequence of C symbols over the 25-symbol alphabet, and nothing else. *[src: "all the possible combinations"]*

  **N = 25^1,312,000 ≈ 1.956 × 10^1,834,097**

- **LIB-C-021** The corpus MUST contain no two identical books. *[src: "there are no two identical books"]* Note that §6.2 makes this a property of the construction rather than a constraint to be enforced.
- **LIB-C-022** Admission MUST be governed solely by conformance to the format. Any sequence of C symbols is a valid book; no semantic, syntactic, or aesthetic filter MAY be applied. *[src: footnote 3, "it suffices that a book be possible for it to exist"]*
- **LIB-C-023** The system MUST NOT implement a nonsense filter, a coherence check, or any content moderation. The source is explicit that apparent nonsense is in scope and that absolute nonsense does not occur — this is an interpretive claim about the corpus, not a generation constraint. *[src: "not a single example of absolute nonsense"]*

---

## 5. Addressing and Topology

### 5.1 Hexagon Capacity

- **LIB-A-001** Each hexagon MUST have six walls, of which exactly four are shelved and two are free. *[src: "cover all the sides except two"]*
- **LIB-A-002** Each shelved wall MUST carry 5 shelves; each hexagon therefore carries **20 shelves**. *[src: "Twenty shelves, five long shelves per side"]*
- **LIB-A-003** Each shelf MUST hold **35 books**. *[src]*
- **LIB-A-004** Hexagon capacity is therefore **4 × 5 × 35 = 700 books**. *[derived]* See §13 for the two source passages that conflict with this figure.

### 5.2 Lattice

- **LIB-A-010** A hexagon MUST connect to its neighbours through a hallway on a free side. *[src]*
- **LIB-A-011** Because only two of six walls are free, the floor plan MUST be a **chain**, not a plane tiling: each hexagon has at most two lateral neighbours. This is the structural basis of the *circuit*. *[derived]*
- **LIB-A-012** Circuits MUST be numbered, and the numbering MUST be stable and total. *[src: "circuit fifteen ninety-four"]*
- **LIB-A-013** Floors MUST be numbered, connected by the hallway stairways, and unbounded in both directions. *[src: "ninety floors farther up"; "sinks abysmally and soars upwards"]*
- **LIB-A-014** The canonical address MUST be the tuple
  `(floor, circuit, hexagon, wall, shelf, slot)`
  with `wall ∈ [0,4)`, `shelf ∈ [0,5)`, `slot ∈ [0,35)`. *[derived]*
- **LIB-A-015** The distribution of galleries MUST be invariable: the geometry MUST be identical at every address, with no special-cased rooms. *[src: "The distribution of the galleries is invariable"]*

### 5.3 Extent and Cyclicity

- **LIB-A-020** The lattice MUST be unbounded. No traversal in any direction MAY terminate. *[src: "the corridors and stairways and hexagons can conceivably come to an end -- which is absurd"]*
- **LIB-A-021** The corpus is nevertheless finite (§4.3). The system MUST reconcile these by making the Library **unlimited and cyclical**: content MUST be assigned by index modulo N. *[src: "The Library is unlimited and cyclical"]*
- **LIB-A-022** A traveller proceeding in a fixed direction MUST eventually encounter the same volumes in the same order. The period MUST be exactly N books — **≈ 2.794 × 10^1,834,094 hexagons**. *[src: "the same volumes were repeated in the same disorder"]*
- **LIB-A-023** LIB-C-021 (uniqueness) MUST be interpreted as holding **within one period**. Across periods, repetition is required, not merely permitted. *[derived; resolves §13.4]*
- **LIB-A-024** The address→index map MUST be a bijection from one period of the lattice onto `[0, N)`. *[derived]*

---

## 6. Content Generation

This is the section on which the feasibility of the entire system turns.

### 6.1 The Storage Prohibition

- **LIB-G-001** The system MUST NOT store book content. Not compressed, not deduplicated, not lazily cached to exhaustion — the corpus MUST NOT be materialised.

  This is not a preference. At one bit per book — a bit that could record only whether the book exists — the corpus would require ≈ 1.956 × 10^1,834,097 bits against roughly 10^80 baryons in the observable universe, an overrun by a factor of ≈ 10^1,834,017. Shelved as physical volumes of ordinary size, the corpus occupies ≈ 1.6 × 10^1,834,094 m³ against a universal volume of ≈ 3.6 × 10^80 m³. Every storage-based architecture fails by margins for which the word "astronomical" is a serious understatement. *[derived]*

### 6.2 Address as Content

- **LIB-G-010** Book content MUST be **computed from the address**, not retrieved. *[derived from LIB-G-001]*
- **LIB-G-011** The generation function MUST be the canonical bijection between `[0, N)` and the set of C-symbol strings: **a book's index, written as a base-25 numeral zero-padded to exactly C digits, with each digit mapped to its symbol, IS the book.**

  ```
  content(i)[p] = alphabet[ (i / 25^(C-1-p)) mod 25 ]   for p in [0, C)
  ```

- **LIB-G-012** Retrieval MUST therefore be: `address → index → base-25 expansion → content`. Storage cost for content is **zero bytes**. Total persistent system state is the alphabet declaration, the lattice parameters, and the label key (§7) — a constant, on the order of kilobytes. *[derived]*
- **LIB-G-013** Because LIB-G-011 is a bijection, uniqueness (LIB-C-021) and totality (LIB-C-020) hold **by construction**. The system MUST NOT implement a uniqueness index, a duplicate check, or a collision table; any such structure would itself violate LIB-G-001. *[derived]*

### 6.3 Determinism

- **LIB-G-020** Generation MUST be deterministic, stateless, and referentially transparent. The same address MUST yield the same book for every reader, at every time, forever.
- **LIB-G-021** The system MUST NOT use a random number generator, a clock, a session seed, or any other source of nondeterminism in the generation path. A Library whose volumes changed between visits would be the "feverish Library" the narrator explicitly repudiates, and would falsify LIB-A-015. *[src: "chance volumes are constantly in danger of changing into others"]*
- **LIB-G-022** Retrieval MUST be idempotent and MUST support unlimited concurrent readers. There are no writes; the corpus is read-only. *[derived]*
- **LIB-G-023** Implementations MUST use arbitrary-precision arithmetic. Indices span ≈ 6.09 × 10^6 bits (≈ 744 KiB each). Naïve repeated division is O(C²) in machine words and MUST NOT be used; a divide-and-conquer radix conversion is REQUIRED for acceptable latency. *[derived]*

---

## 7. Spine Labels

- **LIB-L-001** Every book MUST bear a spine label composed of symbols from the letter subset of the alphabet. *[src]*
- **LIB-L-002** The label MUST be short — on the order of one line, ≤ 80 characters. The source's observed examples run to a few words. *[src: the three titles the narrator names]*
- **LIB-L-003** **Spine labels MUST NOT be used for identity, addressing, lookup, or navigation.** They cannot be: a label capable of uniquely naming a book would need **≈ 1,366,259 characters** in a 22-letter alphabet — longer than the book it names. At the mandated 80 characters there are only ≈ 10^107 distinct labels, so each label is necessarily shared by ≈ 10^1,833,990 books. *[derived]*
- **LIB-L-004** The label MUST be a deterministic function of the address (so that LIB-G-020 holds for the whole book object, spine included), and MUST NOT be a readable function of the content. *[src: "these letters do not indicate or prefigure what the pages will say"]*
- **LIB-L-005** A keyed pseudorandom function over the address, truncated to the label length and rendered in the letter subset, is the RECOMMENDED construction. It satisfies LIB-L-004 in both directions: deterministic, and computationally uncorrelated with the pages.
- **LIB-L-006** The apparent incoherence between spine and contents MUST be preserved as a designed property, not treated as a defect to be fixed. *[src: "I know that this incoherence at one time seemed mysterious"]*

---

## 8. Catalogue and Search

### 8.1 The Catalogue Is Impossible

- **LIB-S-001** The system MUST NOT attempt to build a catalogue of the Library.

  **Proof obligation discharged:** by LIB-G-011 the map from index to content is a bijection, so the information content of an address exactly equals the information content of the book — both are ≈ 744 KiB at optimal encoding. **No address is shorter than the book it names.** A faithful catalogue entry therefore cannot be smaller than its referent, and a faithful catalogue of the whole Library cannot be smaller than the Library. *[derived]*

- **LIB-S-002** This is the formal reason the narrative's *regressive method* — consult book B to locate book A, book C to locate B — cannot terminate, and it MUST NOT be implemented. *[src]*
- **LIB-S-003** It is likewise the reason the corpus contains both faithful catalogues and vastly more false ones: any book-length catalogue can index only a vanishing fragment, and every possible erroneous fragment also exists. The system MUST NOT privilege, certify, or mark any in-corpus catalogue as authoritative. *[src: "thousands and thousands of false catalogues"]*
- **LIB-S-004** Navigation MUST be by computation of the address function (§6.2), which replaces the catalogue entirely. *[derived]*

### 8.2 Reverse Lookup — A Deliberate Divergence

- **LIB-S-010** The inverse of LIB-G-011 is trivial: any desired C-symbol string, read as a base-25 numeral, **is** its own index, and the address follows immediately. Locating any specific book is therefore **O(C)**, not a search at all.
- **LIB-S-011** Implementers MUST recognise that exposing this inverse **destroys the narrative premise**. The source's librarians wander for generations because they compute the probability of finding a specific book as zero; a working reverse-lookup endpoint makes every Vindication instantly retrievable and the Man of the Book a trivial query. *[src: "can be computed as zero"]*
- **LIB-S-012** Reverse lookup MUST therefore be a configurable capability with two conformance profiles:
  - **Profile F (Faithful):** reverse lookup disabled. Books MAY be reached only by physical traversal. Preserves the source's epistemic condition and its tragedy.
  - **Profile U (Utility):** reverse lookup enabled. Preserves the source's *structure* but not its *predicament*.

  The choice MUST be recorded in the deployment declaration, because it determines what the Library means to its inhabitants.

---

## 9. Physical Plant

### 9.1 Gallery

- **LIB-P-001** Galleries MUST be hexagonal. Triangular, pentagonal, and circular rooms are out of scope. *[src; the circular chamber is reported only by mystics, whose "testimony is suspect"]*
- **LIB-P-002** Ceiling height MUST equal the height of the shelving, which MUST scarcely exceed that of a normal bookcase. Taking ~2.1 m, the 5 shelves imply a pitch of ~40 cm. *[src, quantified]*
- **LIB-P-003** Shelf run length MUST accommodate 35 uniform volumes. At ~25 mm per spine this gives ~0.9 m, which fixes the hexagon's side length and makes the gallery a room roughly 1.8 m across — low, tight, and consistent with the source's insufficient light and standing-height closets. *[derived; flagged as an assumption]*
- **LIB-P-004** Two of the six walls MUST be unshelved. One MUST open onto a hallway. *[src]* The disposition of the second free wall is not specified by the source; see §13.5.

### 9.2 Lighting

- **LIB-P-010** Each hexagon MUST contain exactly two spherical lamps, transversally placed. *[src]*
- **LIB-P-011** Illumination MUST be **incessant** — continuous, never extinguished, with no day/night cycle. *[src]*
- **LIB-P-012** Illumination MUST be **insufficient** for comfortable reading. This is a requirement, not a defect; a well-lit Library is non-conforming. *[src: "The light they emit is insufficient, incessant"]*

### 9.3 Hallway

*Built as of §17.13, with the deviations recorded there: the fixtures are
occasional rather than universal, and the stairway is next door rather than
inside.*

- **LIB-P-020** Each hallway MUST be narrow and MUST open onto a gallery identical to every other. *[src]* — **built**, 1.24 m wide.
- **LIB-P-021** Each hallway MUST contain two very small closets, left and right: one permitting sleep **standing up**, one for sanitation. *[src]* — **built as alcoves**, but not in every hallway; see §17.13.
- **LIB-P-022** Each hallway MUST contain a spiral stairway passing through it, descending and ascending without terminus. *[src]* — **deviated** (T-4, T-6): the flight has its own cell, and is at one end of about 1 hallway in 5.
- **LIB-P-023** Each hallway MUST contain a mirror that faithfully duplicates all appearances. *[src]* — **built**, as a true single-bounce reflection, in about 1 hallway in 5.
- **LIB-P-024** The mirror's presence MUST NOT be taken to settle the question of the Library's extent. The source records the inference and the narrator's dissent without resolving it; the mirror is a specified fixture, not a diagnostic instrument. *[src]* — **held**: one bounce, so a facing pair doubles the corridor and then stops.

### 9.4 Shafts

- **LIB-P-030** Vast air shafts MUST separate the galleries. *[src]*
- **LIB-P-031** Shafts MUST be bounded by very low railings. The source is unambiguous that these are low; a safe railing is non-conforming. *[src]*
- **LIB-P-032** Sightlines through the shafts MUST reach the upper and lower floors interminably. No floor, ceiling, or obstruction MAY interrupt the vertical view. *[src: "one can see, interminably, the upper and lower floors"]*
- **LIB-P-033** The shafts MUST support indefinite free fall. Bodies committed to them MUST descend without reaching a bottom, and the fall MUST generate wind. *[src]*

---

## 10. Operations and Habitability

- **LIB-O-001** The system MUST support a resident population of librarians. Historical density was one per three hexagons; current density is lower and declining. *[src: footnote 2]*
- **LIB-O-002** Librarians MUST be able to traverse laterally by hallway and vertically by stairway without limit. Stairways MAY be in disrepair; the source reports a broken one. *[src]*
- **LIB-O-003** Librarians MUST be permitted to annotate book covers by hand. Such marks are crude and wavering, and MUST be visually distinguishable from the printed symbols, which are punctual, delicate, perfectly black, and inimitably symmetrical. *[src]*
- **LIB-O-004** The system MUST tolerate destructive human action: books MAY be condemned, discarded into shafts, or destroyed in bulk. *[src: the Purifiers]*
- **LIB-O-005** No such loss MAY be treated as data loss. Because content is computed (§6.2) and the Library is total, every destroyed book remains regenerable at its address, and several hundred thousand near-facsimiles differing by a single symbol persist regardless. Any reduction of human origin is infinitesimal. *[src, formalised]*
- **LIB-O-006** The system SHOULD accommodate official searchers and inquisitors as a role, with the understanding that their function is not expected to succeed. *[src: "no one expects to discover anything"]*

### 10.3 Unresolved Habitability Gap

- **LIB-O-010** The source specifies sleep and sanitation but provides **no food source, no water source, and no air renewal mechanism**, while simultaneously reporting pulmonary disease, epidemics, and a population approaching extinction. This specification does not resolve the gap. Implementers MUST treat sustenance and atmosphere as an **explicit open dependency**, and MUST NOT infer that the source's silence implies these needs are met. *[derived; gap]*

---

## 11. Durability and Integrity

- **LIB-D-001** The Library MUST be incorruptible: books MUST NOT spontaneously decay, fade, or degrade. *[src: "incorruptible"]*
- **LIB-D-002** The Library MUST be perfectly motionless. No structural drift, settling, or reconfiguration. *[src]*
- **LIB-D-003** LIB-D-001 constrains **spontaneous** decay only. It MUST NOT be implemented as tamper-resistance: LIB-O-004 requires that librarians be able to destroy books. Incorruptible means infinite MTBF absent external force, not indestructible. *[derived; resolves §13.6]*
- **LIB-D-004** The Library MUST outlast its readers. Continued operation MUST NOT depend on the presence of any librarian. *[src: "the human species ... is about to be extinguished, but the Library will endure"]*
- **LIB-D-005** The Library MUST remain secret and useless in the sense the source intends: no index, no curation, no guidance, no recommendation surface. *[src: "useless, incorruptible, secret"]*

---

## 12. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| LIB-N-001 | Content storage | **0 bytes** |
| LIB-N-002 | Total persistent state | O(1); kilobytes |
| LIB-N-003 | Retrieval complexity | O(C log C) worst case, per book |
| LIB-N-004 | Determinism | Absolute; bit-identical across time, host, and observer |
| LIB-N-005 | Concurrency | Unbounded readers; no coordination required (stateless, read-only) |
| LIB-N-006 | Availability | Must not depend on any librarian, process, or era |
| LIB-N-007 | Mutability | Read-only. No write path exists |
| LIB-N-008 | Uptime | *ab aeterno* — no initialisation event, no shutdown path *[src: axiom 1]* |

---

## 13. Registered Contradictions in the Source

The source is internally inconsistent at six points. Each is recorded with the adopted resolution; none is silently smoothed over.

**13.1 — Shelves per hexagon.** Early text: 20 shelves, 5 per side, on four sides. Later text: "five shelves for each of the hexagon's walls," which implies 30 across six walls and contradicts the two free walls.
**Resolution:** adopt 20 (LIB-A-002). The four-shelved-walls figure is stated with more structural detail and is required by the hallway and closet geometry.

**13.2 — Books per shelf.** Stated as 35. Later the narrator refers to "the thirty volumes of the five shelves."
**Resolution:** adopt 35 (LIB-A-003). The later phrase is a rhetorical aside in a passage about tautology, not a measurement. Note that Borges's Spanish gives *treinta y dos* (32) here, so no reading of this translation is fully self-consistent; the choice affects hexagon capacity (700 / 640) and the cyclic period, but no other requirement.

**13.3 — Infinite versus finite.** The galleries are "indefinite and perhaps infinite," yet the possible number of books "does have such a limit."
**Resolution:** the source resolves this itself, and the resolution is normative: unlimited and cyclical (LIB-A-021). Infinite extent, finite corpus, periodic assignment.

**13.4 — Uniqueness versus repetition.** "No two identical books" contradicts a traveller seeing the same volumes repeat.
**Resolution:** uniqueness holds within one period; repetition holds across periods (LIB-A-023).

**13.5 — The second free wall.** Two walls are unshelved; only one is accounted for.
**Resolution:** unspecified in the source and therefore a deployment parameter. Assigning it to the air shaft satisfies LIB-P-032 (interminable vertical sightlines) and is RECOMMENDED. Assigning it to a second hallway would permit branching circuits and richer topology, but is not supported by the text.

**13.6 — Incorruptible versus destroyed.** The Library is incorruptible, yet the Purifiers destroyed millions of books.
**Resolution:** LIB-D-003. Incorruptibility governs spontaneous decay, not human action.

**13.7 — The Crimson Hexagon.** Reported to hold books of smaller format, all-powerful, illustrated, and magical — violating LIB-C-014 (uniform format) and LIB-C-001 (no illustrations in a 25-symbol alphabet).
**Resolution:** classified as **non-normative folklore**. The source presents it as the delirium driving the Purifiers, not as observation. MUST NOT be implemented. Implementing it would break totality, since illustrated content is not expressible in the alphabet.

---

## 14. Feasibility Summary

| Architecture | Verdict |
|---|---|
| Store all books | Fails by ≈ 10^1,834,017× the matter in the observable universe |
| Store books, generate on demand, cache | Fails; cache is unbounded and the corpus is not reachable by enumeration |
| Compute content from address (§6.2) | **Feasible today.** Zero content storage, O(1) state, sub-second retrieval with a competent bignum library |
| Single volume of infinitely thin leaves | See Appendix A |

The decisive insight is that the Library's totality makes it *cheaper*, not more expensive, to build: because every possible book exists, no book needs to be recorded. Address and content are the same object under two descriptions. A total library is exactly the library that need not be stored.

---

## 15. Acceptance Criteria

| ID | Test | Pass condition |
|---|---|---|
| T-01 | Format | Any sampled address yields exactly 1,312,000 symbols, all in the declared alphabet, partitionable into 410 × 40 × 80 |
| T-02 | Round trip | `index(address(i)) == i` and `address(index(a)) == a` across randomly sampled and boundary cases |
| T-03 | Injectivity | Distinct addresses within one period yield distinct content; verified by construction proof plus spot-check |
| T-04 | Determinism | Repeated retrieval of one address across processes, hosts, and restarts is bit-identical |
| T-05 | Cyclicity | `content(0) == content(N)`; period measured as exactly N books |
| T-06 | Known artefacts | The all-`mcv` book is retrievable. Note C mod 3 = 1, so the final cycle is truncated after one symbol — 437,333 full repetitions plus `m`. A book whose penultimate page carries `oh time thy pyramids` is likewise retrievable |
| T-07 | Storage | Measured content storage is 0 bytes; total persistent state is O(1) and does not grow with reads |
| T-08 | Label non-correlation | Spine labels are deterministic per address, and statistically independent of page content under standard randomness tests |
| T-09 | No filtering | Adversarial content is returned unaltered; no code path rejects, sanitises, or flags any C-symbol string *(LIB-C-023)* |
| T-10 | Physical conformance | Sampled galleries: 6 walls, 4 shelved, 20 shelves, 700 slots, 2 lamps, low railings, mirror, two closets, stairway. Illumination measurably insufficient |
| T-11 | Profile declaration | Deployment declares Profile F or U per LIB-S-012, and the reverse-lookup path is present or absent accordingly |

---

## 16. Explicitly Out of Scope

- **LIB-X-001** Books that are not text objects. No book can be a ladder, though books describing, negating, and structurally imitating ladders are all in the corpus and MUST be generated normally. *[src: footnote 3]*
- **LIB-X-002** Semantic guarantees. The system MUST NOT promise that any book is true, useful, or coherent, nor that a reader's Vindication is findable by traversal.
- **LIB-X-003** Language identification. The corpus spans all possible languages, including those with no speakers and those whose vocabulary coincides with another's under different meanings. The system MUST NOT tag, detect, or translate. *[src: the closing parenthesis on the word *library*]*
- **LIB-X-004** The circular chamber and its cyclical book. *[src: mystics; testimony suspect]*
- **LIB-X-005** The Crimson Hexagon. See §13.7.
- **LIB-X-006** Provenance. The Library exists *ab aeterno*; there is no build step to specify. Implementers should note the irony that any actual implementation violates this axiom, and that the source anticipates the objection by distinguishing the god who made the universe from the imperfect librarian who administers it.

---

## 17. As Built — Where the Prototype Departs

The Phase 1 prototype (`app/babel-phase1.html`) implements this
specification with the deviations below. Each was taken deliberately, for
navigability or legibility, and each is measured rather than asserted. This
section is normative for the prototype and for anything that must reproduce
its layout — see §18.

### 17.1 Topology

| # | Deviation | Reason |
|---|---|---|
| T-1 | Wall degree is variable, not exactly two (LIB-A-001) | Two open walls is 2-regular, and every component of a 2-regular graph is a cycle. Strict fidelity yields disjoint circuits and can never yield a network: no junctions, no dead ends. |
| T-2 | Five cell types: gallery, shaft, stairwell, reading room, corridor | Borges has only galleries. Stairs, wells and hallways need their own volumes if they are not to eat the rooms. |
| T-3 | A gap is only ever a *passage* or a *hall*; what varies is the destination | Matches how buildings work, and keeps the grammar legible. Note that a *hall* is a wide doorway and a *corridor* is a room; they are different things. |
| T-4 | Stairs occupy cells, not wall gaps | A 2.60 m rise needs more run than the 1.20 m of wall between cavities. As an edge feature it punched 0.7 m into both galleries. |
| T-5 | Reading rooms exist at all | An intentional break with the text — see §17.4. |
| T-6 | The hallway is a cell too, and it does not contain the stairway | Same reason as T-4: the closets and the mirror need floor area a wall gap does not have. The flight is often at the end of one instead — see §17.13. |

**Measured lattice parameters.** Openness 0.50, shafts 0.02, stairwells 0.12,
reading rooms 0.02, corridors 0.10. Over a 91×91 sample: giant component
**0.96** of standable cells, mean shelved walls **3.15** (against 4 in the
text), a shaft in view from about **1 room in 17**, a reading room about **1
cell in 48**, a corridor about **1 cell in 11**.

Openness is forced upward by T-4: a stairwell is a *vertical* link and
carries no same-floor traffic, so the galleries must percolate on their own.
That is the direct cost of keeping stairs out of the rooms, and it is why
mean shelved walls sits near 3 rather than 4. The corridor does not add to
that cost — it is a lateral link like any room — and in fact lifts the mean
slightly, from 3.08 to 3.14, because a wall facing a corridor opens on the
corridor's axis (one chance in three) where a hashed wall opens one time in
two.

### 17.2 Geometry as built

| Quantity | Value | Note |
|---|---|---|
| Volumes per shelf | 35 | LIB-A-003, unchanged |
| Spine thickness | 52 mm | LIB-P-003 flagged this as an assumption; 28 mm gave a 1.70 m room that played as claustrophobic |
| Shelf run | 1.82 m | 35 × 52 mm |
| Wall (hexagon side) | 2.10 m | run + uprights + a 0.09 m return at each end |
| Gallery across flats | 3.64 m | apothem 1.819 |
| Ceiling | 2.10 m | fixed by the text (D-20); width is the lever, not height |
| Cell centre to centre | 4.838 m | |
| Storey height | 2.60 m | |
| Stair | one straight flight, 4.84 m run, ~28° | enclosed corridor 1.24 m wide, cut in rock |
| Shaft void | 3.40 m across | guardrailed at the lip, never crossable |

### 17.3 Determinism

Layout is a pure function of (cell, floor) through one integer hash, with no
stored state and no randomness at run time (LIB-G-020, LIB-G-021 hold). The
same hash is implemented twice — once in GLSL for rendering and once in
JavaScript for collision — and the two must agree bit for bit; `Math.imul`
and GLSL `uint` multiply both wrap mod 2^32. A mismatch here is not cosmetic:
it puts walls where the renderer shows doorways.

Cell type is floor-independent, so shafts and stairwells are permanent
vertical cores. Gap type is floor-dependent, so every storey is a new maze.

### 17.4 The reading room

A rare cell (2%) holding no shelves and some furniture: a recliner, an end
table, a lamp, a desk and chair. This has no warrant in the text at all —
Borges gives his librarians shelves, a latrine and somewhere to sleep
standing up, and nothing else. It is a humanising intrusion, taken
knowingly.

Two rules constrain it. A room never holds everything: contents come from
sixteen fixed arrangements of at most three pieces, and a desk never shares a
room with a recliner. And nothing blocks the way: the group is anchored to a
wall with no doorway, and any piece coming within 0.55 m of a doorway's axis
is dropped. Since every doorway axis runs through the middle of the room,
that keeps the centre clear and guarantees any door reaches any other —
verified by flood fill over 500 rooms, zero failures.

**A fifth piece, added later: the mirror.** Three of the sixteen
arrangements are a mirror on the anchor wall and nothing else at all — no
chair, no lamp, no table. **22.4% of reading rooms** hold one, and every one
that does holds only that. It is the same reflective surface a corridor's
alcove carries (§17.13), so the same single bounce applies; what differs is
that here it hangs in an otherwise empty room, which is a thing worth walking
into and the closest this build comes to composing anything (against D-51,
knowingly).

The arrangements went from eight to sixteen and **the first eight are the
original eight**, so `key % 16` agrees with `key % 8` wherever the index is
under 8: half the reading rooms in the Library are furnished exactly as they
were, and the new half is where the mirror lives. Because it hangs flat on a
wall that by construction has no doorway, the doorway cull can never drop it
— asserted rather than assumed.

### 17.5 The Alphabet Is 29 Symbols, Not 25

**Departs from LIB-C-001.** The content alphabet is the whole English
alphabet plus the space, the comma and the period: `abcdefghijklmnopqrstuvwxyz ,.`

**The reason is totality in the language this Library is read in.** LIB-C-020
asks for every possible book. A 22-letter inventory cannot deliver every
possible *English* one: four letters of the alphabet are absent, and with them
every word that uses one, every phrase containing such a word, and every page
and book containing such a phrase. Whichever four are dropped the loss is
large, and for some choices it is total — an English corpus without `e` is
not a corpus of English. Twenty-nine symbols make **any English word or
phrase expressible in principle**, which is the property a total library is
supposed to have. LIB-C-004 already made the letter inventory a deployment
parameter, so only the count of 25 is departed from.

The cost is paid in cardinality, and it is the only cost:

| | 25 symbols | 29 symbols |
|---|---|---|
| Corpus size **N** | 25^1,312,000 | **29^1,312,000** |
| Decimal digits in N | 1,834,098 | **1,918,667** |
| Bits per index | 6,092,700 (744 KiB) | **6,373,670 (778 KiB)** |

Nothing else moves. No index is ever materialised (§17.6), so a wider radix
costs nothing at runtime — it costs only in the arithmetic of any
implementation that tries to store or enumerate the corpus, where the figures
were already hopeless.

### 17.6 Content Is Generated Per Symbol, Not Per Book

**Departs from LIB-G-011 in mechanism, and makes LIB-G-023 unnecessary.**
§6.2 constructs a book as its index written out in base 29. Taken literally
that makes every read a full-width radix conversion of a 778 KiB integer:
about 1.7 × 10^12 word operations naively, and even by divide-and-conquer you
must compute the whole book to see one page. LIB-G-023 mandates the
arbitrary-precision machinery this needs.

The prototype instead makes every symbol a pure function of its own position:

```
symbolAt(address, p) -> one of 29 symbols,   O(1) in C
```

A page costs its own 3,200 symbols and nothing else. Storage is still zero
(LIB-G-001, LIB-G-010) and determinism is unchanged (LIB-G-020, LIB-G-021),
so §6.2's *intent* holds exactly; what changes is that the bijection is not
computed by conversion. **LIB-G-023's arbitrary-precision requirement is
therefore withdrawn for this implementation** — there is no bignum in the
system, and adding one would be the slow path.

### 17.7 Two Coordinate Systems, and What Each Can Answer

**Extends LIB-A-014 and LIB-A-024.** Addresses come in two forms, both
citations, carried by a `babel://` URI:

| Form | Example | What it names |
|---|---|---|
| walk | `babel://walk/00001594/floor/7/cell/5,-4/wall/2/shelf/1/slot/8` | a shelf you can stand in front of |
| text | `babel://text/00001594/at/0/axaxaxas%20mlo` | a volume chosen for what it says |

A walk address hashes the position before using it, so the volume in the next
slot is unrelated rather than a near twin — the failure mode of any Library
that shelves in index order, since consecutive integers have near-identical
expansions. A text address is invertible by construction: a phrase is found
by writing its address down.

**Search can only ever answer in the second system, and this is arithmetic
rather than a limitation.** A chosen 3,200-symbol page occupies a fraction
29^-3200 ≈ 10^-4680 of the corpus. Walking reaches about 1.8 × 10¹⁹ **distinct**
volumes (2⁶⁴ — see §17.12), on some 8 × 10²¹ shelves. Expecting a chosen page to
sit on a walkable shelf is therefore short by some **4,660 orders of magnitude**.

Count distinct texts and not shelves for this argument: every copy of a text
either contains the phrase or none of them does, so repeated shelves are not
repeated chances. So: walking yields walk addresses, search yields text
addresses, and both are verifiable by any holder of the core.

Consequently LIB-A-024's bijection is stated over the corpus rather than over
the lattice: the walkable lattice is a keyed *window* onto the corpus, not an
enumeration of it. Uniqueness and totality (LIB-C-020, LIB-C-021) are
unaffected — they hold in the corpus, by construction, as §6.2 intends.

A walk address is also **falsifiable**, which is the property that matters for
agents: a wall that is a doorway carries no books, and a shaft, a stairwell,
a reading room and a corridor hold no shelves at all. `validate()` in the core
rejects all five, so a claimed coordinate can be checked rather than trusted.

### 17.8 A Third Way In: Being Turned Loose

Beside walking to a known shelf and searching for a phrase, an agent can be
sent wandering — *"look through books until you find text that seems to relate
to this, then find a chair, sit, and tell me what you thought."*

Whether a page **relates** to anything is a judgement no specification can
make, and the core does not try. What it owes such a reader is that the
journey be **followable**, and that requires the walk be reproducible: the
choice at step *n* is `uhash(route, n)`, not a random draw. So the same route
number always gives the same journey, step 400 can be checked without
replaying the first 399, and nothing depends on generator state.

Every stop carries coordinates, so a trail is a list of citations:

```
0  study    cell 0,0    fl  0  vols    0  seats[]        -> stair down
1  gallery  cell -2,2   fl -1  vols  175  seats[]        -> hall
…
34 study    cell -6,11  fl +1  vols    0  seats[chair]
```

Two further rules make the report checkable rather than atmospheric:

- **A seat is a named piece in a known place.** Of the four possible pieces
  only the recliner and the desk's chair are sittable; `seatsIn()` reports
  which, and the list is asserted to match the collision geometry exactly, so
  a chair an agent claims to sit in is a chair the renderer drew.
- **Every step is legal or it is not taken.** Tests assert that each move
  passed through a real doorway, that no walk crossed a shaft, that the floor
  changes only on a stair and only by one, and that a stair entered from the
  other end reverses the climb — 235 crossings over 40 routes.

**And the coordinates are yours as well.** The prototype accepts an address
on the way in:

```
babel-phase1.html?at=babel://walk/00001594/floor/1/cell/-6,11
```

which puts you in the room the agent stopped in; and the address panel shows
where *you* have walked to, to hand back the other way. Without that the
citations would be decoration — an agent reporting a place nobody else can
reach. LIB-A-014's canonical address therefore has two scopes: a **room**
(`/floor/1/cell/-6,11`), which names somewhere to stand, and a **volume**
(`…/wall/1/shelf/2/slot/17`), which names something to read. Reading rooms and
shafts have no shelved wall at all, so only the room scope can name them.

### 17.9 Reading a Volume

The corpus was computable from the start of Phase 2; this is where it became
legible. Facing a wall of books, **E** opens the volume you are looking at —
the wall, shelf and slot come from a ray against the same plane the shader
shelves them on (`APO_ROOM` from the cell's centre, the run spanning
±`RUN_HALF`, shelves pitched at 0.40 m from a 0.05 m base), so what opens is
what you were looking at rather than an approximation. Aiming at the middle
of wall 1, shelf 2 in cell 15,94 returns slot 17: the crimson volume, which
the address panel has been naming all along.

Three properties matter more than the pane itself:

- **A page is 40 lines of 80 symbols, and it scrolls rather than wraps.** A
  wrapped line would misreport which column a phrase sits in, and the column
  is part of the citation. The type is sized off the viewport until 80 columns
  fill the width — about 22 px on a wide window — so the page is read rather
  than squinted at.
- **The coordinate system is drawn, not hidden.** Every other reading surface
  buries the grid; here the address *is* an offset, so the grid it refers to
  is on the page: line numbers down the gutter, a column ruler pinned across
  the top, and a cited passage marking both its line number and its column in
  crimson. You can see "line 33, column 17" rather than take it on trust. The
  gutter is unselectable, so a quote copied off the page still matches the
  corpus exactly.
- **The pane takes an address.** Paste what an agent cited and read the page
  it read. For a text address the phrase is highlighted where it claims to
  be, so a false citation is visible at a glance: the same phrase at a
  different offset highlights on a different line.
- **A coordinate that does not exist is refused, with the reason** — a wall
  that is a doorway, a shaft, a slot out of range. A room address walks you
  there instead of opening nothing.

Reading takes the mouse back and freezes movement: drifting away from the
shelf while reading would lose the citation. Slots the Purifiers emptied
(D-42, about one in twenty-nine) report as empty rather than handing you a
volume out of a hole.

**Knowing what you are pointing at.** The cursor is hidden while you look, so
a reticule marks the centre: four ticks and a gap, which close in and brighten
when a volume is under them, and turn to the shafts' warm brown over a slot
that stands empty. The targeted volume itself is picked out in the render — a
20% lift toward lit paper, enough to find one spine along a run of thirty-five
and not enough to light the room. The CPU decides which slot that is, by the
same ray against the same shelf plane that pulling a volume uses, and hands it
to the shader as a uniform, **so the spine that lights up is the spine that
opens.**

That ray has to meet the spines and not the case behind them. The first
version intersected a single plane at `APO_ROOM`, the back of the casework,
while the volumes stand proud of it by their own depth — about 0.18 m — so the
aim was wrong by `0.18 * tan(angle)` along the wall: nothing when facing a
shelf squarely, **three books at 45 degrees and six at 60**, which read as the
reticule drifting off target towards the sides of the screen. It now tests the
actual front face of every slot on every wall it faces — 350 plane
intersections, measured at 0.0035 ms, or 0.05% of a frame — and takes the
nearest face the ray really passes through. Exhaustive rather than clever:
there is no candidate window to get wrong.

Verified by probing the renderer rather than by eye: at 49 angles from −76° to
+76° across three pitches, the centre pixel changes when the highlight is
switched on, which is only true if the highlighted spine is the one under the
crosshair. The old ray disagreed with the new one at 24 of 44 of those angles.

The volume's name goes in the address panel beside "you are here", not under
the crosshair. A label at the centre of the screen sits on top of the very
spine it is naming; the reticule carries the instant feedback and the panel
carries the detail, which is where the other coordinates already live.

### 17.10 One Implementation of the Shared Layer

The lattice was previously written twice — once in GLSL for the renderer and
once in JavaScript for collision and the HUD — and kept in step by hand. It
drifted, more than once, and put walls where the renderer drew doorways.

The layer is now single-sourced in `core/` — including `cellDesc`, the packed
per-cell int both sides read (gaps 0-11, stair axis and rise 12-14, study
anchor 15-17, culled furniture kit 18-22, corridor axis 23-24, its two
alcoves 25-28) — inlined into the prototype by
`core/build.mjs`, and checked three ways: `core/test-core.mjs` compares the
inlined copy against the module byte for byte **and evaluates it**, because an
aliased import survives a byte-identical comparison and still throws in a
browser; and `core/conformance.html` runs the GLSL on the GPU over
`core/vectors.json` and compares 484 integers against the CPU. The first run of that harness found a live instance of
exactly this bug: the reading lamp's light was positioned by a *first blank
wall* rule while the furniture was placed by *best fit*, so in any room where
those differ the lamp lit from a wall it was not standing against. There is
now one anchor rule and both callers use it.

**One mirror remains unshared, and is marked as such**: the hash deciding
which slots the Purifiers emptied lives inside the shader's `mapAt`, too
entangled with the SDF to extract as it stands, so `volumePresent()` in
`core/babel-core.mjs` is a hand-written twin of it. A statistical test
(3.52% empty over 1.8 million slots) is the only guard, and it would catch a
broken mirror rather than a subtly different one. Extract it the next time
`mapAt` is opened.

### 17.11 Two Navigation Affordances the Text Does Not Have

Borges's narrator walks. He has no way to name a room and be in it, and nothing
carries him anywhere. Both of the following are frank conveniences for a
visitor, added because a lattice this size is otherwise only navigable by
patience. *[derived]*

**Z — go to a floor and cell.** A panel taking a floor and a `q,r` cell, or a
pasted `babel://` address, plus a **Random** button. It refuses anything you
could not stand in, and says which: a shaft has no floor in it, a sealed cell
has no way in. It does **not** quietly relocate you to the nearest real room,
which is what `?at=` does for a shaft — a request to stand somewhere
impossible is answered, not silently corrected. Random is a seeded probe
(`someStanding`), so what it finds is an address like any other and can be
pasted back or handed to an agent.

**X — be walked to a shelf and handed a book.** Picks a shelved gallery six to
fifteen rooms away, walks there through doorways and up or down stairs, turns
to face one volume, and opens it at a page. X again stops it; so does touching
WASD. The destination, the volume and the page all come from one seed, so a
journey is repeatable and citable rather than a one-off.

Routing lives in `core/` (`movesFrom`, `walkGraph`, `routeTo`,
`routeToShelves`, `pickVolume`) rather than the renderer, because it is the
same question the wanderer asks — *which moves are legal from here* — and
asking it twice is how the GLSL/JS twins drifted (§17.10). The model it
encodes: **rooms are nodes and stairwells are edges.** You do not stand in a
stairwell and choose again; you enter it in some direction and come out in the
cell beyond, one storey up or down.

**Measured, because none of the following was obvious:**

| | |
|---|---|
| Journeys completed | **395 of 400 (98.8%)**, 370 of them crossing at least one flight |
| Duration | 25.6 s at the 10th percentile, 40 s median, 50.3 s at the 90th, 87.4 s worst |
| Reticule agreed with the volume opened | 400 of 400 |
| Failures | 2 stuck, 1 arrived on the wrong storey, 2 found nothing shelved in range — every one of them reported with its reason |
| Added cost per frame | 0.0067 ms; the route search is a one-off 8 ms when you press X |

Three things had to be fixed to get there, and each was found by measurement
rather than by reading the code:

1. **Cell centres are not a walkable line.** Galleries are 3.64 m across but
   their centres are 4.84 m apart, so adjacent rooms do not touch — they are
   joined by a corridor about a metre wide. Steering from wherever you are
   straight at the next centre threads the wrong doorway and lands you in a
   room the route never mentioned, one wall away from a waypoint you can no
   longer reach. **32 of 40 walks died that way.** Every opening is now a
   waypoint of its own.
2. **Straying has to be expected, not prevented.** Steering through a
   one-metre gap is approximate. Rather than tune it, the walker notices it is
   in a room the route does not mention and asks the lattice again from where
   it actually is. 17 of 400 journeys re-planned once and arrived anyway.
3. **A test that leaves out the vertical concludes the stairs are broken.**
   The feet-follow-the-ground step lived inside the frame loop, so a walk
   driven headlessly never climbed: the storey never changed, and every route
   across a flight died one room later. It is now a named function
   (`stepBody`) that the frame loop and the harness both call. The stairs were
   never at fault; the harness was walking on air.

### 17.12 The Content Key Was 32 Bits Wide, and That Was a Ceiling on the Library

**This section records a defect, its measurement, and a breaking change.**

A shelved volume's content is `streamDigit(walkKey(a), …)` — every one of its
1,312,000 symbols derives from that key and nothing else. `walkKey` returned a
single 32-bit word. So the width of that word, not the number of shelves, was
the real size of the walkable Library. *[derived]*

| | one lane (was) | two lanes (is) |
|---|---|---|
| Shelf slots in one period | ~8 × 10²¹ — 2³² cells × ~2³² floors × 537 volumes, 84% galleries | unchanged |
| Distinct books those slots can hold | **2³² = 4,294,967,296** | **2⁶⁴ = 18,446,744,073,709,551,616** |
| Times each text is repeated | ~2 × 10¹² | ~440 |
| First duplicate pair | ~93,000 slots — about 173 galleries | ~6.1 × 10⁹ slots — about 11.3 million galleries |
| Share of the corpus | 10^−1,918,657 | 10^−1,918,647 |

**The share is the number that says what this change is and is not.** It moved by
9.63 decimal orders against a denominator of 1,918,667 digits. Widening the key
buys no coverage of the corpus and cannot: naming an arbitrary book takes
6,373,671 bits — 778 KiB — of coordinate, and a coordinate that large is the book
(LIB-S-010..012, and §17.7 on why walking and searching are different systems).
What it buys is that the reachable set no longer repeats itself where a reader can
see it. A reader who opens a thousand volumes now expects 2.7 × 10⁻¹⁴ duplicate
pairs; before, an afternoon's exploring could turn one up.

One consequence worth stating plainly: at 2³² the walkable Library was
*enumerable*. Every distinct book it contained could be listed by a laptop in a
weekend, and stored — at 778 KiB each — in 3.4 petabytes. That is a catalogue,
which is the one thing the source insists cannot exist (LIB-S-001..004). At 2⁶⁴ it
is 14.7 yottabytes and 7.7 × 10¹⁴ years of reading, which is not.

Not theoretical. `floor/0/cell/0,20/wall/4/shelf/3/slot/26` and
`floor/0/cell/2,32/wall/0/shelf/0/slot/19` were the same book, identical across
every symbol compared and carrying the same spine label. Twenty such pairs
appeared in a 500,000-slot scan, matching the birthday prediction for a 32-bit
space to within noise (implied key space 6.3 × 10⁹ ≈ 2^32.5). **This contradicted
LIB-C-021, "no two identical books"** — the corpus has no duplicates by
construction, but the *shelving* had them in quantity, and nothing said so.

**`walkKey` now returns two independent 32-bit lanes.** Independent is the
operative word: two addresses collide only if they collide in *both*, so the
lanes use different multipliers at every stage rather than deriving one from the
other. Measured after the change: in 500,500 addresses, 20 pairs still share
lane 0 — exactly as a 32-bit lane must — and **none of them share lane 1**. A
scan of 3,000,000 shelf slots found **zero** identical books where a single lane
would have produced about 1,048. The first duplicate now sits near 2^32.5 slots,
some 8 million galleries.

**It cost nothing per symbol, and in fact reads got faster.** `mix(a, b, c)` has
two inputs that are constant for a whole book and one that varies with position,
so two `mix` calls absorb four constant words — 128 bits — at no per-symbol cost,
provided they are derived once rather than per symbol. Measured with hoisting held
constant so width was the only variable:

| key width | ns/symbol | vs 32-bit |
|---|---|---|
| 32 bits | 38.8 | 1.00× |
| **64 bits (shipped)** | 38.6 | **0.995×** |
| 128 bits | 39.6 | 1.02× |
| 192 bits (a third `mix`) | 70.2 | 1.81× |

64 bits was chosen over the equally free 128 because reaching 128 requires
folding key lanes into the domain word, which slightly blurs the separation
between the WALK, TEXT and LABL streams for no observable gain.

The old code also recomputed two XOR constants *and the whole of `walkKey`*
inside every symbol — 9,600 redundant hashes per 3,200-symbol page. `pageOf`,
`lineOf` and `sliceOf` now derive the stream once: **0.301 → 0.203 ms per page,
33% faster.** `digitAt(a, p)` on its own is unchanged, and remains O(1).

**The renderer is untouched.** `streamDigit`, `reduceRadix` and `walkKey` appear
nowhere in the GLSL — the shader hashes topology and spine geometry, never text —
so frame time cannot move. Verified by search, in the module and in the inlined
copy.

**Breaking change, and the one cost that is real.** Every walk address now names
a different book than it did. Text addresses are byte-for-byte unchanged: the
second lane for a text stream is the constant the old single-lane code derived
internally, so a text citation made before this change still verifies. What broke:

- every `babel://walk/...` citation, including the crimson volume's contents
  (its *location* is unchanged);
- every walk spine label — the crimson volume's went from `aknvr` to
  `omzpawrdrcabtjknbrgligcqdak`;
- the `content` block of `core/vectors.json`, regenerated.

Nothing in the repository quoted generated text or a spine label, which was
checked before the change rather than hoped. Widening later would have cost more,
and never widening would have left a defect that is observable from inside the
Library by anyone who walked 170 galleries.

### 17.13 The Corridor, and What It Holds

**Implements §9.3, which had been specified and not built.** A fifth cell
type: Borges's hallway, the narrow passage between galleries, with a mirror,
a latrine and somewhere to sleep standing up.

It is built like the stairwell — a cut through solid rock, open only on its
own axis, and those two doorways structural rather than hashed — but it has
no rise, so **a corridor is a place and a stairwell is a move**. You stand in
one and choose again. Rooms remain the nodes of §17.11's model and the
corridor is simply another node, which is why `movesFrom`, `walkGraph`,
`routeTo` and `wander` needed no changes at all.

| | |
|---|---|
| Corridor | 1.24 m wide, ceiling at 2.10 m as everywhere else, running the full 4.84 m of the cell and 0.75 m past each boundary to meet the gallery's doorway |
| Alcoves | one facing pair at midspan, 0.80 m across the opening, 0.62 m deep, 2.00 m high — a closet to stand in, not to lie down in |
| Holds | a mirror, a latrine, or nothing, which is the standing closet |
| How often | 60% of corridors are bare, 30% hold one, 10% a facing pair |
| The latrine | a bored stone seat; the bore stops short of the floor and its inner wall carries its own material, so the hole reads as a void rather than as a clean cut through the floorboards |

**Where the band came from.** The corridor's slice of the hash range is taken
from the *top* rather than continued upward from the reading room's
threshold. Continued, the type of every gallery becomes a function of where
that threshold lands: a 10% band starting at `P_STUDY` swallows cell 15,94 —
hash lane 16563 — and the crimson volume with it. Taken from the top, the
share can be tuned without moving a single shaft, stairwell, reading room, or
the landmark. A test asserts the crimson volume is still a shelved slot.

**The stairway in the hallway, arrived at sideways.** LIB-P-022 puts the
flight inside the hallway; T-4 has already given flights their own cells, so
the nearest available arrangement is a flight at the end of a corridor. Two
rules meet in the middle: a corridor will accept a stairwell as an end, and
`axisOf` prefers an axis with a corridor at one. Neither consults the other's
axis. That gets a flight at the end of **1 corridor in 5.1**, against 1 in 47
when the two types are indifferent to each other.

**The axis rule is the richer of the two that were written.** A corridor
prefers an axis with a flight *whose own axis agrees*, which means calling
`axisOf` on a neighbour from inside `corridorAxis` — which `gapAt` calls,
which `cellDesc` calls six times, which the shader calls for every cell a ray
enters. When the shader first refused to link that was the obvious suspect and
it was innocent (§17.13 below), so a flat version shipped briefly and this one
replaced it once the real cause was fixed. It leaves **2.7%** of corridors
open at one end against 7.2% for the flat rule, and both put a flight at the
end of 1 corridor in 5. The six ends are resolved once into a bitfield and
both passes then read bits, which halves the `axisEnd` calls; keep it that
way.

**What actually stopped the shader linking, and how it was found.** The GLSL
compiled in 17 ms; the linker then ran for **127 seconds** and returned false
with an empty info log. Nothing reported an error — the page simply froze,
and after a few reloads Chrome disabled WebGL for the whole session, which
presents as a broken machine rather than a broken change.

The cause was **two call sites**. The mirror was written the obvious way:
march, shade, and if the surface was a mirror, march and shade again. ANGLE
inlines, so `main()` ended up holding two copies of a body that already
contains `mapAt` eight times over — once for the march, four for the normal,
three for the ambient term — plus `lighting()`. Removing the second bounce
made the link instant; stubbing out the suspected axis rule did not, and nor
did stubbing `studyAnchorAt` out of `lighting()`, which had looked like the
other candidate.

The fix is that the bounce is now a **loop**, and `uBounce` is a *uniform*
rather than the constant 2, because a compiler cannot unroll a loop whose
bound it does not know. One call site; nothing else about the render changed.

Two smaller lessons are worth keeping. A bisection that disables code with a
runtime `if` proves nothing — the compiler still emits it, and the first
attempt here did exactly that and cleared an innocent suspect. And the timer
must span `getProgramParameter(LINK_STATUS)`, not just `linkProgram`: ANGLE
defers the real work, so timing only the first call reported **0.0 s** for a
link that had just hung the tab for ninety seconds. The link step now times
the pair and prints the elapsed time when the driver has nothing to say.

**The mirror costs nothing until you look at one.** Measured at 1550×889 by
timing 24 draws against a `readPixels` sync, since the display is vsync-locked
at 50 Hz and frame time cannot see it:

| | one ray | with the bounce |
|---|---|---|
| Standing in a gallery, no mirror in view | 6.67 ms | **6.67 ms** |
| Facing a mirror at arm's length, filling much of the frame | 3.61 ms | **4.29 ms** (+19%) |

The loop breaks after its first pass on every pixel that is not a mirror,
which is almost all of them. And that the reflection is real was checked by
probing the renderer rather than by eye, as in §17.9: with the bounce off, the
mirror is a flat dark pane; with it on, **68.1%** of the pixels across the
alcove change and mean luma goes from 11.7 to 18.3. In a corridor whose other
alcove holds the latrine, what appears in the glass is the latrine.

**Measured** over a 91×91 sample on floor 0, and over 200 seeded routes:

| | |
|---|---|
| Corridors | 9.3% of cells — about 1 in 11 |
| Two-ended / one-ended / sealed | **96.8% / 2.7% / 0.5%** |
| With a flight at one end | **20.0%**, 1 in 5.0 |
| Holding a mirror | 15.4% of corridors; with the reading rooms of §17.4, a mirror stands in **1 cell in 52** |
| Met on a wander | a mirror on **189 of 200** routes, median step 56 |
| Giant component | 0.962 of standable cells, against 0.967 before |
| Mean shelved walls | 3.149, against 3.079 before |
| `routeToShelves` | arrived 198 of 200 |

**The mirror is a real reflection.** One bounce, marched and shaded through
the same code path as the primary ray — `main()` was split into `marchRay`
and `shadeHit` for exactly this, because a reflection shaded by a second code
path is a reflection that does not match the room, and duplicating
appearances faithfully is the one thing LIB-P-023 asks. A mirror facing a
mirror therefore shows the corridor doubled and then terminates in a dark
pane, which is what a facing pair really looks like a few reflections in, and
is as much as LIB-P-024 permits it to settle. What it cost, and how the
reflection was verified, is below.

### 17.14 The Mottling: Two Defects Wearing One Coat

**The symptom** was large, smooth, dark organic shapes lying across walls and
across book spines, reported at `floor/-1/cell/-1,3`, `floor/-1/cell/0,3` and
`floor/0/cell/-11,0`. It looked like one bug. It was two, and both are fixed;
the record of getting there is in the case study, because three of my
diagnoses were wrong and the way each died is the useful part.

**On book spines: the distance field over-reported, so the march stepped
through the surface.** Three places in the shelving took geometry out of the
field rather than measuring it:

- `mod(base, SHELF_P) - 0.167` repeated the shelf up the wall for ever and was
  not centred on the volume, so above the top shelf it measured to a book that
  is not there, and in the upper part of each gap to the farther of two books;
- `abs(w.y) > CASE_HALF + 0.03` dropped a wall's casework out of the field
  outright — that is what tore the corners;
- `abs(w.y) > RUN_HALF` and the slot-index range check dropped the books.

An SDF that over-reports lets the ray land *past* the surface, where the
gradient is nonsense — hence wrong normals, and hence the patches. Measured at
the 0.80 step scale this shader marches with, **8.5%** of surface pixels
carried a normal facing no wall; at 0.30 it was 6.1% and the frame cost 6.7×.
Making the field conservative — nearest of the five real shelves by `clamp`,
nearest of the thirty-five real slots, and culls that compare against the best
distance so far instead of discarding — gets the same result at 0.80 **for
nothing**: 6.58 ms against 6.27 before.

**On bare stone: a step function on a continuous quantity.** The wall
highlight read

```
if ((mat < 0.5 || mat > 2.5) && horiz > 0.86 && lit > 0.28) lum += 0.30;
```

On dim stone that lift is most of what makes a wall visible at all, so the
pixels that fell the wrong side of 0.28 did not dim — they went nearly black.
The boundary is an iso-contour of the lighting times the ambient term, which
is why it came out as smooth shapes following the geometry. Book spines are
excluded by that same material test, which is why this survived every fix
aimed at the shelving, and why it was the *last* thing to be suspected rather
than the first. Both tests are now `smoothstep` ramps. Cost: nothing
measurable.

**What was ruled out, and how.** The 72-step ray budget: the shader was made
to paint step-exhausted pixels, and in the reported cell **0.04%** of pixels
had given up. The six-level tone ramp: the shapes survived turning it off. The
ambient-occlusion term: forcing `occ = 1.0` did clear the shelves, which
convicted it — wrongly. AO was *carrying* the spine symptom, not causing it;
the margin widened in §17.4 is a real inconsistency and worth keeping, but it
was never the fix. **An ablation proves what it proves in the view you ran it
in**, and that one was run on a shelf.

*Still open:* ripples torn out of a volume's cover seen edge-on at a grazing
angle. Possibly the same overshoot as the spine case and therefore possibly
already gone — unverified either way, so it stays on the list.

**What you can get into.** The alcoves are void in the collision field, not
just in the render, and the fixtures are solid. Probing the field along the
cross-axis: you can stand 0.38 m from the back of an empty closet — which is
what sleeping standing up requires (LIB-P-021) — and step up to within 0.3 m
of a mirror, while a latrine lets you reach its mouth and no further. The
corridor itself is continuous end to end and out through both doorways.

**What this does to existing citations.** Less than the key widening did
(§17.12), and in a different way. `walkKey` is a function of the cell key,
the floor, the slot and the seed — it reads no topology at all — so **no
address that remains valid names a different book**. What changes is
validity, and it fails loudly:

- 11% of galleries are now corridors, and hold no books at all;
- of the galleries that stay galleries, **3.1% of wall slots** change verdict
  between shelved and doorway, touching **16.8%** of them;
- an address on a wall that closed is refused with its reason; an address
  anywhere else verifies exactly as before;
- every room address still names somewhere you can stand;
- wander and route seeds give different journeys, so the figures in §17.11
  were re-measured above.

`CORE_VERSION` is **0.5.0**. A transcript recorded under 0.4.0 replays only
against 0.4.0, which is what that stamp is for.

---

## 18. Reproducing the Layout Elsewhere

The layout is reproducible outside the renderer, and doing so is a stated
goal: an agent should be able to walk the same Library, meet the same rooms
in the same places, and read the same volume from the same shelf, with no
3D at all.

That requires pinning, to the bit:

1. The integer hash and every constant fed to it.
2. Cell-type thresholds and the axial hex lattice mapping.
3. Gap resolution, including the stairwell's and the corridor's always-open
   axis rules, the reading room's kit and anchor rules, and which alcove of a
   corridor holds what.
4. The address ordering — which volume is "shelf 2, slot 17" — and the
   base-25 expansion that turns an address into text (§6.2).
5. A table of test vectors, so any implementation can prove it agrees.

Until those are pinned in one place, two implementations will drift. The
prototype is currently the only reference, and its GLSL and JavaScript
already have to be kept in step by hand.

---

## Appendix A — The Álvarez de Toledo Alternative

Footnote 4 records an observation that this specification must take seriously as a competing architecture: the Library is redundant, since a **single volume of ordinary format containing infinitely many infinitely thin leaves** would suffice.

**Assessment.** It is information-theoretically equivalent and physically worse.

- It requires unbounded divisibility of matter — a stronger physical assumption than the Library's merely unbounded extent.
- Its stated ergonomics are disqualifying: each apparent page unfolds into further pages, and the middle page has no reverse. Random access is undefined; there is no address space.
- It replaces a *countable, addressable* structure with a *continuum*, and the source's own totality argument (§4.3) shows the corpus is finite. A continuum is the wrong cardinality for the job.

**Verdict:** REJECTED as the primary architecture. Retained as a proof that the Library's redundancy is real — which, note, is also what §6.2 concludes by a different route. Álvarez de Toledo and the address-as-content architecture are the same observation: the Library does not need to be built, only indexed.

---

## Appendix B — Reference Algorithm

```
CONSTANTS
  ALPHABET : 25 symbols            # 22 letters, space, comma, period
  C        = 1_312_000             # 410 * 40 * 80
  N        = 25 ** C
  PER_HEX  = 700                   # 4 walls * 5 shelves * 35 slots

INDEX(address) -> integer in [0, N)
  local = ((address.wall * 5) + address.shelf) * 35 + address.slot
  hexN  = LATTICE_ORDINAL(address.floor, address.circuit, address.hexagon)
  return (hexN * PER_HEX + local) mod N          # mod N realises LIB-A-021

CONTENT(i) -> string of C symbols
  digits = TO_BASE_25(i)                          # divide-and-conquer; LIB-G-023
  return ZERO_PAD_LEFT(digits, C) mapped through ALPHABET

ADDRESS_OF(text) -> address                       # Profile U only; LIB-S-012
  require LENGTH(text) == C and all symbols in ALPHABET
  return LATTICE_POSITION( FROM_BASE_25(text) )

SPINE(address) -> string of <= 80 letters         # LIB-L-005
  return RENDER_LETTERS( PRF(key, SERIALISE(address)) )
```

`LATTICE_ORDINAL` and `LATTICE_POSITION` are mutual inverses enumerating the hexagon chain — slot within shelf, shelf within wall, wall within hexagon, hexagon along circuit, circuit within floor, floor along the vertical axis. Their bijectivity is the whole correctness argument for LIB-A-024, LIB-C-020, and LIB-C-021 simultaneously.

---

## Appendix C — Traceability Summary

| Source claim | Requirements |
|---|---|
| Hexagonal galleries, invariable distribution | LIB-P-001, LIB-A-015 |
| Twenty shelves, five per side, all sides but two | LIB-A-001, LIB-A-002 |
| 35 books / 410 pages / 40 lines / ~80 letters | LIB-C-010–013, LIB-A-003 |
| Twenty-five orthographic symbols | LIB-C-001–003 |
| Spine letters do not prefigure contents | LIB-C-015, LIB-L-004, LIB-L-006 |
| All possible combinations | LIB-C-020, LIB-C-022, LIB-G-011 |
| No two identical books | LIB-C-021, LIB-A-023, LIB-G-013 |
| Unlimited and cyclical | LIB-A-020–022 |
| Hallway: closets, stairway, mirror | LIB-P-020–024 |
| Two lamps; insufficient, incessant light | LIB-P-010–012 |
| Air shafts, low railings, infinite fall | LIB-P-030–033 |
| Circuit fifteen ninety-four; ninety floors up | LIB-A-011–013 |
| Probability of finding a book is zero | LIB-S-010–012 |
| False catalogues; the regressive method | LIB-S-001–004 |
| The Purifiers; imperfect facsimiles | LIB-O-004, LIB-O-005 |
| Illuminated, motionless, useless, incorruptible, secret | LIB-D-001–005 |
| One man per three hexagons (fn. 2) | LIB-O-001 |
| Only the impossible is excluded (fn. 3) | LIB-C-022, LIB-X-001 |
| A single infinite volume would suffice (fn. 4) | Appendix A |
