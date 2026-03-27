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

  // Find the scrollable ancestor of the grid (the element with the scrollbar).
  const gridScroller = (doc) => {
    let el = doc.querySelector('#gridTable');
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return null;
  };

  // Paste an array of values into a column, scrolling to reach lazily-rendered
  // rows. Rows off-screen exist as empty <tr> placeholders (no inputs) until
  // scrolled into view, so we scroll through the grid and fill cells in DOM
  // order as they appear, using a Set to avoid double-filling.
  const pasteColumn = async (data, col) => {
    const doc = gridDoc();
    if (!doc) return;

    const scroller = gridScroller(doc);
    const filled = new Set();  // track filled data-xy values
    let nextDataIdx = 0;

    const fillVisible = () => {
      const cells = inputCells(col);
      for (const input of cells) {
        const xy = input.closest('[data-xy]')?.dataset.xy;
        if (!xy || filled.has(xy)) continue;
        if (nextDataIdx >= data.length) break;
        fillCell(input, data[nextDataIdx]);
        filled.add(xy);
        nextDataIdx++;
      }
    };

    if (scroller) {
      // Start from the top so we fill in DOM/visual order.
      scroller.scrollTop = 0;
      await new Promise(r => setTimeout(r, 100));
    }

    fillVisible();

    if (scroller) {
      const step = scroller.clientHeight * 0.8;
      while (scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 1) {
        scroller.scrollTop += step;
        await new Promise(r => setTimeout(r, 150));
        fillVisible();
        if (nextDataIdx >= data.length) break;
      }
      // One final check at the bottom.
      fillVisible();
    }

    console.log(`Filled ${nextDataIdx}/${data.length} cells in column ${col}`);
    if (nextDataIdx < data.length) {
      console.warn(`Could not find cells for ${data.length - nextDataIdx} rows — they may not exist in the grid.`);
    }
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

      await pasteColumn(data, col);
    } finally {
      active = false;
    }
  };

  document.addEventListener('ic-fill', run);
}
