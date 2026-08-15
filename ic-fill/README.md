# IC Fill — Bulk Grade Entry for Infinite Campus

A Chrome extension that pastes a column of grades from your clipboard into
Infinite Campus's grade grid.

## Installation

1. Unzip the archive.
2. In Chrome, go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the unzipped folder.

## Usage

1. Copy grades to your clipboard — e.g. from a spreadsheet — in one of the
   two formats below.
2. Navigate to the Infinite Campus score grid.
3. Click the extension icon in the toolbar.
4. Click any cell in the column you want to fill.

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
  are ignored and listed in the summary.
- Names match regardless of case, extra spaces, or nicknames in
  parentheses, and can be written either `Last, First` or `First Last`.
- If two students in the grid have the same name, that name is skipped and
  flagged in the summary rather than guessing.

## Notes

- Read-only cells are skipped.
- If something couldn't be filled — extra clipboard rows, unmatched or
  ambiguous names — the summary banner stays up and lists the problems;
  after a clean fill it fades out on its own.
- The console (`F12` → Console tab) has the same messages as the banner.
