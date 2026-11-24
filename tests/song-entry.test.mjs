import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {nicknameContext} from './nickname-context.mjs';
const source=readFileSync(new URL('../dist/song-entry.js',import.meta.url),'utf8');
function setup(){
 const c=nicknameContext({document:{addEventListener(){}},me:{id:'owner'},URLSearchParams,esc:String,time:()=> '0:45',cover:()=>'<img>',credits:()=> '가수',icon:n=>'<i data-icon="'+n+'"></i>',number:String});
 vm.runInContext(source,c);return c;
}
test('song entry replaces the chooser and retains distinct solo, duet, joining and draft routes',()=>{
 const c=setup();assert(c.isSongEntryRoute('sing/one'));assert(c.isSongEntryRoute('#sing/one'));
 for(const q of ['?duet=invitation','?draft=1','?mode=solo','?mode=duet'])assert(!c.isSongEntryRoute('sing/one'+q));
 const html=c.songEntryHeaderHTML({id:'one',title:'노래',karaoke_ready:true});assert.match(html,/#sing\/one\?mode=solo/);assert.match(html,/#sing\/one\?mode=duet/);assert.match(html,/원곡 듣기/);assert.match(html,/data-play="one"/);
 assert(!readFileSync(new URL('../dist/karaoke.js',import.meta.url),'utf8').includes('function openRecordingMode'));
});
test('tabs have exact names, distinct error/empty states and account-scoped retained state',()=>{
 const c=setup();vm.runInContext(readFileSync(new URL('../dist/song-covers.js',import.meta.url),'utf8'),c);
 const d={view:'all',covers:[],counts:{all:0,duet:0,recent:0},next_offset:null},html=c.songEntryPanelHTML({id:'one'},d,'all');assert.match(html,/인기커버/);assert.match(html,/참여 대기 듀엣/);assert.doesNotMatch(html,/인기순/);assert.match(html,/아직 등록된 커버가 없습니다/);
 assert.match(c.songEntryListHTML({...d,view:'duet'},'duet'),/참여를 기다리는 듀엣이 없습니다/);
 const failure=c.songEntryPanelHTML({id:'one'},null,'all','연결 오류');assert.match(failure,/role="alert"/);assert.doesNotMatch(failure,/song-cover-tab-count|아직 등록된/);
 c.songEntryState('one').tab='duet';assert.equal(c.songEntryState('one').tab,'duet');c.me={id:'other'};assert.equal(c.songEntryState('one').tab,'all');
});
test('returning from recording preserves the original entry source and returns to its history entry',async()=>{
 const c=setup(),visited=[];
 c.window={navigation:{entries:()=>[{key:'song-story'}],traverseTo:key=>({finished:Promise.resolve(visited.push(key))})}};c.location={hash:'#sing/one'};
 c.rememberSongEntryOrigin('one','#song/one','song-story');
 c.rememberSongEntryOrigin('one','#sing/one?mode=solo','recorder');
 assert.equal(c.songEntryState('one').origin,'#song/one');
 c.returnFromSongEntry('one');assert.deepEqual(visited,['song-story']);
 c.window={};c.returnFromSongEntry('one');assert.equal(c.location.hash,'#song/one');
 c.returnFromSongEntry('two');assert.equal(c.location.hash,'#song/two');
});
