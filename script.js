/* StartPage Browser - script.js
   - LSK (delivered as Escape on Cloud Phone) is context-sensitive:
       Home: Menu | Menu: Select | Favorites/History: Options | Add: Save
   - RSK = Back (left untouched on Home so the platform can close the app)
   - Favorites/History are D-pad lists; Options/confirm use a custom sheet
     (native alert/confirm are not available on Cloud Phone)
   - Real History API (pushState/popstate) for screens and the sheet
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const screens = {
    home: $('screen-home'),
    menu: $('screen-menu'),
    favorites: $('screen-favorites'),
    addfav: $('screen-addfav'),
    history: $('screen-history'),
    settings: $('screen-settings'),
    help: $('screen-help')
  };

  const btnLsk = $('btn-lsk');
  const btnRsk = $('btn-rsk');
  const btnGo = $('btn-go');
  const searchInput = $('search-input');
  const favoritesList = $('favorites-list');
  const historyList = $('history-list');
  const addFavForm = $('add-favorite-form');
  const favTitleInput = $('fav-title');
  const favUrlInput = $('fav-url');
  const btnSaveFav = $('btn-save-fav');
  const searchEngineSelect = $('search-engine');
  const themeToggle = $('theme-toggle');
  const btnOpenHelp = $('btn-open-help');
  const statusEl = $('status');
  const datetimeEl = $('datetime');
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));
  const sheetEl = $('sheet');
  const sheetTitle = $('sheet-title');
  const sheetList = $('sheet-list');

  const KEY_FAV = 'startpage_favorites_v1';
  const KEY_HIST = 'startpage_history_v1';
  const KEY_SETTINGS = 'startpage_settings_v1';

  const LIST_SCREENS = ['menu', 'favorites', 'history'];
  // LSK arrives as Escape on Cloud Phone; others kept for emulators/devices.
  const LSK_KEYS = ['Escape', 'SoftLeft', 'MenuKey', 'F1'];
  const RSK_KEYS = ['SoftRight', 'F2', 'Backspace'];

  let favorites = [];
  let historyEntries = [];
  let settings = { searchEngine: 'https://www.bing.com/search?q=', theme: 'day' };
  let nextFocus = 0; // row to focus the next time a list screen is entered

  const navStack = [];
  let usingHistoryApi = !!(window.history && window.history.pushState);

  /* ---------- Icons (static strings only) ---------- */
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="21" y2="21"/></svg>';
  const ICON_GLOBE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  /* ---------- Persistence ---------- */
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function loadAll() {
    try { const f = JSON.parse(localStorage.getItem(KEY_FAV) || '[]'); if (Array.isArray(f)) favorites = f; } catch (e) { favorites = []; }
    try { const h = JSON.parse(localStorage.getItem(KEY_HIST) || '[]'); if (Array.isArray(h)) historyEntries = h; } catch (e) { historyEntries = []; }
    try { const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}'); if (s && typeof s === 'object') settings = Object.assign(settings, s); } catch (e) {}
  }
  const saveFavorites = () => save(KEY_FAV, favorites);
  const saveHistory = () => save(KEY_HIST, historyEntries);
  const saveSettings = () => save(KEY_SETTINGS, settings);

  /* ---------- Helpers ---------- */
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; }
  }

  function hueOf(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function normalizeUrl(u) {
    try { return new URL(u).href; } catch (e) {
      try { return new URL('https://' + u).href; } catch (e2) { return u; }
    }
  }

  function isSearchEntry(h) {
    if (h.kind) return h.kind === 'search';
    return Array.from(searchEngineSelect.options).some((o) => h.url.indexOf(o.value) === 0);
  }

  function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function groupLabel(ts) {
    const today = startOfDay(Date.now());
    const day = startOfDay(ts);
    if (day >= today) return 'Today';
    if (day >= today - 86400000) return 'Yesterday';
    return 'Earlier';
  }

  function timeAgo(ts) {
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return 'now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    if (d < 7) return d + 'd';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  let statusTimer = null;
  function setStatus(text) {
    statusEl.textContent = text || '';
    if (statusTimer) clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 2500);
  }

  function isTextField(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  }

  /* ---------- Softkey labels ---------- */
  function updateSoftkeys() {
    const name = currentScreenName();
    let l = 'Menu';
    let r = 'Back';
    if (sheet.open) { l = 'Select'; r = 'Cancel'; }
    else {
      switch (name) {
        case 'home': r = 'Exit'; break;
        case 'menu': l = 'Select'; break;
        case 'favorites': l = 'Options'; break;
        case 'history': l = historyEntries.length ? 'Options' : ''; break;
        case 'addfav': l = 'Save'; break;
      }
    }
    btnLsk.textContent = l;
    btnRsk.textContent = r;
    btnLsk.setAttribute('aria-label', (l || 'No action') + ' (Left softkey)');
    btnRsk.setAttribute('aria-label', r + ' (Right softkey)');
  }

  /* ---------- Row building ---------- */
  function makeRow(opts) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'row' + (opts.cls ? ' ' + opts.cls : '');

    const badge = document.createElement('span');
    badge.className = 'badge';
    if (opts.badgeHtml) badge.innerHTML = opts.badgeHtml; // static icon strings only
    else badge.textContent = opts.badgeText || '?';
    if (opts.hue !== undefined) badge.style.background = 'hsl(' + opts.hue + ',55%,42%)';

    const text = document.createElement('span');
    text.className = 'row-text';
    const t = document.createElement('span');
    t.className = 'row-title';
    t.textContent = opts.title;
    text.appendChild(t);
    if (opts.sub) {
      const s = document.createElement('span');
      s.className = 'row-sub';
      s.textContent = opts.sub;
      text.appendChild(s);
    }

    btn.appendChild(badge);
    btn.appendChild(text);
    if (opts.meta) {
      const m = document.createElement('span');
      m.className = 'row-meta';
      m.textContent = opts.meta;
      btn.appendChild(m);
    }

    btn._type = opts.type || '';
    btn._item = opts.item || null;
    btn.addEventListener('click', opts.onActivate);
    li.appendChild(btn);
    return li;
  }

  function rowsOf(name) { return Array.from(screens[name].querySelectorAll('.row')); }

  function focusedIndex(name) { return rowsOf(name).indexOf(document.activeElement); }

  function focusRow(name, idx) {
    const rows = rowsOf(name);
    if (!rows.length) return;
    idx = Math.max(0, Math.min(idx, rows.length - 1));
    const r = rows[idx];
    try { r.focus({ preventScroll: true }); } catch (e) { r.focus(); }
    if (idx === 0) screens[name].scrollTop = 0;
    else if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
  }

  function moveFocus(name, dir) {
    const rows = rowsOf(name);
    if (!rows.length) return;
    const cur = rows.indexOf(document.activeElement);
    const next = cur < 0 ? 0 : (cur + dir + rows.length) % rows.length;
    focusRow(name, next);
  }

  /* ---------- Favorites ---------- */
  function renderFavorites() {
    favoritesList.innerHTML = '';
    favoritesList.appendChild(makeRow({
      cls: 'add',
      type: 'add',
      badgeHtml: ICON_PLUS,
      title: 'Add favorite',
      sub: 'Save a website',
      onActivate: () => showScreen('addfav')
    }));

    favorites.slice().reverse().forEach((f) => {
      const title = f.title || hostOf(f.url);
      favoritesList.appendChild(makeRow({
        type: 'fav',
        item: f,
        badgeText: title.charAt(0).toUpperCase(),
        hue: hueOf(title),
        title: title,
        sub: hostOf(f.url),
        onActivate: () => openLink(title, f.url, 'link')
      }));
    });

    if (!favorites.length) {
      const li = document.createElement('li');
      li.className = 'note';
      li.textContent = 'No favorites yet';
      favoritesList.appendChild(li);
    }
  }

  function deleteFavorite(f) {
    const idx = focusedIndex('favorites');
    const i = favorites.indexOf(f);
    if (i > -1) {
      favorites.splice(i, 1);
      saveFavorites();
      renderFavorites();
      focusRow('favorites', idx);
      setStatus('Favorite deleted');
    }
  }

  function openFavoritesOptions() {
    const el = document.activeElement;
    if (el && el._type === 'add') { showScreen('addfav'); return; } // nothing to choose from
    const f = el && el._type === 'fav' ? el._item : null;
    const items = [];
    if (f) items.push({ label: 'Open', fn: () => openLink(f.title || hostOf(f.url), f.url, 'link') });
    items.push({ label: 'Add new', fn: () => showScreen('addfav') });
    if (f) items.push({ label: 'Delete', danger: true, fn: () => deleteFavorite(f) });
    openSheet(f ? (f.title || hostOf(f.url)) : 'Favorites', items);
  }

  function saveFavoriteInline() {
    const title = favTitleInput.value.trim();
    const url = favUrlInput.value.trim();
    if (!title || !url) { setStatus('Title and address needed'); return; }
    const normalized = normalizeUrl(url);
    if (favorites.some((f) => f.url === normalized)) { setStatus('Already in favorites'); return; }
    favorites.push({ title, url: normalized });
    saveFavorites();
    favTitleInput.value = '';
    favUrlInput.value = '';
    nextFocus = 1; // newest favorite sits right under "Add favorite"
    setStatus('Favorite saved');
    goBack();
  }

  /* ---------- History ---------- */
  function addHistory(title, url, kind) {
    historyEntries = historyEntries.filter((x) => x.url !== url); // no duplicates; newest on top
    historyEntries.push({ title: title || url, url, kind: kind || 'link', time: Date.now() });
    if (historyEntries.length > 500) historyEntries.shift();
    saveHistory();
    if (currentScreenName() === 'history') { renderHistory(); focusRow('history', 0); }
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (!historyEntries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.innerHTML = ICON_CLOCK; // static icon string
      const msg = document.createElement('div');
      msg.textContent = 'No history yet';
      const small = document.createElement('small');
      small.textContent = 'Searches and sites you open show up here';
      li.appendChild(msg);
      li.appendChild(small);
      historyList.appendChild(li);
      return;
    }

    let lastGroup = '';
    historyEntries.slice().reverse().forEach((h) => {
      const g = groupLabel(h.time);
      if (g !== lastGroup) {
        const head = document.createElement('li');
        head.className = 'group';
        head.textContent = g;
        historyList.appendChild(head);
        lastGroup = g;
      }
      const search = isSearchEntry(h);
      const title = h.title || h.url;
      historyList.appendChild(makeRow({
        type: 'hist',
        item: h,
        badgeHtml: search ? ICON_SEARCH : ICON_GLOBE,
        hue: hueOf(hostOf(h.url)),
        title: title,
        sub: hostOf(h.url),
        meta: timeAgo(h.time),
        onActivate: () => openLink(title, h.url, search ? 'search' : 'link')
      }));
    });
  }

  function deleteHistoryItem(h) {
    const idx = focusedIndex('history');
    const i = historyEntries.indexOf(h);
    if (i > -1) {
      historyEntries.splice(i, 1);
      saveHistory();
      renderHistory();
      focusRow('history', Math.max(0, idx - 1));
      updateSoftkeys();
      setStatus('Removed');
    }
  }

  function clearHistory() {
    historyEntries = [];
    saveHistory();
    renderHistory();
    updateSoftkeys();
    setStatus('History cleared');
  }

  function openHistoryOptions() {
    if (!historyEntries.length) return;
    const el = document.activeElement;
    const h = el && el._type === 'hist' ? el._item : null;
    const items = [];
    if (h) {
      const search = isSearchEntry(h);
      items.push({ label: 'Open', fn: () => openLink(h.title || h.url, h.url, search ? 'search' : 'link') });
      items.push({ label: 'Delete', danger: true, fn: () => deleteHistoryItem(h) });
    }
    items.push({
      label: 'Clear all',
      danger: true,
      fn: () => openSheet('Clear all history?', [
        { label: 'Yes, clear', danger: true, fn: clearHistory },
        { label: 'No', fn: null }
      ])
    });
    openSheet(h ? (h.title || h.url) : 'History', items);
  }

  /* ---------- Opening links / searching ---------- */
  function openLink(title, url, kind) {
    window.open(url, '_blank', 'noopener');
    addHistory(title, url, kind);
    setStatus('Opening...');
  }

  function performSearch(query) {
    if (!query || !query.trim()) { setStatus('Enter a search term'); return; }
    const engine = settings.searchEngine || 'https://www.bing.com/search?q=';
    const q = query.trim();
    window.open(engine + encodeURIComponent(q), '_blank', 'noopener');
    addHistory(q, engine + encodeURIComponent(q), 'search');
    setStatus('Searching...');
    try { searchInput.blur(); } catch (e) {} // so the next LSK press is never eaten by text editing
  }

  /* ---------- Options / confirm sheet ---------- */
  const sheet = { open: false, items: [], idx: 0, prevFocus: null, pushed: false };
  let skipNextPop = false;
  let pendingAfterPop = null;

  function openSheet(title, items) {
    sheet.items = items;
    sheet.idx = 0;
    sheet.prevFocus = document.activeElement;
    sheetTitle.textContent = title;
    sheetList.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-item' + (it.danger ? ' danger' : '');
      b.textContent = it.label;
      b.addEventListener('click', () => { sheet.idx = i; sheetSelect(); });
      sheetList.appendChild(b);
    });
    sheet.open = true;
    sheetEl.classList.remove('hidden');
    // Own history entry so a native "back" closes the sheet instead of the screen.
    if (usingHistoryApi) {
      try { window.history.pushState({ screen: currentScreenName(), sheet: true }, '', '#opts'); sheet.pushed = true; }
      catch (e) { sheet.pushed = false; }
    }
    sheetFocus(0);
    updateSoftkeys();
  }

  function sheetButtons() { return Array.from(sheetList.querySelectorAll('.sheet-item')); }

  function sheetFocus(i) {
    const b = sheetButtons();
    if (!b.length) return;
    sheet.idx = (i + b.length) % b.length;
    b[sheet.idx].focus();
  }

  function hideSheet() {
    sheet.open = false;
    sheetEl.classList.add('hidden');
    sheetList.innerHTML = '';
    const p = sheet.prevFocus;
    sheet.prevFocus = null;
    if (p && p.focus && document.body.contains(p)) { try { p.focus({ preventScroll: true }); } catch (e) {} }
    updateSoftkeys();
  }

  // Close the sheet (cancel or after a choice). afterFn runs once history is settled.
  function closeSheet(afterFn) {
    hideSheet();
    if (sheet.pushed) {
      sheet.pushed = false;
      pendingAfterPop = afterFn || null;
      skipNextPop = true;
      window.history.back();
    } else if (afterFn) {
      afterFn();
    }
  }

  function sheetSelect() {
    const it = sheet.items[sheet.idx];
    closeSheet(it && it.fn ? it.fn : null);
  }

  /* ---------- Screen navigation ---------- */
  function currentScreenName() {
    const cur = document.querySelector('.screen:not(.hidden)');
    return cur ? cur.getAttribute('data-screen') : 'home';
  }

  function onEnter(name) {
    switch (name) {
      case 'home':
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
        screens.home.focus();
        break;
      case 'menu':
        focusRow('menu', 0);
        break;
      case 'favorites':
        renderFavorites();
        focusRow('favorites', nextFocus);
        break;
      case 'history':
        renderHistory();
        focusRow('history', nextFocus);
        break;
      case 'addfav':
        favTitleInput.focus();
        break;
      case 'help':
        screens.help.focus();
        break;
    }
    nextFocus = 0;
  }

  function renderScreen(name) {
    if (!screens[name]) name = 'home';
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
    screens[name].scrollTop = 0;
    onEnter(name);
    updateSoftkeys();
  }

  function showScreen(name, push = true) {
    if (!screens[name]) return;
    const cur = currentScreenName();
    if (cur === name) { renderScreen(name); return; }
    if (usingHistoryApi) {
      try {
        if (push) window.history.pushState({ screen: name }, '', '#' + name);
        else window.history.replaceState({ screen: name }, '', '#' + name);
      } catch (e) { usingHistoryApi = false; }
    }
    if (!usingHistoryApi && push && cur) navStack.push(cur);
    renderScreen(name);
  }

  function goBack() {
    if (usingHistoryApi) { window.history.back(); return; }
    if (!navStack.length) { renderScreen('home'); return; }
    renderScreen(navStack.pop());
  }

  window.addEventListener('popstate', (e) => {
    if (skipNextPop) { // the pop we triggered ourselves when closing the sheet
      skipNextPop = false;
      const fn = pendingAfterPop;
      pendingAfterPop = null;
      if (fn) fn();
      return;
    }
    if (sheet.open) { // native Back while the sheet is open: just close it
      sheet.pushed = false;
      hideSheet();
      return;
    }
    renderScreen((e.state && e.state.screen) ? e.state.screen : 'home');
  });

  /* ---------- LSK / RSK actions ---------- */
  function activateFocused(name) {
    const rows = rowsOf(name);
    const cur = rows.indexOf(document.activeElement);
    const target = rows[cur < 0 ? 0 : cur];
    if (target) target.click();
  }

  function onLsk() {
    const name = currentScreenName();
    switch (name) {
      case 'menu': activateFocused('menu'); break;
      case 'favorites': openFavoritesOptions(); break;
      case 'history': openHistoryOptions(); break;
      case 'addfav': saveFavoriteInline(); break;
      default: showScreen('menu');
    }
  }

  function onRsk() {
    if (sheet.open) { closeSheet(); return; }
    if (currentScreenName() === 'home') {
      try { window.close(); } catch (e) {}
    }
    goBack();
  }

  function handleGlobalKeydown(e) {
    const key = e.key;
    const isLsk = LSK_KEYS.indexOf(key) > -1;
    const isRsk = RSK_KEYS.indexOf(key) > -1;
    const name = currentScreenName();
    const target = e.target;

    // Ignore auto-repeat on softkeys (held key must not fire twice)
    if ((isLsk || isRsk) && e.repeat) { e.preventDefault(); return; }

    // Sheet is modal: it owns the keys while open
    if (sheet.open) {
      if (key === 'ArrowDown') { e.preventDefault(); sheetFocus(sheet.idx + 1); }
      else if (key === 'ArrowUp') { e.preventDefault(); sheetFocus(sheet.idx - 1); }
      else if (key === 'Enter' || isLsk) { e.preventDefault(); sheetSelect(); }
      else if (isRsk) { e.preventDefault(); closeSheet(); }
      return;
    }

    // LSK is never a typing key, so it works even while a text box has focus
    if (isLsk) { e.preventDefault(); onLsk(); return; }

    if (isRsk) {
      // Home: leave RSK alone so the platform can close the app
      if (name === 'home') return;
      // Real Backspace inside a text box must still delete characters
      if (key === 'Backspace' && isTextField(target) && target.value) return;
      e.preventDefault();
      goBack();
      return;
    }

    // Quick number-key selection on the Menu screen
    if (name === 'menu' && /^[1-4]$/.test(key)) {
      const item = menuItems[parseInt(key, 10) - 1];
      if (item) { e.preventDefault(); item.click(); }
      return;
    }

    // D-pad up/down moves through list screens
    if (LIST_SCREENS.indexOf(name) > -1 && (key === 'ArrowDown' || key === 'ArrowUp')) {
      e.preventDefault();
      moveFocus(name, key === 'ArrowDown' ? 1 : -1);
      return;
    }

    // Home: type-to-search. Nothing is auto-focused (that used to swallow LSK).
    if (name === 'home') {
      const nothingFocused = !target || target === document.body || target === screens.home;
      if (nothingFocused) {
        if (key === 'Enter') { e.preventDefault(); searchInput.focus(); }
        else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { searchInput.focus(); }
      }
    }
  }

  /* ---------- Theme / clock ---------- */
  function applyTheme() {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }

  function updateDateTime() {
    const now = new Date();
    datetimeEl.textContent = now.toLocaleDateString() + ' ' +
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------- Wiring ---------- */
  function wireEvents() {
    btnLsk.addEventListener('click', onLsk);
    btnRsk.addEventListener('click', onRsk);

    menuItems.forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        if (target) showScreen(target);
      });
    });

    if (btnOpenHelp) btnOpenHelp.addEventListener('click', () => showScreen('help'));

    btnGo.addEventListener('click', () => performSearch(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); performSearch(searchInput.value); }
    });

    favTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); favUrlInput.focus(); }
    });
    favUrlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveFavoriteInline(); }
    });
    btnSaveFav.addEventListener('click', saveFavoriteInline);
    addFavForm.addEventListener('submit', (e) => { e.preventDefault(); saveFavoriteInline(); });

    searchEngineSelect.addEventListener('change', (e) => {
      settings.searchEngine = e.target.value;
      saveSettings();
      setStatus('Search engine saved');
    });

    themeToggle.addEventListener('click', () => {
      settings.theme = settings.theme === 'dark' ? 'day' : 'dark';
      saveSettings();
      applyTheme();
      setStatus('Theme updated');
    });

    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function init() {
    loadAll();

    if (settings.searchEngine) {
      const found = Array.from(searchEngineSelect.options).find((o) => o.value === settings.searchEngine);
      if (!found) {
        const opt = document.createElement('option');
        opt.value = settings.searchEngine;
        opt.textContent = settings.searchEngine;
        searchEngineSelect.appendChild(opt);
      }
      searchEngineSelect.value = settings.searchEngine;
    }

    applyTheme();
    wireEvents();

    if (usingHistoryApi) {
      try { window.history.replaceState({ screen: 'home' }, '', '#home'); } catch (e) { usingHistoryApi = false; }
    }
    renderScreen('home');

    updateDateTime();
    setInterval(updateDateTime, 1000);
  }

  init();

  window.StartPage = {
    getFavorites: () => favorites.slice(),
    getHistory: () => historyEntries.slice(),
    settings,
    showScreen
  };
})();
