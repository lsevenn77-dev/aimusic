import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as AifectDubbing from '../shared/dubbing.js';

const source=readFileSync(new URL('../dist/dubbing.js',import.meta.url),'utf8');
const discovery=readFileSync(new URL('../dist/dub-discovery.js',import.meta.url),'utf8');
test('custom art works for unclassified scripts, and only a permitted original offers the picker',()=>{
 const c=vm.createContext({AifectDubbing,window:{addEventListener(){}},esc:String,icon:()=>''});
 vm.runInContext(source,c);vm.runInContext(discovery,c);
 const p={posterUrl:'/api/dubbing/projects/root/poster?v=new',canEditPoster:true,genres:[],script:{genres:['판타지']}};
 assert.match(c.dubPhoto(p),/src="\/api\/dubbing\/projects\/root\/poster\?v=new"/);
 assert.ok(c.dubbingDetailPoster(p).includes(p.posterUrl));
 assert.match(c.dubbingPosterPicker(p),/썸네일 변경/);
 assert.equal(c.dubbingPosterPicker({...p,isOwner:true,canEditPoster:false}),'');
 assert.ok(c.dubbingDetailPoster({...p,posterUrl:''}).includes(AifectDubbing.dubbingGenreArtwork(['판타지'])));
});
