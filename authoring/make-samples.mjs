import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {packProductDirectory} from './product-assets.mjs';

const sharp=createRequire(new URL('../ops/cafe24/package.json',import.meta.url))('sharp');
const scratch=await mkdtemp(join(tmpdir(),'aifect-authoring-'));
const out=resolve(process.argv[2]??'authoring/samples');
await mkdir(out,{recursive:true});
const svg=(width,height,art,view='0 0 '+width+' '+height)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="'+view+'">'+art+'</svg>');
const star=(x,y,r,color,opacity=1)=>`<path d="M${x} ${y-r}q0 ${r} ${r} ${r}q${-r} 0 ${-r} ${r}q0 ${-r} ${-r} ${-r}q${r} 0 ${r} ${-r}Z" fill="${color}" opacity="${opacity}"/>`;
const palette={mint:['#375990','#55dfd0','#ecffe7'],violet:['#443772','#be9dee','#ffdcfa']};

function objectArt(type,colors){
 const [dark,accent,light]=colors;
 const defs=`<defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".43" stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`;
 if(type==='gift')return defs+`
  <path d="M125 215h262v170q0 28-28 28H153q-28 0-28-28Z" fill="url(#surface)" stroke="${dark}" stroke-width="15"/>
  <rect x="105" y="170" width="302" height="75" rx="20" fill="url(#surface)" stroke="${dark}" stroke-width="15"/>
  <path d="M256 410V184c-95 6-145-54-114-86 30-31 88 3 114 86 25-83 84-117 114-86 32 32-19 92-114 86" fill="none" stroke="${light}" stroke-width="26" stroke-linejoin="round"/>
  ${star(339,312,28,light)}`;
 return defs+`<circle cx="256" cy="256" r="206" fill="none" stroke="${dark}" stroke-width="37"/>
  <circle cx="256" cy="256" r="209" fill="none" stroke="url(#surface)" stroke-width="27"/>
  <circle cx="256" cy="256" r="193" fill="none" stroke="${light}" stroke-opacity=".7" stroke-width="4"/>
  ${[0,1,2,3].map(n=>star(256+214*Math.cos(n*Math.PI/2),256+214*Math.sin(n*Math.PI/2),25,light)).join('')}`;
}
function scene(width,height,colors){
 const [dark,accent,light]=colors,horizon=height*.57;
 const defs=`<defs>
  <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#0b1634"/><stop offset=".65" stop-color="${dark}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
  <linearGradient id="water" x2="0" y2="1"><stop stop-color="${accent}"/><stop offset=".36" stop-color="${dark}"/><stop offset="1" stop-color="#08162a"/></linearGradient></defs>`;
 return defs+`<rect width="${width}" height="${height}" fill="url(#sky)"/>
 <circle cx="${width*.67}" cy="${horizon*.52}" r="${Math.min(width,height)*.12}" fill="${light}" opacity=".78"/>
 <path d="M0 ${horizon}Q${width*.21} ${horizon*.67} ${width*.32} ${horizon*.89}T${width*.65} ${horizon*.94}Q${width*.79} ${horizon*.85} ${width} ${horizon}Z" fill="#192849"/>
 <rect y="${horizon}" width="${width}" height="${height-horizon}" fill="url(#water)"/>
 ${Array.from({length:16},(_,i)=>{const w=width*(.06+(i*13%21)/100),y=horizon+(height-horizon)*i/25;return `<rect x="${width*.66-w/2}" y="${y}" width="${w}" height="${height*.004}" rx="4" fill="${light}" opacity="${(16-i)/42}"/>`;}).join('')}
 ${Array.from({length:35},(_,i)=>star(width*((i*53+19)%97)/97,height*((i*17+8)%47)/100,Math.max(2,Math.min(width,height)*(i%4+1)/620),light,.52)).join('')}`;
}

for(const productType of ['gift','frame','theme']){
 for(const renderMode of ['static','layered']){
  const moving=renderMode==='layered',sample=productType+'-'+renderMode;
  const path=join(scratch,sample);
  await mkdir(join(path,'originals','effects'),{recursive:true});
  await mkdir(join(path,'assets','effects'),{recursive:true});
  const colors=moving?palette.violet:palette.mint;
  const names={gift:['유리 리본','달빛 리본'],frame:['청록 링','달빛 링'],theme:['청록 물결','보랏빛 조수']};
  const renderer={gift:['gift-standard','gift-overlay'],frame:['frame-static','frame-overlay'],theme:['room-background','room-overlay']}[productType][Number(moving)];
  const config={schemaVersion:2,assetVersion:'2.0.0',productType,renderMode,packageKind:'author',renderer:{id:renderer,version:1},
   metadata:{name:names[productType][Number(moving)],description:'AIFECT 상품 제작 및 등록 검증용 예제',note:'격리 검수용 시안'},
   assets:{},originals:[],derive:[]};
  async function original(name,data){
   const relative='originals/'+name;
   await writeFile(join(path,relative),data);config.originals.push(relative);
   return relative;
  }
  function derive(from,role,name,width,height){
   const to='assets/'+name+'.webp';
   config.assets[role]=to;config.derive.push({from,to,width,height});
  }
  if(productType==='theme'){
   const dimensions={desktop:[2560,1440,1280,720],mobile:[1080,2400,720,1600],roomCard:[1200,1200,512,512]};
   for(const [role,[width,height,w,h]] of Object.entries(dimensions)){
    const from=await original(role+'.png',await sharp(svg(width,height,scene(width,height,colors))).png().toBuffer());
    derive(from,role,role,w,h);
    if(role==='roomCard')derive(from,'thumbnail','thumbnail',256,256);
    else derive(from,role+'Low',role+'-low',w*.6|0,h*.6|0);
   }
   config.metadata.uiMode=moving?'dark':'light';
   config.layout={desktop:{fit:'cover',focus:[.55,.5],safe:[.35,.31,.77,.67]},mobile:{fit:'cover',focus:[.5,.45],safe:[.25,.26,.78,.73]}};
  }else{
   const from=await original('base.png',await sharp(svg(768,768,objectArt(productType,colors),'0 0 512 512')).png().toBuffer());
   derive(from,'base','base',384,384);
   derive(from,'thumbnail','thumbnail',256,256);
   if(moving)config.assets.fallback=config.assets.base;
  }
  if(moving){
   const layers=productType==='theme'?{desktopEffect:[1280,720],mobileEffect:[720,1600]}:{effect:[384,384]};
   for(const [role,[w,h]] of Object.entries(layers)){
    const pages=[];
    for(let i=0;i<6;i++){
     const art=[];
     for(let n=0;n<(productType==='theme'?14:8);n++){
      const angle=n*Math.PI/4;
      const theme=productType==='theme',radius=productType==='frame'?.414:(.34+.02*Math.sin(i+n));
      const x=theme?w*((n*23+7)%90+5)/100:w*(.5+radius*Math.cos(angle)),
       y=theme?h*((n*19+13)%44+7)/100:h*(.5+radius*Math.sin(angle));
      art.push(star(x,y,Math.min(w,h)*(.009+.009*Math.abs(Math.sin((n+i)*Math.PI/6))),colors[2],.19+.73*Math.abs(Math.sin((i+n)*Math.PI/6))));
     }
     const frame=sharp(svg(w,h,art.join(''))).ensureAlpha();
     const png=await frame.clone().png().toBuffer();
     await original('effects/'+role+'-'+i+'.png',png);
     pages.push(await frame.raw().toBuffer());
    }
    const dest='assets/effects/'+role+'.webp';
    const image=await sharp(Buffer.concat(pages),{raw:{width:w,height:h*pages.length,channels:4,pageHeight:h}})
     .webp({quality:87,alphaQuality:100,delay:Array(pages.length).fill(productType==='gift'?250:180),loop:productType==='gift'?1:0}).toBuffer();
    await writeFile(join(path,dest),image);config.assets[role]=dest;
   }
   config.animation='animation.json';
   await writeFile(join(path,config.animation),JSON.stringify({schemaVersion:1,playback:productType==='gift'?'event':'visible',layers:Object.keys(layers)},null,2));
  }
  await writeFile(join(path,'product.json'),JSON.stringify(config,null,2));
  const zip=await packProductDirectory(path);
  await writeFile(join(out,sample+'.zip'),zip);
  console.log(sample,zip.length);
 }
}
