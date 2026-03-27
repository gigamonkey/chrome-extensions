if (!window.__icFill) {
  window.__icFill = true;

  // Find the grid document by searching through nested iframes for the one
  // containing #gridTable, rather than assuming a fixed nesting depth.
  const gridDoc = () => {
    let doc = document;
    const maxDepth = 10;
    for (let i = 0; i < maxDepth; i++) {
      if (doc.querySelector('#gridTable')) return doc;
      const iframe = doc.querySelector('iframe');
      if (!iframe?.contentDocument) break;
      doc = iframe.contentDocument;
    }
    console.error('Could not find #gridTable in any iframe');
    return null;
  };

  // Find all editable input cells in a given column.
  const inputCells = (col) => {
    const doc = gridDoc();
    if (!doc) return [];
    const divs = [...doc.querySelector('#gridTable').querySelectorAll('div.scoreCell')];
    return divs
      .filter(e => e.closest('[data-xy]')?.dataset.xy.startsWith(`${col}_`))
      .map(e => e.querySelector('input.scoreInput'))
      .filter(e => e && !e.hasAttribute('readonly'));
  };

  // Use the native value setter to bypass any framework wrappers (React, Angular, etc.)
  // that may intercept normal property assignment.
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

  // Simulate entering a value into a single input cell.
  const fillCell = (input, value) => {
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    nativeSetter.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  };

  // Paste an array of values into a column. Handles length mismatches by pasting
  // as many as possible and warning about the difference.
  const pasteColumn = (data, col) => {
    const cells = inputCells(col);
    if (cells.length === 0) {
      console.error(`No editable cells found in column ${col}`);
      return;
    }

    const count = Math.min(cells.length, data.length);
    if (cells.length !== data.length) {
      console.warn(`Column mismatch: ${cells.length} cells, ${data.length} data rows. Filling ${count}.`);
    }

    for (let i = 0; i < count; i++) {
      fillCell(cells[i], data[i]);
    }
    console.log(`Filled ${count} cells in column ${col}`);
  };

  // Read grades from clipboard, filtering out empty trailing lines.
  const getFromClipboard = () =>
    navigator.clipboard.readText().then(t => {
      const lines = t.split('\n');
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }
      return lines;
    });

  // Main flow: read clipboard, wait for user to click a cell, then fill.
  let active = false;

  const run = async () => {
    if (active) return;
    active = true;
    try {
      const data = await getFromClipboard();
      if (data.length === 0) {
        console.error('Clipboard is empty');
        return;
      }
      console.log(`Got ${data.length} rows from clipboard. Click a cell in the target column...`);

      const doc = gridDoc();
      if (!doc) return;

      const col = await new Promise(resolve => {
        doc.addEventListener('focusin', function handler(e) {
          if (e.target.matches('input.scoreInput')) {
            doc.removeEventListener('focusin', handler);
            const xy = e.target.closest('[data-xy]')?.dataset.xy;
            if (xy) resolve(xy.split('_')[0]);
          }
        });
      });

      pasteColumn(data, col);
    } finally {
      active = false;
    }
  };

  document.addEventListener('ic-fill', run);
}
