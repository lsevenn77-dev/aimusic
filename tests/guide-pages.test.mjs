import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPage } from '../server/public-pages.js';
import { guidePresentation } from '../server/guide-pages.js';
import { brandPublicDocument } from '../shared/web-brand.js';
import { BUSINESS,PREMIUM,APP_PREMIUM } from '../shared/site-info.js';
import { WEB_GOLD_PACKS } from '../shared/gifts.js';

const original=path=>brandPublicDocument(publicPage(path));
const render=path=>guidePresentation(original(path),path);
const links=s=>[...s.matchAll(/<a\b[^>]* href="([^"]+)"/g)].map(m=>m[1]);
test('privacy retains the exact effective note, complete disclosure and anchors, including notices added later',()=>{
  const source=original('/privacy').replace('</main>','<section id="future"><h2>11. 추가 고지</h2><p>추가 안내</p></section></main>');
  const page=guidePresentation(source,'/privacy');
  const [,date,legal]=source.match(/<\/nav>(<p class="legal-fine">[^<]+<\/p>)([\s\S]*?)<\/main>/);
  assert.ok(page.includes(date));assert.ok(page.includes('<article class="guide-clauses">'+legal+'</article>'));
  for(const [,id] of legal.matchAll(/<section id="([^"]+)"/g)) assert.ok(page.includes('href="#'+id+'"'));
});
test('terms and refunds retain every byte of the effective notice and policy body, including nested anchors and the refund formula',()=>{
  for(const path of ['/terms','/refund']){
    const src=original(path), html=render(path);
    const [,date,body]=src.match(/<\/nav>(<p class="legal-fine">[^<]+<\/p>)([\s\S]*?)<\/main>/);
    assert.ok(html.includes(date));
    assert.ok(html.includes('<article class="guide-clauses">'+body+'</article>'));
    for(const [,id] of body.matchAll(/<section id="([^"]+)"/g)){
      assert.ok(html.includes('href="#'+id+'"'));
    }
  }
});
test('five branded documents retain SEO, shared links and canonical current tabs; other routes keep their original',()=>{
  for(const path of ['/privacy','/contact','/pricing','/terms','/refund']){
    const src=original(path),html=guidePresentation(src,path+'/');
    assert.ok(html.includes('class="legal-site guide-page"'));
    for(const regex of [/<title>.*?<\/title>/,/<meta name="description"[^>]+>/,/<link rel="canonical"[^>]+>/,/<footer[\s\S]*?<\/footer>/])assert.ok(html.includes(src.match(regex)[0]));
    assert.ok(html.includes('href="'+path+'" aria-current="page"'));
    for(const link of links(src))assert.ok(links(html).includes(link),link);
  }
  for (const path of ['/business','/pricing/app']) assert.equal(render(path),original(path));
});
test('comparison discloses both channel prices without enabling recurring sales; review links are separate from real products',()=>{
  const html=render('/pricing');
  assert.ok(html.includes(PREMIUM.price.toLocaleString('ko-KR')));assert.ok(html.includes(APP_PREMIUM.price.toLocaleString('ko-KR')));
  assert.match(html,/data-sales="false" href="\/#membership"/);
  assert.match(html,/웹 Premium 신규 가입 준비 중/);
  assert.doesNotMatch(html,/추천 플레이리스트 저장|공개 목록 저장/);
  assert.match(html,/음색 보정 · 구간 재녹음/);
  const review=html.match(/<aside class="guide-review"[^>]*>([\s\S]*?)<\/aside>/)[1];
  assert.match(review,/href="\/checkout\/toss\/gold"/);
  assert.doesNotMatch(html.replace(review,''),/href="\/checkout\/toss/);
  for(const p of WEB_GOLD_PACKS)assert.ok(html.includes('/#gold?pack='+p.gold));
  for(const limit of ['월 3곡','월 10곡','최대 2개','최대 10개'])assert.ok(html.includes(limit));
});
test('contact provides five distinct addressed messages, a plain address and recovery paths without a submission form',()=>{
  const html=render('/contact'),cards=html.match(/<article class="guide-card guide-request">[\s\S]*?<\/article>/g);
  assert.equal(cards.length,5);
  const subjects=cards.map(card=>new URL(links(card)[0]));
  assert.ok(subjects.every(u=>u.protocol==='mailto:'&&u.pathname===BUSINESS.email));
  assert.equal(new Set(subjects.map(u=>u.searchParams.get('subject'))).size,5);
  assert.ok(html.includes('data-copy-email="'+BUSINESS.email+'"'));assert.doesNotMatch(html,/<form\b/);
});
