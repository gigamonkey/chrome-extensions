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

1. Copy a column of grades (one per line) to your clipboard — e.g. from a
   spreadsheet.
2. Navigate to the Infinite Campus score grid.
3. Click the extension icon in the toolbar.
4. Click any cell in the column you want to fill.

The extension reads your clipboard, then fills every editable cell in that
column from top to bottom. It automatically scrolls through the grid to
reach rows that haven't loaded yet.

## Notes

- Read-only cells are skipped.
- If the clipboard has more values than there are editable cells (or vice
  versa), the extension fills as many as it can and logs a warning to the
  browser console.
- You can open the console (`F12` → Console tab) to see progress messages.
