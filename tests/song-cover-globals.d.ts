interface SongCover {
 id:string; title:string; producer:string; genre:string; duration:number; original_id:string;
 cover_mode:'solo'|'duet'; rank?:number; participants?:number; completions?:number;
 duet_partner?:string; can_join?:boolean; likes:number; plays:number; comments?:number; is_composer_pick?:boolean; part_description?:string; remaining_part?:string;
}
interface SongCoverPage {
 view:'all'|'duet'|'recent'|'children'; covers:SongCover[]; pick?:{cover_id:string|null;revision:number;can_manage:boolean;cover?:SongCover};
 counts:{all:number;duet:number;recent:number}; next_offset:number|null; accepts_covers:boolean;
}
declare const current:SongCover|null;
declare const audio:HTMLAudioElement;
declare const inApp:boolean;
interface Window { AifectAudioAds?:{active:boolean}; }
declare function esc(value:unknown):string;
declare function number(value:number):string;
declare function time(value:number):string;
declare function cover(track:SongCover,className?:string):string;
declare function liked(id:string):boolean;
declare function icon(name:string,size?:number):string;
declare function api(path:string):Promise<SongCoverPage>;
declare function remember(tracks:SongCover[]):void;
declare function paintInteractions():void;
declare function toast(message:string):void;
declare function refreshComposerPickPanel(panel:HTMLElement):Promise<void>;
declare function musicRowActionsHTML(track:SongCover,plays:number,playsIcon:string,story:boolean):string;
declare function bindChartPlayback():void;
declare function syncChartPlayback():void;

declare function userNickname(name:unknown,identity?:{profileId?:string;userId?:string;artistId?:string;entityType?:string},options?:object):string;
declare function trackNickname(track:unknown,role?:string):string;
declare function trackPerformers(track:unknown):string;
