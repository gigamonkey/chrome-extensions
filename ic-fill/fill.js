// A bare block, not an if-guard: consts stay block-scoped so re-injection
// doesn't collide, and the listener swap at the bottom makes the newest
// injected version take over without requiring a page reload.
{
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

  // Find all editable input cells in a given data-xy column.
  const inputCells = (doc, col) => {
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
      // A banner left behind by a replaced script version isn't ours to reuse.
      document.getElementById('ic-fill-banner')?.remove();
      el = document.createElement('div');
      el.id = 'ic-fill-banner';
      // All styling is inline so the host page's CSS can't affect it.
      el.style.cssText =
        'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:380px;' +
        'max-height:60vh;overflow-y:auto;' +
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
  // stripped, lowercased, commas treated as spaces, whitespace collapsed.
  // "Last, First" names get a second "first last" key so the clipboard can
  // use either order.
  const norm = s =>
    s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  const nameKeys = (name) => {
    const keys = [norm(name)];
    const comma = name.indexOf(',');
    if (comma >= 0) keys.push(norm(`${name.slice(comma + 1)} ${name.slice(0, comma)}`));
    return [...new Set(keys)].filter(k => k !== '');
  };

  // A looser "last-name first-name" key that drops middle names/initials,
  // which Infinite Campus includes in display names ("Astera, Maia C") but
  // clipboard rosters often lack. Used only when no full-name key matches,
  // and subject to the same ambiguity rules.
  const reducedKey = (name) => {
    const stripped = name.replace(/\([^)]*\)/g, ' ');
    const comma = stripped.indexOf(',');
    let first, last;
    if (comma >= 0) {
      last = stripped.slice(0, comma);
      first = stripped.slice(comma + 1).trim().split(/\s+/)[0] ?? '';
    } else {
      const parts = stripped.trim().split(/\s+/);
      first = parts[0] ?? '';
      last = parts.length > 1 ? parts[parts.length - 1] : '';
    }
    return first && last ? norm(`${last} ${first}`) : '';
  };

  // Parse clipboard text into one of three modes:
  //  - assignments: a header row whose first column is Name/name/Names/names
  //    and whose other columns name the assignments to fill (by name or
  //    abbreviation), followed by name + grades rows.
  //  - names: every non-blank line is a name<TAB>grade pair.
  //  - positional: a plain column of grades pasted top to bottom.
  // Trailing blank lines are dropped.
  const parseClipboard = (text) => {
    const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    if (lines.length === 0) return null;
    const nonBlank = lines.filter(l => l.trim() !== '');

    const first = nonBlank[0]?.split('\t') ?? [];
    if (first.length >= 2 && ['Name', 'name', 'Names', 'names'].includes(first[0].trim())) {
      return {
        mode: 'assignments',
        headers: first.slice(1).map(h => h.trim()),
        rows: nonBlank.slice(1).map(l => {
          const fields = l.split('\t');
          return { name: fields[0].trim(), grades: fields.slice(1).map(g => g.trim()) };
        }),
      };
    }

    if (!nonBlank.every(l => l.includes('\t'))) {
      return { mode: 'positional', values: lines };
    }
    return { mode: 'names', entries: tsvEntries(nonBlank.map(l => l.split('\t'))) };
  };

  // Build name/grade entries from [name, grade] pairs. Rows with an empty
  // grade are dropped: no grade means leave that student's cell untouched,
  // not blank it. Unmatchable names are reported after the fill, not
  // treated as errors.
  const tsvEntries = (pairs) =>
    pairs
      .filter(([name, grade]) => name.trim() !== '' && grade?.trim())
      .map(([name, grade]) => ({ name: name.trim(), grade: grade.trim(), used: false, ambiguous: false }));

  // The assignments visible in the grid header: full name (from the sr-only
  // tooltip text), displayed abbreviation, and the id that prefixes every
  // score cell of that assignment's column.
  const assignments = (doc) => {
    return [...doc.querySelectorAll('td.assignTD[id^="assignTD"]')].map(td => ({
      id: td.id.slice('assignTD'.length),
      abbrev: td.querySelector('.assignmentName a')?.textContent.trim() ?? '',
      name: td.querySelector('span.sr-only b')?.textContent.trim() ?? '',
    }));
  };

  // Console dump for name-matching failures: shows exactly what the grid
  // displays, with any non-ASCII characters made visible.
  const dumpRosterDiagnostics = (roster, unmatched) => {
    const reveal = n => JSON.stringify(n).replace(/[^\x20-\x7e]/g,
      c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    console.log(`Student names read from the grid (${roster.length}):\n  ` +
      roster.map(reveal).join('\n  '));
    console.log('Unmatched clipboard names:\n  ' + unmatched.map(reveal).join('\n  '));
  };

  // Value source for positional mode: the current fill-down-the-column
  // behavior, one clipboard line per editable cell.
  const positionalSource = (values) => {
    let idx = 0;
    return {
      resolve: () => values[idx++],
      exhausted: () => idx >= values.length,
      summary: (filled, offered) => {
        const lines = [`Filled ${filled} of ${values.length} rows.`];
        if (filled < values.length) {
          lines.push(`No cells found for the last ${values.length - filled} rows — the grid may have fewer rows than the clipboard.`);
        }
        return { lines, ok: filled === values.length };
      },
    };
  };

  // Value source for name-matched modes. Grid rows (tr#gridTR<sec>_<stu>)
  // and student-name rows (tr#studentTR<sec>_<stu>) share an id suffix, so
  // each editable cell maps to a display name via that suffix. refresh()
  // re-reads #studentTable on every scroll pass in case it, like the grid,
  // renders rows lazily.
  const nameSource = (entries) => {
    const byKey = new Map();      // full-name key -> entry
    const byReduced = new Map();  // reduced key -> entry, or null if two entries share it
    for (const entry of entries) {
      for (const key of nameKeys(entry.name)) {
        if (byKey.has(key) && byKey.get(key) !== entry) {
          console.warn(`Duplicate name on clipboard: "${entry.name}" — using the last row.`);
        }
        byKey.set(key, entry);
      }
      const rk = reducedKey(entry.name);
      if (rk) byReduced.set(rk, byReduced.has(rk) && byReduced.get(rk) !== entry ? null : entry);
    }
    const rowNames = new Map();       // "<section>_<student>" -> display name
    let keyOwners = new Map();        // full-name key -> Set of row keys
    let reducedOwners = new Map();    // reduced key -> Set of row keys
    const unfilledNames = new Set();  // students whose row got no grade
    const miss = (name) => {
      if (name) unfilledNames.add(name.replace(/\s+/g, ' ').trim());
      return undefined;
    };
    const details = () => ({
      unmatched: entries.filter(e => !e.used && !e.ambiguous).map(e => e.name),
      ambiguous: entries.filter(e => e.ambiguous && !e.used).map(e => e.name),
      unfilled: [...unfilledNames],
      roster: [...new Set(rowNames.values())],
    });
    return {
      details,
      refresh: (doc) => {
        for (const tr of doc.querySelectorAll('#studentTable tr.studentTR')) {
          const name = tr.querySelector('.studentName a')?.textContent;
          if (tr.id.startsWith('studentTR') && name) {
            rowNames.set(tr.id.slice('studentTR'.length), name);
          }
        }
        keyOwners = new Map();
        reducedOwners = new Map();
        const own = (map, key, rowKey) => {
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(rowKey);
        };
        for (const [rowKey, name] of rowNames) {
          for (const key of nameKeys(name)) own(keyOwners, key, rowKey);
          const rk = reducedKey(name);
          if (rk) own(reducedOwners, rk, rowKey);
        }
      },
      resolve: (input) => {
        const tr = input.closest('tr.gridTR');
        if (!tr?.id?.startsWith('gridTR')) return undefined;
        const name = rowNames.get(tr.id.slice('gridTR'.length));
        if (!name) return undefined;
        // Full-name match first; fall back to the middle-name-insensitive
        // reduced key only if no full key matches.
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
        const rk = reducedKey(name);
        if (rk && byReduced.has(rk)) {
          const entry = byReduced.get(rk);
          if (entry === null) return miss(name);  // two clipboard rows collide on this key
          if (entry.used) return miss(name);      // already claimed via a full-name match
          if (reducedOwners.get(rk)?.size > 1) {
            entry.ambiguous = true;
            return miss(name);
          }
          entry.used = true;
          return entry.grade;
        }
        return miss(name);
      },
      // Never stop early: success is judged by whether every row in the
      // column got filled, so the whole column has to be examined.
      exhausted: () => false,
      summary: (filled, offered) => {
        const det = details();
        const lines = [`Filled ${filled} of ${offered} rows by student name.`];
        if (det.unfilled.length > 0) lines.push(`Not filled: ${det.unfilled.join('; ')}`);
        if (det.ambiguous.length > 0) lines.push(`Ambiguous name, skipped: ${det.ambiguous.join('; ')}`);
        if (det.unmatched.length > 0) lines.push(`Extra clipboard rows, no matching student: ${det.unmatched.join('; ')}`);
        if (filled === 0 && offered > 0 && det.roster.length === 0) {
          lines.push('No student names could be read from the grid at all — the page layout may have changed.');
        }
        if (det.unmatched.length > 0) dumpRosterDiagnostics(det.roster, det.unmatched);
        // Extra clipboard rows are not an error: it's a success (banner
        // fades) as long as every row in the column got a grade.
        return { lines, ok: filled === offered };
      },
    };
  };

  // A fill job: a value source plus how to enumerate its editable cells and
  // key them for the visited set.
  const columnJob = (source, col) => ({
    source,
    cells: (doc) => inputCells(doc, col),
    key: (input) => input.closest('[data-xy]')?.dataset.xy,
  });

  // Selecting by score-cell id prefix (score<assignId>_<sec>_<stu>) rather
  // than data-xy avoids the grid's duplicated data-xy coordinate spaces.
  const assignmentJob = (source, assignId, label) => ({
    source,
    label,
    cells: (doc) => [...doc.querySelectorAll(`td[id^="score${assignId}_"] input.scoreInput`)]
      .filter(e => !e.hasAttribute('readonly')),
    key: (input) => input.closest('td[id]')?.id,
  });

  // Fill one or more columns in a single pass, scrolling to reach
  // lazily-rendered rows. Rows off-screen exist as empty <tr> placeholders
  // (no inputs) until scrolled into view, so we scroll through the grid and
  // offer each cell to its job's source as it appears, using per-job Sets to
  // avoid revisiting cells. Returns per-job {filled, offered}.
  const pasteColumns = async (jobs) => {
    const doc = gridDoc();
    if (!doc) return jobs.map(() => ({ filled: 0, offered: 0 }));

    const scroller = gridScroller(doc);
    const visited = jobs.map(() => new Set());
    const filled = jobs.map(() => 0);

    const fillVisible = () => {
      jobs.forEach((job, i) => {
        job.source.refresh?.(doc);
        for (const input of job.cells(doc)) {
          const key = job.key(input);
          if (!key || visited[i].has(key)) continue;
          if (job.source.exhausted()) break;
          visited[i].add(key);
          const value = job.source.resolve(input);
          if (value !== undefined) {
            fillCell(input, value);
            filled[i]++;
          }
        }
      });
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
        if (jobs.every(job => job.source.exhausted())) break;
      }
      // One final check at the bottom.
      fillVisible();
    }

    return jobs.map((_, i) => ({ filled: filled[i], offered: visited[i].size }));
  };

  // Aggregate summary for assignments mode. Same success rule as the other
  // name-matched mode, applied across all columns: every offered cell filled
  // and every clipboard column matched to an assignment.
  const assignmentsSummary = (jobs, stats, problems) => {
    const filled = stats.reduce((sum, s) => sum + s.filled, 0);
    const offered = stats.reduce((sum, s) => sum + s.offered, 0);
    const lines = [`Filled ${filled} of ${offered} cells across ${jobs.length} assignment${jobs.length === 1 ? '' : 's'}.`];
    lines.push(...problems);
    const ambiguous = new Set();
    const extra = new Set();
    jobs.forEach((job, i) => {
      const det = job.source.details();
      det.ambiguous.forEach(n => ambiguous.add(n));
      det.unmatched.forEach(n => extra.add(n));
      if (stats[i].filled < stats[i].offered) {
        lines.push(`${job.label} — not filled: ${det.unfilled.join('; ') || 'unknown rows'}`);
      }
    });
    if (ambiguous.size > 0) lines.push(`Ambiguous name, skipped: ${[...ambiguous].join('; ')}`);
    if (extra.size > 0) lines.push(`Extra clipboard rows, no matching student: ${[...extra].join('; ')}`);
    if (extra.size > 0 && jobs.length > 0) {
      dumpRosterDiagnostics(jobs[0].source.details().roster, [...extra]);
    }
    return { lines, ok: filled === offered && problems.length === 0 };
  };

  // Fill every clipboard column whose header exactly matches an assignment's
  // name or abbreviation. No cell click needed — the headers say where each
  // column goes.
  const runAssignments = async (clip, doc) => {
    const known = assignments(doc);
    const problems = [];
    const claimed = new Set();
    const jobs = [];
    clip.headers.forEach((header, j) => {
      if (header === '') return;
      const matches = known.filter(a => a.name === header || a.abbrev === header);
      if (matches.length === 0) {
        problems.push(`No matching assignment: ${header}`);
        return;
      }
      if (matches.length > 1) {
        problems.push(`Multiple assignments match "${header}" — column skipped.`);
        return;
      }
      if (claimed.has(matches[0].id)) {
        problems.push(`Duplicate column for assignment "${header}" — column skipped.`);
        return;
      }
      claimed.add(matches[0].id);
      const entries = tsvEntries(clip.rows.map(r => [r.name, r.grades[j]]));
      jobs.push(assignmentJob(nameSource(entries), matches[0].id, header));
    });

    if (jobs.length === 0) {
      const lines = ['IC Fill: no clipboard columns matched an assignment.', ...problems];
      lines.push(`Assignments in the grid: ${known.map(a => `${a.name} (${a.abbrev})`).join('; ') || 'none found'}`);
      banner.show(lines, 'warn');
      console.warn(lines.join('\n'));
      return;
    }

    banner.show([`IC Fill: filling ${jobs.length} assignment column${jobs.length === 1 ? '' : 's'}: ` +
      jobs.map(j => j.label).join(', ') + '…'], 'info');

    const stats = await pasteColumns(jobs);
    const { lines, ok } = assignmentsSummary(jobs, stats, problems);
    lines[0] = `IC Fill: ${lines[0]}`;
    banner.show(lines, ok ? 'success' : 'warn', { autoHide: ok });
    console.log(lines.join('\n'));
  };

  // Fill a single column chosen by clicking a cell in it.
  const runColumn = async (clip, doc) => {
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
    const [{ filled, offered }] = await pasteColumns([columnJob(source, col)]);

    const { lines, ok } = source.summary(filled, offered);
    lines[0] = `IC Fill: ${lines[0]}`;
    banner.show(lines, ok ? 'success' : 'warn', { autoHide: ok });
    console.log(lines.join('\n'));
  };

  // Main flow: read clipboard, dispatch by mode.
  let active = false;

  const run = async () => {
    if (active) return;
    active = true;
    try {
      const clip = parseClipboard(await navigator.clipboard.readText());
      const empty = !clip ||
        (clip.mode === 'names' && clip.entries.length === 0) ||
        (clip.mode === 'assignments' && clip.rows.length === 0);
      if (empty) {
        banner.show(['IC Fill: nothing usable on the clipboard.'], 'warn');
        console.error('Clipboard is empty or has no usable rows');
        return;
      }

      const doc = gridDoc();
      if (!doc) {
        banner.show(['IC Fill: could not find the grade grid on this page.'], 'warn');
        return;
      }

      if (clip.mode === 'assignments') {
        await runAssignments(clip, doc);
      } else {
        await runColumn(clip, doc);
      }
    } finally {
      active = false;
    }
  };

  // Replace any previously injected version's handler (e.g. after the
  // extension is updated while the tab stays open) so the newest code runs.
  if (window.__icFillRun) document.removeEventListener('ic-fill', window.__icFillRun);
  window.__icFillRun = run;
  document.addEventListener('ic-fill', run);
}
