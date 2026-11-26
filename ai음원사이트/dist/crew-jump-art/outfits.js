// Shared catalog: prices come from the server, and outfits never alter game physics.
export const DEFAULT_OUTFIT='default';
export const JUMP_OUTFITS=Object.freeze([
 {id:DEFAULT_OUTFIT,name:'기본 의상',price:0,unit:'S'},
 {id:'runner',name:'육상선수룩',price:500,unit:'S'},
 {id:'street',name:'스트릿룩',price:500,unit:'S'},
 {id:'idol',name:'아이돌룩',price:50,unit:'G'},
 {id:'suit',name:'정장룩',price:100,unit:'G'},
 {id:'princess',name:'공주룩',price:200,unit:'G',reverse:true}
].map(outfit=>Object.freeze({...outfit,
 image:outfit.id===DEFAULT_OUTFIT?'/crew-jump-art/arcade-cheer.webp':'/crew-jump-art/outfits/'+outfit.id+'.webp',
 sprite:outfit.id===DEFAULT_OUTFIT?null:'/crew-jump-art/outfits/'+outfit.id+'-run.webp'
})));
