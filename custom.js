/* ==========================================================
   Transmission Web UI — Custom Enhancements  (custom.js)
   Works alongside the unmodified transmission-app.js bundle.

   Features
   ────────
   1. Live download/upload sparkline in the statusbar
   2. Dynamic page title (torrent count + current speeds)
   3. Quick Relocate Paths — move dialog dropdown (labels only)
      & "Manage paths" CRUD dialog
   4. Overflow menu "Quick Relocate" one-click section
   5. Path-label chips auto-injected on each torrent row
   6. "Show" filter dropdown — filter torrent list by path label
   ========================================================== */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     SECTION 1 — QUICK PATH STORE
     Persists an ordered array of { id, name, path } objects.
     ════════════════════════════════════════════════════════════════ */

  const QPS = (() => {
    const KEY = 'tx_quick_paths_v1';
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; }
      catch { return []; }
    }
    function save(arr) {
      localStorage.setItem(KEY, JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent('qps:changed', { detail: arr }));
    }
    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    return {
      getAll:  ()                => load(),
      add:     (name, path)     => { const a = load(); a.push({ id: uid(), name: name.trim(), path: path.trim() }); save(a); },
      update:  (id, name, path) => { save(load().map(e => e.id === id ? { id, name: name.trim(), path: path.trim() } : e)); },
      remove:  (id)             => { save(load().filter(e => e.id !== id)); },
      // Return the first saved path whose .path matches dir (exact or prefix)
      matchDir: (dir) => {
        if (!dir) return null;
        const all = load();
        return all.find(p => p.path === dir) ||
               all.find(p => dir.startsWith(p.path.replace(/\/?$/, '/'))) ||
               null;
      },
    };
  })();


  /* ════════════════════════════════════════════════════════════════
     SECTION 2 — PATH MANAGER DIALOG
     Full CRUD: add / inline-edit / delete saved paths.
     Shows both label AND path (as requested for the manage view).
     ════════════════════════════════════════════════════════════════ */

  function openPathManager() {
    const existing = document.getElementById('qp-manager-dialog');
    if (existing) { existing.close(); existing.remove(); }

    const dlg = document.createElement('dialog');
    dlg.id = 'qp-manager-dialog';
    dlg.className = 'qp-manager';
    dlg.innerHTML = `
      <div class="qp-inner">
        <div class="qp-header">
          <div>
            <div class="qp-header-title">Quick Relocate Paths</div>
            <div class="qp-header-subtitle">
              Saved paths appear as labels in the relocate dropdown, torrent chips, and the Show filter.
            </div>
          </div>
          <button class="qp-close" aria-label="Close" id="qp-close-btn">&#x2715;</button>
        </div>
        <div class="qp-list" id="qp-path-list"></div>
        <div class="qp-add-form">
          <div class="qp-section-label">Add new path</div>
          <div class="qp-add-row">
            <input class="qp-input" id="qp-new-name" placeholder="Label  e.g. Movies" maxlength="40" />
            <input class="qp-input qp-path-input" id="qp-new-path" placeholder="/downloads/movies" />
            <button class="qp-btn qp-btn-primary" id="qp-add-btn">Add</button>
          </div>
        </div>
      </div>`;

    document.body.append(dlg);

    function renderList() {
      const list = dlg.querySelector('#qp-path-list');
      const paths = QPS.getAll();
      if (paths.length === 0) {
        list.innerHTML = '<div class="qp-empty">No quick paths yet. Add one below.</div>';
        return;
      }
      list.innerHTML = '';
      for (const entry of paths) {
        const row = document.createElement('div');
        row.className = 'qp-path-row';
        row.dataset.id = entry.id;
        row.innerHTML = `
          <div class="qp-row-display" data-view="${entry.id}">
            <span class="qp-row-name" title="${escHtml(entry.name)}">${escHtml(entry.name)}</span>
            <span class="qp-row-path" title="${escHtml(entry.path)}">${escHtml(entry.path)}</span>
            <button class="qp-btn qp-btn-sm" data-edit="${entry.id}">Edit</button>
            <button class="qp-btn qp-btn-sm qp-btn-danger" data-del="${entry.id}">Delete</button>
          </div>
          <div class="qp-row-edit qp-hidden" data-form="${entry.id}">
            <input class="qp-input" value="${escHtml(entry.name)}" maxlength="40" data-edit-name="${entry.id}" />
            <input class="qp-input qp-path-input" value="${escHtml(entry.path)}" data-edit-path="${entry.id}" />
            <button class="qp-btn qp-btn-primary qp-btn-sm" data-save="${entry.id}">Save</button>
            <button class="qp-btn qp-btn-sm" data-cancel="${entry.id}">Cancel</button>
          </div>`;
        list.append(row);
      }
    }

    renderList();

    dlg.querySelector('#qp-path-list').addEventListener('click', e => {
      const t = e.target;
      const id = t.dataset.edit || t.dataset.del || t.dataset.save || t.dataset.cancel;
      if (!id) return;
      if (t.dataset.edit) {
        dlg.querySelector(`[data-view="${id}"]`).classList.add('qp-hidden');
        dlg.querySelector(`[data-form="${id}"]`).classList.remove('qp-hidden');
        dlg.querySelector(`[data-edit-name="${id}"]`).focus();
        return;
      }
      if (t.dataset.cancel) {
        dlg.querySelector(`[data-view="${id}"]`).classList.remove('qp-hidden');
        dlg.querySelector(`[data-form="${id}"]`).classList.add('qp-hidden');
        return;
      }
      if (t.dataset.save) {
        const name = dlg.querySelector(`[data-edit-name="${id}"]`).value.trim();
        const path = dlg.querySelector(`[data-edit-path="${id}"]`).value.trim();
        if (!name || !path) { shake(!name ? dlg.querySelector(`[data-edit-name="${id}"]`) : dlg.querySelector(`[data-edit-path="${id}"]`)); return; }
        QPS.update(id, name, path);
        renderList();
        return;
      }
      if (t.dataset.del) { QPS.remove(id); renderList(); }
    });

    dlg.querySelector('#qp-add-btn').addEventListener('click', () => {
      const nameEl = dlg.querySelector('#qp-new-name');
      const pathEl = dlg.querySelector('#qp-new-path');
      const name = nameEl.value.trim(), path = pathEl.value.trim();
      if (!name || !path) { shake(!name ? nameEl : pathEl); return; }
      QPS.add(name, path);
      nameEl.value = ''; pathEl.value = '';
      renderList(); nameEl.focus();
    });

    [dlg.querySelector('#qp-new-name'), dlg.querySelector('#qp-new-path')].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') dlg.querySelector('#qp-add-btn').click(); });
    });

    dlg.querySelector('#qp-close-btn').addEventListener('click', () => { dlg.close(); dlg.remove(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) { dlg.close(); dlg.remove(); } });
    dlg.showModal();
    dlg.querySelector('#qp-new-name').focus();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function shake(el) {
    if (!el) return;
    el.style.transition = 'transform 0.08s ease';
    el.style.transform  = 'translateX(-5px)';
    setTimeout(() => { el.style.transform = 'translateX(5px)'; }, 80);
    setTimeout(() => { el.style.transform = ''; }, 160);
    el.focus && el.focus();
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 3 — INJECT QUICK-PATH DROPDOWN INTO MOVE DIALOG
     Shows label only in the dropdown (not the full path).
     The full path still populates the text input below on selection.
     ════════════════════════════════════════════════════════════════ */

  function augmentMoveDialog(dialog) {
    if (dialog.dataset.qpInjected) return;
    dialog.dataset.qpInjected = '1';

    const pathInput = dialog.querySelector('#torrent-path');
    const workarea  = dialog.querySelector('.dialog-workarea');
    if (!pathInput || !workarea) return;

    const row = document.createElement('div');
    row.className = 'qp-select-row';
    row.innerHTML = `
      <span class="qp-select-label">Quick path:</span>
      <select class="qp-move-select" id="qp-move-select">
        <option value="">— choose a saved path —</option>
      </select>
      <button class="qp-btn qp-btn-sm" id="qp-manage-btn" title="Manage saved paths">Manage…</button>`;

    workarea.insertBefore(row, workarea.firstChild);
    const sel = row.querySelector('#qp-move-select');

    function populateSelect() {
      while (sel.options.length > 1) sel.remove(1);
      for (const p of QPS.getAll()) {
        const opt = document.createElement('option');
        opt.value       = p.path;
        opt.textContent = p.name;          // ← label only, path is hidden
        opt.title       = p.path;          // tooltip shows full path on hover
        sel.append(opt);
      }
    }
    populateSelect();

    // Pre-select the option matching the current path input value, if any
    function preselectCurrent() {
      const cur = pathInput.value.trim();
      if (!cur) return;
      for (const opt of sel.options) {
        if (opt.value === cur) { sel.value = cur; return; }
      }
    }
    preselectCurrent();

    sel.addEventListener('change', () => {
      if (sel.value) {
        pathInput.value = sel.value;
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
        pathInput.focus();
      }
    });

    window.addEventListener('qps:changed', populateSelect);
    const mo = new MutationObserver(() => {
      if (!document.body.contains(dialog)) {
        window.removeEventListener('qps:changed', populateSelect);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true });
    row.querySelector('#qp-manage-btn').addEventListener('click', openPathManager);
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 4 — INJECT "QUICK RELOCATE" INTO OVERFLOW MENU
     ════════════════════════════════════════════════════════════════ */

  function augmentOverflowMenu(menu) {
    if (menu.dataset.qpInjected) return;
    menu.dataset.qpInjected = '1';

    function buildSection() {
      menu.querySelector('.qp-overflow-section')?.remove();
      const paths = QPS.getAll();
      if (paths.length === 0) return;

      let insertBefore = null;
      for (const fs of menu.querySelectorAll('fieldset.section')) {
        if (fs.querySelector('legend')?.textContent.trim() === 'Actions') { insertBefore = fs; break; }
      }

      const section = document.createElement('fieldset');
      section.className = 'section qp-overflow-section';
      section.innerHTML = `<legend class="title">Quick Relocate</legend>`;

      for (const p of paths) {
        const btn = document.createElement('button');
        btn.textContent = p.name;
        btn.title = p.path;
        btn.addEventListener('click', () => { moveSelectedTorrents(p.path); document.body.click(); });
        section.append(btn);
      }

      insertBefore ? menu.insertBefore(section, insertBefore) : menu.append(section);
    }

    buildSection();
    window.addEventListener('qps:changed', buildSection);
  }

  function moveSelectedTorrents(destPath) {
    if (!destPath) return;
    const selected = Array.from(document.querySelectorAll('#torrent-list .torrent.selected'));
    if (selected.length === 0) { alert('No torrents selected.'); return; }

    const ids = selected
      .map(el => el.row?.getTorrentId ? el.row.getTorrentId() : parseInt(el.dataset?.id || '0', 10))
      .filter(id => Number.isFinite(id) && id > 0);

    if (ids.length === 0) {
      alert(`Could not read torrent IDs.\nTarget: ${destPath}`);
      return;
    }

    const body    = JSON.stringify({ jsonrpc:'2.0', id:'qp-relocate', method:'torrent-set-location', params:{ ids, location:destPath, move:true } });
    const headers = new Headers({ 'Content-Type':'application/json', 'cache-control':'no-cache', pragma:'no-cache' });
    const sid     = document.cookie.split('; ').find(c => c.startsWith('X-Transmission-Session-Id='));
    if (sid) headers.set('X-Transmission-Session-Id', sid.split('=')[1]);

    function doFetch(retry) {
      fetch('../rpc', { method:'POST', headers, body })
        .then(r => {
          if (r.status === 409 && retry) {
            headers.set('X-Transmission-Session-Id', r.headers.get('X-Transmission-Session-Id') || '');
            doFetch(false);
          }
        })
        .catch(err => console.warn('[QP] RPC error:', err));
    }
    doFetch(true);
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 5 — PATH-LABEL CHIPS ON TORRENT ROWS
     Each torrent whose download_dir matches a saved path gets a
     chip appended to its .torrent-labels div showing that path's
     label.  Chips are visually distinct from Transmission's own
     label pills (purple tint vs blue).
     ════════════════════════════════════════════════════════════════ */

  // Inject or refresh the chip on a single torrent <li> element.
  function injectChip(el) {
    // Remove any previously injected chip so we always start fresh.
    el.querySelector('.qp-path-chip')?.remove();

    // Grab download_dir from the bundle's row object.
    const dir = el.row?.getTorrent?.()?.getDownloadDir?.();
    if (!dir) return;

    const match = QPS.matchDir(dir);
    if (!match) return;

    const labelsDiv = el.querySelector('.torrent-labels');
    if (!labelsDiv) return;

    const chip = document.createElement('span');
    chip.className = 'qp-path-chip';
    chip.textContent = match.name;
    chip.title = match.path;

    // Clicking the chip sets the Show filter to this path label.
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const sel = document.getElementById('qp-filter-path');
      if (sel) {
        sel.value = match.path;
        sel.dispatchEvent(new Event('change'));
      }
    });

    labelsDiv.append(chip);
  }

  // Refresh chips on every visible torrent row.
  function refreshAllChips() {
    for (const el of document.querySelectorAll('#torrent-list .torrent')) {
      // el.row may not be attached yet on the very first mutation tick;
      // the short delay handles that edge case.
      if (el.row) {
        injectChip(el);
      } else {
        setTimeout(() => injectChip(el), 80);
      }
    }
  }

  // Watch the torrent list for added/removed rows.
  function initChipObserver() {
    const list = document.getElementById('torrent-list');
    if (!list) { setTimeout(initChipObserver, 300); return; }

    // Initial pass once the list has some rows.
    refreshAllChips();

    const lo = new MutationObserver(muts => {
      for (const mut of muts) {
        for (const node of mut.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('torrent')) {
            // Brief delay so the bundle has time to attach .row to the element.
            setTimeout(() => injectChip(node), 60);
          }
        }
      }
    });
    lo.observe(list, { childList: true });

    // Also refresh periodically to catch download_dir changes (rare but possible).
    setInterval(refreshAllChips, 8000);

    // Refresh whenever the saved path list changes (labels or paths renamed).
    window.addEventListener('qps:changed', refreshAllChips);
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 6 — "SHOW" PATH-LABEL FILTER DROPDOWN
     A new <select> injected into #mainwin-statusbar right after
     #filter-tracker, matching the style of the existing dropdowns.
     Hides torrent rows whose download_dir doesn't match.
     ════════════════════════════════════════════════════════════════ */

  let currentPathFilter = '';   // the path string currently filtered on ('': show all)

  function applyPathFilter() {
    const sel = document.getElementById('qp-filter-path');
    currentPathFilter = sel ? sel.value : '';

    // Visual cue: highlight the select when a non-default filter is active
    sel?.classList.toggle('qp-active', !!currentPathFilter);

    for (const el of document.querySelectorAll('#torrent-list .torrent')) {
      if (!currentPathFilter) {
        el.classList.remove('qp-path-hidden');
        continue;
      }
      const dir = el.row?.getTorrent?.()?.getDownloadDir?.() || '';
      el.classList.toggle('qp-path-hidden', dir !== currentPathFilter);
    }
  }

  function initPathFilterSelect() {
    const statusbar = document.getElementById('mainwin-statusbar');
    if (!statusbar) { setTimeout(initPathFilterSelect, 300); return; }

    const trackerSel = statusbar.querySelector('#filter-tracker');
    if (!trackerSel) { setTimeout(initPathFilterSelect, 300); return; }

    // Guard against double-injection.
    if (document.getElementById('qp-filter-path')) return;

    // Build the label element matching the adjacent "Tracker:" label pattern.
    const label = document.createElement('label');
    label.className  = 'qp-filter-label';
    label.htmlFor    = 'qp-filter-path';
    label.textContent = 'Show:';

    const sel = document.createElement('select');
    sel.id = 'qp-filter-path';

    function populateFilterSelect() {
      const prev = sel.value;
      while (sel.options.length) sel.remove(0);

      const allOpt = document.createElement('option');
      allOpt.value = ''; allOpt.textContent = 'All paths';
      sel.append(allOpt);

      for (const p of QPS.getAll()) {
        const opt = document.createElement('option');
        opt.value       = p.path;
        opt.textContent = p.name;
        opt.title       = p.path;
        sel.append(opt);
      }

      // Restore previous selection if the path still exists.
      if (prev) {
        for (const opt of sel.options) {
          if (opt.value === prev) { sel.value = prev; break; }
        }
      }
    }

    populateFilterSelect();
    sel.addEventListener('change', applyPathFilter);
    window.addEventListener('qps:changed', () => { populateFilterSelect(); applyPathFilter(); });

    // Insert the label+select immediately after the tracker select.
    trackerSel.after(label, sel);

    // Re-apply the filter each time the torrent list changes (bundle re-renders rows).
    const list = document.getElementById('torrent-list');
    if (list) {
      const fo = new MutationObserver(() => { if (currentPathFilter) applyPathFilter(); });
      fo.observe(list, { childList: true });
    }
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 7 — GLOBAL BODY OBSERVER
     Watches document.body for dynamically created dialogs & menus.
     ════════════════════════════════════════════════════════════════ */

  const bodyObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList?.contains('move-dialog'))    augmentMoveDialog(node);
        if (node.classList?.contains('overflow-menu')) augmentOverflowMenu(node);
      }
    }
  });
  bodyObserver.observe(document.body, { childList: true });


  /* ════════════════════════════════════════════════════════════════
     SECTION 8 — SPEED SPARKLINE & DYNAMIC TITLE
     ════════════════════════════════════════════════════════════════ */

  const POLL_MS    = 2000;
  const MAX_POINTS = 30;
  const dnBuf = new Float32Array(MAX_POINTS);
  const upBuf = new Float32Array(MAX_POINTS);
  let   bufHead = 0;
  let   canvas, ctx;

  function parseKBps(el) {
    if (!el) return 0;
    const txt = el.textContent || '';
    const m   = txt.match(/([\d\u202f\u00a0,. ]+)/);
    if (!m) return 0;
    const raw = m[1].replace(/[\u202f\u00a0 ]/g,'').replace(/,/g,'.');
    const num = parseFloat(raw);
    if (!isFinite(num)) return 0;
    if (/GB/i.test(txt)) return num * 1_000_000;
    if (/MB/i.test(txt)) return num * 1_000;
    return num;
  }

  function initCanvas() {
    const statusbar = document.getElementById('mainwin-statusbar');
    if (!statusbar) return false;
    canvas        = document.createElement('canvas');
    canvas.id     = 'custom-speed-graph';
    canvas.width  = 120;
    canvas.height = 22;
    canvas.title  = 'Transfer speed — last 60 s  (▼ download  ▲ upload)';
    statusbar.insertBefore(canvas, document.getElementById('turtle') || null);
    ctx = canvas.getContext('2d');
    return true;
  }

  function drawGraph() {
    if (!ctx) return;
    const W = 120, H = 22;
    ctx.clearRect(0, 0, W, H);
    let maxVal = 10;
    for (let i = 0; i < MAX_POINTS; i++) {
      if (dnBuf[i] > maxVal) maxVal = dnBuf[i];
      if (upBuf[i] > maxVal) maxVal = upBuf[i];
    }
    const cs = getComputedStyle(document.documentElement);
    paintSeries(dnBuf, maxVal, W, H, cs.getPropertyValue('--blue-100').trim()  || '#51b3f7');
    paintSeries(upBuf, maxVal, W, H, cs.getPropertyValue('--green-100').trim() || '#26aa55');
  }

  function paintSeries(buf, maxVal, W, H, color) {
    const n = MAX_POINTS, PAD = 1;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const idx = (bufHead + i) % n;
      pts.push({ x: (i / (n-1)) * W, y: H - PAD - (buf[idx] / maxVal) * (H - PAD*2) });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle   = color + '30'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color + 'bb'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
  }

  function updateTitle(dnKBps, upKBps) {
    const countEl = document.getElementById('filter-count');
    const parts   = ['Transmission'];
    if (countEl?.textContent.trim()) parts.push(countEl.textContent.trim());
    const sp = [];
    if (dnKBps > 0) sp.push('▼\u202f' + fmtKBps(dnKBps));
    if (upKBps > 0) sp.push('▲\u202f' + fmtKBps(upKBps));
    if (sp.length) parts.push(sp.join('  '));
    document.title = parts.join(' · ');
  }

  function fmtKBps(kbps) {
    if (kbps >= 1_000_000) return (kbps/1_000_000).toFixed(1) + '\u202fGB/s';
    if (kbps >= 1_000)     return (kbps/1_000).toFixed(1)     + '\u202fMB/s';
    return kbps.toFixed(0) + '\u202fkB/s';
  }

  function poll() {
    const dn = parseKBps(document.getElementById('speed-down'));
    const up = parseKBps(document.getElementById('speed-up'));
    dnBuf[bufHead] = dn; upBuf[bufHead] = up;
    bufHead = (bufHead + 1) % MAX_POINTS;
    drawGraph(); updateTitle(dn, up);
  }

  function init() {
    if (!initCanvas()) { setTimeout(init, 400); return; }
    initChipObserver();
    initPathFilterSelect();
    setInterval(poll, POLL_MS);
    poll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
