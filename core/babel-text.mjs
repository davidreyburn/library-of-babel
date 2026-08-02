/* ====================================================================
 * babel-text -- the corpus half of the core: addresses, and the text
 * they name. Pure, like babel-core, and imports the lattice from it.
 *
 * THE ONE IDEA. A book is 1,312,000 symbols (LIB-C-013), which is a
 * 6,373,670-bit number -- 778 KiB. The spec's own construction (§6.2)
 * says the book IS its index written in base 29. Taken literally that
 * makes reading page 2 cost a full-width radix conversion of a 778 KiB
 * integer: about 1.7e12 word operations the naive way, and even done by
 * divide-and-conquer you must compute the whole book to see one page.
 *
 * So every symbol here is instead a pure function of its own position:
 *
 *     symbolAt(address, p)  ->  one of 29 symbols,  O(1)
 *
 * A page costs 3,200 of those and nothing else. No bignum, no radix
 * conversion, no state. This satisfies §6.2's intent -- content is
 * computed from the address and never stored (LIB-G-001, LIB-G-010) --
 * and makes LIB-G-023's arbitrary-precision requirement unnecessary
 * rather than merely satisfied. Recorded as a departure in §17.
 *
 * TWO COORDINATE SYSTEMS, and the distinction is load-bearing:
 *
 *   walk addresses  a shelf you can stand in front of. Diffused: the
 *                   slot next door is an unrelated book, not a near
 *                   twin, because the position is hashed before it is
 *                   used. Not invertible from text -- see below.
 *   text addresses  a book chosen for what it says. Invertible by
 *                   construction: you find a phrase by writing its
 *                   address down.
 *
 * Why "where does this phrase exist?" can only ever be answered in the
 * second system: a given 3,200-symbol page occurs in a fraction 29^-3200
 * of the corpus, about 1e-4680. The walkable lattice reaches on the
 * order of 1e22 volumes. Expecting a chosen page to sit on a walkable
 * shelf is off by about 4,700 orders of magnitude.
 * That is arithmetic, not a limitation of the implementation: search
 * returns a text address, walking returns walk addresses, and both are
 * citations any holder of this module can verify.
 * ==================================================================== */

/* Imported without aliases on purpose. This module is inlined into the
   prototype with its import statement stripped, so an alias would name
   something that does not exist there -- which is exactly the bug this
   comment replaces. core/test-core.mjs now evaluates the inlined blocks
   rather than only comparing their text, so a repeat would be caught. */
import { u32, uhash, cellKey, cellType, gapAt, TYPE, GAP,
         shelvedWalls, SHELVES_PER_WALL, BOOKS_PER_SHELF,
         stepHash, wander, findSeat } from "./babel-core.mjs";

/* ---- the alphabet (§4.1) ------------------------------------------- *
 * 29 symbols: the whole English alphabet, then space, comma, period.
 *
 * A DELIBERATE DEPARTURE from LIB-C-001, which fixes 25 on the source's
 * authority. The reason is totality in the language this Library is read
 * in. LIB-C-020 asks for every possible book; at 22 letters four of the
 * alphabet are missing, and with them every English word, phrase and
 * page that uses one -- a strange hole in a corpus defined as all the
 * combinations. 29 symbols make any English word or phrase expressible
 * in principle, which is the property this build is for. Recorded in §17.
 *
 * It is not free. The corpus grows from 25^1,312,000 to 29^1,312,000 --
 * from 1,834,098 digits to 1,918,667 -- and each index from 744 KiB to
 * 778 KiB, which matters not at all here because no index is ever
 * materialised, and matters enormously to anything that tries.        */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz ,.";
const LETTERS  = ALPHABET.slice(0, 26);
const RADIX    = ALPHABET.length;

const PAGES = 410, LINES = 40, COLS = 80;      // LIB-C-010..012
const PAGE_LEN = LINES * COLS;                 // 3,200
const C = PAGES * PAGE_LEN;                    // 1,312,000  (LIB-C-013)

/* log10 N, since N itself has 1,918,667 digits */
const LOG10_N = C * Math.log10(RADIX);         // ~1,918,666.4

const DEFAULT_SEED = 0x00001594;               // "circuit fifteen ninety-four"

/* 26 letters + space + comma + period. Asserted rather than assumed: the
   whole content layer is arithmetic in this base, and a silent change to
   the string would silently change every book in the Library. */
if (RADIX !== 29) throw new Error("alphabet must be exactly 29 symbols (§17 departure from LIB-C-001)");
if (new Set(ALPHABET).size !== 29) throw new Error("alphabet has a repeated symbol");
if (LETTERS !== "abcdefghijklmnopqrstuvwxyz") throw new Error("the letter subset must be the English alphabet");

const SYMBOL_INDEX = new Map([...ALPHABET].map((ch, i) => [ch, i]));

/* ---- the keyed stream --------------------------------------------- *
 * Built on the same uhash the lattice and the shader use, so the shader
 * could render a spine or a page later without a second primitive.     */
function mix(a, b, c){
  let h = uhash(u32(a ^ 0x9E3779B9));
  h = uhash(u32(h ^ b));
  return uhash(u32(h ^ Math.imul(c | 0, 0x85EBCA6B)));
}
/* (h1 * 2^32 + h2) mod 29, exact in 32-bit lanes: 2^32 mod 29 == 16.
   Reducing 64 uniform bits leaves a bias of about 29/2^64, which is
   1.6e-18 -- far below anything observable, and worth the second hash
   because a single 32-bit reduction biases by 7e-9 instead.           */
const POW2_32_MOD_RADIX = 16;                  // 4294967296 % 29
function reduceRadix(h1, h2){
  return ((h1 % RADIX) * POW2_32_MOD_RADIX + (h2 % RADIX)) % RADIX;
}
function streamDigit(key, domain, p){
  return reduceRadix(mix(key, domain, p),
                     mix(u32(key ^ 0x5bf03635), u32(domain ^ 0xA5A5A5A5), p));
}

/* ---- walk addresses ----------------------------------------------- */
const WALK_DOMAIN = 0x57414C4B;                 // "WALK"
const TEXT_DOMAIN = 0x54455854;                 // "TEXT"

/* The position is hashed, not used positionally, and that single choice
   is what stops neighbouring slots from being near-identical twins --
   the failure mode of every Library that shelves books in index order.
   Consecutive integers have near-identical base-29 expansions; hashing
   first means slot 17 and slot 18 share nothing.                      */
function walkKey(a){
  /* The seed has to enter here, or every seed shelves the same volumes and
     "what happens if we navigate from this seed?" has one answer. It keys
     the content only -- the layout is seed-independent, so two seeds are
     the same rooms holding different books. */
  let h = uhash(u32(cellKey(a.q, a.r) ^ u32(a.seed)));
  h = uhash(u32(h ^ Math.imul(a.floor + 32768, 0x9E3779B9)));
  h = uhash(u32(h ^ Math.imul(a.wall * 175 + a.shelf * 35 + a.slot + 1, 0x85EBCA6B)));
  return h;
}

function walkAddress({ floor = 0, q = 0, r = 0, wall = 0, shelf = 0, slot = 0,
                       seed = DEFAULT_SEED } = {}){
  return { kind: "walk", scope: "volume", floor, q, r, wall, shelf, slot, seed: u32(seed) };
}
/* A place rather than a volume: the room you are standing in. Every stop on
   a wander is one of these, and so is the "you are here" line in the HUD.
   It names somewhere to go, and has no content of its own. */
function roomAddress({ floor = 0, q = 0, r = 0, seed = DEFAULT_SEED } = {}){
  return { kind: "walk", scope: "room", floor, q, r, seed: u32(seed) };
}
function textAddress({ phrase = "", offset = 0, seed = DEFAULT_SEED } = {}){
  const bad = [...phrase].find(ch => !SYMBOL_INDEX.has(ch));
  if (bad !== undefined)
    throw new Error(`"${bad}" is not in the alphabet; content is 26 lowercase ` +
                    `letters, space, comma and period only (LIB-C-002, LIB-C-003)`);
  if (offset < 0 || offset + phrase.length > C)
    throw new Error(`a ${phrase.length}-symbol phrase at offset ${offset} runs past ` +
                    `the end of the book (C = ${C})`);
  return { kind: "text", phrase, offset, seed: u32(seed) };
}

/* ---- validity: is this address a place that exists? ---------------- *
 * A shaft and a stairwell hold no shelves; a reading room is defined by
 * having none (an intentional break with the text). And a wall that is
 * a doorway carries no books, whatever an agent claims. This is the
 * check that makes "return with coordinates" falsifiable.             */
function validate(a){
  if (a.kind === "text"){
    if (a.offset + a.phrase.length > C) return { ok: false, reason: "phrase runs past the book" };
    return { ok: true };
  }
  const t = cellType(a.q, a.r);
  /* A room address only has to name somewhere you could be. A shaft is the
     one cell type you cannot stand in -- you look into it, you do not cross
     it -- so that is the only rejection. */
  if (a.scope === "room")
    return t === TYPE.SHAFT
      ? { ok: false, reason: `cell ${a.q},${a.r} is a shaft: you can look into it but not stand in it` }
      : { ok: true, place: ["gallery", "shaft", "stairwell", "study"][t] };
  if (t !== TYPE.GALLERY)
    return { ok: false, reason: `cell ${a.q},${a.r} is a ${["gallery","shaft","stairwell","study"][t]}, which holds no shelves` };
  const walls = shelvedWalls(a.q, a.r, a.floor);
  if (!walls.includes(a.wall))
    return { ok: false, reason: `wall ${a.wall} of ${a.q},${a.r} on floor ${a.floor} is not shelved (shelved: ${walls.join(", ") || "none"})` };
  if (a.shelf < 0 || a.shelf >= SHELVES_PER_WALL)
    return { ok: false, reason: `shelf must be 0..${SHELVES_PER_WALL - 1}` };
  if (a.slot < 0 || a.slot >= BOOKS_PER_SHELF)
    return { ok: false, reason: `slot must be 0..${BOOKS_PER_SHELF - 1}` };
  return { ok: true };
}

/* ---- content ------------------------------------------------------ */
function addressKey(a){
  return a.kind === "walk" ? walkKey(a)
       : uhash(u32(a.seed ^ Math.imul(a.offset + 1, 0x27d4eb2d)));
}
function addressDomain(a){ return a.kind === "walk" ? WALK_DOMAIN : TEXT_DOMAIN; }

/* One symbol, from its own position and nothing else. */
function digitAt(a, p){
  if (a.scope === "room")
    throw new Error(`${formatAddress(a)} names a room, not a volume -- ` +
                    `add /wall/<w>/shelf/<s>/slot/<n> to open a book`);
  if (p < 0 || p >= C) throw new Error(`position ${p} is outside the book (0..${C - 1})`);
  if (a.kind === "text"){
    const i = p - a.offset;
    if (i >= 0 && i < a.phrase.length) return SYMBOL_INDEX.get(a.phrase[i]);
    /* Filler is keyed on the seed alone, not on the phrase, so two text
       addresses in one seed share a background and differ only where
       their phrases differ -- which is what makes "nearby textual
       mutations" a one-symbol edit rather than a different universe. */
    return streamDigit(a.seed, TEXT_DOMAIN, p);
  }
  return streamDigit(addressKey(a), WALK_DOMAIN, p);
}
const symbolAt = (a, p) => ALPHABET[digitAt(a, p)];

function lineOf(a, page, line){
  if (page < 0 || page >= PAGES) throw new Error(`page must be 0..${PAGES - 1}`);
  if (line < 0 || line >= LINES) throw new Error(`line must be 0..${LINES - 1}`);
  const base = page * PAGE_LEN + line * COLS;
  let s = "";
  for (let i = 0; i < COLS; i++) s += symbolAt(a, base + i);
  return s;
}
function pageOf(a, page){
  const lines = [];
  for (let l = 0; l < LINES; l++) lines.push(lineOf(a, page, l));
  return { page, lines };
}
/* An arbitrary window, for an agent that wants a few symbols either side
   of a hit rather than a whole page. */
function sliceOf(a, from, length){
  const n = Math.min(length, C - from);
  let s = "";
  for (let i = 0; i < n; i++) s += symbolAt(a, from + i);
  return s;
}

/* ---- spine labels (§7) -------------------------------------------- *
 * Letters only, short, deterministic on the address (LIB-L-004), and
 * keyed in a separate domain so it is not a readable function of the
 * pages (LIB-L-004 again, and LIB-L-006: the incoherence is the point). */
const LABEL_DOMAIN = 0x4C41424C;                 // "LABL"
function spineLabel(a){
  if (a.scope === "room")
    throw new Error(`${formatAddress(a)} names a room; only a volume has a spine`);
  const k = uhash(u32(addressKey(a) ^ LABEL_DOMAIN));
  const len = 3 + (k % 26);                      // 3..28, well inside LIB-L-002
  let s = "";
  for (let i = 0; i < len; i++)
    s += LETTERS[reduceRadix(mix(k, LABEL_DOMAIN, i),
                             mix(u32(k ^ 0x846ca68b), LABEL_DOMAIN, i)) % LETTERS.length];
  return s;
}

/* ---- how rare is a phrase? ---------------------------------------- *
 * Returned as base-10 logarithms: the counts themselves have upwards of
 * a million digits. At a fixed offset, a phrase of length L appears in
 * 29^(C-L) books; over all offsets, about (C-L+1) times that.         */
function rarity(len){
  const atOffset = (C - len) * Math.log10(RADIX);
  return {
    symbols: len,
    log10BooksAtFixedOffset: atOffset,
    log10BooksAnywhere: atOffset + Math.log10(C - len + 1),
    log10Corpus: LOG10_N,
    fractionLog10: -len * Math.log10(RADIX)      // share of the corpus, as log10
  };
}

/* ---- the babel:// scheme ------------------------------------------ *
 * Canonical output is always explicit. Parsing is lenient, because the
 * point of a citation is that a human can type it: a missing seed means
 * the default, and a missing wall means the first shelved wall of that
 * gallery, which the lattice can answer. `book` is accepted for `slot`. */
const hex8 = n => u32(n).toString(16).padStart(8, "0");

/* A room rather than a shelf: what the HUD shows you standing in, and what
   a wander reports at each stop. Coarser than a full walk address on
   purpose -- it names a place, not a volume. */
function cellAddress(q, r, floor = 0, seed = DEFAULT_SEED){
  return formatAddress(roomAddress({ q, r, floor, seed }));
}

function formatAddress(a, page){
  const tail = (page === undefined || page === null) ? "" : `/page/${page}`;
  if (a.kind === "text")
    return `babel://text/${hex8(a.seed)}/at/${a.offset}/${encodeURIComponent(a.phrase)}${tail}`;
  const place = `babel://walk/${hex8(a.seed)}/floor/${a.floor}/cell/${a.q},${a.r}`;
  if (a.scope === "room") return place + tail;
  return `${place}/wall/${a.wall}/shelf/${a.shelf}/slot/${a.slot}${tail}`;
}

function parseAddress(uri){
  const m = /^babel:\/\/(.*)$/.exec(String(uri).trim());
  if (!m) throw new Error(`not a babel:// address: ${uri}`);
  const parts = m[1].split("/").filter(s => s.length);
  const kind = (parts[0] === "text" || parts[0] === "walk") ? parts.shift() : null;

  let seed = DEFAULT_SEED;
  if (parts.length && /^[0-9a-f]{1,8}$/i.test(parts[0]) && !/^\d+$/.test(parts[0])){
    seed = u32(parseInt(parts.shift(), 16));
  } else if (kind && parts.length && /^[0-9a-f]{8}$/i.test(parts[0])){
    seed = u32(parseInt(parts.shift(), 16));
  }

  if (kind === "text"){
    let offset = 0;
    if (parts[0] === "at"){ parts.shift(); offset = parseInt(parts.shift(), 10); }
    const phrase = decodeURIComponent(parts.shift() ?? "");
    const a = textAddress({ phrase, offset, seed });
    return withPage(a, parts);
  }

  /* walk form, possibly written the short way */
  const f = {};
  while (parts.length){
    const k = parts.shift();
    if (k === "page"){ parts.unshift("page"); break; }
    const v = parts.shift();
    if (v === undefined) throw new Error(`"${k}" has no value`);
    if (k === "cell"){
      const c = v.split(",");
      if (c.length !== 2) throw new Error(`cell must be "q,r", got "${v}"`);
      f.q = parseInt(c[0], 10); f.r = parseInt(c[1], 10);
    }
    else if (k === "floor") f.floor = parseInt(v, 10);
    else if (k === "wall")  f.wall  = parseInt(v, 10);
    else if (k === "shelf") f.shelf = parseInt(v, 10);
    else if (k === "slot" || k === "book") f.slot = parseInt(v, 10);
    else throw new Error(`unknown address component "${k}"`);
  }
  if (f.q === undefined || f.r === undefined) throw new Error("a walk address needs a cell");
  if (f.floor === undefined) f.floor = 0;
  /* No shelf and no slot means this names a room, not a volume -- which is
     what the HUD shows you standing in and what a wander reports at each
     stop. Reading rooms and shafts have no shelved wall at all, so
     insisting on one made their own addresses unparseable. */
  if (f.shelf === undefined && f.slot === undefined && f.wall === undefined)
    return withPage(roomAddress({ ...f, seed }), parts);
  if (f.wall === undefined){
    const walls = shelvedWalls(f.q, f.r, f.floor);
    if (!walls.length)
      throw new Error(`cell ${f.q},${f.r} on floor ${f.floor} has no shelved wall to default to`);
    f.wall = walls[0];
  }
  return withPage(walkAddress({ ...f, seed }), parts);
}
function withPage(a, parts){
  if (parts[0] === "page") return { ...a, page: parseInt(parts[1], 10) };
  return a;
}

/* ---- one call an agent can build a whole turn around --------------- */
function readBook(uriOrAddress, page = 0){
  const a = typeof uriOrAddress === "string" ? parseAddress(uriOrAddress) : uriOrAddress;
  const v = validate(a);
  const p = a.page ?? page;
  return {
    address: formatAddress(a, p),
    valid: v.ok, reason: v.reason,
    spine: spineLabel(a),
    ...pageOf(a, p)
  };
}
/* Find a phrase: construct the address of a book that contains it. */
function findPhrase(phrase, { offset = 0, seed = DEFAULT_SEED } = {}){
  const a = textAddress({ phrase, offset, seed });
  return { address: formatAddress(a, Math.floor(offset / PAGE_LEN)),
           page: Math.floor(offset / PAGE_LEN),
           line: Math.floor((offset % PAGE_LEN) / COLS),
           column: offset % COLS,
           spine: spineLabel(a),
           rarity: rarity(phrase.length) };
}

/* ---- wandering, with something to read ----------------------------- *
 * The third way in, beside walking to a shelf and searching for a phrase:
 * be turned loose. "Look through books until you find text that relates
 * to this, then find a chair and sit" is a job for a reader, not for this
 * module -- whether a page *relates* to anything is a judgement no core
 * can make. What the core owes such a reader is that every room it passed
 * through and every volume it opened has coordinates someone else can
 * follow, and that the same journey seed always gives the same journey.  */

/* Every shelf position in a gallery, in a fixed order. Small enough to
   enumerate: at most 6 walls x 5 shelves x 35 slots. */
function shelfAddresses(q, r, fl, seed = DEFAULT_SEED){
  const out = [];
  for (const wall of shelvedWalls(q, r, fl))
    for (let shelf = 0; shelf < SHELVES_PER_WALL; shelf++)
      for (let slot = 0; slot < BOOKS_PER_SHELF; slot++)
        out.push(walkAddress({ q, r, floor: fl, wall, shelf, slot, seed }));
  return out;
}

/* A deterministic handful from this gallery -- which volumes you happened
   to pull down. Keyed on the journey seed and the step, so the choice is
   part of the record rather than an accident. */
function volumesToHand(q, r, fl, { seed = DEFAULT_SEED, journey = 1, step = 0, take = 3 } = {}){
  const all = shelfAddresses(q, r, fl, seed);
  if (!all.length) return [];
  const out = [];
  for (let k = 0; k < Math.min(take, all.length); k++){
    const pick = stepHash(u32(journey ^ 0x424F4F4B), step * 8 + k) % all.length;
    const a = all[pick];
    if (!out.some(o => o.wall === a.wall && o.shelf === a.shelf && o.slot === a.slot)) out.push(a);
  }
  return out;
}

/* The whole excursion: where it went, what was on the shelves, what it
   could sit in. Pages are not included -- a reader asks for the ones it
   wants with readBook(), which keeps a long walk cheap. */
function journey({ q = 0, r = 0, floor = 0, steps = 24, seed = DEFAULT_SEED,
                   route = 1, take = 3 } = {}){
  const trail = wander({ q, r, floor, steps, seed: route });
  return {
    route, seed,
    from: cellAddress(q, r, floor, seed),
    stops: trail.map(t => ({
      step: t.step,
      cell: { q: t.q, r: t.r, floor: t.floor },
      at: cellAddress(t.q, t.r, t.floor, seed),
      type: t.type,
      volumes: t.volumes,
      seats: t.seats,
      shelves: t.volumes
        ? volumesToHand(t.q, t.r, t.floor, { seed, journey: route, step: t.step, take })
            .map(a => ({ uri: formatAddress(a), spine: spineLabel(a) }))
        : [],
      took: t.took && { via: t.took.via, climb: t.took.climb,
                        to: { q: t.took.to.q, r: t.took.to.r, floor: t.took.to.floor } }
    }))
  };
}

/* Walk until there is a chair, and report the room in full. */
function walkToASeat({ q = 0, r = 0, floor = 0, seed = DEFAULT_SEED,
                       route = 1, maxSteps = 400 } = {}){
  const found = findSeat({ q, r, floor, seed: route, maxSteps });
  return {
    route, seed, steps: found.steps,
    found: !!found.room,
    room: found.room && {
      ...found.room,
      at: cellAddress(found.room.q, found.room.r, found.room.floor, seed)
    },
    trail: found.trail.map(t => ({ step: t.step, cell: { q: t.q, r: t.r, floor: t.floor },
                                   type: t.type, volumes: t.volumes, seats: t.seats }))
  };
}

export {
  ALPHABET, LETTERS, RADIX, PAGES, LINES, COLS, PAGE_LEN, C, LOG10_N, DEFAULT_SEED,
  shelfAddresses, volumesToHand, journey, walkToASeat, cellAddress,
  WALK_DOMAIN, TEXT_DOMAIN, LABEL_DOMAIN,
  mix, reduceRadix, streamDigit, walkKey, addressKey,
  walkAddress, roomAddress, textAddress, validate,
  digitAt, symbolAt, lineOf, pageOf, sliceOf, spineLabel, rarity,
  formatAddress, parseAddress, readBook, findPhrase
};
