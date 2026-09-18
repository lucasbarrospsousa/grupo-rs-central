// Same viewport as the native fixture. Never connects to production services.
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = path.resolve(__dirname, '../../tmp/design-comparison');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.route(/^https?:/, r => r.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const name of ['inicio', 'estoque', 'sms', 'cadastro', 'config', 'novo', 'edicao', 'relatorio']) {
      await page.goto('about:blank');
      await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href + '#' + (['novo', 'edicao', 'relatorio'].includes(name) ? 'estoque' : name));
      const actions = { novo: 'new', edicao: 'edit', relatorio: 'report' };
      if (actions[name]) await page.locator(`[data-rsaction="${actions[name]}"]`).first().click();
      await page.evaluate(async () => { await document.fonts.ready; for (const a of document.getAnimations()) { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } });
      await page.screenshot({ path: path.join(out, `html-${name}.png`), fullPage: false });
    }
    if (errors.length) throw Error(errors.join('\n'));
    console.log('REFERENCE_CAPTURE_OK ' + out);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
