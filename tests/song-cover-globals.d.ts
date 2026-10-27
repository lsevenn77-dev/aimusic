interface SongCover {
 id:string; title:string; producer:string; genre:string; duration:number; original_id:string;
 cover_mode:'solo'|'duet'; rank?:number; participants?:number; completions?:number;
 can_join?:boolean; likes:number; plays:number;
}
interface SongCoverPage {
 view:'all'|'duet'|'recent'|'children'; covers:SongCover[];
 counts:{all:number;duet:number;recent:number}; next_offset:number|null; accepts_covers:boolean;
}
declare const current:SongCover|null;
declare const audio:HTMLAudioElement;
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
