// Rasterize the approved code-native logo. No reference screenshot or font is needed.
// Run from this directory after npm install: node export-brand-assets.cjs
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const brand = path.join(__dirname, 'brand');
const catalog = path.join(__dirname, 'ios/Assets.xcassets');
const bg = '#0F1117';
const symbol = `<defs><linearGradient id="a" x1="54" y1="33" x2="54" y2="76" gradientUnits="userSpaceOnUse"><stop stop-color="#79C7F4"/><stop offset=".48" stop-color="#9DA8ED"/><stop offset="1" stop-color="#CE8BE2"/></linearGradient></defs><path d="M31 76 L54 33 L77 76" fill="none" stroke="url(#a)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
const icon = (opaque = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${opaque ? `<path fill="${bg}" d="M0 0h108v108H0z"/>` : ''}${symbol}</svg>`;
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const json = (file, data) => write(file, JSON.stringify(data, null, 2) + '\n');
async function raster(svg, file, width, height = width, opaque = false) {
  let output = sharp(Buffer.from(svg), { density: 300 }).resize(width, height);
  if (opaque) output = output.flatten({ background: bg }).removeAlpha();
  write(file, await output.png().toBuffer());
}
async function main() {
  write(path.join(brand, 'aifect-app-icon.svg'), icon());
  write(path.join(brand, 'aifect-app-mark.svg'), icon(false));
  const wordmark = fs.readFileSync(path.join(root, '../ai음원사이트/dist/assets/aifect-wordmark.svg'), 'utf8');
  write(path.join(brand, 'aifect-wordmark.svg'), wordmark);
  await raster(icon(), path.join(brand, 'aifect-app-icon-1024.png'), 1024, 1024, true);
  await raster(icon(), path.join(root, 'assets/icon-only.png'), 1024, 1024, true);
  await raster(icon(false), path.join(root, 'assets/icon-foreground.png'), 1024);
  const solid = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108"><path fill="${bg}" d="M0 0h108v108H0z"/></svg>`;
  await raster(solid, path.join(root, 'assets/icon-background.png'), 1024, 1024, true);
  for (const dir of fs.readdirSync(res).filter(name => /^mipmap-(ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(name))) {
    for (const name of fs.readdirSync(path.join(res, dir)).filter(name => /^ic_launcher.*\.png$/.test(name))) {
      const file = path.join(res, dir, name), { width, height } = await sharp(file).metadata();
      await raster(name.includes('foreground') ? icon(false) : name.includes('background') ? solid : icon(), file, width, height, !name.includes('foreground'));
    }
  }
  // These older fallback assets are kept consistent in case a platform generator is used.
  for (const folder of [path.join(root, 'assets'), ...fs.readdirSync(res).filter(name => name.startsWith('drawable')).map(name => path.join(res, name))]) {
    for (const name of fs.readdirSync(folder).filter(name => /^splash(-dark)?\.png$/.test(name))) {
      const file = path.join(folder, name), { width, height } = await sharp(file).metadata();
      const side = Math.round(Math.min(width, height) * .38);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path fill="${bg}" d="M0 0h${width}v${height}H0z"/><svg x="${(width-side)/2}" y="${(height-side)/2}" width="${side}" height="${side}" viewBox="0 0 108 108">${symbol}</svg></svg>`;
      await raster(svg, file, width, height, true);
    }
  }
  await raster(wordmark, path.join(res, 'drawable/aifect_wordmark.png'), 592, 144);
  write(path.join(res, 'drawable-v24/ic_launcher_foreground.xml'), fs.readFileSync(path.join(res, 'drawable/aifect_launcher_foreground.xml')));
  write(path.join(res, 'drawable/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="@color/aifect_icon_background" /></shape>\n`);
  write(path.join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">@color/aifect_icon_background</color></resources>\n`);
  json(path.join(catalog, 'Contents.json'), { info: { author: 'xcode', version: 1 } });
  const images = [];
  for (const [idiom, sizes, scales] of [['iphone', [20,29,40,60], [2,3]], ['ipad', [20,29,40,76], [1,2]], ['ipad', [83.5], [2]], ['ios-marketing', [1024], [1]]]) {
    for (const size of sizes) for (const scale of scales) {
      const filename = `icon-${idiom}-${size}@${scale}x.png`;
      await raster(icon(), path.join(catalog, 'AppIcon.appiconset', filename), size*scale, size*scale, true);
      images.push({ idiom, size: `${size}x${size}`, scale: `${scale}x`, filename });
    }
  }
  json(path.join(catalog, 'AppIcon.appiconset/Contents.json'), { images, info: { author: 'xcode', version: 1 } });
  for (const [name, svg, width, height] of [['AifectMark', icon(false), 108,108], ['AifectWordmark', wordmark,148,36]]) {
    const images = [];
    for (const scale of [1,2,3]) {
      const filename = `${name}@${scale}x.png`;
      await raster(svg, path.join(catalog, `${name}.imageset`, filename), width*scale, height*scale);
      images.push({ idiom:'universal', scale:`${scale}x`, filename });
    }
    json(path.join(catalog, `${name}.imageset/Contents.json`), { images, info:{author:'xcode',version:1}, properties:{'template-rendering-intent':'original'} });
  }
  console.log('Generated Android fallback icons, splash assets and ready-to-import iOS asset catalog.');
}
main().catch(error => { console.error(error); process.exitCode=1; });
