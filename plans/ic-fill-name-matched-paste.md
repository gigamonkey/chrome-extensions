# ic-fill: name-matched paste

## Goal

Today ic-fill pastes clipboard lines positionally down the clicked column:
line 1 goes into the first editable row, line 2 into the second, and so on.
This breaks whenever the clipboard's row order doesn't exactly match the
gradebook's row order, or covers a different set of students.

New behavior: when the clipboard contains a **two-column TSV** — first column
student name, second column grade — match rows **by student name** instead of
by position:

- Grid rows whose student doesn't appear in the clipboard are left untouched.

- Clipboard rows whose name matches no student in the grid are ignored
  (reported in the console, but not an error).

A one-column clipboard keeps the current positional behavior unchanged.

## What the DOM gives us (from sample-body.html)

Only `ic-fill/fill.js` needs to change. The relevant structure in the nested
grid document:

- The score grid is `#gridTable`. Each student's row is
  `<tr class="gridTR" id="gridTR109090_23103">` — the id suffix is
  `<sectionId>_<studentId>`.

- Student names live in a separate, scroll-synced table `#studentTable`,
  one `<tr id="studentTR109090_23103" class="studentTR">` per student, with
  the **same id suffix** as the corresponding grid row. The display name is
  the text of `.studentName a` inside that row (which also has an id of the
  form `student_23103`).

- Names come as `"Last, First "` — note stray trailing/double spaces — and
  sometimes with a nickname: `"Gehring, Darien  (Darien)"`.

- Editable score cells are the same `input.scoreInput` (without `readonly`)
  the extension already targets; each sits inside a `td[data-xy="col_row"]`
  within a `tr.gridTR`.

So the mapping from an editable input to a student is:
`input.closest('tr.gridTR').id` → strip the `gridTR` prefix → look up the
same suffix in `#studentTable` → read `.studentName a` text. Using the full
`<sectionId>_<studentId>` suffix as the key (not just the student id) keeps
this correct if a gradebook ever shows multiple sections.

## Design

### 1. Clipboard parsing and mode detection

Extend `getFromClipboard` (or add a `parseClipboard`) to return a parsed
result rather than raw lines:

- Split into lines, drop trailing blank lines (as today).

- **Name mode** if every remaining non-blank line contains a tab. Each line
  splits on `\t`; field 1 is the name, field 2 the grade (extra fields
  ignored). Build a `Map` from normalized name → grade. Lines with an empty
  grade field are dropped — "no grade in the clipboard" must leave the row
  untouched, not blank it.

- **Positional mode** otherwise: the current array-of-lines behavior,
  untouched.

A convenient consequence: a spreadsheet header row like `Name\tGrade`
matches no student and is silently ignored — no special-casing needed.

### 2. Name normalization

Both grid names and clipboard names go through one `normalizeName`:

- strip any `(...)` parenthetical (nicknames),
- lowercase,
- collapse runs of whitespace to a single space, trim.

When indexing grid names, register each student under **two keys**: the
native `"last, first"` form and a reordered `"first last"` form (split on
the first comma). That lets the clipboard use either format.

If two students normalize to the same key, that key is **ambiguous**: don't
fill either row, and `console.warn` about it. Silently giving two students
the same grade is worse than making the user handle a rare collision by
hand.

### 3. Building the student map

A `studentNames(doc)` helper walks `#studentTable tr.studentTR`, extracts
the id suffix and the `.studentName a` text, and returns
`Map<rowKey, name>`.

The grid lazily renders rows as placeholders until scrolled into view; it is
unknown whether `#studentTable` (scroll-synced with the grid) does the same.
To be safe, rebuild/extend the name map inside the existing scroll loop each
time we look for newly rendered cells — cheap, and correct either way.

### 4. Refactor `pasteColumn` to a value resolver

`pasteColumn` currently threads a sequential `nextDataIdx` through
`fillVisible`. Generalize: `fillVisible` asks a resolver for each not-yet
visited editable input in the column:

- **Positional resolver**: returns `data[nextDataIdx++]` — current behavior,
  including "stop when data is exhausted".

- **Name resolver**: row key → student name → normalized → grade map. Returns
  `undefined` (leave untouched) for unmatched or ambiguous rows. Marks each
  clipboard entry as used when matched.

The scroll loop stays as is; only its early-exit condition differs by mode:
positional exits when the data runs out, name mode exits when every
clipboard entry has been used (otherwise it scrolls to the bottom, since
matches can be anywhere).

Visited cells are still tracked by `data-xy` in the `filled` set so
unmatched rows aren't re-examined every scroll step (rename the set if that
reads better).

### 5. Reporting: in-page status banner

Console logging alone is invisible unless DevTools happens to be open, so
results — especially ambiguous or unmatched names — get a proper in-page
banner. `fill.js` already runs in the page's MAIN world, so it can inject
an overlay directly: no new permissions, no background/content-script
messaging.

A small `banner` helper owns a single fixed-position div in the **top**
document (`position: fixed`, top-right, high z-index, all styling inline so
Infinite Campus CSS can't affect it; reuse the same element across calls).
It drives the whole flow, replacing today's console-only prompts:

- On activation: "Got N grades from clipboard — click a cell in the target
  column…" (currently the user gets no visible feedback that the extension
  is armed).

- While filling: a short "Filling…" state, since the scroll loop can take a
  few seconds on long rosters.

- On completion, a summary per mode. For name mode: how many cells were
  filled, clipboard names that matched no student (listed), and ambiguous
  names that were skipped (listed). On clean success the banner auto-fades
  after a few seconds; if there are unmatched or ambiguous names it stays
  up, styled as a warning, with a close button.

Grid rows without a clipboard grade are by design and don't appear in the
summary. Keep the `console.log` calls too, as the detailed record.

## Steps

1. Add `normalizeName`, `parseClipboard` (mode detection + grade map), and
   `studentNames` helpers to `fill.js`.

2. Refactor `pasteColumn`/`fillVisible` to take a resolver; reimplement the
   current positional behavior on top of it and verify nothing changed.

3. Add the name resolver wired to the student map (rebuilt inside the scroll
   loop) and the mode switch in `run`.

4. Add the `banner` helper and wire it through `run`/`pasteColumn`
   (activation prompt, filling state, per-mode summary with
   unmatched/ambiguous name lists); keep the console logging alongside.

5. Update `README.md` to describe the two clipboard formats and the banner.

6. Bump the version with the existing `bump-version.py` / Makefile flow.

## Testing

Manual, against a real Infinite Campus gradebook:

- One-column clipboard: behavior identical to today.

- Two-column TSV in grid order: same result as positional paste.

- Shuffled TSV, TSV missing some students, TSV with extra/unknown names, a
  header row, names in `First Last` order, a nickname student
  ("Gehring, Darien (Darien)") — verify matches, untouched rows, and the
  summary in both the banner and the console.

- Banner behavior: prompt appears on activation, warning variant sticks
  around (with working close button) when there are unmatched or ambiguous
  names, success variant auto-fades, and repeated runs reuse one banner
  rather than stacking.

- A class long enough to trigger lazy rendering, to confirm name matching
  works for rows that only render mid-scroll.

Selector assumptions (`studentTR`/`gridTR` id suffixes, `.studentName a`)
can be sanity-checked ahead of time by opening `sample-body.html` as a
static page and running the helpers in the console.
