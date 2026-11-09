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
test('shop carousel preserves the approved desktop artwork and uses separate mobile copy',()=>{
 const banner=readFileSync('public/images/shop/aifect_shop_banner_final.webp');
 assert.equal(banner.toString('ascii',8,12),'WEBP');assert.equal(banner.toString('ascii',12,16),'VP8 ');
 assert.equal(banner.readUInt16LE(26)&0x3fff,2172);assert.equal(banner.readUInt16LE(28)&0x3fff,469);
 const mobile=readFileSync('public/images/shop/aifect-store-banner-mobile.webp');
 assert.equal(mobile.toString('ascii',8,12),'WEBP');
 const js=readFileSync('dist/decorations.js','utf8');
 assert.match(js,/<section class="shop-banner home-content-refresh" id="shop-banner"/);
 assert.match(js,/<source media="\(min-width:801px\)" srcset="\/images\/shop\/aifect_shop_banner_final\.webp[^\"]*" width="2172" height="469">/);
 assert.ok(js.includes('src="/images/shop/aifect-store-banner-mobile.webp"'));
 assert.ok(js.includes('loading="eager" fetchpriority="high"'));
 assert.match(css,/\.shop-banner-intro-art img\{[^}]*object-fit:contain/);
 assert.match(css,/\[data-shop-banner=gifts\] \.shop-banner-copy\{display:none\}/);
 assert.match(css,/@media\(max-width:800px\)[\s\S]*\[data-shop-banner=gifts\] \.shop-banner-copy\{display:flex/);
 assert.ok(!js.includes('shop-banner-caption'),'mobile copy belongs inside the shared carousel frame');
 for(const unit of ['g','s']){const svg=readFileSync('dist/assets/shop/coin-'+unit+'.svg','utf8');assert.ok(svg.includes('<svg'));assert.ok(svg.includes('<radialGradient'));}
});

test('shop uses the shared page frame and Play carousel heights with zoom-safe search',()=>{
 const shared=readFileSync('dist/home-content.css','utf8');
 assert.match(shared,/\.home-content-refresh \.home-feature\{--home-feature-height:272px;/);
 assert.match(shared,/@media\(max-width:800px\)[\s\S]*--home-feature-height:224px/);
 assert.doesNotMatch(css,/\.shop-banner \.home-feature\{[^}]*(?:^|;)height:/);
 assert.doesNotMatch(css,/--main-frame-gutter\s*:/,'shop must inherit the common page gutter at every breakpoint');
 assert.doesNotMatch(css,/--shop-play-(?:gutter|top)/,'banner and products must use the same frame without duplicate sizing tokens');
 assert.match(css,/\.shop-banner\{[^}]*margin:0;/);
 assert.match(css,/@media\(max-width:800px\)\{\s*\.shop-page \.shop-banner\{margin-inline:calc\(-1 \* var\(--main-frame-gutter,20px\)\)\}/);
 assert.match(css,/@media\(max-width:800px\)\{#main:has\(>\.shop-page\)\{--main-frame-top:0px;/);
 assert.match(css,/\.shop-item-search input\{height:38px;font-size:16px/);
 assert.ok(!css.includes('.is-silver .shop-card-buy'));
 assert.ok(css.includes('.page-wrap:has(>main>.shop-page)::before'));
});
