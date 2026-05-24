/* ==========================================================
   Transmission Web UI — Custom Enhancements  (custom.js)
   Works alongside the unmodified transmission-app.js bundle.

   Features
   ────────
   1. Live download/upload sparkline in the statusbar
   2. Dynamic page title (torrent count + current speeds)
   3. Quick Relocate Paths
      • User-defined named paths stored in localStorage
      • Injected dropdown in the native "Set Torrent Location"
        (move) dialog — pick a path, the text field fills instantly
      • "Manage paths" button opens a full CRUD manager dialog
      • "Quick Relocate" section in the overflow (⋮) menu lets you
        move selected torrents to a saved path in one click
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
      getAll:  ()        => load(),
      add:     (name, path) => { const a = load(); a.push({ id: uid(), name: name.trim(), path: path.trim() }); save(a); },
      update:  (id, name, path) => { const a = load().map(e => e.id === id ? { id, name: name.trim(), path: path.trim() } : e); save(a); },
      remove:  (id)      => { save(load().filter(e => e.id !== id)); },
    };
  })();


  /* ════════════════════════════════════════════════════════════════
     SECTION 2 — PATH MANAGER DIALOG
     Full CRUD: add / inline-edit / delete saved paths.
     ════════════════════════════════════════════════════════════════ */

  function openPathManager() {
    // Remove any existing manager
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
            <div class="qp-header-subtitle">Saved paths appear as a dropdown when relocating torrents</div>
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

    // Delegate clicks inside the list
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
        if (!name || !path) { shake(dlg.querySelector(`[data-form="${id}"]`)); return; }
        QPS.update(id, name, path);
        renderList();
        return;
      }
      if (t.dataset.del) {
        QPS.remove(id);
        renderList();
      }
    });

    // Add new path
    dlg.querySelector('#qp-add-btn').addEventListener('click', () => {
      const nameEl = dlg.querySelector('#qp-new-name');
      const pathEl = dlg.querySelector('#qp-new-path');
      const name = nameEl.value.trim();
      const path = pathEl.value.trim();
      if (!name || !path) {
        shake(!name ? nameEl : pathEl);
        return;
      }
      QPS.add(name, path);
      nameEl.value = '';
      pathEl.value = '';
      renderList();
      nameEl.focus();
    });

    // Enter key in add row
    [dlg.querySelector('#qp-new-name'), dlg.querySelector('#qp-new-path')].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') dlg.querySelector('#qp-add-btn').click(); });
    });

    dlg.querySelector('#qp-close-btn').addEventListener('click', () => { dlg.close(); dlg.remove(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) { dlg.close(); dlg.remove(); } });

    dlg.showModal();
    dlg.querySelector('#qp-new-name').focus();
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
     The bundle creates .move-dialog elements dynamically.
     We watch for them with a MutationObserver and augment them.
     ════════════════════════════════════════════════════════════════ */

  function augmentMoveDialog(dialog) {
    if (dialog.dataset.qpInjected) return;
    dialog.dataset.qpInjected = '1';

    // The text input created by the bundle
    const pathInput = dialog.querySelector('#torrent-path');
    if (!pathInput) return;

    const workarea = dialog.querySelector('.dialog-workarea');
    if (!workarea) return;

    // Build the quick-path row
    const row = document.createElement('div');
    row.className = 'qp-select-row';
    row.innerHTML = `
      <span class="qp-select-label">Quick path:</span>
      <select class="qp-move-select" id="qp-move-select">
        <option value="">— choose a saved path —</option>
      </select>
      <button class="qp-btn qp-btn-sm" id="qp-manage-btn" title="Manage saved paths">Manage…</button>`;

    // Insert ABOVE the existing label+input
    workarea.insertBefore(row, workarea.firstChild);

    const sel = row.querySelector('#qp-move-select');

    function populateSelect() {
      // Keep the placeholder, replace everything else
      while (sel.options.length > 1) sel.remove(1);
      for (const p of QPS.getAll()) {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = `${p.name}  (${p.path})`;
        sel.append(opt);
      }
    }
    populateSelect();

    // When user picks a path, fill the text input immediately
    sel.addEventListener('change', () => {
      if (sel.value) {
        pathInput.value = sel.value;
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
        pathInput.focus();
      }
    });

    // Re-populate if paths change while dialog is open
    window.addEventListener('qps:changed', populateSelect);
    // Clean up listener when dialog is removed
    const mo = new MutationObserver(() => {
      if (!document.body.contains(dialog)) {
        window.removeEventListener('qps:changed', populateSelect);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: false });

    // Manage button → open manager
    row.querySelector('#qp-manage-btn').addEventListener('click', openPathManager);
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 4 — INJECT "QUICK RELOCATE" INTO OVERFLOW MENU
     The overflow menu is also dynamically created; we watch for it.
     ════════════════════════════════════════════════════════════════ */

  function augmentOverflowMenu(menu) {
    if (menu.dataset.qpInjected) return;
    menu.dataset.qpInjected = '1';

    function buildSection() {
      // Remove previous injection if user re-opens menu after path change
      const old = menu.querySelector('.qp-overflow-section');
      if (old) old.remove();

      const paths = QPS.getAll();
      if (paths.length === 0) return;

      // Find the "Actions" fieldset to insert before it
      const sections = menu.querySelectorAll('fieldset.section');
      let insertBefore = null;
      for (const fs of sections) {
        const legend = fs.querySelector('legend');
        if (legend && legend.textContent.trim() === 'Actions') {
          insertBefore = fs;
          break;
        }
      }

      const section = document.createElement('fieldset');
      section.className = 'section qp-overflow-section';
      section.innerHTML = `<legend class="title">Quick Relocate</legend>`;

      for (const p of paths) {
        const btn = document.createElement('button');
        btn.textContent = p.name;
        btn.title = p.path;
        btn.addEventListener('click', () => {
          moveSelectedTorrents(p.path);
          // Close overflow menu: click the overlay button
          const closeBtn = menu.closest('.overflow-menu')?.querySelector('button[data-action]');
          // The app closes it via an outside-click listener; dispatch a click outside
          document.body.click();
        });
        section.append(btn);
      }

      if (insertBefore) {
        menu.insertBefore(section, insertBefore);
      } else {
        menu.append(section);
      }
    }

    buildSection();
    window.addEventListener('qps:changed', buildSection);
  }

  /* Call transmission's own RPC to move selected torrents */
  function moveSelectedTorrents(destPath) {
    if (!destPath) return;

    // Gather selected torrent IDs from the DOM
    const selected = Array.from(
      document.querySelectorAll('#torrent-list .torrent.selected')
    );
    if (selected.length === 0) {
      alert('No torrents selected. Please select one or more torrents first.');
      return;
    }

    // Extract numeric IDs — the bundle stores them as data attributes or
    // we must reach into the row objects. The safest DOM-only way is to
    // find the data-id attribute, which transmission-app sets on <li> elements.
    const ids = selected
      .map(el => {
        // Attempt row object reference (bundle stores `row` on the element)
        if (el.row?.getTorrentId) return el.row.getTorrentId();
        // Fallback: parse from dataset if present
        const raw = el.dataset?.id || el.getAttribute('data-id');
        return raw ? parseInt(raw, 10) : null;
      })
      .filter(id => Number.isFinite(id) && id > 0);

    if (ids.length === 0) {
      // Couldn't get IDs from DOM: show a hint
      alert(`Could not determine torrent IDs. Please use "Set location…" from the right-click menu instead.\n\nTarget path: ${destPath}`);
      return;
    }

    // Issue the RPC directly — mirrors what the bundle's remote.moveTorrents does
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 'qp-relocate',
      method: 'torrent-set-location',
      params: { ids, location: destPath, move: true }
    });

    const headers = new Headers({
      'Content-Type': 'application/json',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
    });

    // Respect whatever session-id the bundle has already negotiated
    const existing = document.cookie
      .split('; ')
      .find(c => c.startsWith('X-Transmission-Session-Id='));
    if (existing) headers.set('X-Transmission-Session-Id', existing.split('=')[1]);

    function doFetch(retry) {
      fetch('../rpc', { method: 'POST', headers, body })
        .then(r => {
          if (r.status === 409 && retry) {
            headers.set('X-Transmission-Session-Id', r.headers.get('X-Transmission-Session-Id') || '');
            doFetch(false);
          }
        })
        .catch(err => console.warn('[QP] relocate RPC error:', err));
    }
    doFetch(true);
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION 5 — GLOBAL MUTATION OBSERVER
     Watches document.body for the dialogs & overflow menu.
     ════════════════════════════════════════════════════════════════ */

  const bodyObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Move dialog
        if (node.classList?.contains('move-dialog')) {
          augmentMoveDialog(node);
        }
        // Overflow menu (div.overflow-menu.popup)
        if (node.classList?.contains('overflow-menu')) {
          augmentOverflowMenu(node);
        }
      }
    }
  });

  bodyObserver.observe(document.body, { childList: true });


  /* ════════════════════════════════════════════════════════════════
     SECTION 6 — SPEED SPARKLINE & DYNAMIC TITLE
     (unchanged from previous version)
     ════════════════════════════════════════════════════════════════ */

  const POLL_MS    = 2000;
  const MAX_POINTS = 30;

  const dnBuf = new Float32Array(MAX_POINTS);
  const upBuf = new Float32Array(MAX_POINTS);
  let   bufHead = 0;

  let canvas, ctx;

  function parseKBps(el) {
    if (!el) return 0;
    const txt = el.textContent || '';
    const m = txt.match(/([\d\u202f\u00a0,. ]+)/);
    if (!m) return 0;
    const raw = m[1].replace(/[\u202f\u00a0 ]/g, '').replace(/,/g, '.');
    const num = parseFloat(raw);
    if (!isFinite(num)) return 0;
    if (/GB/i.test(txt)) return num * 1_000_000;
    if (/MB/i.test(txt)) return num * 1_000;
    return num;
  }

  function initCanvas() {
    const statusbar = document.getElementById('mainwin-statusbar');
    if (!statusbar) return false;
    canvas = document.createElement('canvas');
    canvas.id     = 'custom-speed-graph';
    canvas.width  = 120;
    canvas.height = 22;
    canvas.title  = 'Transfer speed — last 60 s  (▼ download  ▲ upload)';
    const turtle = document.getElementById('turtle');
    statusbar.insertBefore(canvas, turtle || null);
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
      pts.push({ x: (i / (n - 1)) * W, y: H - PAD - (buf[idx] / maxVal) * (H - PAD * 2) });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle   = color + '30';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color + 'bb';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }

  function updateTitle(dnKBps, upKBps) {
    const countEl = document.getElementById('filter-count');
    const count   = countEl ? countEl.textContent.trim() : '';
    const parts   = ['Transmission'];
    if (count) parts.push(count);
    const sp = [];
    if (dnKBps > 0) sp.push('▼\u202f' + fmtKBps(dnKBps));
    if (upKBps > 0) sp.push('▲\u202f' + fmtKBps(upKBps));
    if (sp.length) parts.push(sp.join('  '));
    document.title = parts.join(' · ');
  }

  function fmtKBps(kbps) {
    if (kbps >= 1_000_000) return (kbps / 1_000_000).toFixed(1) + '\u202fGB/s';
    if (kbps >= 1_000)     return (kbps / 1_000).toFixed(1)     + '\u202fMB/s';
    return kbps.toFixed(0) + '\u202fkB/s';
  }

  function poll() {
    const dn = parseKBps(document.getElementById('speed-down'));
    const up = parseKBps(document.getElementById('speed-up'));
    dnBuf[bufHead] = dn;
    upBuf[bufHead] = up;
    bufHead = (bufHead + 1) % MAX_POINTS;
    drawGraph();
    updateTitle(dn, up);
  }

  function init() {
    if (!initCanvas()) { setTimeout(init, 400); return; }
    setInterval(poll, POLL_MS);
    poll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
