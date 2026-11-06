import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('dist/shop.css','utf8');
test('responsive grid uses eight desktop and four mobile columns without shelf scrollbars',()=>{
 for(const n of [8,6,5,4])assert.ok(css.includes('grid-template-columns:repeat('+n+',minmax(0,1fr))'));
 assert.match(css,/@media\(min-width:1280px\)\{\.shop-page \.shop-products\{grid-template-columns:repeat\(8/);
 assert.match(css,/@media\(max-width:767px\)[\s\S]*\.shop-products\{grid-template-columns:repeat\(4/);
 assert.ok(!/\.shop-products\{[^}]*repeat\([23],minmax\(0,1fr\)\)/.test(css));
 assert.ok(!/overflow-x:auto|scroll-snap|shop-scrollbar/.test(css));assert.match(css,/\.shop-card\[hidden\]\{display:none\}/);
});
test('responsive WebP banners preserve the supplied dimensions and mobile HTML copy',()=>{
 const pc=readFileSync('public/images/shop/aifect-store-banner-pc.png'),mobile=readFileSync('public/images/shop/aifect-store-banner-mobile.png');
 assert.equal(pc.readUInt32BE(16),2400);assert.equal(pc.readUInt32BE(20),413);assert.equal(mobile.readUInt32BE(16),1080);assert.equal(mobile.readUInt32BE(20),512);
 for(const kind of ['pc','mobile'])assert.equal(readFileSync('public/images/shop/aifect-store-banner-'+kind+'.webp').toString('ascii',8,12),'WEBP');
 assert.match(css,/\.shop-banner img\{[^}]*width:100%;height:auto;aspect-ratio:2400\/413;object-fit:contain;[^}]*border-radius:0/);
 assert.match(css,/\.shop-banner-copy\{display:none\}/);assert.match(css,/aspect-ratio:1080\/512/);
 const js=readFileSync('dist/decorations.js','utf8');assert.ok(js.includes('media="(max-width:767px)" srcset="/images/shop/aifect-store-banner-mobile.webp"'));
 assert.ok(js.includes('loading="eager" fetchpriority="high"'));assert.ok(js.includes('프레임 · 배지 · 효과 · 이모티콘 · 테마 등'));
 for(const unit of ['g','s']){const svg=readFileSync('dist/assets/shop/coin-'+unit+'.svg','utf8');assert.ok(svg.includes('<svg'));assert.ok(svg.includes('<radialGradient'));}
});

test('mobile copy is inside the compact banner and search preserves zoom-safe input size',()=>{
 assert.match(css,/\.shop-banner\{position:relative;height:clamp\(140px,39vw,165px\)/);
 assert.match(css,/\.shop-banner-copy\{position:relative;display:flex/);
 assert.match(css,/\.shop-item-search input\{height:38px;font-size:16px/);
 assert.ok(!css.includes('.is-silver .shop-card-buy'));
 assert.ok(css.includes('.page-wrap:has(>main>.shop-page)::before'));
});
