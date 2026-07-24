/* StartPage Browser - script.js
   - LSK (left softkey) opens the Menu screen; number keys 1-4 jump to an item
   - RSK (right softkey) goes back / closes, and is backed by the real
     browser History API so a platform "go back" also works correctly
   - Status bar starts empty
*/

(() => {
  // DOM references
  const screens = {
    home: document.getElementById('screen-home'),
    menu: document.getElementById('screen-menu'),
    favorites: document.getElementById('screen-favorites'),
    history: document.getElementById('screen-history'),
    settings: document.getElementById('screen-settings'),
    help: document.getElementById('screen-help')
  };

  const btnLsk = document.getElementById('btn-lsk');
  const btnRsk = document.getElementById('btn-rsk');
  const btnGo = document.getElementById('btn-go');
  const searchInput = document.getElementById('search-input');
  const favoritesList = document.getElementById('favorites-list');
  const historyList = document.getElementById('history-list');
  const addFavForm = document.getElementById('add-favorite-form');
  const favTitleInput = document.getElementById('fav-title');
  const favUrlInput = document.getElementById('fav-url');
  const btnSaveFav = document.getElementById('btn-save-fav');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const searchEngineSelect = document.getElementById('search-engine');
  const themeToggle = document.getElementById('theme-toggle');
  const btnOpenHelp = document.getElementById('btn-open-help');
  const statusEl = document.getElementById('status');
  const datetimeEl = document.getElementById('datetime');
  const menuItems = Array.from(document.querySelectorAll('.menu-item'));

  // Storage keys
  const KEY_FAV = 'startpage_favorites_v1';
  const KEY_HIST = 'startpage_history_v1';
  const KEY_SETTINGS = 'startpage_settings_v1';

  // State
  let favorites = [];
  let historyEntries = [];
  let settings = {
    searchEngine: 'https://www.bing.com/search?q=',
    theme: 'day' // 'day' or 'dark'
  };

  // Internal fallback nav stack (used if History API is unavailable)
  const navStack = [];
  let usingHistoryApi = true;
  try {
    if (!window.history || !window.history.pushState) usingHistoryApi = false;
  } catch (e) { usingHistoryApi = false; }

  // Utilities: persistence
  function saveFavorites() {
    try { localStorage.setItem(KEY_FAV, JSON.stringify(favorites)); } catch (e) {}
  }
  function saveHistory() {
    try { localStorage.setItem(KEY_HIST, JSON.stringify(historyEntries)); } catch (e) {}
  }
  function saveSettings() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }
  function loadAll() {
    try {
      const f = JSON.parse(localStorage.getItem(KEY_FAV) || '[]');
      if (Array.isArray(f)) favorites = f;
    } catch (e) { favorites = []; }
    try {
      const h = JSON.parse(localStorage.getItem(KEY_HIST) || '[]');
      if (Array.isArray(h)) historyEntries = h;
    } catch (e) { historyEntries = []; }
    try {
      const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}');
      if (s && typeof s === 'object') settings = Object.assign(settings, s);
    } catch (e) { /* ignore */ }
  }

  // Rendering favorites
  function renderFavorites() {
    favoritesList.innerHTML = '';
    if (favorites.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No favorites yet.';
      favoritesList.appendChild(li);
      return;
    }
    favorites.slice().reverse().forEach((f) => {
      const li = document.createElement('li');

      const meta = document.createElement('div');
      meta.className = 'meta';

      const a = document.createElement('a');
      a.href = f.url;
      a.textContent = f.title || f.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', () => {
        addHistory(f.title || f.url, f.url);
      });

      const small = document.createElement('div');
      small.style.fontSize = '11px';
      small.style.color = 'var(--muted)';
      small.textContent = f.url;

      meta.appendChild(a);
      meta.appendChild(small);

      const btns = document.createElement('div');

      const openBtn = document.createElement('button');
      openBtn.className = 'btn';
      openBtn.textContent = 'Open';
      openBtn.title = 'Open favorite';
      openBtn.addEventListener('click', () => {
        window.open(f.url, '_blank', 'noopener');
        addHistory(f.title || f.url, f.url);
        setStatus('Opened favorite');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.textContent = 'Delete';
      delBtn.title = 'Delete favorite';
      delBtn.addEventListener('click', () => {
        const index = favorites.indexOf(f);
        if (index > -1) {
          favorites.splice(index, 1);
          saveFavorites();
          renderFavorites();
          setStatus('Favorite deleted');
        }
      });

      btns.appendChild(openBtn);
      btns.appendChild(delBtn);

      li.appendChild(meta);
      li.appendChild(btns);
      favoritesList.appendChild(li);
    });
  }

  // Rendering history
  function renderHistory() {
    historyList.innerHTML = '';
    if (historyEntries.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No history yet.';
      historyList.appendChild(li);
      return;
    }
    historyEntries.slice().reverse().forEach((h) => {
      const li = document.createElement('li');

      const meta = document.createElement('div');
      meta.className = 'meta';

      const a = document.createElement('a');
      a.href = h.url;
      a.textContent = h.title || h.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', () => {
        addHistory(h.title || h.url, h.url);
      });

      const small = document.createElement('div');
      small.style.fontSize = '11px';
      small.style.color = 'var(--muted)';
      small.textContent = new Date(h.time).toLocaleString();

      meta.appendChild(a);
      meta.appendChild(small);

      const btns = document.createElement('div');

      const openBtn = document.createElement('button');
      openBtn.className = 'btn';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', () => {
        window.open(h.url, '_blank', 'noopener');
        addHistory(h.title || h.url, h.url);
        setStatus('Opened from history');
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        const index = historyEntries.indexOf(h);
        if (index > -1) {
          historyEntries.splice(index, 1);
          saveHistory();
          renderHistory();
          setStatus('History item deleted');
        }
      });

      btns.appendChild(openBtn);
      btns.appendChild(delBtn);

      li.appendChild(meta);
      li.appendChild(btns);
      historyList.appendChild(li);
    });
  }

  // Status helper (starts empty)
  let statusTimer = null;
  function setStatus(text) {
    statusEl.textContent = text || '';
    if (statusTimer) clearTimeout(statusTimer);
    if (text) {
      statusTimer = setTimeout(() => {
        statusEl.textContent = '';
      }, 2500);
    }
  }

  // History management (browsing history, not browser History API)
  function addHistory(title, url) {
    const entry = { title: title || url, url, time: Date.now() };
    historyEntries.push(entry);
    if (historyEntries.length > 500) historyEntries.shift();
    saveHistory();
    renderHistory();
  }

  // ---- Screen navigation ---------------------------------------------
  // Uses the browser History API (pushState/popstate) so that the RSK
  // (right softkey), which platforms map to a native "go back" action,
  // correctly steps back through app screens per the Cloud Phone
  // navigation-history rule.

  function currentScreenName() {
    const current = document.querySelector('.screen:not(.hidden)');
    return current ? current.getAttribute('data-screen') : 'home';
  }

  function renderScreen(name) {
    if (!screens[name]) name = 'home';
    Object.values(screens).forEach((s) => s.classList.add('hidden'));
    screens[name].classList.remove('hidden');
    setStatus(capitalize(name) + ' opened');

    if (name === 'menu' && menuItems.length) {
      try { menuItems[0].focus(); } catch (e) {}
    }
  }

  function showScreen(name, push = true) {
    if (!screens[name]) return;
    const curName = currentScreenName();
    if (curName === name) {
      renderScreen(name);
      return;
    }

    if (usingHistoryApi) {
      if (push) {
        try { window.history.pushState({ screen: name }, '', '#' + name); }
        catch (e) { usingHistoryApi = false; }
      } else {
        try { window.history.replaceState({ screen: name }, '', '#' + name); }
        catch (e) { usingHistoryApi = false; }
      }
    }
    if (!usingHistoryApi && push && curName) {
      navStack.push(curName);
    }
    renderScreen(name);
  }

  function goBack() {
    if (usingHistoryApi) {
      // Let popstate do the actual screen switch; if there's nothing to
      // go back to, the browser/platform handles closing the page.
      window.history.back();
      return;
    }
    if (navStack.length === 0) {
      renderScreen('home');
      setStatus('At home');
      return;
    }
    const prev = navStack.pop();
    renderScreen(prev);
    setStatus('Back');
  }

  window.addEventListener('popstate', (e) => {
    const name = (e.state && e.state.screen) ? e.state.screen : 'home';
    renderScreen(name);
  });

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- Actions ---------------------------------------------------------
  function performSearch(query) {
    if (!query || !query.trim()) {
      setStatus('Enter a search term');
      return;
    }
    const engine = settings.searchEngine || 'https://www.bing.com/search?q=';
    const url = engine + encodeURIComponent(query.trim());
    window.open(url, '_blank', 'noopener');
    addHistory(query.trim(), url);
    setStatus('Search performed');
  }

  function saveFavoriteInline() {
    const title = favTitleInput.value.trim();
    const url = favUrlInput.value.trim();
    if (!title || !url) {
      setStatus('Title and URL required');
      return;
    }
    const normalized = normalizeUrl(url);
    favorites.push({ title, url: normalized });
    saveFavorites();
    renderFavorites();
    favTitleInput.value = '';
    favUrlInput.value = '';
    setStatus('Favorite saved');
  }

  function normalizeUrl(u) {
    try {
      const parsed = new URL(u);
      return parsed.href;
    } catch (e) {
      try {
        return new URL('https://' + u).href;
      } catch (e2) {
        return u;
      }
    }
  }

  function clearHistory() {
    historyEntries = [];
    saveHistory();
    renderHistory();
    setStatus('History cleared');
  }

  // Theme
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  // Date/time
  function updateDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    datetimeEl.textContent = `${date} ${time}`;
  }

  // ---- Softkey (LSK/RSK) + T9 key handling -----------------------------
  // Feature phones send platform-specific key names for the soft keys.
  // We listen for the common ones and also expose visible on-screen
  // buttons so the widget works with touch, mouse and keyboard alike.
  const LSK_KEYS = ['SoftLeft', 'MenuKey', 'F1'];
  const RSK_KEYS = ['SoftRight', 'F2', 'Backspace'];

  function openMenu() {
    showScreen('menu');
  }

  function handleGlobalKeydown(e) {
    const target = e.target;
    const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

    if (LSK_KEYS.includes(e.key) && !isTyping) {
      e.preventDefault();
      openMenu();
      return;
    }

    if (RSK_KEYS.includes(e.key) && !isTyping) {
      e.preventDefault();
      goBack();
      return;
    }

    // Quick number-key selection while the Menu screen is open
    if (currentScreenName() === 'menu' && /^[1-4]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (menuItems[idx]) {
        e.preventDefault();
        menuItems[idx].click();
      }
      return;
    }

    // Basic up/down navigation within the menu list
    if (currentScreenName() === 'menu' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const focusedIndex = menuItems.indexOf(document.activeElement);
      let nextIndex;
      if (e.key === 'ArrowDown') {
        nextIndex = focusedIndex < 0 ? 0 : (focusedIndex + 1) % menuItems.length;
      } else {
        nextIndex = focusedIndex < 0 ? menuItems.length - 1 : (focusedIndex - 1 + menuItems.length) % menuItems.length;
      }
      menuItems[nextIndex].focus();
    }
  }

  // Event wiring
  function wireEvents() {
    btnLsk.addEventListener('click', openMenu);
    btnRsk.addEventListener('click', goBack);

    menuItems.forEach((item) => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        if (target) showScreen(target);
      });
    });

    if (btnOpenHelp) {
      btnOpenHelp.addEventListener('click', () => showScreen('help'));
    }

    btnGo.addEventListener('click', () => {
      performSearch(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch(searchInput.value);
      }
    });

    btnSaveFav.addEventListener('click', saveFavoriteInline);
    addFavForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveFavoriteInline();
    });

    btnClearHistory.addEventListener('click', () => {
      if (confirm('Clear all history?')) clearHistory();
    });

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

  // Initialization
  function init() {
    loadAll();

    // ensure search engine select matches settings
    if (settings.searchEngine) {
      const opts = Array.from(searchEngineSelect.options);
      const found = opts.find((o) => o.value === settings.searchEngine);
      if (found) {
        searchEngineSelect.value = settings.searchEngine;
      } else {
        const opt = document.createElement('option');
        opt.value = settings.searchEngine;
        opt.textContent = settings.searchEngine;
        searchEngineSelect.appendChild(opt);
        searchEngineSelect.value = settings.searchEngine;
      }
    }

    applyTheme();
    renderFavorites();
    renderHistory();
    wireEvents();

    if (usingHistoryApi) {
      try { window.history.replaceState({ screen: 'home' }, '', '#home'); }
      catch (e) { usingHistoryApi = false; }
    }
    renderScreen('home');

    updateDateTime();
    setInterval(updateDateTime, 1000);

    // Accessibility: focus search input on load
    try { searchInput.focus(); } catch (e) {}
  }

  // Run
  init();

  // Expose minimal API for debugging
  window.StartPage = {
    getFavorites: () => favorites.slice(),
    getHistory: () => historyEntries.slice(),
    settings,
    showScreen
  };
})();
