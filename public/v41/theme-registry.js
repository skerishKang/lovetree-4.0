(() => {
  if (globalThis.LT41_THEME_REGISTRY) return;
  const themes = Object.freeze([
    Object.freeze({ id: 'night', label: '밤', order: 1, icon: '☾', tone: 'dark', attribute: null }),
    Object.freeze({ id: 'garden', label: '정원', order: 2, icon: '☀', tone: 'light', attribute: 'garden' })
  ].sort((a, b) => a.order - b.order));
  const defaultTheme = themes[0];
  const find = value => themes.find(theme => theme.id === value) || null;
  globalThis.LT41_THEME_REGISTRY = Object.freeze({
    cleanupViews: Object.freeze([{id:'classic',label:'지금 방식'},{id:'cards',label:'새 방식'}].map(Object.freeze)),
    readCleanupView(){try{return localStorage.getItem('lt41.cleanupView')==='cards'?'cards':'classic'}catch{return 'classic'}},
    writeCleanupView(value){try{localStorage.setItem('lt41.cleanupView',value==='cards'?'cards':'classic')}catch{}},
    themes,
    defaultTheme,
    find,
    normalize: value => find(value)?.id || defaultTheme.id,
    tone: value => find(value)?.tone || defaultTheme.tone,
    apply(root, value) {
      const theme = find(value) || defaultTheme;
      if (theme.attribute) root.setAttribute('data-lt-theme', theme.attribute);
      else root.removeAttribute('data-lt-theme');
      return theme.id;
    }
  });
})();
