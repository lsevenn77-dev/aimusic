import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as AifectLyrics from '../shared/lyrics.js';
import * as AifectAlignment from '../shared/alignment.js';

function input(value=''){
 return {value,selectionStart:value.length,selectionEnd:value.length,selectionDirection:'none',listeners:{},dataset:{},children:[],isConnected:true,
  setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;},
  addEventListener(name,handler){this.listeners[name]=handler;},removeAttribute(){},matches(selector){return selector==='.lyric-text-input';}};
}
function editor(initial=''){
 const elements=new Map();
 for(const id of ['lyrics-editor','lyrics-source','lyrics-audio','lyrics-rows','lyrics-editor-error','lyrics-mode','lyrics-build','lyrics-file','lyrics-preview-play','lyrics-preview-seek','lyrics-stamp-next','auto-lyrics-editor','auto-lyrics-source','auto-lyrics-language','alignment-error','alignment-status','auto-lyrics-file','lyrics-cleanup-note'])elements.set('#'+id,input());
 elements.get('#lyrics-editor').dataset.duration='1200';
 elements.get('#auto-lyrics-editor').dataset.job='null';elements.get('#auto-lyrics-editor').dataset.track='';
 elements.set('#auto-lyrics-source',input(initial));elements.get('#auto-lyrics-language').value='ko';
 const c=vm.createContext({AifectLyrics,AifectAlignment,audio:{addEventListener(){}},$:selector=>elements.get(selector)||null,esc:s=>s,setTimeout,clearTimeout,FormData});
 for(const file of ['alignment.js','lyrics.js'])vm.runInContext(readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),c);
 c.bindLyricsEditor();return {c,elements,auto:elements.get('#auto-lyrics-source'),manual:elements.get('#lyrics-source')};
}
function setValue(el,value){el.value=value;el.selectionStart=value.length;el.selectionEnd=value.length;}

test('actual auto editor clears existing labels, typed/pasted labels and submits only sung words',async()=>{
 const e=editor('[male]\n첫 가사'),source=e.auto;assert.equal(source.value,'\n첫 가사');
 setValue(source,'첫 [female][기타]가사\n[Chorus]다음 가사');source.oninput({isComposing:false});assert.equal(source.value,'첫 가사\n다음 가사');assert.equal(source.selectionStart,source.value.length);
 assert.match(e.elements.get('#lyrics-cleanup-note').textContent,/자동으로 지웠어요/);
 setValue(source,'[Guitar Solo]\n첫 가사');source.listeners.paste();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(source.value,'\n첫 가사');
 const fd=new FormData();fd.set('lyrics_mode','auto');e.c.applyLyrics(fd);assert.equal(fd.get('lyrics_source'),'첫 가사');
});

test('both editors wait for Korean composition and preserve directly timed LRC on entry',()=>{
 const e=editor();
 for(const source of [e.auto,e.manual]){
  setValue(source,'앞 [남성]뒤');source.oninput({isComposing:true});assert.equal(source.value,'앞 [남성]뒤');
  source.listeners.compositionend();assert.equal(source.value,'앞 뒤');assert.equal(source.selectionStart,3);
  setValue(source,'[00:12.500][male]안녕 [기타]');source.oninput({isComposing:false});assert.equal(source.value,'[00:12.500]안녕 ');
 }
 const fd=new FormData();fd.set('lyrics_mode','auto');assert.throws(()=>e.c.applyLyrics(fd),/LRC/,'time tags must not be silently lost in automatic mode');
});

test('editing an individual lyric row clears annotations without rebuilding and discarding row edits',()=>{
 const e=editor(),row=input('나의 [male]노래'),box=e.elements.get('#lyrics-rows');
 box.listeners.input({target:row,isComposing:false});assert.equal(row.value,'나의 노래');assert.equal(row.selectionStart,5);
 setValue(row,'나의 [female]노래');box.listeners.input({target:row,isComposing:true});assert.equal(row.value,'나의 [female]노래');
 box.listeners.compositionend({target:row});assert.equal(row.value,'나의 노래');assert.equal(vm.runInContext('lyricEditor.dirty',e.c),false);
});
