import {escapeHTML as esc} from './site-info.js';

export function badgeHTML(){
 return '<span class="composer-pick-badge" title="원곡 제작자가 선택한 커버곡입니다.">PICK</span>';
}

/** @param {{id:string, title:string, kind?:string, original_id?:string, is_composer_pick?:boolean|number}} track */
export function titleHTML(track,content=esc(track.title)){
 if(track.kind!=='cover'&&!track.is_composer_pick)return content;
 const title=esc(track.title);
 const text=content===title?title:`<span class="composer-pick-caption">${content}</span><span class="composer-pick-song-name">${title}</span>`;
 return `<span class="composer-pick-title" data-pick-title="${esc(track.id)}" data-pick-title-original="${esc(track.original_id||'')}"><span class="composer-pick-title-text">${text}</span>${track.is_composer_pick?badgeHTML():''}</span>`;
}
