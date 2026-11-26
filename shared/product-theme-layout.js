// Geometry is normalized in the un-cropped author's artwork; the same fit is used by base and overlay.
function place(spec,width,height,fit){
 const scale=(fit==='cover'?Math.max:Math.min)(width/spec.width,height/spec.height);
 const imageWidth=spec.width*scale,imageHeight=spec.height*scale;
 const [x,y]=spec.focus,[l,t,r,b]=spec.safe;
 const offsetX=(width-imageWidth)*x,offsetY=(height-imageHeight)*y;
 const safe=offsetX+imageWidth*l>=-.5&&offsetY+imageHeight*t>=-.5&&
  offsetX+imageWidth*r<=width+.5&&offsetY+imageHeight*b<=height+.5;
 return {fit,focus:spec.focus,safe};
}

export function resolveProductTheme(artwork,{width,height,dpr=1,app=false,economy=false,reducedMotion=false,failed}= {}){
 if(!artwork||width<=0||height<=0)return null;
 const wide=width>=600&&width>=height*1.1;
 const ordered=wide?['desktop','app','mobile']:app?['app','mobile','desktop']:['mobile','desktop'];
 const candidates=[];
 for(const role of ordered){
  const spec=artwork[role];
  if(!spec||(role==='app'&&!app))continue;
  const useLow=spec.low&&(economy||width*dpr<=spec.low.width&&height*dpr<=spec.low.height);
  const widths=useLow?['low','standard']:['standard','low'];
  for(const quality of widths){
   const variant=quality==='low'?spec.low:spec;
   if(!variant||failed?.has(variant.src))continue;
   const position=place({...spec,...variant},width,height,spec.fit);
   candidates.push({role,quality,variant,position,spec});
   // The lighter rendition has the same composition, so try the other one only on failure.
   break;
  }
 }
 const selected=candidates.find(candidate=>candidate.position.safe)||candidates[0];
 if(!selected)return null;
 const {role,quality,variant,position,spec}=selected;
 return {role,quality,src:variant.src,width:variant.width,height:variant.height,focus:spec.focus,
  fit:position.safe?position.fit:'contain',warning:!position.safe||role!==candidates[0].role,
  effect:reducedMotion||economy||failed?.has(variant.effect)?null:variant.effect??null};
}
