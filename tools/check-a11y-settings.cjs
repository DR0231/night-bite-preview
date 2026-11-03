#!/usr/bin/env node
/* Display settings (js/a11y-boot.js + js/a11y.js), end to end:
 *   node tools/check-a11y-settings.cjs <base> [outDir] [pages]     pages default: ",hoover/,species/" (comma list)
 * At 390 (phone, via the More menu) and 1280 (desktop, via the footer) on each page: the Display button shows, the
 * panel opens as a modal with focus inside and closes on Escape with focus back on a button; each text size sets
 * data-text and changes the root font size; Large and Extra large turn on readable text; Readable text swaps body, nav
 * and heading fonts to the system font while the logo keeps its pixel face; Less motion stops transitions; High contrast
 * sets data-contrast and keeps body/nav text >= 7:1; every setting persists after a reload and is on <html> before
 * first paint (checked from a script that runs before the stylesheet's first paint); no sideways scroll at XL;
 * Reset clears it. Prints PASS/FAIL lines; exit 1 on any FAIL. Analytics blocked (tools/no-analytics.cjs).
 */
const path = require('path');
const PW = process.env.PLAYWRIGHT_CORE || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = require(PW);
const na = require(path.join(__dirname, 'no-analytics.cjs'));
const B = (process.argv[2] || 'http://127.0.0.1:8765/night-bite-preview/').replace(/\/?$/, '/');
const PAGES = (process.argv[4] || ',hoover/,species/').split(',');
let fails = 0, passes = 0;
function ok(name, cond, info) {
  if (cond) passes++; else fails++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !cond ? ' :: ' + JSON.stringify(info) : ''));
}
const attrs = p => p.evaluate(() => { const h = document.documentElement; return ['text', 'font', 'motion', 'contrast'].map(k => k + '=' + (h.getAttribute('data-' + k) || '')).join(' '); });
const state = p => p.evaluate(() => {
  const cs = e => e ? getComputedStyle(e) : null, q = s => document.querySelector(s);
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const navA = q('.site-nav a'), body = document.body;
  return {
    root: parseFloat(cs(document.documentElement).fontSize),
    body: cs(body).fontFamily, nav: navA ? cs(navA).fontFamily : '', h: cs(q('h1') || body).fontFamily,
    logo: q('.logo-text') ? cs(q('.logo-text')).fontFamily : 'Night Bite Pixel',
    navTrans: navA ? cs(navA).transitionDuration : '0s',
    bodyContrast: ratio(cs(body).color, 'rgb(10, 22, 40)'),
    navContrast: Math.min(21, ...[...document.querySelectorAll('.site-nav a, .nav-more-btn')].filter(e => e.offsetParent && !e.matches(':hover')).map(e => ratio(cs(e).color, 'rgb(10, 22, 40)'))),
    navLow: [...document.querySelectorAll('.site-nav a, .nav-more-btn')].filter(e => e.offsetParent && ratio(cs(e).color, 'rgb(10, 22, 40)') < 7).map(e => e.textContent.trim() + ' ' + cs(e).color),
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    navHit: [...document.querySelectorAll('.site-nav a, .nav-more-btn')].filter(e => e.offsetParent).filter(e => {
      const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) return true;
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(t && (e === t || e.contains(t)));
    }).map(e => e.textContent.trim()),
    boot: window.__nbBootAttrs || null
  };
});
const sys = f => /system-ui/.test(f) && !/Pixelify|Night Bite Pixel|Source Serif/.test(f);

(async () => {
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: na.args() });
  const errs = [];
  for (const vp of [{ width: 390, height: 844, m: true }, { width: 1280, height: 800, m: false }]) {
    for (const pg of PAGES) {
      const W = vp.width + ' /' + pg + ': ';
      const ctx = await br.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.m, hasTouch: vp.m, serviceWorkers: 'block' });
      await na.block(ctx);
      // record <html> attributes at the first point the body exists (before first paint of content)
      await ctx.addInitScript(() => { document.addEventListener('readystatechange', () => {}, { once: true });
        new MutationObserver((l, o) => { if (document.body) { const h = document.documentElement; window.__nbBootAttrs = ['text', 'font', 'motion', 'contrast'].map(k => h.getAttribute('data-' + k) || '').join('|'); o.disconnect(); } }).observe(document, { childList: true, subtree: true }); });
      const p = await ctx.newPage(); p.on('pageerror', e => errs.push(W + e.message));
      await p.goto(B + pg + (pg === '' ? '?pick' : ''), { waitUntil: 'load' });
      const base = await state(p);
      ok(W + 'default: pixel/serif fonts, no attributes', !sys(base.body) && (await attrs(p)) === 'text= font= motion= contrast=', [base.body, await attrs(p)]);
      async function openPanel() {
        if (vp.m && await p.isVisible('.nav-more-btn')) { await p.click('.nav-more-btn'); await p.click('#nav-more-panel [data-a11y-open]'); }
        else { await p.click('.site-footer [data-a11y-open]'); }
        await p.waitForSelector('#a11y-panel[open]', { timeout: 3000 });
      }
      const btnVisible = vp.m && await p.isVisible('.nav-more-btn')
        ? (await p.click('.nav-more-btn'), await p.isVisible('#nav-more-panel [data-a11y-open]'))
        : await p.isVisible('.site-footer [data-a11y-open]');
      if (vp.m && await p.isVisible('#nav-more-panel')) await p.click('.nav-more-btn');
      ok(W + 'Display button visible (' + (vp.m ? 'More menu' : 'footer') + ')', btnVisible);
      await openPanel();
      const modal = await p.evaluate(() => { const d = document.getElementById('a11y-panel'); return { modal: d.matches(':modal'), focusIn: d.contains(document.activeElement), label: d.getAttribute('aria-labelledby') }; });
      ok(W + 'panel is a labelled modal with focus inside', modal.modal && modal.focusIn && modal.label === 'a11y-title', modal);
      await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      ok(W + 'Escape closes and returns focus to a button', await p.evaluate(() => !document.getElementById('a11y-panel').open && /^(BUTTON)$/.test(document.activeElement.tagName)));
      // text sizes
      let prev = 0;
      for (const [v, lbl] of [['sm', 'Small'], ['', 'Default'], ['lg', 'Large'], ['xl', 'Extra large']]) {
        await openPanel(); await p.click('.a11y-seg-opt[data-size="' + (v || 'default') + '"]'); await p.keyboard.press('Escape');
        const s = await state(p), a = await attrs(p);
        ok(W + 'size ' + lbl + ' applies', a.includes('text=' + v + ' ') && s.root > prev, [a, s.root]);
        if (v === 'lg' || v === 'xl') ok(W + lbl + ' turns on readable text', a.includes('font=readable') && sys(s.body) && sys(s.nav) && sys(s.h) && /Night Bite Pixel/.test(s.logo), [a, s.body, s.nav, s.logo]);
        prev = s.root;
      }
      let s = await state(p);
      ok(W + 'XL: no sideways scroll', s.scrollX <= 1, s.scrollX);
      ok(W + 'XL: every header link fits and is tappable', s.navHit.length === 0, s.navHit);
      await p.reload({ waitUntil: 'load' }); s = await state(p);
      ok(W + 'XL persists after reload and applies before paint', (await attrs(p)).startsWith('text=xl font=readable') && s.boot === 'xl|readable||' && sys(s.body), [await attrs(p), s.boot]);
      // back to default size, readable on its own
      await openPanel(); await p.click('.a11y-seg-opt[data-size="default"]');
      const fontDisabled = await p.isDisabled('#a11y-font');
      await p.uncheck('#a11y-font'); await p.check('#a11y-font'); await p.keyboard.press('Escape');
      ok(W + 'Readable text alone (default size)', !fontDisabled && (await attrs(p)).startsWith('text= font=readable') && sys((await state(p)).body), await attrs(p));
      await openPanel(); await p.check('#a11y-motion'); await p.check('#a11y-contrast'); await p.keyboard.press('Escape'); await p.mouse.move(1, 400); await p.waitForTimeout(200);
      s = await state(p);
      ok(W + 'Less motion stops transitions', /motion=reduce/.test(await attrs(p)) && parseFloat(s.navTrans) < 0.001 && await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), [s.navTrans]);
      ok(W + 'High contrast: body and nav text >= 7:1', /contrast=more/.test(await attrs(p)) && s.bodyContrast >= 7 && s.navContrast >= 7, [s.bodyContrast, s.navContrast, s.navLow]);
      await p.reload({ waitUntil: 'load' }); s = await state(p);
      ok(W + 'motion + contrast + readable persist after reload, before paint', (await attrs(p)) === 'text= font=readable motion=reduce contrast=more' && s.boot === '|readable|reduce|more', [await attrs(p), s.boot]);
      await openPanel(); await p.click('.a11y-reset'); await p.keyboard.press('Escape');
      await p.reload({ waitUntil: 'load' });
      ok(W + 'Reset clears every setting', (await attrs(p)) === 'text= font= motion= contrast=' && (await p.evaluate(() => localStorage.getItem('nb-a11y'))) === '{}', await attrs(p));
      await ctx.close();
    }
  }
  // no JS: Display buttons stay hidden (no dead control)
  {
    const ctx = await br.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
    await na.block(ctx);
    const p = await ctx.newPage(); await p.goto(B + 'hoover/', { waitUntil: 'load' });
    ok('no JS: Display button hidden', !(await p.isVisible('.site-footer [data-a11y-open]')));
    await ctx.close();
  }
  ok('no page errors', errs.length === 0, errs);
  await br.close();
  console.log(`check-a11y-settings ${B}: ${passes} pass, ${fails} fail`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed :: ' + e.message); process.exit(1); });
