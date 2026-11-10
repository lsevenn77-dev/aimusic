import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/sing-drafts.js',import.meta.url),'utf8');
const page=source.match(/function karaokeDraftsHTML\(drafts\)\{[\s\S]*?(?=\n\n\/\/ Delete only)/)?.[0];
const update=source.match(/function updateDraftLibrary\(root\)\{[\s\S]*?(?=\ndocument\.addEventListener\('input')/)?.[0];
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

test('draft page uses the approved list, real resume links and escaped account data',()=>{
 assert.ok(page,'draft page function exists');
 const render=vm.runInNewContext(page+'\nkaraokeDraftsHTML',{me:{id:'owner1'},heading:t=>'<h1>'+t+'</h1>',esc:escape,icon:n=>'<svg>'+n+'</svg>',time:()=>'0:30',encodeURIComponent,Date,Number});
 const html=render([
  {draftKey:'owner1:abc',id:'abc',title:'별 <img onerror="alert(1)">',artist:'DO NOT SHOW ARTIST',mode:'solo',part:'male',duration:30,updated:1794000000000},
  {draftKey:'owner1:def:duet:female:parent42',id:'def',title:'듀엣 테스트',artist:'DO NOT SHOW ARTIST',mode:'duet',part:'female',parent:'parent42',duration:50,updated:1794100000000}
 ]);
 for(const selector of ['data-draft-search','data-draft-sort','data-draft-select-all','data-draft-delete-selected','data-delete-draft','data-draft-list']) assert.ok(html.includes(selector),selector);
 assert.ok(html.includes('#sing/abc?mode=solo&amp;part=male&amp;draft=1')||html.includes('#sing/abc?mode=solo&part=male&draft=1'));
 assert.ok(html.includes('duet=parent42'));
 assert.ok(html.includes('별 &lt;img onerror=&quot;alert(1)&quot;&gt;'));
 assert.equal(html.includes('<img onerror='),false);
 assert.equal(html.includes('DO NOT SHOW ARTIST'),false);
 assert.equal(html.includes('전체 삭제'),false);
 assert.equal((html.match(/class="draft-list-row"/g)||[]).length,2);
 const empty=render([]);
 assert.ok(empty.includes('저장된 초안이 없어요'));
 assert.ok(empty.includes('data-draft-select-all'));
});

test('draft search, sort and bulk state keep selection across filters',()=>{
 assert.ok(update,'draft interaction logic exists');
 const refresh=vm.runInNewContext(update+'\nupdateDraftLibrary',{Number});
 const mk=(name,date)=>{const input={checked:false};return {dataset:{draftTitle:name,draftUpdated:String(date)},hidden:false,
  input,classList:{toggle(k,v){this[k]=v}},querySelector:()=>input};};
 const first=mk('별일 아닌 것처럼',50),second=mk('듀엣 테스트',100),third=mk('느린 밤',10);
 let nodes=[first,second,third];
 const list={querySelectorAll:()=>nodes.slice(),appendChild(row){nodes=nodes.filter(x=>x!==row);nodes.push(row)}};
 const search={value:'듀엣'},sort={value:'recent'},all={checked:false,indeterminate:false,disabled:false};
 const count={textContent:''},remove={disabled:true},noMatch={hidden:true};
 const lookup={'[data-draft-list]':list,'[data-draft-sort]':sort,'[data-draft-search]':search,
  '[data-draft-select-all]':all,'[data-draft-selected-count]':count,'[data-draft-delete-selected]':remove,
  '[data-draft-filter-empty]':noMatch};
 const root={querySelector:key=>lookup[key]};
 refresh(root);
 assert.equal(second.hidden,false);
 assert.equal(first.hidden,true);
 assert.equal(third.hidden,true);
 second.input.checked=true;refresh(root);
 assert.equal(count.textContent,'선택 1개');
 assert.equal(remove.disabled,false);
 assert.equal(all.checked,true);
 search.value='없는 검색';refresh(root);
 assert.equal(count.textContent,'선택 1개');
 assert.equal(noMatch.hidden,false);
 assert.equal(all.disabled,true);
 search.value='';sort.value='oldest';refresh(root);
 assert.deepEqual(nodes,[third,first,second]);
 assert.equal(all.indeterminate,true);
});
