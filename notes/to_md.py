"""Convert pdftotext output of 'The Library of Babel' into Markdown.

Runs entirely on disk; the prose is never held anywhere but this process.
  - decode Latin-1 -> UTF-8 (restores 'mlo:' and 'A'lvarez)
  - TeX-style ``quotes'' -> typographic "quotes"
  - unwrap hard line breaks back into paragraphs
  - footnote refs/bodies -> GFM [^n] footnotes
"""
import re
import sys

SRC, DST = sys.argv[1], sys.argv[2]

raw = open(SRC, "rb").read().decode("latin-1")

# TeX quote conventions left over from the original typesetting.
raw = raw.replace("``", "“").replace("''", "”")
# Stray apostrophe artifact after the quoted word 'infinite'.
raw = raw.replace('the word "infinite".\'', 'the word “infinite.”')
# Remaining straight double quotes -> curly, pairwise.
def curl(m):
    curl.n += 1
    return "”" if curl.n % 2 == 0 else "“"
curl.n = 0
raw = re.sub(r'"', curl, raw)

raw_blocks = [b for b in re.split(r"\n\s*\n", raw) if b.strip()]

def unwrap(block):
    text = " ".join(line.strip() for line in block.strip().splitlines())
    return re.sub(r"\s+", " ", text).strip()

blocks = [unwrap(b) for b in raw_blocks]

title = blocks[0]
epigraph = blocks[1]
body = blocks[2:]

# Trailing matter: 'Translated by J. E. I.', then footnotes 1..4 -- which run
# together with no blank line between them, so they arrive as one block and
# have to be split on the leading numeral of each note.
notes = {}
trans = None
kept = []
for i, b in enumerate(body):
    if b.startswith("Translated by"):
        trans = b
    elif re.match(r"^1 The original manuscript", b):
        parts = re.split(r"(?m)^\s*([1-4]) (?=\S)", raw_blocks[i + 2])
        for n, text in zip(parts[1::2], parts[2::2]):
            notes[n] = unwrap(text)
    else:
        kept.append(b)
body = kept

# Inline footnote references, matched on their exact surrounding context so
# that in-text numerals such as 'page 71' are left alone.
REFS = [
    ("twenty-five in number.1", "twenty-five in number.[^1]"),
    ("an upper hexagon2 came", "an upper hexagon[^2] came"),
    ("of the universe3;", "of the universe[^3];"),
    ("this elegant hope4.", "this elegant hope[^4]."),
]
body_text = "\n\n".join(body)
for old, new in REFS:
    if old not in body_text:
        sys.exit("footnote ref not found: %r" % old)
    body_text = body_text.replace(old, new, 1)
body = body_text.split("\n\n")

# Epigraph is quotation + attribution on consecutive source lines, so it has
# to be read before the unwrap pass collapses them together.
epi_lines = [l.strip() for l in raw_blocks[1].strip().splitlines() if l.strip()]
quote, attrib = epi_lines[0], " ".join(epi_lines[1:])

heading = re.match(r"^(.*?), by (.*?) \((\d{4})\)$", title)
name, author, year = heading.group(1), heading.group(2), heading.group(3)

out = []
out.append("# %s" % name)
out.append("*%s, %s*" % (author, year))
out.append("> %s\n>\n> — %s" % (quote, attrib))
out.append("---")
out.extend(body)
out.append("---")
out.append("*%s*" % trans)
out.append("## Notes")
for n in sorted(notes):
    out.append("[^%s]: %s" % (n, notes[n]))

open(DST, "w", encoding="utf-8", newline="\n").write("\n\n".join(out) + "\n")
print("wrote %s: %d paragraphs, %d footnotes" % (DST, len(body), len(notes)))
