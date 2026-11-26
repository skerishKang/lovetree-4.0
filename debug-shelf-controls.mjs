import { chromium } from 'playwright';
import { serve } from './tests/helpers/screen-audit.mjs';
const trees = [1, 2].map(id => ({ id: 't' + id, title: '시험용 ' + id, subject: id, moments: [{ id: id + 'm1', title: '시험 순간', type: 'memo', date: '2026-11-01', note: '가짜 기록', first: true }], edges: [] }));
const host = `<html><body style="margin:0" data-member="in" data-record-source="server"><script>window.LT41=${JSON.stringify({ source: 'server', writable: true, owned: true, momentId: 't1m1', prefs: {}, tree: trees[0], trees })};</script><iframe src="/v41/views/track32-bookshelf.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
const server = await serve({ '/shelf-search-host.html': host });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin !== base) return r.abort(); if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 200, json: { ok: true, items: [] } }); return r.continue(); });
const page = await ctx.newPage();
try {
  await page.goto(base + '/shelf-search-host.html', { waitUntil: 'load' });
  const f = page.frames().find(x => x !== page.mainFrame());
  await f.waitForSelector('.lt-screen-toolbar');
  await f.waitForTimeout(800);
  const info = await f.evaluate(() => {
    const group = document.querySelector('.lt-toolbar-tools'), menu = document.querySelector('.lt-toolbar-menu');
    const row = el => ({ id: el.id, cls: el.className, w: Math.round(el.getBoundingClientRect().width), visible: el.getClientRects().length > 0, parent: el.parentElement?.className });
    return { groupW: group?.clientWidth, group: [...(group?.children || [])].map(row), menu: [...(menu?.children || [])].map(row), moreHidden: document.querySelector('.lt-toolbar-more')?.hidden };
  });
  const c=await f.evaluate(()=>{const el=document.querySelector('.shelf-controls');const row=e=>({cls:e.className,id:e.id,w:Math.round(e.getBoundingClientRect().width),col:getComputedStyle(e).gridColumn,left:Math.round(e.getBoundingClientRect().left)});return{w:el.clientWidth,cols:getComputedStyle(el).gridTemplateColumns,kids:[...el.children].map(row)}});console.log(JSON.stringify(info));console.log('CONTROLS',JSON.stringify(c));
} finally { await ctx.close(); await browser.close(); await new Promise(r => server.close(r)); }
