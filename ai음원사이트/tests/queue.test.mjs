import test from 'node:test';
import assert from 'node:assert/strict';
import {insertTrack,removeTrack,moveTrack,clearWaiting,restoreQueue} from '../shared/queue.js';
test('queue edits preserve current playback, uniqueness and saved list inputs',()=>{
 const saved=['one','two','three'];assert.deepEqual(insertTrack(saved,'three','one','next'),['one','three','two']);assert.deepEqual(saved,['one','two','three']);
 assert.deepEqual(insertTrack(saved,'four','one','last'),['one','two','three','four']);assert.deepEqual(insertTrack(saved,'one','one','next'),saved);
 assert.deepEqual(insertTrack([],'one',null,'next'),['one']);assert.deepEqual(removeTrack(saved,'one','one'),saved);assert.deepEqual(removeTrack(saved,'two','one'),['one','three']);
 assert.deepEqual(moveTrack(saved,2,-1),['one','three','two']);assert.deepEqual(moveTrack(saved,0,-1),saved);assert.deepEqual(moveTrack(saved,999,-1),saved);
 assert.deepEqual(clearWaiting('one'),['one']);assert.deepEqual(clearWaiting(null),[]);
});
test('device queue restoration handles corruption and retains only matching display metadata',()=>{
 assert.deepEqual(restoreQueue('bad'),{ids:[],tracks:[]});assert.deepEqual(restoreQueue('null'),{ids:[],tracks:[]});
 assert.deepEqual(restoreQueue(JSON.stringify({ids:'one',tracks:[]})),{ids:[],tracks:[]});
 const d=restoreQueue(JSON.stringify({ids:['one','one','../private','two'],tracks:[{id:'one',title:'첫 곡',artist:'가수',lyrics:'not stored'},{id:'secret',title:'hidden'}]}));
 assert.deepEqual(d,{ids:['one','two'],tracks:[{id:'one',title:'첫 곡',artist:'가수'}]});
});
