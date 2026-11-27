// #1535: recover a missing deployment chunk before the entry module can run.
(function () {
  const key = 'lt41.deployRecovery.v1';
  let host = window;
  try { if (top.location.origin === location.origin) host = top; } catch {}
  if (host !== window && host.LT41DeployRecovery) {
    window.LT41DeployRecovery = host.LT41DeployRecovery;
  } else {
    let recovering = false;
    const marker = () => { try { return host.sessionStorage.getItem(key); } catch { return null; } };
    const show = () => {
      const doc = host.document;
      if (!doc.body) { doc.addEventListener('DOMContentLoaded', show, { once: true }); return; }
      if (doc.getElementById('lt-deploy-recovery')) return;
      const box = doc.createElement('div');
      box.id = 'lt-deploy-recovery'; box.setAttribute('role', 'alert');
      const button = doc.createElement('button');
      button.type = 'button'; button.textContent = '새 버전이 있어요 — 다시 불러오기';
      button.addEventListener('click', () => host.location.reload());
      box.append(button); doc.body.append(box);
    };
    const recover = () => {
      if (recovering) return;
      recovering = true;
      if (marker()) { show(); return; }
      try { host.sessionStorage.setItem(key, '1'); }
      catch { show(); return; }
      host.location.reload();
    };
    // Reset only when the complete shell and its home frame have loaded successfully.
    const ready = () => { if (!recovering) { try { host.sessionStorage.removeItem(key); } catch {} } };
    window.LT41DeployRecovery = { recover, ready };
  }
  const recover = window.LT41DeployRecovery.recover;
  const chunkError = error => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(String(error?.message || error || ''));
  addEventListener('vite:preloadError', e => { e.preventDefault(); recover(); });
  addEventListener('unhandledrejection', e => { if (chunkError(e.reason)) recover(); });
  addEventListener('error', e => {
    const el = e.target;
    if (!el || !el.tagName) { if (chunkError(e.error)) recover(); return; }
    const url = el.src || el.href;
    if (!url) return;
    const u = new URL(url, location.href);
    if (u.origin !== location.origin || !/^\/assets\/[^/]+\.(?:js|css)$/.test(u.pathname)) return;
    if (el.tagName === 'SCRIPT' && el.type === 'module' || el.tagName === 'LINK' && ['modulepreload', 'stylesheet'].includes(el.rel)) recover();
  }, true);
})();
