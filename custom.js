/* ==========================================================
   Transmission Web UI — Custom Enhancements  (custom.js)
   Works alongside the unmodified transmission-app.js bundle.

   Features
   ────────
   1.  Live download/upload sparkline in the statusbar
   2.  Dynamic page title (torrent count + current speeds)
   3.  Quick Relocate Paths — move-dialog dropdown (label only)
       & Manage CRUD dialog
   4.  Overflow menu "Quick Relocate" one-click section
   5.  Path-label chips auto-injected on each torrent row  (purple)
   6.  "Show" filter dropdown — filter by path label
   7.  Category Types Store — subfolder names appended to a base path
   8.  Move dialog "Type" row — combine quick path + type → full dest
   9.  Overflow menu "Relocate with Type" two-step section
   10. Type chips on torrent rows  (teal)
   11. "Type" filter dropdown in statusbar
   ========================================================== */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     HELPERS
     ───────────────────────────────────────────────────────────── */

  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function shake(el) {
    if (!el) return;
    el.style.transition = 'transform 0.08s ease';
    el.style.transform  = 'translateX(-5px)';
    setTimeout(() => { el.style.transform = 'translateX(5px)'; }, 80);
    setTimeout(() => { el.style.transform = ''; }, 160);
    el.focus?.();
  }

  /** Join base path + subfolder safely, collapsing duplicate slashes. */
  function joinPath(base, sub) {
    if (!sub) return base;
    return base.replace(/\/?$/, '/') + sub.replace(/^\/+/, '');
  }

  /** Extract torrent download_dir from a DOM <li> row element. */
  function getDir(el) {
    return el?.row?.getTorrent?.()?.getDownloadDir?.() || '';
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — QUICK PATH STORE  (full absolute paths)
     ═══════════════════════════════════════════════════════════════ */

  const QPS = (() => {
    const KEY = 'tx_quick_paths_v1';
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
    }
    function save(arr) {
      localStorage.setItem(KEY, JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent('qps:changed', { detail: arr }));
    }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
    return {
      getAll:   ()                => load(),
      add:      (name, path)     => { const a = load(); a.push({ id: uid(), name: name.trim(), path: path.trim() }); save(a); },
      update:   (id, name, path) => { save(load().map(e => e.id===id ? { id, name: name.trim(), path: path.trim() } : e)); },
      remove:   (id)             => { save(load().filter(e => e.id!==id)); },
      matchDir: (dir) => {
        if (!dir) return null;
        const all = load();
        return all.find(p => p.path === dir) ||
               all.find(p => dir.startsWith(p.path.replace(/\/?$/,'/'))) ||
               null;
      },
    };
  })();


  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 — CATEGORY TYPE STORE  (subfolder names only)
     ═══════════════════════════════════════════════════════════════ */

  const CTS = (() => {
    const KEY = 'tx_category_types_v1';
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
    }
    function save(arr) {
      localStorage.setItem(KEY, JSON.stringify(arr));
      window.dispatchEvent(new CustomEvent('cts:changed', { detail: arr }));
    }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
    return {
      getAll:   ()                    => load(),
      add:      (name, subfolder)     => { const a = load(); a.push({ id: uid(), name: name.trim(), subfolder: subfolder.trim().replace(/^\/+|\/+$/g,'') }); save(a); },
      update:   (id, name, subfolder) => { save(load().map(e => e.id===id ? { id, name: name.trim(), subfolder: subfolder.trim().replace(/^\/+|\/+$/g,'') } : e)); },
      remove:   (id)                  => { save(load().filter(e => e.id!==id)); },
      /**
       * Match a download_dir against known types.
       * Looks for an entry whose subfolder appears as the last
       * path segment(s) of dir.
       */
      matchDir: (dir) => {
        if (!dir) return null;
        const all = load();
        const norm = dir.replace(/\/+$/,'');
        return all.find(t => {
          const sub = t.subfolder.replace(/\/+$/,'');
          return norm === sub ||
                 norm.endsWith('/' + sub);
        }) || null;
      },
    };
  })();


  /* ═══════════════════════════════════════════════════════════════
     SECTION 3 — GENERIC CRUD MANAGER DIALOG
     Reused by both Quick Paths and Category Types.
     config = {
       dialogId, title, subtitle,
       storeName,           // 'path' | 'type'
       col1Label,           // 'Label'
       col2Label,           // 'Path' | 'Subfolder'
       col2Placeholder,     // e.g. '/downloads/movies' | 'movies'
       col2Monospace,       // bool
       store,               // QPS or CTS
       col2Key,             // 'path' | 'subfolder'
       eventName,           // 'qps:changed' | 'cts:changed'
     }
     ═══════════════════════════════════════════════════════════════ */

  function openManagerDialog(config) {
    const existing = document.getElementById(config.dialogId);
    if (existing) { existing.close(); existing.remove(); }

    const dlg = document.createElement('dialog');
    dlg.id        = config.dialogId;
    dlg.className = 'qp-manager';
    dlg.innerHTML = `
      <div class="qp-inner">
        <div class="qp-header">
          <div>
            <div class="qp-header-title">${escHtml(config.title)}</div>
            <div class="qp-header-subtitle">${escHtml(config.subtitle)}</div>
          </div>
          <button class="qp-close" id="qp-close-btn">&#x2715;</button>
        </div>
        <div class="qp-manager-col-header">
          <span>${escHtml(config.col1Label)}</span>
          <span>${escHtml(config.col2Label)}</span>
        </div>
        <div class="qp-list" id="qp-item-list"></div>
        <div class="qp-add-form">
          <div class="qp-section-label">Add new ${escHtml(config.storeName)}</div>
          <div class="qp-add-row">
            <input class="qp-input" id="qp-new-name"
              placeholder="Label  e.g. ${config.storeName==='type' ? 'Movies' : 'Archive'}" maxlength="40" />
            <input class="qp-input${config.col2Monospace ? ' qp-path-input' : ''}"
              id="qp-new-col2" placeholder="${escHtml(config.col2Placeholder)}" />
            <button class="qp-btn qp-btn-primary" id="qp-add-btn">Add</button>
          </div>
        </div>
      </div>`;

    document.body.append(dlg);

    function renderList() {
      const list = dlg.querySelector('#qp-item-list');
      const items = config.store.getAll();
      if (items.length === 0) {
        list.innerHTML = `<div class="qp-empty">No ${config.storeName}s yet. Add one below.</div>`;
        return;
      }
      list.innerHTML = '';
      for (const entry of items) {
        const col2val = entry[config.col2Key];
        const row = document.createElement('div');
        row.className  = 'qp-path-row';
        row.dataset.id = entry.id;
        row.innerHTML  = `
          <div class="qp-row-display" data-view="${entry.id}">
            <span class="qp-row-name"  title="${escHtml(entry.name)}">${escHtml(entry.name)}</span>
            <span class="qp-row-path${config.col2Monospace ? ' qp-mono' : ''}"
                  title="${escHtml(col2val)}">${escHtml(col2val)}</span>
            <button class="qp-btn qp-btn-sm" data-edit="${entry.id}">Edit</button>
            <button class="qp-btn qp-btn-sm qp-btn-danger" data-del="${entry.id}">Delete</button>
          </div>
          <div class="qp-row-edit qp-hidden" data-form="${entry.id}">
            <input class="qp-input" value="${escHtml(entry.name)}"
              maxlength="40" data-edit-name="${entry.id}" />
            <input class="qp-input${config.col2Monospace ? ' qp-path-input' : ''}"
              value="${escHtml(col2val)}" data-edit-col2="${entry.id}" />
            <button class="qp-btn qp-btn-primary qp-btn-sm" data-save="${entry.id}">Save</button>
            <button class="qp-btn qp-btn-sm" data-cancel="${entry.id}">Cancel</button>
          </div>`;
        list.append(row);
      }
    }

    renderList();
    window.addEventListener(config.eventName, renderList);

    dlg.querySelector('#qp-item-list').addEventListener('click', e => {
      const t  = e.target;
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
        const nameEl = dlg.querySelector(`[data-edit-name="${id}"]`);
        const col2El = dlg.querySelector(`[data-edit-col2="${id}"]`);
        const name   = nameEl.value.trim();
        const col2   = col2El.value.trim();
        if (!name || !col2) { shake(!name ? nameEl : col2El); return; }
        config.store.update(id, name, col2);
        return;   // renderList called via eventName listener
      }
      if (t.dataset.del) { config.store.remove(id); }
    });

    const nameEl = dlg.querySelector('#qp-new-name');
    const col2El = dlg.querySelector('#qp-new-col2');
    dlg.querySelector('#qp-add-btn').addEventListener('click', () => {
      const name = nameEl.value.trim(), col2 = col2El.value.trim();
      if (!name || !col2) { shake(!name ? nameEl : col2El); return; }
      config.store.add(name, col2);
      nameEl.value = ''; col2El.value = '';
      nameEl.focus();
    });
    [nameEl, col2El].forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') dlg.querySelector('#qp-add-btn').click(); });
    });

    const cleanup = () => { window.removeEventListener(config.eventName, renderList); };
    dlg.querySelector('#qp-close-btn').addEventListener('click', () => { cleanup(); dlg.close(); dlg.remove(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) { cleanup(); dlg.close(); dlg.remove(); } });
    dlg.showModal();
    nameEl.focus();
  }

  const openPathManager = () => openManagerDialog({
    dialogId:        'qp-manager-dialog',
    title:           'Quick Relocate Paths',
    subtitle:        'Full absolute paths. Appear as labels in the relocate dropdown, row chips, and Show filter.',
    storeName:       'path',
    col1Label:       'Label',
    col2Label:       'Full path',
    col2Placeholder: '/downloads/archive',
    col2Monospace:   true,
    store:           QPS,
    col2Key:         'path',
    eventName:       'qps:changed',
  });

  const openTypeManager = () => openManagerDialog({
    dialogId:        'ct-manager-dialog',
    title:           'Category Types',
    subtitle:        'Subfolder names appended to the selected quick path when relocating.',
    storeName:       'type',
    col1Label:       'Label',
    col2Label:       'Subfolder',
    col2Placeholder: 'movies',
    col2Monospace:   true,
    store:           CTS,
    col2Key:         'subfolder',
    eventName:       'cts:changed',
  });


  /* ═══════════════════════════════════════════════════════════════
     SECTION 4 — INJECT ROWS INTO MOVE DIALOG
     Row A: Quick Path  (label → fills full path)
     Row B: Type        (subfolder → appended to Row A's value)
     Final path = quickPath + '/' + typeSubfolder
     If no quick path chosen: uses torrent's current download_dir.
     ═══════════════════════════════════════════════════════════════ */

  function augmentMoveDialog(dialog) {
    if (dialog.dataset.qpInjected) return;
    dialog.dataset.qpInjected = '1';

    const pathInput = dialog.querySelector('#torrent-path');
    const workarea  = dialog.querySelector('.dialog-workarea');
    if (!pathInput || !workarea) return;

    /* ── Row A: Quick Path ──────────────────────────────────────── */
    const rowA = document.createElement('div');
    rowA.className = 'qp-select-row';
    rowA.innerHTML = `
      <span class="qp-select-label">Quick path:</span>
      <select class="qp-move-select" id="qp-move-select">
        <option value="">— choose a saved path —</option>
      </select>
      <button class="qp-btn qp-btn-sm" id="qp-manage-btn">Manage…</button>`;

    /* ── Row B: Category Type ───────────────────────────────────── */
    const rowB = document.createElement('div');
    rowB.className = 'qp-select-row qp-type-row';
    rowB.innerHTML = `
      <span class="qp-select-label">Type:</span>
      <select class="qp-move-select" id="qp-type-select">
        <option value="">— none —</option>
      </select>
      <span class="qp-type-preview" id="qp-type-preview"></span>
      <button class="qp-btn qp-btn-sm" id="qp-type-manage-btn">Manage…</button>`;

    workarea.insertBefore(rowA, workarea.firstChild);
    rowA.after(rowB);

    const selA    = rowA.querySelector('#qp-move-select');
    const selB    = rowB.querySelector('#qp-type-select');
    const preview = rowB.querySelector('#qp-type-preview');

    /* helpers */
    function getBasePath() {
      // Prefer what's currently in the quick-path select; fall back to
      // whatever is already in the path input (the torrent's current dir).
      return selA.value || pathInput.value.trim() || '';
    }

    function updatePathInput() {
      const base = getBasePath();
      const sub  = selB.value;
      const full = sub ? joinPath(base, sub) : base;
      if (full) {
        pathInput.value = full;
        pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      preview.textContent = sub && base ? '→ ' + full : '';
    }

    function populatePathSelect() {
      const prev = selA.value;
      while (selA.options.length > 1) selA.remove(1);
      for (const p of QPS.getAll()) {
        const opt = document.createElement('option');
        opt.value = p.path; opt.textContent = p.name; opt.title = p.path;
        selA.append(opt);
      }
      if (prev) for (const o of selA.options) { if (o.value===prev) { selA.value=prev; break; } }
    }

    function populateTypeSelect() {
      const prev = selB.value;
      while (selB.options.length > 1) selB.remove(1);
      for (const t of CTS.getAll()) {
        const opt = document.createElement('option');
        opt.value = t.subfolder; opt.textContent = t.name; opt.title = t.subfolder;
        selB.append(opt);
      }
      if (prev) for (const o of selB.options) { if (o.value===prev) { selB.value=prev; break; } }
      updatePathInput();
    }

    // Pre-select matching quick path from current input
    function preselectCurrent() {
      const cur = pathInput.value.trim();
      if (!cur) return;
      for (const o of selA.options) { if (o.value===cur) { selA.value=cur; return; } }
    }

    populatePathSelect();
    populateTypeSelect();
    preselectCurrent();

    selA.addEventListener('change', updatePathInput);
    selB.addEventListener('change', updatePathInput);

    window.addEventListener('qps:changed', () => { populatePathSelect(); updatePathInput(); });
    window.addEventListener('cts:changed', populateTypeSelect);

    const mo = new MutationObserver(() => {
      if (!document.body.contains(dialog)) {
        window.removeEventListener('qps:changed', populatePathSelect);
        window.removeEventListener('cts:changed', populateTypeSelect);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true });

    rowA.querySelector('#qp-manage-btn').addEventListener('click', openPathManager);
    rowB.querySelector('#qp-type-manage-btn').addEventListener('click', openTypeManager);
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 5 — OVERFLOW MENU
     "Quick Relocate" — path only  (same as before)
     "Relocate with Type" — 2-level: first pick path, then type
     ═══════════════════════════════════════════════════════════════ */

  function augmentOverflowMenu(menu) {
    if (menu.dataset.qpInjected) return;
    menu.dataset.qpInjected = '1';

    function findInsertPoint() {
      for (const fs of menu.querySelectorAll('fieldset.section')) {
        if (fs.querySelector('legend')?.textContent.trim() === 'Actions') return fs;
      }
      return null;
    }

    function buildSections() {
      menu.querySelector('.qp-overflow-section')?.remove();
      menu.querySelector('.qp-overflow-type-section')?.remove();

      const paths = QPS.getAll();
      const types = CTS.getAll();
      const ins   = findInsertPoint();

      /* ── Quick Relocate section ────────────────────────────────── */
      if (paths.length > 0) {
        const sec = document.createElement('fieldset');
        sec.className = 'section qp-overflow-section';
        sec.innerHTML = `<legend class="title">Quick Relocate</legend>`;
        for (const p of paths) {
          const btn = document.createElement('button');
          btn.textContent = p.name; btn.title = p.path;
          btn.addEventListener('click', () => { moveSelectedTorrents(p.path); document.body.click(); });
          sec.append(btn);
        }
        ins ? menu.insertBefore(sec, ins) : menu.append(sec);
      }

      /* ── Relocate with Type section ────────────────────────────── */
      if (paths.length > 0 && types.length > 0) {
        const sec2 = document.createElement('fieldset');
        sec2.className = 'section qp-overflow-type-section';
        sec2.innerHTML = `<legend class="title">Relocate with Type</legend>`;

        // Two-step inline sub-menu:
        // Step 1: pick path → renders type buttons
        const step1 = document.createElement('div');
        step1.className = 'qp-overflow-step';
        step1.innerHTML = `<span class="qp-step-hint">Pick path:</span>`;

        const step2 = document.createElement('div');
        step2.className = 'qp-overflow-step qp-hidden';
        step2.innerHTML = `<span class="qp-step-hint">Pick type:</span>`;

        let chosenPath = null;

        for (const p of paths) {
          const btn = document.createElement('button');
          btn.textContent = p.name; btn.title = p.path;
          btn.addEventListener('click', () => {
            chosenPath = p;
            // Highlight selected path
            step1.querySelectorAll('button').forEach(b => b.classList.remove('qp-selected'));
            btn.classList.add('qp-selected');
            // Build type buttons
            step2.querySelectorAll('button').forEach(b => b.remove());
            for (const t of CTS.getAll()) {
              const dest = joinPath(p.path, t.subfolder);
              const tb = document.createElement('button');
              tb.textContent = t.name; tb.title = dest;
              tb.addEventListener('click', () => {
                moveSelectedTorrents(dest);
                document.body.click();
              });
              step2.append(tb);
            }
            // Back button
            const backBtn = document.createElement('button');
            backBtn.className = 'qp-back-btn';
            backBtn.textContent = '← back';
            backBtn.addEventListener('click', () => {
              step2.classList.add('qp-hidden');
              step1.classList.remove('qp-hidden');
              step1.querySelectorAll('button').forEach(b => b.classList.remove('qp-selected'));
            });
            step2.prepend(backBtn);
            step1.classList.add('qp-hidden');
            step2.classList.remove('qp-hidden');
          });
          step1.append(btn);
        }

        sec2.append(step1, step2);
        ins ? menu.insertBefore(sec2, ins) : menu.append(sec2);
      }
    }

    buildSections();
    window.addEventListener('qps:changed', buildSections);
    window.addEventListener('cts:changed', buildSections);
  }

  function moveSelectedTorrents(destPath) {
    if (!destPath) return;
    const selected = Array.from(document.querySelectorAll('#torrent-list .torrent.selected'));
    if (selected.length === 0) { alert('No torrents selected.'); return; }
    const ids = selected
      .map(el => el.row?.getTorrentId ? el.row.getTorrentId() : parseInt(el.dataset?.id||'0',10))
      .filter(id => Number.isFinite(id) && id > 0);
    if (ids.length === 0) { alert(`Could not read torrent IDs.\nTarget: ${destPath}`); return; }

    const body    = JSON.stringify({ jsonrpc:'2.0', id:'qp-relocate', method:'torrent-set-location', params:{ ids, location:destPath, move:true } });
    const headers = new Headers({ 'Content-Type':'application/json', 'cache-control':'no-cache', pragma:'no-cache' });
    const sid     = document.cookie.split('; ').find(c => c.startsWith('X-Transmission-Session-Id='));
    if (sid) headers.set('X-Transmission-Session-Id', sid.split('=')[1]);

    function doFetch(retry) {
      fetch('../rpc', { method:'POST', headers, body })
        .then(r => {
          if (r.status===409 && retry) {
            headers.set('X-Transmission-Session-Id', r.headers.get('X-Transmission-Session-Id')||'');
            doFetch(false);
          }
        })
        .catch(err => console.warn('[QP] RPC error:', err));
    }
    doFetch(true);
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 6 — CHIPS ON TORRENT ROWS
     Purple chip: matched quick path label
     Teal chip:   matched category type label (subfolder)
     Clicking either chip activates the corresponding filter.
     ═══════════════════════════════════════════════════════════════ */

  function injectChips(el) {
    el.querySelector('.qp-path-chip')?.remove();
    el.querySelector('.qp-type-chip')?.remove();

    const dir = getDir(el);
    if (!dir) return;

    const labelsDiv = el.querySelector('.torrent-labels');
    if (!labelsDiv) return;

    // ── Path chip (purple) ─────────────────────────────────────
    const pathMatch = QPS.matchDir(dir);
    if (pathMatch) {
      const chip = document.createElement('span');
      chip.className   = 'qp-path-chip';
      chip.textContent = pathMatch.name;
      chip.title       = pathMatch.path;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const sel = document.getElementById('qp-filter-path');
        if (sel) { sel.value = pathMatch.path; sel.dispatchEvent(new Event('change')); }
      });
      labelsDiv.append(chip);
    }

    // ── Type chip (teal) ───────────────────────────────────────
    const typeMatch = CTS.matchDir(dir);
    if (typeMatch) {
      const chip = document.createElement('span');
      chip.className   = 'qp-type-chip';
      chip.textContent = typeMatch.name;
      chip.title       = typeMatch.subfolder;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        const sel = document.getElementById('qp-filter-type');
        if (sel) { sel.value = typeMatch.subfolder; sel.dispatchEvent(new Event('change')); }
      });
      labelsDiv.append(chip);
    }
  }

  function refreshAllChips() {
    for (const el of document.querySelectorAll('#torrent-list .torrent')) {
      if (el.row) injectChips(el);
      else setTimeout(() => injectChips(el), 80);
    }
  }

  function initChipObserver() {
    const list = document.getElementById('torrent-list');
    if (!list) { setTimeout(initChipObserver, 300); return; }
    refreshAllChips();
    new MutationObserver(muts => {
      for (const mut of muts)
        for (const node of mut.addedNodes)
          if (node instanceof HTMLElement && node.classList.contains('torrent'))
            setTimeout(() => injectChips(node), 60);
    }).observe(list, { childList: true });
    setInterval(refreshAllChips, 8000);
    window.addEventListener('qps:changed', refreshAllChips);
    window.addEventListener('cts:changed', refreshAllChips);
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 7 — FILTER DROPDOWNS IN STATUSBAR
     "Show:"  — filter by quick path   (purple tint when active)
     "Type:"  — filter by category type (teal tint when active)
     Both injected after #filter-tracker.
     Combined: a torrent must match BOTH active filters to show.
     ═══════════════════════════════════════════════════════════════ */

  let currentPathFilter = '';
  let currentTypeFilter = '';  // value = subfolder string

  function applyFilters() {
    const pathSel = document.getElementById('qp-filter-path');
    const typeSel = document.getElementById('qp-filter-type');
    currentPathFilter = pathSel?.value || '';
    currentTypeFilter = typeSel?.value || '';

    pathSel?.classList.toggle('qp-active', !!currentPathFilter);
    typeSel?.classList.toggle('qp-active-teal', !!currentTypeFilter);

    for (const el of document.querySelectorAll('#torrent-list .torrent')) {
      const dir = getDir(el);
      let hide  = false;

      if (currentPathFilter && dir !== currentPathFilter) hide = true;

      if (!hide && currentTypeFilter) {
        // The torrent's dir must end with the type subfolder
        const norm = dir.replace(/\/+$/,'');
        const sub  = currentTypeFilter.replace(/\/+$/,'');
        if (!(norm === sub || norm.endsWith('/'+sub))) hide = true;
      }

      el.classList.toggle('qp-path-hidden', hide);
    }
  }

  function initFilterSelects() {
    const statusbar  = document.getElementById('mainwin-statusbar');
    if (!statusbar) { setTimeout(initFilterSelects, 300); return; }
    const trackerSel = statusbar.querySelector('#filter-tracker');
    if (!trackerSel) { setTimeout(initFilterSelects, 300); return; }
    if (document.getElementById('qp-filter-path')) return;

    /* ── Show (path) filter ──────────────────────────────────── */
    const lblPath = document.createElement('label');
    lblPath.className = 'qp-filter-label'; lblPath.htmlFor = 'qp-filter-path';
    lblPath.textContent = 'Show:';

    const selPath = document.createElement('select');
    selPath.id = 'qp-filter-path';

    function populatePath() {
      const prev = selPath.value;
      while (selPath.options.length) selPath.remove(0);
      selPath.append(Object.assign(document.createElement('option'), { value:'', textContent:'All paths' }));
      for (const p of QPS.getAll()) {
        selPath.append(Object.assign(document.createElement('option'), { value:p.path, textContent:p.name, title:p.path }));
      }
      if (prev) for (const o of selPath.options) { if (o.value===prev) { selPath.value=prev; break; } }
    }

    /* ── Type filter ─────────────────────────────────────────── */
    const lblType = document.createElement('label');
    lblType.className = 'qp-filter-label'; lblType.htmlFor = 'qp-filter-type';
    lblType.textContent = 'Type:';

    const selType = document.createElement('select');
    selType.id = 'qp-filter-type';

    function populateType() {
      const prev = selType.value;
      while (selType.options.length) selType.remove(0);
      selType.append(Object.assign(document.createElement('option'), { value:'', textContent:'All types' }));
      for (const t of CTS.getAll()) {
        selType.append(Object.assign(document.createElement('option'), { value:t.subfolder, textContent:t.name, title:t.subfolder }));
      }
      if (prev) for (const o of selType.options) { if (o.value===prev) { selType.value=prev; break; } }
    }

    populatePath(); populateType();
    selPath.addEventListener('change', applyFilters);
    selType.addEventListener('change', applyFilters);
    window.addEventListener('qps:changed', () => { populatePath(); applyFilters(); });
    window.addEventListener('cts:changed', () => { populateType(); applyFilters(); });

    trackerSel.after(lblPath, selPath, lblType, selType);

    const list = document.getElementById('torrent-list');
    if (list) {
      new MutationObserver(() => { if (currentPathFilter || currentTypeFilter) applyFilters(); })
        .observe(list, { childList: true });
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 8 — GLOBAL BODY OBSERVER
     ═══════════════════════════════════════════════════════════════ */

  new MutationObserver(muts => {
    for (const { addedNodes } of muts)
      for (const node of addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList?.contains('move-dialog'))   augmentMoveDialog(node);
        if (node.classList?.contains('overflow-menu')) augmentOverflowMenu(node);
      }
  }).observe(document.body, { childList: true });


  /* ═══════════════════════════════════════════════════════════════
     SECTION 9 — SPEED SPARKLINE & DYNAMIC TITLE
     ═══════════════════════════════════════════════════════════════ */

  const POLL_MS = 2000, MAX_POINTS = 30;
  const dnBuf = new Float32Array(MAX_POINTS), upBuf = new Float32Array(MAX_POINTS);
  let bufHead = 0, canvas, ctx;

  function parseKBps(el) {
    if (!el) return 0;
    const txt = el.textContent || '';
    const m   = txt.match(/([\d\u202f\u00a0,. ]+)/);
    if (!m) return 0;
    const num = parseFloat(m[1].replace(/[\u202f\u00a0 ]/g,'').replace(/,/g,'.'));
    if (!isFinite(num)) return 0;
    if (/GB/i.test(txt)) return num*1_000_000;
    if (/MB/i.test(txt)) return num*1_000;
    return num;
  }

  function initCanvas() {
    const sb = document.getElementById('mainwin-statusbar');
    if (!sb) return false;
    canvas = Object.assign(document.createElement('canvas'), { id:'custom-speed-graph', width:120, height:22 });
    canvas.title = 'Transfer speed — last 60 s  (▼ download  ▲ upload)';
    sb.insertBefore(canvas, document.getElementById('turtle') || null);
    ctx = canvas.getContext('2d');
    return true;
  }

  function drawGraph() {
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 22);
    let maxVal = 10;
    for (let i=0; i<MAX_POINTS; i++) { if(dnBuf[i]>maxVal)maxVal=dnBuf[i]; if(upBuf[i]>maxVal)maxVal=upBuf[i]; }
    const cs = getComputedStyle(document.documentElement);
    paintSeries(dnBuf, maxVal, cs.getPropertyValue('--blue-100').trim()  || '#51b3f7');
    paintSeries(upBuf, maxVal, cs.getPropertyValue('--green-100').trim() || '#26aa55');
  }

  function paintSeries(buf, maxVal, color) {
    const W=120, H=22, n=MAX_POINTS, PAD=1;
    const pts = Array.from({length:n}, (_,i) => {
      const idx=(bufHead+i)%n;
      return { x:(i/(n-1))*W, y:H-PAD-(buf[idx]/maxVal)*(H-PAD*2) };
    });
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
    ctx.fillStyle=color+'30'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.strokeStyle=color+'bb'; ctx.lineWidth=1.5; ctx.lineJoin='round'; ctx.stroke();
  }

  function fmtKBps(k) {
    if(k>=1_000_000)return(k/1_000_000).toFixed(1)+'\u202fGB/s';
    if(k>=1_000)    return(k/1_000).toFixed(1)+'\u202fMB/s';
    return k.toFixed(0)+'\u202fkB/s';
  }

  function poll() {
    const dn=parseKBps(document.getElementById('speed-down'));
    const up=parseKBps(document.getElementById('speed-up'));
    dnBuf[bufHead]=dn; upBuf[bufHead]=up; bufHead=(bufHead+1)%MAX_POINTS;
    drawGraph();
    const c=document.getElementById('filter-count');
    const parts=['Transmission'];
    if(c?.textContent.trim())parts.push(c.textContent.trim());
    const sp=[];
    if(dn>0)sp.push('▼\u202f'+fmtKBps(dn));
    if(up>0)sp.push('▲\u202f'+fmtKBps(up));
    if(sp.length)parts.push(sp.join('  '));
    document.title=parts.join(' · ');
  }

  function init() {
    if (!initCanvas()) { setTimeout(init, 400); return; }
    initChipObserver();
    initFilterSelects();
    setInterval(poll, POLL_MS);
    poll();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
