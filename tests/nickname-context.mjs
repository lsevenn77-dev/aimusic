import * as AifectPlaylist from '../shared/playlist-policy.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/user-nickname.js',import.meta.url),'utf8');
const hasArtistSource=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').split('\n').find(line=>line.startsWith('const hasArtist='));
const chatUI=readFileSync(new URL('../dist/chat-ui.js',import.meta.url),'utf8');
const roomTemplate=readFileSync(new URL('../dist/voice-room-template.js',import.meta.url),'utf8');
const chatGlyph=roomTemplate.slice(roomTemplate.indexOf('function voiceGlyph('),roomTemplate.indexOf('function voiceRoomHTML('));
// Renderer unit tests use the same shared component as the browser entry point.
export function nicknameContext(sandbox,options){
 sandbox.AifectPlaylist=AifectPlaylist;const context=vm.createContext(sandbox,options);
 vm.runInContext(source,context);
 vm.runInContext(chatUI,context);
 if(!('voiceGlyph' in sandbox))vm.runInContext(chatGlyph,context);
 if(!('hasArtist' in sandbox))context.hasArtist=vm.runInNewContext(hasArtistSource+'\nhasArtist');
 return context;
}
