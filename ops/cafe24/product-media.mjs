import sharp from 'sharp';

const MAX_BYTES=5*1024*1024;
const MAX_DECODE_PIXELS=16_000_000;
const types={jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
const invalid=message=>{throw new Error(message);};

function decoded(input,{animated=true}={}){
 return sharp(input,{animated,limitInputPixels:MAX_DECODE_PIXELS,failOn:'warning'});
}

export async function processProductImage(input,action){
 const image=decoded(input),info=await image.metadata();
 const frames=info.pages??1,width=info.width,height=info.pageHeight??info.height;
 if(!types[info.format]||!width||!height||width>4096||height>4096||frames>120||width*height*frames>MAX_DECODE_PIXELS)
  invalid('image bounds');
 if(action==='product-inspect'||action==='product-frame'){
  // Decode the entire bounded image. Reading headers alone accepts corrupt
  // streams and does not validate animation or the transparent frame opening.
  const {data,info:raw}=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(action==='product-frame'){
   if(!info.hasAlpha||width!==height)invalid('frame canvas');
   const alpha=(x,y,frame)=>data[((y+frame*height)*width+x)*raw.channels+3];
   for(let f=0;f<frames;f++){
    for(let y=Math.ceil(height*.33);y<height*.67;y++){
     for(let x=Math.ceil(width*.33);x<width*.67;x++){
      if(alpha(x,y,f)>12)invalid('frame opening');
     }
    }
   }
  }
  return {type:'application/json',body:Buffer.from(JSON.stringify({format:info.format,width,height,frames,alpha:!!info.hasAlpha}))};
 }
 if(frames!==1||!['product-display','product-thumbnail'].includes(action))invalid('image action');
 let encoder=decoded(input,{animated:false}).rotate();
 if(action==='product-thumbnail')encoder=encoder.resize(256,256,{fit:'inside',withoutEnlargement:true});
 const {data,info:out}=await encoder.webp({quality:88,alphaQuality:100}).toBuffer({resolveWithObject:true});
 if(data.length>MAX_BYTES)invalid('size');
 const written=await sharp(data).metadata();
 return {type:'image/webp',body:data,metadata:{format:'webp',width:out.width,height:out.height,frames:1,alpha:!!written.hasAlpha}};
}

export async function compareProductScreens(input){
 if(input.length<6)invalid('comparison input');
 const firstSize=input.readUInt32BE(0);
 if(firstSize<1||firstSize>=input.length-4)invalid('comparison boundary');
 async function surface(source){
  const image=sharp(source,{limitInputPixels:4_200_000,failOn:'warning'}),meta=await image.metadata();
  if(!['png','webp'].includes(meta.format)||(meta.pages??1)!==1||!meta.width||!meta.height||meta.width*meta.height>4_200_000)
   invalid('full screenshot required');
  return image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 }
 // Decode sequentially to stay within the image worker's memory budget.
 const a=await surface(input.subarray(4,4+firstSize)),b=await surface(input.subarray(4+firstSize));
 if(a.info.width!==b.info.width||a.info.height!==b.info.height||a.info.channels!==4||b.info.channels!==4)invalid('different screenshot dimensions');
 const {width,height}=a.info,n=width*height;
 let matches=0,structural=0,windows=0;
 // Rec. 709 luminance and 8x8 local-window SSIM. No image or UI areas are
 // omitted. Colour equality uses a fixed three-level tolerance per channel.
 for(let y=0;y<height;y+=8){
  for(let x=0;x<width;x+=8){
   let sumA=0,sumB=0,sqA=0,sqB=0,ab=0,count=0;
   for(let row=y;row<Math.min(y+8,height);row++){
    for(let col=x;col<Math.min(x+8,width);col++){
     const i=(row*width+col)*4;
     if(a.data[i+3]!==255||b.data[i+3]!==255)invalid('opaque screenshot required');
     if(Math.abs(a.data[i]-b.data[i])<=3&&Math.abs(a.data[i+1]-b.data[i+1])<=3&&Math.abs(a.data[i+2]-b.data[i+2])<=3)matches++;
     const la=.2126*a.data[i]+.7152*a.data[i+1]+.0722*a.data[i+2],lb=.2126*b.data[i]+.7152*b.data[i+1]+.0722*b.data[i+2];
     sumA+=la;sumB+=lb;sqA+=la*la;sqB+=lb*lb;ab+=la*lb;count++;
    }
   }
   const meanA=sumA/count,meanB=sumB/count,va=sqA/count-meanA*meanA,vb=sqB/count-meanB*meanB,cov=ab/count-meanA*meanB;
   const c1=6.5025,c2=58.5225;
   structural+=((2*meanA*meanB+c1)*(2*cov+c2))/((meanA*meanA+meanB*meanB+c1)*(va+vb+c2));
   windows++;
  }
 }
 return {width,height,pixelMatch:matches/n,ssim:Math.min(1,structural/windows),tolerance:3};
}
