// The Night Bite: if js/lakes.js fails to load, a non-Hoover page must not use Hoover's gauge, saved
// keys, or numbers. Seeds unsuffixed Hoover saved readings (877.77 ft, 99°F), blocks lakes.js, then
// checks Madison (no gauge), Alum Creek (gauged), Hoover, and water.html?lake=alum.
// Usage: node tools/check-lakes-js-fallback.cjs [BASE] [OUTDIR]
// Blocks analytics (tools/no-analytics.cjs). Exit code 1 on any FAIL. Log: OUTDIR/check-lakes-js-fallback.log
const PW = require(require('path').join(__dirname, 'playwright-path.cjs'));
const { chromium } = require(PW);
const NA = require('./no-analytics.cjs');
const fs = require('fs');
const BASE = (process.argv[2] || 'https://dr0231.github.io/night-bite-preview/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || '/workspace/nb-lakes-js-fallback').replace(/\/?$/, '/');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
const lines = []; let fails = 0;
const check = (n, ok, info) => { lines.push((ok ? 'PASS ' : 'FAIL ') + n + (info ? ' :: ' + info : '')); if (!ok) fails++; };
const MARK_FT = '877.77';
const MARK_F = '99';
const HOOVER_SITE = '03228400';
const HOOVER_GAUGE = /03228400/;
const LAKES_JS = /\/js\/lakes\.js(\?|$)/;

function seedHoover() {
  const now = Date.now();
  const iso = new Date(now - 30 * 60 * 1000).toISOString();
  const pts = [];
  for (let i = 13; i >= 0; i--) {
    const t = now - i * 12 * 3600 * 1000;
    pts.push({ t: t, v: i ? 876.5 : 877.77, iso: new Date(t).toISOString() });
  }
  const usgs = {
    savedAt: now,
    g: '03228400:62614:00010',
    pool: { value: 877.77, dateTime: iso },
    temp: { value: 37.222, dateTime: iso }
  };
  localStorage.setItem('nb-usgs-last', JSON.stringify(usgs));
  localStorage.setItem('nb-trend-last', JSON.stringify({ savedAt: now, pts: pts }));
}

async function read(page) {
  return page.evaluate(() => {
    const $ = s => document.querySelector(s), tx = e => e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
    const line = $('#correction-line'), checked = $('#correction-checked'), trend = $('#pool-trend');
    const hrefs = Array.from(document.querySelectorAll('#correction-checked a, #usgs-live-status a, #correction-line a, [data-cell="pool"], [data-cell="temp"]'))
      .map(a => a.getAttribute('href') || '').join(' ');
    return {
      lake: document.documentElement.getAttribute('data-lake') || '',
      hasLK: !!(window.NightBiteLake && window.NightBiteLake.id),
      line: tx(line),
      src: line && line.getAttribute('data-source'),
      checked: tx(checked),
      status: tx($('#usgs-live-status')),
      temp: tx($('#water-temp')),
      gPool: tx($('[data-glance="pool"]')),
      gTemp: tx($('[data-glance="temp"]')),
      stamp: tx($('[data-glance="stamp"]')),
      hrefs,
      trendDrawn: !!(trend && trend.hasAttribute('data-drawn') && !trend.hidden),
      trendLabel: trend ? (trend.querySelector('svg') && trend.querySelector('svg').getAttribute('aria-label') || '') : ''
    };
  });
}

function borrowed(r) {
  const blob = [r.line, r.checked, r.status, r.temp, r.gPool, r.gTemp, r.stamp, r.trendLabel, r.hrefs].join(' ');
  return blob.includes(MARK_FT) || new RegExp('\\b' + MARK_F + '\\s*°F').test(blob) || HOOVER_GAUGE.test(blob) || HOOVER_GAUGE.test(r.hrefs);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: NA.args && NA.args() });
  lines.push('INFO base ' + BASE);

  async function visit(path) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await NA.block(ctx);
    await ctx.addInitScript(seedHoover);
    const hits = { lakesJs: 0, hooverGauge: 0, urls: [] };
    await ctx.route(LAKES_JS, r => { hits.lakesJs++; return r.abort('failed'); });
    await ctx.route(/./, r => {
      const u = r.request().url();
      if (HOOVER_GAUGE.test(u) && /waterdata|waterservices|api\.waterdata/.test(u)) hits.hooverGauge++;
      return r.fallback();
    });
    const page = await ctx.newPage();
    const perr = [];
    page.on('pageerror', e => perr.push(e.message));
    await page.goto(BASE + path, { waitUntil: 'load' }).catch(e => perr.push('goto ' + e.message));
    await page.waitForTimeout(500);
    const r = await read(page);
    r.hits = hits;
    r.perr = perr.filter(m => !/lakes\.js/i.test(m));
    await ctx.close();
    return r;
  }

  const madison = await visit('madison/?t=' + Date.now());
  check('madison: lakes.js was blocked', !madison.hasLK, 'hasLK=' + madison.hasLK);
  check('madison: data-lake is madison', madison.lake === 'madison', madison.lake);
  check('madison: baked no-gauge line kept', madison.line === 'No public lake level gauge', madison.line);
  check('madison: glance stays no public gauge', /no public gauge/i.test(madison.gPool), madison.gPool);
  check('madison: no Hoover numbers, gauge link, or saved 877.77/99°F', !borrowed(madison), [madison.line, madison.gPool, madison.temp, madison.hrefs].join(' | '));
  check('madison: no fetch of Hoover gauge 03228400', madison.hits.hooverGauge === 0, String(madison.hits.hooverGauge));
  check('madison: trend not drawn from Hoover saved week', !madison.trendDrawn && !madison.trendLabel.includes(MARK_FT), madison.trendLabel);

  const alum = await visit('alum/?t=' + Date.now());
  check('alum: lakes.js was blocked', !alum.hasLK, 'hasLK=' + alum.hasLK);
  check('alum: data-lake is alum', alum.lake === 'alum', alum.lake);
  check('alum: baked Alum snapshot kept (not Hoover saved reading)', alum.line.includes('ft') && !alum.line.includes(MARK_FT), alum.line);
  check('alum: no Hoover numbers, gauge link, or saved 877.77/99°F', !borrowed(alum), [alum.line, alum.temp, alum.hrefs].join(' | '));
  check('alum: no fetch of Hoover gauge 03228400', alum.hits.hooverGauge === 0, String(alum.hits.hooverGauge));
  check('alum: trend not drawn from Hoover saved week', !alum.trendDrawn && !alum.trendLabel.includes(MARK_FT), alum.trendLabel);

  const hoover = await visit('hoover/?t=' + Date.now());
  check('hoover: lakes.js was blocked', !hoover.hasLK, 'hasLK=' + hoover.hasLK);
  check('hoover: data-lake is hoover', hoover.lake === 'hoover', hoover.lake);
  check('hoover: may use unsuffixed saved reading (877.77 ft)', hoover.line.includes(MARK_FT), hoover.line);

  const water = await visit('water.html?lake=alum&t=' + Date.now());
  check('water.html?lake=alum: data-lake is alum', water.lake === 'alum', water.lake);
  check('water.html?lake=alum: no Hoover numbers or 03228400 link', !borrowed(water) && !water.line.includes('891.50') && !/03228400/.test(water.hrefs), [water.line, water.hrefs, water.checked].join(' | '));
  check('water.html?lake=alum: no fetch of Hoover gauge 03228400', water.hits.hooverGauge === 0, String(water.hits.hooverGauge));

  await browser.close();
  const text = lines.join('\n') + '\n' + (fails ? fails + ' FAIL\n' : 'all passed\n');
  fs.writeFileSync(OUT + 'check-lakes-js-fallback.log', text);
  console.log(text);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
