#!/usr/bin/env node
/* Interface language (js/i18n.js), end to end at 390 on hoover/ and log.
 *   node tools/check-i18n.cjs <base> [outDir]
 * Fresh phone: English, html lang="en", no draft marker. Footer Language opens the Display panel on the language select;
 * picking Español sets html lang="es", shows the "Draft translation" marker, swaps nav, glance and footer labels, and
 * leaves the h1 (lake name), the night-rules chip rule and the glance numbers untouched. A reload keeps Spanish (lang set
 * by js/a11y-boot.js before any page script). A string file missing a key falls back to English for that key only.
 * Log in Spanish: form labels and placeholders swap, species and ramp options stay English. Red light and high contrast:
 * the marker stays readable (>= 4.5:1). Back to English: everything restores and nb-lang is cleared. No sideways scroll,
 * no page errors. Prints PASS/FAIL lines; exit 1 on any FAIL. Analytics blocked (tools/no-analytics.cjs).
 */
const fs = require('fs'), path = require('path'), os = require('os');
const PW = process.env.PLAYWRIGHT_CORE || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = require(PW);
const na = require(path.join(__dirname, 'no-analytics.cjs'));
const B = (process.argv[2] || 'http://127.0.0.1:8642/night-bite-preview/').replace(/\/?$/, '/');
const OUT = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'nb-i18n-'));
fs.mkdirSync(OUT, { recursive: true });
let fails = 0, passes = 0;
function ok(name, cond, info) {
  if (cond) passes++; else fails++;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined && !cond ? ' :: ' + JSON.stringify(info).slice(0, 400) : ''));
}
const state = () => {
  const q = s => document.querySelector(s), t = s => ((q(s) || {}).textContent || '').replace(/\s+/g, ' ').trim();
  const m = q('#i18n-draft');
  return { lang: document.documentElement.lang, store: localStorage.getItem('nb-lang'), marker: m && m.offsetParent ? m.textContent : '',
    nav: t('.site-nav a[href="species/"]'), glance: t('#glance-title'), level: t('.glance-cell[data-cell="pool"] .glance-label'),
    poolVal: t('[data-glance="pool"]'), h1: t('main h1'), chip: t('.night-chip-text'), foot: t('.site-footer a[href="privacy"]'),
    gear: t('.site-nav a[href="gear"]'), ov: document.documentElement.scrollWidth - innerWidth };
};
(async () => {
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: na.args() });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await na.block(ctx);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + 'hoover/', { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  const en = await p.evaluate(state);
  ok('fresh: English, lang="en", no draft marker', en.lang === 'en' && !en.marker && en.nav === 'Species' && !en.store, en);
  const btn = p.locator('.site-footer [data-lang-open]');
  ok('footer has a Language button', await btn.count() === 1 && await btn.isVisible());
  await btn.click(); await p.waitForTimeout(300);
  const foc = await p.evaluate(() => document.activeElement && document.activeElement.id);
  ok('Language opens the Display panel on the language select', foc === 'a11y-lang', foc);
  await p.selectOption('#a11y-lang', 'es'); await p.waitForTimeout(800);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const es = await p.evaluate(state);
  ok('es: html lang="es", nb-lang saved', es.lang === 'es' && es.store === 'es', es);
  ok('es: Draft translation marker shown', /Draft translation/.test(es.marker) && /Traducci/.test(es.marker), es.marker);
  ok('es: nav, glance and footer labels in Spanish', es.nav === 'Especies' && es.glance === 'Esta noche de un vistazo' && es.level === 'Nivel del lago' && es.foot === 'Privacidad', es);
  ok('es: lake name, rule chip and level number unchanged', es.h1 === en.h1 && es.chip === en.chip && es.poolVal === en.poolVal, { en, es });
  ok('es: no sideways scroll', es.ov <= 1, es.ov);
  await p.reload({ waitUntil: 'load' });
  const early = await p.evaluate(() => document.documentElement.lang);
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(600);
  const re = await p.evaluate(state);
  ok('reload: Spanish kept (lang set before page scripts)', early === 'es' && re.nav === 'Especies' && /Draft translation/.test(re.marker), { early, re });
  for (const mode of [['data-light', 'red'], ['data-contrast', 'more']]) {
    await p.evaluate(m => document.documentElement.setAttribute(m[0], m[1]), mode); await p.waitForTimeout(300);
    const c = await p.evaluate(() => {
      const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const m = document.getElementById('i18n-draft'), bg = getComputedStyle(m).backgroundColor, r = [];
      for (const el of [m.querySelector('.i18n-draft-tag'), m.querySelector('.i18n-draft-text')]) { const x = lum(getComputedStyle(el).color), y = lum(bg); r.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)); }
      return { bg, r };
    });
    ok(mode.join('=') + ': draft marker readable (>= 4.5:1)', c.r.every(x => x >= 4.5), c);
    await p.evaluate(m => document.documentElement.removeAttribute(m[0]), mode);
  }
  await p.goto(B + 'log', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const lg = await p.evaluate(() => ({ sum: (document.querySelector('#add-private summary') || {}).textContent, date: (document.querySelector('label[for="date"]') || {}).textContent,
    ph: (document.querySelector('#trip-form textarea') || {}).placeholder, opts: [...document.querySelectorAll('#trip-form option')].map(o => o.textContent).join('|'),
    ov: document.documentElement.scrollWidth - innerWidth }));
  ok('log es: form labels and placeholder in Spanish', lg.sum === 'Añadir una salida' && lg.date === 'Fecha' && /Tiempo, luna/.test(lg.ph || ''), lg);
  ok('log es: species and ramp options stay English', /Walleye/.test(lg.opts) && /Walnut Street ramp/.test(lg.opts) && /Channel catfish/.test(lg.opts), lg.opts.slice(0, 300));
  ok('log es: no sideways scroll', lg.ov <= 1, lg.ov);
  // back to English from the panel
  await p.goto(B + 'hoover/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  await p.locator('.site-footer [data-lang-open]').click(); await p.waitForTimeout(300);
  await p.selectOption('#a11y-lang', 'en'); await p.waitForTimeout(600); await p.keyboard.press('Escape');
  const back = await p.evaluate(state);
  ok('back to English: labels restored, marker gone, nb-lang cleared', back.lang === 'en' && back.nav === 'Species' && back.glance === 'Tonight at a glance' && !back.marker && !back.store, back);
  ok('no page errors', !errs.length, errs);
  // missing key falls back to English (string file served without nav.gear)
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await na.block(c2);
  await c2.route(/data\/i18n\/es\.json/, async r => { const res = await r.fetch(); const j = await res.json(); delete j.strings['nav.gear']; await r.fulfill({ response: res, json: j }); });
  await c2.addInitScript(() => { try { localStorage.setItem('nb-lang', 'es'); } catch (e) {} });
  const p2 = await c2.newPage(); await p2.goto(B + 'hoover/', { waitUntil: 'networkidle' }); await p2.waitForTimeout(700);
  const fb = await p2.evaluate(state);
  ok('missing key falls back to English (Gear), others Spanish', fb.gear === 'Gear' && fb.nav === 'Especies' && fb.lang === 'es', fb);
  // every other drafted language (S9b+): applies (html lang, marker, Species nav from its file), facts untouched, no sideways scroll at 390
  const langs = fs.readdirSync(path.join(__dirname, '..', 'data', 'i18n')).map(f => f.replace(/\.json$/, '')).filter(l => l !== 'en' && l !== 'es');
  for (const l of langs) {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'i18n', l + '.json'), 'utf8'));
    const c3 = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await na.block(c3);
    await c3.addInitScript(v => { try { localStorage.setItem('nb-lang', v); } catch (e) {} }, l);
    const p3 = await c3.newPage(); const e3 = []; p3.on('pageerror', e => e3.push(e.message));
    await p3.goto(B + 'hoover/', { waitUntil: 'networkidle' }); await p3.waitForTimeout(700);
    const st = await p3.evaluate(state);
    ok(`${l}: applies (lang, marker, nav), facts unchanged, no sideways scroll, no errors`, st.lang === l && /Draft translation/.test(st.marker) && st.nav === j.strings['nav.species'] && st.h1 === en.h1 && st.chip === en.chip && st.ov <= 1 && !e3.length, { st, e3 });
    await c3.close();
  }
  await br.close();
  console.log(`check-i18n: ${passes} pass, ${fails} fail`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed :: ' + e.message); process.exit(1); });
