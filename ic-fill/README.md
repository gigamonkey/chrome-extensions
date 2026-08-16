# IC Fill — Bulk Grade Entry for Infinite Campus

A Chrome extension that pastes a column of grades from your clipboard into
Infinite Campus's grade grid.

## Installation

1. Download `ic-fill-1.0.0.zip`.
2. Unzip the archive.
3. In Chrome, go to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the unzipped folder.

## Usage

1. Copy grades to your clipboard — e.g. from a spreadsheet — in one of the
   three formats below.
2. Navigate to the Infinite Campus score grid.
3. Click the extension icon in the toolbar.
4. Click any cell in the column you want to fill. (Not needed for the
   header-row format, which knows its columns.)

A status banner in the top-right corner of the page shows what the
extension is doing and, when it finishes, a summary of what was filled.
The extension automatically scrolls through the grid to reach rows that
haven't loaded yet.

### Clipboard formats

**One column** (grades only): the grades are pasted positionally, filling
every editable cell in the clicked column from top to bottom.

**Two columns** (name, then grade, tab-separated — i.e. two spreadsheet
columns): each grade goes to the row whose student name matches, so the
clipboard doesn't have to be in the grid's order or cover every student:

- Students not on the clipboard, and clipboard rows with an empty grade,
  are left untouched.
- Clipboard rows whose name matches no student (including any header row)
  are ignored. They're mentioned in the summary, but they aren't an
  error: as long as every row in the column gets filled, the run counts
  as a success.
- Names match regardless of case, extra spaces, or nicknames in
  parentheses, and can be written either `Last, First` or `First Last`.
- If two students in the grid have the same name, that name is skipped and
  flagged in the summary rather than guessing.

**Header row** (first cell `Name`/`Names`, remaining cells assignment
names): fills several assignment columns at once, with no cell click
needed. Each header must exactly match an assignment's name or its
abbreviation as shown in the grid; each column below it is a grade per
student, matched by name with the same rules as the two-column format.
Empty cells are left untouched, and headers that match no assignment (or
more than one) are reported and that column is skipped.

## Notes

- Read-only cells are skipped.
- The summary banner stays up only when some rows in the column didn't
  get filled, and lists those students; otherwise it fades out on its
  own after a few seconds.
- The console (`F12` → Console tab) has the same messages as the banner.
