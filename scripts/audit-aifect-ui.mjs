/**
 * AIFECT UI style auditor — run only on a computer that can reach the site.
 * Usage: node scripts/audit-aifect-ui.mjs
 *   AIFECT_AUDIT_URL='http://localhost:4174/#home' node scripts/audit-aifect-ui.mjs
 * Output: audit-output/ (do not commit if screenshots contain private data).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const target = process.env.AIFECT_AUDIT_URL || 'https://aifect.co.kr/#home';
const outDir = path.resolve(process.env.AIFECT_AUDIT_OUT || 'audit-output');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error('Playwright is not installed. Use an existing Playwright dependency or run: npm install --no-save playwright');
  process.exit(1);
}
await fs.mkdir(outDir, { recursive: true });
const browser = await playwright.chromium.launch({ headless: true });
const sizes = [
  { label: 'desktop', width: 1440, height: 900, isMobile: false },
  { label: 'mobile', width: 390, height: 844, isMobile: true },
];
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: {width: size.width, height: size.height}, isMobile: size.isMobile, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}
    await page.waitForTimeout(1200);
    const record = await page.evaluate(() => {
      const selectors = [
        ['body', 'body'], ['root', ':root'], ['header', 'header'], ['nav', 'nav'], ['aside', 'aside'],
        ['main', 'main'], ['buttons', 'button'], ['links', 'a'], ['inputs', 'input'],
        ['tabs', '[role="tab"]'], ['dialogs', '[role="dialog"]'], ['modal', '[class*="modal" i]'],
        ['sidebar', '[class*="sidebar" i]'], ['player', '[class*="player" i]'],
        ['cards', '[class*="card" i]'], ['sections', 'section'], ['headings', 'h1,h2,h3'],
      ];
      const styles = {};
      const fields = ['display','backgroundColor','backgroundImage','color','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','gap','rowGap','columnGap','borderRadius','border','borderColor','boxShadow','height','minHeight','maxWidth','textAlign'];
      for (const [category, selector] of selectors) {
        let matched;
        try { matched = [...document.querySelectorAll(selector)].filter(el => {
          const box = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return box.width > 3 && box.height > 3 && st.visibility !== 'hidden' && st.display !== 'none';
        }).slice(0, 5); } catch { matched = []; }
        styles[category] = matched.map(el => {
          const st = getComputedStyle(el);
          const obj = { tag: el.tagName.toLowerCase(), className: typeof el.className === 'string' ? el.className.slice(0, 180) : '', selectorSample: selector };
          for (const field of fields) obj[field] = st[field];
          return obj;
        });
      }
      const rootCss = getComputedStyle(document.documentElement);
      const vars = {};
      for (let i = 0; i < rootCss.length; i++) {
        const property = rootCss[i];
        if (property.startsWith('--') && Object.keys(vars).length < 250) vars[property] = rootCss.getPropertyValue(property).trim();
      }
      return { title: document.title, documentLang: document.documentElement.lang, styles, rootVariables: vars,
        meta: 'Computed style snapshots from the target page; element classes and screen rendering may change. No cookies/tokens captured.' };
    });
    const output = { ...record, target, capturedAt: new Date().toISOString(), viewport: size };
    await fs.writeFile(path.join(outDir, `aifect-style-${size.label}.json`), JSON.stringify(output, null, 2), 'utf8');
    await page.screenshot({ path: path.join(outDir, `home-${size.label}.png`), fullPage: false, animations: 'disabled' });
    console.log(`Saved ${size.label} computed styles and screenshot from ${page.url()}`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('Review screenshot and computed styles before changing production tokens. Do not commit personal data.');
