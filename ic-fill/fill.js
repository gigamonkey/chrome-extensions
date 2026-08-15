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

  // Status banner injected into the top page, since console output is
  // invisible unless DevTools is open. One element, reused across runs.
  const banner = (() => {
    const COLORS = { info: '#1a73e8', success: '#188038', warn: '#d93025' };
    let el, msg, timer;
    const hide = () => {
      clearTimeout(timer);
      el?.remove();
      el = null;
    };
    const ensure = () => {
      if (el?.isConnected) return;
      el = document.createElement('div');
      // All styling is inline so the host page's CSS can't affect it.
      el.style.cssText =
        'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:380px;' +
        'background:#fff;color:#202124;font:13px/1.5 system-ui,sans-serif;' +
        'padding:12px 36px 12px 14px;border-radius:8px;border-left:4px solid #1a73e8;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.3);transition:opacity .4s;';
      msg = document.createElement('div');
      const close = document.createElement('div');
      close.textContent = '×';
      close.style.cssText =
        'position:absolute;top:4px;right:10px;cursor:pointer;font-size:18px;color:#5f6368;';
      close.addEventListener('click', hide);
      el.append(msg, close);
      document.body.appendChild(el);
    };
    // lines: array of strings; the first is rendered bold. Text goes in via
    // textContent since it can contain clipboard data.
    const show = (lines, kind = 'info', { autoHide = false } = {}) => {
      ensure();
      clearTimeout(timer);
      el.style.opacity = '1';
      el.style.borderLeftColor = COLORS[kind];
      msg.replaceChildren(...lines.map((line, i) => {
        const div = document.createElement('div');
        div.textContent = line;
        if (i === 0) div.style.fontWeight = '600';
        return div;
      }));
      if (autoHide) {
        timer = setTimeout(() => {
          el.style.opacity = '0';
          timer = setTimeout(hide, 450);
        }, 5000);
      }
    };
    return { show, hide };
  })();

  // Normalized lookup keys for a student name: parentheticals (nicknames)
  // stripped, lowercased, whitespace collapsed. "Last, First" names get a
  // second "first last" key so the clipboard can use either order.
  const nameKeys = (name) => {
    const norm = s => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const keys = [norm(name)];
    const comma = name.indexOf(',');
    if (comma >= 0) keys.push(norm(`${name.slice(comma + 1)} ${name.slice(0, comma)}`));
    return [...new Set(keys)].filter(k => k !== '');
  };

  // Parse clipboard text. If every non-blank line contains a tab, it's a
  // name/grade TSV and we match by student name; otherwise it's a plain
  // column of grades pasted positionally. Trailing blank lines are dropped.
  const parseClipboard = (text) => {
    const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    if (lines.length === 0) return null;
    const nonBlank = lines.filter(l => l.trim() !== '');
    if (!nonBlank.every(l => l.includes('\t'))) {
      return { mode: 'positional', values: lines };
    }
    // Rows with an empty grade are dropped: no grade means leave that
    // student's cell untouched, not blank it. Unmatchable names (including
    // any header row) are reported after the fill, not treated as errors.
    const entries = [];
    for (const line of nonBlank) {
      const [name, grade] = line.split('\t');
      if (name.trim() === '' || !grade?.trim()) continue;
      entries.push({ name: name.trim(), grade: grade.trim(), used: false, ambiguous: false });
    }
    return { mode: 'names', entries };
  };

  // Value source for positional mode: the current fill-down-the-column
  // behavior, one clipboard line per editable cell.
  const positionalSource = (values) => {
    let idx = 0;
    return {
      resolve: () => values[idx++],
      exhausted: () => idx >= values.length,
      summary: (filled) => {
        const lines = [`Filled ${filled} of ${values.length} rows.`];
        if (filled < values.length) {
          lines.push(`No cells found for the last ${values.length - filled} rows — the grid may have fewer rows than the clipboard.`);
        }
        return { lines, ok: filled === values.length };
      },
    };
  };

  // Value source for name mode. Grid rows (tr#gridTR<section>_<student>) and
  // student-name rows (tr#studentTR<section>_<student>) share an id suffix,
  // so each editable cell maps to a display name via that suffix. refresh()
  // re-reads #studentTable on every scroll pass in case it, like the grid,
  // renders rows lazily.
  const nameSource = (entries) => {
    const byKey = new Map();
    for (const entry of entries) {
      for (const key of nameKeys(entry.name)) {
        if (byKey.has(key) && byKey.get(key) !== entry) {
          console.warn(`Duplicate name on clipboard: "${entry.name}" — using the last row.`);
        }
        byKey.set(key, entry);
      }
    }
    const rowNames = new Map();  // "<section>_<student>" -> display name
    let keyOwners = new Map();   // normalized key -> Set of row keys
    return {
      refresh: (doc) => {
        for (const tr of doc.querySelectorAll('#studentTable tr.studentTR')) {
          const name = tr.querySelector('.studentName a')?.textContent;
          if (tr.id.startsWith('studentTR') && name) {
            rowNames.set(tr.id.slice('studentTR'.length), name);
          }
        }
        keyOwners = new Map();
        for (const [rowKey, name] of rowNames) {
          for (const key of nameKeys(name)) {
            if (!keyOwners.has(key)) keyOwners.set(key, new Set());
            keyOwners.get(key).add(rowKey);
          }
        }
      },
      resolve: (input) => {
        const tr = input.closest('tr.gridTR');
        if (!tr?.id?.startsWith('gridTR')) return undefined;
        const name = rowNames.get(tr.id.slice('gridTR'.length));
        if (!name) return undefined;
        for (const key of nameKeys(name)) {
          const entry = byKey.get(key);
          if (!entry) continue;
          // Two students normalizing to the same name: filling both with one
          // grade would silently be wrong for one of them, so skip and report.
          if (keyOwners.get(key)?.size > 1) {
            entry.ambiguous = true;
            continue;
          }
          entry.used = true;
          return entry.grade;
        }
        return undefined;
      },
      exhausted: () => entries.every(e => e.used || e.ambiguous),
      summary: (filled) => {
        const unmatched = entries.filter(e => !e.used && !e.ambiguous).map(e => e.name);
        const ambiguous = entries.filter(e => e.ambiguous && !e.used).map(e => e.name);
        const lines = [`Filled ${filled} of ${entries.length} grades by student name.`];
        if (unmatched.length > 0) lines.push(`No matching student: ${unmatched.join('; ')}`);
        if (ambiguous.length > 0) lines.push(`Ambiguous name, skipped: ${ambiguous.join('; ')}`);
        return { lines, ok: unmatched.length === 0 && ambiguous.length === 0 };
      },
    };
  };

  // Fill a column from a value source, scrolling to reach lazily-rendered
  // rows. Rows off-screen exist as empty <tr> placeholders (no inputs) until
  // scrolled into view, so we scroll through the grid and offer each cell to
  // the source as it appears, using a Set to avoid revisiting cells.
  const pasteColumn = async (source, col) => {
    const doc = gridDoc();
    if (!doc) return 0;

    const scroller = gridScroller(doc);
    const visited = new Set();  // data-xy values already offered to the source
    let filled = 0;

    const fillVisible = () => {
      source.refresh?.(doc);
      for (const input of inputCells(col)) {
        const xy = input.closest('[data-xy]')?.dataset.xy;
        if (!xy || visited.has(xy)) continue;
        if (source.exhausted()) break;
        visited.add(xy);
        const value = source.resolve(input);
        if (value !== undefined) {
          fillCell(input, value);
          filled++;
        }
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
        if (source.exhausted()) break;
      }
      // One final check at the bottom.
      fillVisible();
    }

    return filled;
  };

  // Main flow: read clipboard, wait for user to click a cell, then fill.
  let active = false;

  const run = async () => {
    if (active) return;
    active = true;
    try {
      const clip = parseClipboard(await navigator.clipboard.readText());
      if (!clip || (clip.mode === 'names' && clip.entries.length === 0)) {
        banner.show(['IC Fill: nothing usable on the clipboard.'], 'warn');
        console.error('Clipboard is empty or has no name/grade rows');
        return;
      }

      const doc = gridDoc();
      if (!doc) {
        banner.show(['IC Fill: could not find the grade grid on this page.'], 'warn');
        return;
      }

      const count = clip.mode === 'names' ? clip.entries.length : clip.values.length;
      const how = clip.mode === 'names' ? 'matching by student name' : 'pasting down the column';
      banner.show(
        [`IC Fill: ${count} grades on clipboard, ${how}.`, 'Click a cell in the target column…'],
        'info');
      console.log(`Got ${count} rows from clipboard (${clip.mode} mode). Click a cell in the target column...`);

      const col = await new Promise(resolve => {
        doc.addEventListener('focusin', function handler(e) {
          if (e.target.matches('input.scoreInput')) {
            doc.removeEventListener('focusin', handler);
            const xy = e.target.closest('[data-xy]')?.dataset.xy;
            if (xy) resolve(xy.split('_')[0]);
          }
        });
      });

      banner.show(['IC Fill: filling…'], 'info');

      const source = clip.mode === 'names' ? nameSource(clip.entries) : positionalSource(clip.values);
      const filled = await pasteColumn(source, col);

      const { lines, ok } = source.summary(filled);
      lines[0] = `IC Fill: ${lines[0]}`;
      banner.show(lines, ok ? 'success' : 'warn', { autoHide: ok });
      console.log(lines.join('\n'));
    } finally {
      active = false;
    }
  };

  document.addEventListener('ic-fill', run);
}
