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
test('final WebP banner preserves its full ratio and has no duplicate overlay',()=>{
 const banner=readFileSync('public/images/shop/aifect_shop_banner_final.webp');
 assert.equal(banner.toString('ascii',8,12),'WEBP');assert.equal(banner.toString('ascii',12,16),'VP8 ');
 assert.equal(banner.readUInt16LE(26)&0x3fff,2172);assert.equal(banner.readUInt16LE(28)&0x3fff,469);
 assert.match(css,/\.shop-banner img\{[^}]*width:100%;height:auto;aspect-ratio:2172\/469;object-fit:contain;[^}]*border-radius:0/);
 const js=readFileSync('dist/decorations.js','utf8');assert.ok(js.includes('/images/shop/aifect_shop_banner_final.webp?v=115d346082e4" width="2172" height="469"'));
 assert.ok(!js.includes('shop-banner-copy'));assert.ok(!js.includes('aifect-store-banner-mobile.webp'));
 assert.ok(js.includes('loading="eager" fetchpriority="high"'));assert.ok(js.includes('프레임 · 배지 · 효과 · 이모티콘 · 테마 등'));
 for(const unit of ['g','s']){const svg=readFileSync('dist/assets/shop/coin-'+unit+'.svg','utf8');assert.ok(svg.includes('<svg'));assert.ok(svg.includes('<radialGradient'));}
});

test('mobile banner has no forced crop or height and search preserves zoom-safe input size',()=>{
 assert.ok(!css.includes('shop-banner-copy'));assert.ok(!css.includes('aspect-ratio:1080/512'));
 assert.match(css,/\.shop-item-search input\{height:38px;font-size:16px/);
 assert.ok(!css.includes('.is-silver .shop-card-buy'));
 assert.ok(css.includes('.page-wrap:has(>main>.shop-page)::before'));
});
