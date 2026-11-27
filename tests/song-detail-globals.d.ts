interface SongDetailTrack {
 id:string;title:string;kind:'original'|'cover';user_id:string;producer_id:string;producer:string;
 description?:string;creator_description?:string;genres?:string[];genre?:string;duration:number;likes:number;plays:number;comments:number;ai_comments?:number;
 karaoke_ready?:boolean;cover_mode?:'solo'|'duet';duet_open?:number;original_id?:string;has_ai_artist?:boolean;
 can_manage_cover_pick?:boolean;is_composer_pick?:boolean|number;
 lyrics_mode?:string;
}
declare const me:{id:string}|null;
declare const inApp:boolean;
declare function esc(value:unknown):string;
declare function icon(name:string,size?:number):string;
declare function number(value:number):string;
declare function time(value:number):string;
declare function cover(track:SongDetailTrack):string;
declare function liked(id:string):boolean;
declare function hasArtist(track:SongDetailTrack):boolean;
declare function credits(track:SongDetailTrack):string;
declare function songCredits(track:SongDetailTrack):string;
declare function songReleaseDateHTML(track:SongDetailTrack,wrapLabel?:boolean):string;
declare function trackModerationToolsHTML(track:SongDetailTrack):string;
declare function registerRouteCleanup(cleanup:()=>void):()=>void;

declare function trackNickname(t:any,role?:string):string;
declare const AifectCoverPick:typeof import('../shared/cover-pick-ui.js');
