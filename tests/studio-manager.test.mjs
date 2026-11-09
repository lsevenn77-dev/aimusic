import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fixture} from './fixture.mjs';

const script=readFileSync(new URL('../dist/studio-manager.js',import.meta.url),'utf8');
const media=readFileSync(new URL('../server/media.js',import.meta.url),'utf8');
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function sampleTracks(n=3){
 return Array.from({length:n},(_,i)=>({id:'work-'+i,title:'작품 '+i,kind:i%2?'cover':'original',status:i%3===0?'published':i%3===1?'hidden':'queued'}));
}
function sandbox(tracks){
 const section=s=>`<div class="section-heading">${s}</div>`;
 const ctx={
  studioData:{tracks:[...tracks],track_total:tracks.length,artists:[],producer:null,upload_quota:{used:1,limit:3,remaining:2}},
  member:{plan:'free'},
  studioHTML:()=>`<div class="legacy">legacy</div>${section('내 프로필')}<form id="producer-form">프로필</form>${section('AI 가수 · 아티스트 프로필')}<div class="artist-editors">아티스트</div>`,
  bindStudioForms(){},section,icon:()=>'+',cover:t=>`<span class="mini-cover">${esc(t.title)}</span>`,
  number:n=>String(n),esc,Set,Object,Number,Array,document:{querySelector:()=>null},api:async()=>({tracks:[]}),
 };
 runInNewContext(script,ctx);
 return ctx;
}

test('single and bulk confirmations preserve target scope and deletion safeguards without duplicate titles',async()=>{
 const tracks=[{id:'one',title:'Do not repeat this title',kind:'original',status:'published'},{id:'two',title:'Other title',kind:'original',status:'published'}];
 const ctx=sandbox(tracks),form={};let html='';
 ctx.me={id:'owner'};ctx.studioSyncBulk=()=>{};ctx.dialog=value=>{html=value;};ctx.busyForm=(_form,handler)=>handler;ctx.toast=message=>{throw Error(message);};
 ctx.document={querySelector:()=>({isConnected:true}),getElementById:()=>form};
 const state=runInNewContext('studioManage',ctx);state.type='original';
 await ctx.studioBulkDialog('hide','one');
 assert.match(html,/이 작품을 비공개하시겠습니까\?/);assert.match(html,/>비공개 처리<\/button>/);
 assert.doesNotMatch(html,/<h2>|Do not repeat|선택한 작품만|공개 목록과 검색/);
 state.selected=new Set(['one','two']);await ctx.studioBulkDialog('hide');
 assert.match(html,/선택한 작품 2개를 비공개하시겠습니까/);
 await ctx.studioBulkDialog('delete','one');
 assert.match(html,/삭제하면 복구할 수 없습니다/);assert.match(html,/연결된 노래방·다른 회원의 커버곡/);assert.match(html,/name="verify"/);
 await assert.rejects(form.onsubmit(new Map([['verify','wrong']])),/삭제를 정확히/);
});
test('studio tabs isolate inventory and status summaries below the shared quota banner',()=>{
 const ctx=sandbox(sampleTracks(6));
 const html=ctx.studioHTML(ctx.studioData);
 assert.equal((html.match(/role="tab"/g)||[]).length,2);
 assert.match(html,/전체 제작곡<\/span><strong>3/);
 assert.match(html,/업로드·변환 중<\/span><span class="studio-stat-label-compact">처리 중<\/span><strong>1/);
 assert.match(html,/이번 달 제작곡 정보를 확인하고 있어요/);
 assert.doesNotMatch(html,/PREMIUM 업그레이드|href="#membership"/,'the cached global plan is not an entitlement response');
 assert.match(html,/href="#upload"/);
 assert.doesNotMatch(html,/data-studio-select="work-1"|정산 내역|id="producer-form"|artist-editors/);
 ctx.member.plan='premium';ctx.studioData.upload_quota={used:11,limit:10,remaining:0};
 const paid=ctx.studioQuotaCard({plan:'premium',upload_quota:{...ctx.studioData.upload_quota,covers_unlimited:true}},'ready');
 assert.match(paid,/11 \/ 10/);assert.match(paid,/style="--studio-quota-progress:100%"/);assert.doesNotMatch(paid,/href="#membership"/);
 ctx.studioResetFilters('cover');ctx.member.plan='free';
 const covers=ctx.studioHTML(ctx.studioData);
 assert.match(covers,/전체 커버곡<\/span><strong>3/);
 assert.doesNotMatch(ctx.studioWorksHTML(ctx.studioData),/업로드·변환 중|이번 달 제작곡|PREMIUM|data-studio-select="work-0"/);
 assert.match(covers,/data-studio-select="work-1"/);
});
test('kind, status and keyword filters restrict the visible works',()=>{
 const ctx=sandbox(sampleTracks(6));
 const state=runInNewContext('studioManage',ctx);
 state.type='cover';state.status='hidden';state.search='작 품1';
 assert.deepEqual(ctx.studioFiltered().map(t=>t.id),['work-1']);
 state.search='없는 제목';assert.equal(ctx.studioFiltered().length,0);
 state.selected.add('work-1');ctx.studioResetFilters('original');
 assert.equal(state.selected.size,0);assert.equal(state.search,'');assert.equal(state.status,'all');
 state.status='processing';
 assert.deepEqual(ctx.studioFiltered().map(t=>t.id),['work-2']);
});

test('status tabs preserve failed and moderator-hidden searches without a duplicate dropdown',()=>{
 const tracks=['published','hidden','queued','failed','removed'].map((status,i)=>({id:'state-'+i,title:'같은 제목',kind:'original',status}));
 const ctx=sandbox(tracks),state=runInNewContext('studioManage',ctx);
 const html=ctx.studioHTML(ctx.studioData);
 assert.doesNotMatch(html,/<select|data-studio-status|전체 상태/);
 for(const status of ['all','published','hidden','processing','failed','removed'])assert.match(html,new RegExp('data-studio-filter="'+status+'"'));
 state.search='같 은제목';
 for(const status of ['failed','removed']){
  state.status=status;
  assert.equal(ctx.studioFiltered().length,1);
  assert.equal(ctx.studioFiltered()[0].status,status);
  assert.match(ctx.studioHTML(ctx.studioData),new RegExp('data-studio-filter="'+status+'" aria-pressed="true"'));
 }
 state.search='다른 제목';assert.equal(ctx.studioFiltered().length,0);
 ctx.studioData.tracks=[];
 assert.match(ctx.studioHTML(ctx.studioData),/data-studio-filter="removed" aria-pressed="true"/);
});

function controls(ctx){
 const nodes=Object.fromEntries(['[data-studio-select-all]','.studio-selected-count','.studio-bulk-actions',...['hide','delete','all-delete'].map(k=>'[data-studio-bulk="'+k+'"]')].map(k=>[k,{}]));
 nodes['.studio-filters']={classList:{toggle(name,value){this[name]=value;}}};
 nodes['[data-studio-search]']={value:'',focus(){this.focused=true;}};
 nodes['[data-studio-search-action="open"]']={setAttribute(name,value){this[name]=value;},focus(){this.focused=true;}};
 const inputs=ctx.studioData.tracks.map(t=>({dataset:{studioSelect:t.id},checked:false,closest(){return {classList:{toggle(){}}};}}));
 const events={},root={dataset:{},isConnected:true,querySelector:s=>nodes[s]||null,querySelectorAll:s=>s==='[data-studio-select]'?inputs:[],addEventListener:(name,fn)=>events[name]=fn};
 const area={innerHTML:''};
 ctx.document={querySelector:s=>s==='[data-studio-root]'?root:s.endsWith('.studio-list-area')?area:null};
 ctx.bindStudioManager();
 return {nodes,inputs,root,events,area};
}

test('mobile search opens with focus, keeps filters and selection, and closing clears only the keyword filter',async()=>{
 const ctx=sandbox(sampleTracks(5)),state=runInNewContext('studioManage',ctx),ui=controls(ctx);
 const click=action=>ui.events.click({target:{closest:()=>({dataset:{studioSearchAction:action}})},preventDefault(){},stopPropagation(){}});
 const input=ui.nodes['[data-studio-search]'],toggle=ui.nodes['[data-studio-search-action="open"]'];
 state.status='hidden';state.selected.add('work-4');ctx.studioSyncBulk();
 assert.equal(state.searchOpen,false);
 await click('open');
 assert.equal(state.searchOpen,true);assert.equal(input.focused,true);assert.equal(toggle['aria-expanded'],'true');
 assert.equal(state.status,'hidden');assert.equal(state.selected.size,1);assert.equal(ui.nodes['.studio-bulk-actions'].hidden,false);
 await click('close');
 assert.equal(state.selected.size,1,'closing an empty search should not lose selection');
 await click('open');
 input.value='없는 곡';ui.events.input({target:{matches:()=>true,value:input.value}});
 assert.match(ui.area.innerHTML,/해당하는 작품이 없습니다/);assert.equal(state.selected.size,0);
 await click('close');
 assert.equal(input.value,'');assert.equal(state.search,'');assert.equal(state.status,'hidden');
 assert.equal(state.searchOpen,false);assert.equal(toggle['aria-expanded'],'false');assert.equal(toggle.focused,true);
 assert.match(ui.area.innerHTML,/data-studio-select="work-4"/);assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
});

test('desktop keywords stay exposed on narrowing; Escape ignores composition and only closes mobile search',()=>{
 const ctx=sandbox(sampleTracks(5)),state=runInNewContext('studioManage',ctx),ui=controls(ctx);
 ui.events.input({target:{matches:()=>true,value:'작품'}});
 assert.equal(state.searchOpen,true);
 assert.match(ctx.studioHTML(ctx.studioData),/studio-filters is-search-open/);
 let mobile=false;ctx.matchMedia=()=>({matches:mobile});
 const key={key:'Escape',isComposing:false,target:{matches:()=>true,closest:()=>null},preventDefault(){}};
 ui.events.keydown(key);assert.equal(state.search,'작품');
 mobile=true;ui.events.keydown({...key,isComposing:true});assert.equal(state.search,'작품');
 ui.events.keydown(key);assert.equal(state.search,'');assert.equal(state.searchOpen,false);
 state.searchOpen=true;ctx.studioResetFilters('cover');assert.equal(state.searchOpen,false);
});

test('bulk actions follow individual/select-all checkboxes, zero selection and refreshed inventory',()=>{
 const ctx=sandbox(sampleTracks(5)),state=runInNewContext('studioManage',ctx),ui=controls(ctx);
 assert.match(ctx.studioHTML(ctx.studioData),/class="studio-bulk-actions" hidden/);
 assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
 const change=(selector,checked,id)=>ui.events.change({target:{matches:s=>s===selector,checked,dataset:{studioSelect:id}}});
 change('[data-studio-select]',true,'work-0');
 assert.equal(ui.nodes['.studio-bulk-actions'].hidden,false);
 assert.equal(ui.nodes['.studio-selected-count'].textContent,'1개 선택');
 assert.equal(ui.nodes['[data-studio-select-all]'].indeterminate,true);
 assert.equal(ui.nodes['[data-studio-bulk="hide"]'].disabled,false);
 change('[data-studio-select]',false,'work-0');
 assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
 change('[data-studio-select-all]',true);
 assert.equal(state.selected.size,3);assert.equal(ui.nodes['[data-studio-select-all]'].checked,true);
 change('[data-studio-select-all]',false);
 assert.equal(state.selected.size,0);assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
 change('[data-studio-select]',true,'work-4');
 assert.equal(ui.nodes['[data-studio-bulk="hide"]'].disabled,true);
 assert.equal(ui.nodes['[data-studio-bulk="delete"]'].disabled,false);
 assert.equal(ui.nodes['[data-studio-bulk="all-delete"]'].disabled,false);
 state.loading=true;ctx.studioSyncBulk();
 assert.equal(ui.nodes['[data-studio-bulk="delete"]'].disabled,true);
 state.loading=false;ctx.studioData.tracks=ctx.studioData.tracks.filter(t=>t.id!=='work-4');ctx.studioSyncBulk();
 assert.equal(state.selected.size,0);assert.equal(ui.inputs[4].checked,false);
 assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
});

test('filter clicks and search input immediately clear selection and preserve the other filter',async()=>{
 const ctx=sandbox(sampleTracks(5)),state=runInNewContext('studioManage',ctx),ui=controls(ctx);
 state.selected.add('work-0');state.search='작품';
 const button={dataset:{studioFilter:'hidden'}};
 await ui.events.click({target:{closest:()=>button},preventDefault(){},stopPropagation(){}});
 assert.equal(state.status,'hidden');assert.equal(state.search,'작품');assert.equal(state.selected.size,0);
 assert.match(ui.area.innerHTML,/data-studio-select="work-4"/);assert.doesNotMatch(ui.area.innerHTML,/data-studio-select="work-0"/);
 assert.equal(ui.nodes['.studio-bulk-actions'].hidden,true);
 state.selected.add('work-4');
 ui.events.input({target:{matches:()=>true,value:'없는 곡'}});
 assert.equal(state.status,'hidden');assert.equal(state.selected.size,0);assert.match(ui.area.innerHTML,/해당하는 작품이 없습니다/);
});

test('all-delete still loads the full filtered inventory and requires typed confirmation',async()=>{
 const tracks=[{id:'a',title:'대상 A',kind:'original',status:'published'},{id:'b',title:'대상 B',kind:'original',status:'published'},{id:'c',title:'대상 C',kind:'original',status:'hidden'},{id:'d',title:'대상 D',kind:'cover',status:'published'}];
 const ctx=sandbox(tracks.slice(0,1)),state=runInNewContext('studioManage',ctx);controls(ctx);
 state.status='published';state.search='대상';state.selected.add('a');ctx.me={id:'owner'};
 const calls=[];ctx.api=async url=>{calls.push(url);return {tracks:url==='/api/studio'?tracks.slice(0,1):tracks.slice(1),track_total:4};};
 let html='',submit;ctx.dialog=value=>html=value;ctx.busyForm=(_form,fn)=>(submit=fn);ctx.document.getElementById=()=>({});
 await ctx.studioBulkDialog('all-delete');
 assert.deepEqual(calls,['/api/studio','/api/studio?offset=1']);
 assert.match(html,/현재 목록의 작품 2개를 삭제하시겠습니까/);assert.match(html,/현재 필터와 검색 결과의 모든 작품/);
 assert.match(html,/연결된 노래방·다른 회원의 커버곡/);assert.match(html,/name="verify"/);
 await assert.rejects(submit({get:()=>''}),/삭제를 정확히 입력/);
});
test('track titles are escaped in work rows',()=>{
 const tracks=[{id:'x',title:'<img src=x onerror=alert(1)>',kind:'original',status:'published'}];
 const ctx=sandbox(tracks),html=ctx.studioHTML(ctx.studioData);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/&lt;img src=x/);
});
test('load-all fetches every page before full deletion is possible',async()=>{
 const all=sampleTracks(205);
 const ctx=sandbox(all.slice(0,100));ctx.studioData.track_total=205;
 const requested=[];
 ctx.api=async url=>{requested.push(url);const offset=Number(new URL(url,'https://unit.local').searchParams.get('offset'));return {tracks:all.slice(offset,offset+100),track_total:205};};
 await runInNewContext('studioLoadComplete()',ctx);
 assert.equal(ctx.studioData.tracks.length,205);
 assert.deepEqual(requested,['/api/studio?offset=100','/api/studio?offset=200']);
});
test('empty pagination aborts rather than silently deleting an incomplete list',async()=>{
 const ctx=sandbox(sampleTracks(2));ctx.studioData.track_total=3;
 await assert.rejects(runInNewContext('studioLoadComplete()',ctx),/전부 불러오지 못했어요/);
});
test('studio API retains owner constraint, excludes deleted rows and pages with bound offset',()=>{
 assert.match(media,/t\.user_id=\? AND t\.status!='deleted'/);
 assert.match(media,/LIMIT 100 OFFSET \?/);
 assert.match(media,/track_total:Number/);
});

test('studio pages span the real uploader’s historical originals and covers, independent of the displayed producer',async t=>{
 const {call,sql}=await fixture(t);
 const insert=sql.prepare("INSERT INTO tracks(id,user_id,artist_id,producer_id,title,genre,ai_tool,rights_accepted,original_ext,original_bytes,created,status,kind,original_id) VALUES(?,?,'artist','producer',?,'Rock','QA',1,'wav',128,1,?,?,?)");
 for(let i=0;i<205;i++)insert.run('legacy-'+i,'other','기존 작품 '+i,i%3?'published':'hidden',i%2?'original':'cover',i%2?null:'one');
 insert.run('deleted-owned','other','삭제한 곡','deleted','original',null);
 const ids=[];
 for(const offset of [0,100,200]){
  const {status,body}=await call('/api/studio?offset='+offset,'GET',undefined,'other');
  assert.equal(status,200);assert.equal(body.track_total,205);ids.push(...body.tracks.map(t=>t.id));
 }
 assert.equal(ids.length,205);assert.equal(new Set(ids).size,205);assert.ok(ids.every(id=>id.startsWith('legacy-')));
 assert.equal((await call('/api/studio?offset=100','GET',undefined,null)).status,401);
 assert.equal((await call('/api/studio?offset=-1')).status,400);
});

test('restore reuses a hidden rendition; failed conversions retry separately and removal cannot be reversed by the uploader',async t=>{
 const {call,sql}=await fixture(t,{BUCKET:{async head(){return {size:128};}}});
 assert.equal((await call('/api/uploads/hidden/retry','POST',undefined,'other')).status,404);
 assert.equal((await call('/api/uploads/hidden/retry','POST')).body.status,'published');
 assert.equal((await call('/api/tracks/hidden')).status,200);
 sql.exec("UPDATE tracks SET status='failed' WHERE id='two'; UPDATE tracks SET status='removed' WHERE id='three'");
 assert.equal((await call('/api/uploads/two/retry','POST')).body.status,'queued');
 assert.equal((await call('/api/uploads/three/retry','POST')).status,409);
 assert.equal(sql.prepare("SELECT status FROM tracks WHERE id='three'").get().status,'removed');
});
