function texture(path) {
  const image=new Image();
  image.decoding='async';
  image.src='/crew-racing/art/'+path+'.webp';
  return image;
}

// Bounds in the original art sheets. The packed WebPs may be downsampled.
const propFrames = {
  palm: [68, 23, 519, 561], lamp: [784, 8, 307, 576],
  bunny: [93, 603, 510, 629], cart: [659, 613, 568, 628],
};
const propHeights={lamp:550,palm:790,bunny:540,cart:720};
const kartFrames = {
  c2: [21,14,475,468], c3: [527,102,481,379],
  c5: [1037,99,483,381], c4: [9,554,498,436],
  c1: [524,581,487,402], pearl: [1028,574,503,411],
};
// Centres of the two exhaust openings in the same source coordinate system.
const outlets={c2:[242,282,458],c3:[746,790,444],c5:[1260,1302,451],
  c4:[242,285,944],c1:[746,790,948],pearl:[1260,1302,952]};

export function rearPreview(id) {
  const [x,y,w,h]=kartFrames[id];
  const node=document.createElement('span');
  node.className='kart-rear';node.setAttribute('aria-hidden','true');
  node.style.aspectRatio=w+'/'+h;
  node.style.backgroundSize=(1536/w*100)+'% '+(1024/h*100)+'%';
  node.style.backgroundPosition=(x/(1536-w)*100)+'% '+(y/(1024-h)*100)+'%';
  return node;
}

function drawFrame(ctx, image, sheetWidth, frame, x, y, w, h) {
  const scale = image.naturalWidth / sheetWidth;
  ctx.drawImage(image, frame[0]*scale, frame[1]*scale, frame[2]*scale, frame[3]*scale, x, y, w, h);
}

function asphaltTile() {
  const tile=document.createElement('canvas');
  tile.width=768; tile.height=512;
  const ctx=tile.getContext('2d'), pixels=ctx.createImageData(tile.width,tile.height);
  let seed=659;
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  const grooves=Array.from({length:tile.width},()=>random()*2.5);
  for(let y=0;y<tile.height;y++){
    const lampPhase=.5+.5*Math.cos(y/tile.height*Math.PI*2);
    const leftLight=48*lampPhase**12,rightLight=48*(1-lampPhase)**12;
    for(let x=0;x<tile.width;x++){
      const u=x/tile.width,v=y/tile.height, offset=(y*tile.width+x)*4;
      const grain=grooves[x]*.6+random()*3;
      const glint=Math.pow(.5+.5*Math.cos(v*Math.PI*2),2);
      const shimmer=.5+.5*Math.sin(x*1.8+y*.038);
      const pink=Math.exp(-Math.abs(u-.17)*13)*(glint*85+10)*(.55+shimmer*.45);
      const blue=Math.exp(-Math.abs(u-.84)*15)*((1-glint)*79+16)*(.50+shimmer*.50);
      const laneSheen=(Math.exp(-Math.abs(u-.34)*28)+Math.exp(-Math.abs(u-.68)*30))*(10+24*glint);
      // One warm ellipse below each alternating star lamp, quieter near the centreline.
      const pool=leftLight*Math.exp(-((u-.23)**2)*17)+rightLight*Math.exp(-((u-.77)**2)*17);
      pixels.data[offset]=45+grain+pink*.66+blue*.14+laneSheen*.52+pool;
      pixels.data[offset+1]=39+grain*.87+pink*.14+blue*.58+laneSheen*.34+pool*.69;
      pixels.data[offset+2]=75+grain+pink*.60+blue*.89+laneSheen*.72+pool*.38;
      pixels.data[offset+3]=255;
    }
  }
  ctx.putImageData(pixels,0,0);
  return tile;
}

function ribbon(ctx,a,b,side,from,to,tint) {
  ctx.fillStyle=tint;ctx.beginPath();
  ctx.moveTo(a.x+side*a.w*from,a.y);ctx.lineTo(b.x+side*b.w*from,b.y);
  ctx.lineTo(b.x+side*b.w*to,b.y);ctx.lineTo(a.x+side*a.w*to,a.y);ctx.fill();
}

function turnSign() {
  const image=document.createElement('canvas');
  image.width=128;image.height=84;
  const ctx=image.getContext('2d');
  ctx.fillStyle='#90758d';ctx.fillRect(58,35,12,46);
  ctx.fillStyle='#e5bd9c';ctx.fillRect(58,35,4,46);
  ctx.fillStyle='#70547f';ctx.beginPath();ctx.roundRect(3,5,122,51,16);ctx.fill();
  ctx.fillStyle='#ffebcd';ctx.beginPath();ctx.roundRect(3,1,122,49,16);ctx.fill();
  ctx.fillStyle='#cf6684';ctx.beginPath();ctx.roundRect(7,5,114,41,12);ctx.fill();
  ctx.strokeStyle='#fff3d8';ctx.lineWidth=8;ctx.lineJoin=ctx.lineCap='round';
  for(const x of [42,66]) {
    ctx.beginPath();ctx.moveTo(x,15);ctx.lineTo(x+13,25);ctx.lineTo(x,35);ctx.stroke();
  }
  return image;
}

function lampGlow() {
  const image=document.createElement('canvas');
  image.width=image.height=96;
  const ctx=image.getContext('2d'), glow=ctx.createRadialGradient(48,48,0,48,48,48);
  glow.addColorStop(0,'rgba(255,235,178,.65)');
  glow.addColorStop(.38,'rgba(255,201,158,.34)');
  glow.addColorStop(1,'rgba(255,171,150,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,96,96);
  return image;
}

// The tyre and barrier positions come from the same course projection used by the game engine.
export function arcadeScenery() {
  const park=texture('waterfront'), props=texture('harbor-toys'), karts=texture('kart-toys');
  const asphalt=asphaltTile(), sign=turnSign(), glow=lampGlow(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const promenade=['bunny',null,'cart','palm',null,'bunny',null,'cart'];
  function drawBackground(ctx,v,heading,lane,progress=0) {
    ctx.fillStyle='#302955';ctx.fillRect(0,0,v.w,v.h);
    if(!park.naturalWidth)return;
    // Frame landmarks in the original park panorama: the wheel at x=.82,
    // then the bandstand at .34. Never crop the wheel out of the starting grid.
    const scale=Math.max(v.w/park.naturalWidth,v.horizon/(park.naturalHeight*.67));
    const w=park.naturalWidth*scale,h=park.naturalHeight*scale;
    const lap=Math.max(0,Math.min(1,progress));
    const focus=.58+.24*Math.cos(lap*2*Math.PI)+.035*Math.sin(heading*.68)+.008*lane;
    const left=Math.max(0,Math.min(w-v.w,focus*w-v.w*.54));
    ctx.drawImage(park,-left,v.horizon-h*.67,w,h);
  }
  function drawRoad(ctx,segment,v,finishSegment) {
    const a=segment.p1.screen,b=segment.p2.screen, height=a.y-b.y;
    if(height<=0||b.y>v.h)return;
    const first=Math.max(0,(0-b.y)/height),last=Math.min(1,(v.h-b.y)/height);
    if(last<=first)return;
    // Slice in screen space only where a nearby trapezoid needs perspective detail.
    const strips=Math.max(1,Math.ceil(height*(last-first)/6));
    const sampleHeight=512/28, sampleY=(27-segment.i%28)*sampleHeight;
    ribbon(ctx,a,b,-1,1,2.35,'#ae8ea9');
    ribbon(ctx,a,b,-1,2.25,2.35,'#f3d2bd');
    ribbon(ctx,a,b,1,1,1.24,'#b8a1b9');
    for(let i=0;i<strips;i++){
      const t0=first+(last-first)*i/strips,t1=first+(last-first)*(i+1)/strips,mid=(t0+t1)/2;
      const width=b.w+(a.w-b.w)*mid, center=b.x+(a.x-b.x)*mid;
      const left=center-width, roadWidth=width*2;
      if(roadWidth<=0||left>v.w||left+roadWidth<0)continue;
      const sx=Math.max(0,-left/roadWidth),ex=Math.min(1,(v.w-left)/roadWidth);
      const top=b.y+height*t0,rows=height*(t1-t0)+.65;
      ctx.drawImage(asphalt,sx*768,sampleY+sampleHeight*t0,(ex-sx)*768,sampleHeight*(t1-t0),
        left+sx*roadWidth,top,(ex-sx)*roadWidth,rows);
    }
    if(segment.i%12>=6 && segment.i%12<=10){
      for(const lane of [-1/3,1/3])ribbon(ctx,a,b,1,lane-.006,lane+.006,'#dbc5e0');
    }
    if(segment.i===finishSegment||segment.i===finishSegment+1){
      for(let cell=0;cell<12;cell++)ribbon(ctx,a,b,1,-1+cell/6,-1+(cell+1)/6,
        (cell+segment.i)%2?'#e9e3eb':'#252032');
    }
    for(const side of [-1,1]){
      const colored=Math.floor(segment.i/3)%2===0;
      ribbon(ctx,a,b,side,.955,1.04,colored?(side<0?'#f4a7b6':'#90dccd'):'#ffead4');
      const ax=a.x+side*a.w*1.025,bx=b.x+side*b.w*1.025;
      const ha=a.scale*200*v.ys,hb=b.scale*200*v.ys;
      const rail=(from,to,color)=>{
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(ax,a.y-ha*from);ctx.lineTo(bx,b.y-hb*from);
        ctx.lineTo(bx,b.y-hb*to);ctx.lineTo(ax,a.y-ha*to);ctx.fill();
      };
      rail(.18,.46,'#82738e');rail(.35,.50,'#b6f2ed');rail(.69,.93,'#a584ac');rail(.87,1,'#ffcfde');
      if(segment.i%3===0){
        ctx.strokeStyle='#8b8997';ctx.lineWidth=Math.max(.7,a.w*.005);
        ctx.beginPath();ctx.moveTo(ax,a.y);ctx.lineTo(ax,a.y-ha);ctx.stroke();
      }
    }
  }
  function drawProp(ctx,segment,prop,v,time) {
    if(prop.k==='chev') {
      const a=segment.p1.screen, w=a.scale*v.w*315, x=a.x+a.w*prop.x;
      if(w<3 || x+w*.5<0 || x-w*.5>v.w || a.y>segment.clip+2)return true;
      ctx.save();ctx.translate(x,a.y);ctx.scale(prop.dir,1);
      ctx.drawImage(sign,-w/2,-w*84/128,w,w*84/128);ctx.restore();
      return true;
    }
    if(prop.k!=='palm' && prop.k!=='lamp')return false;
    const index=Math.floor(segment.i/14);
    const kind=prop.k==='palm'?promenade[Math.floor(segment.i/9)%promenade.length]:'lamp';
    if(!kind || !props.naturalWidth)return true;
    if(kind==='lamp' && Math.sign(prop.x)!==(index%2 ? 1 : -1))return true;
    const a=segment.p1.screen;
    const offset=kind==='lamp'?Math.sign(prop.x)*1.19 : (Math.floor(segment.i/36)%2?1:-1)*1.7;
    const x=a.x+a.w*offset,y=a.y;
    const h=a.scale*v.w*propHeights[kind];
    const frame=propFrames[kind], w=h*frame[2]/frame[3];
    if(kind==='lamp' && h>6) {
      // The pool stays on the tarmac as the post passes outside the viewport.
      const litX=a.x+a.w*Math.sign(prop.x)*.62;
      ctx.drawImage(glow,litX-a.w*.54,y-h*.13,a.w*1.08,h*.23);
    }
    if(h<3||x+w*.5<0||x-w*.5>v.w||y-h>v.h)return true;
    ctx.save();
    if(y>segment.clip){
      ctx.beginPath();ctx.rect(0,0,v.w,segment.clip);ctx.clip();
    }
    ctx.translate(x,y);
    if(kind==='lamp' && h>6) {
      ctx.drawImage(glow,-w*1.2,-h*.74-w*1.2,w*2.4,w*2.4);
    }
    if(kind==='bunny' && !reduced.matches)ctx.rotate(.045*Math.sin(time*5+segment.i));
    drawFrame(ctx,props,1254,frame,-w/2,-h,w,h);
    ctx.restore();return true;
  }
  function drawSpeed(ctx,v,state,boost) {
    const power=Math.min(1,Math.max(0,(state.speed-7600)/5600));
    if(reduced.matches || power<.02)return;
    ctx.save();ctx.globalAlpha=(.12+.3*boost)*power;
    ctx.strokeStyle='#e3ddff';ctx.lineCap='round';
    for(let i=0;i<12;i++){
      const depth=(state.z/5600+i*.38197)%1, side=i%2?1:-1;
      const reach=.30+depth*.48, dy=.11+(i%5)*.095;
      const x=v.w*(.5+side*reach), y=v.horizon+v.h*dy*depth;
      ctx.lineWidth=.6+depth*1.25;ctx.beginPath();ctx.moveTo(x,y);
      ctx.lineTo(x+side*v.w*depth*(.024+boost*.10),y+v.h*dy*depth*(.06+boost*.19));ctx.stroke();
    }
    ctx.restore();
  }
  function drawKart(ctx,id,w,jet) {
    const frame=kartFrames[id];
    if(!karts.naturalWidth || !frame)return false;
    const h=w*frame[3]/frame[2];
    drawFrame(ctx,karts,1536,frame,-w/2,-h,w,h);
    if(jet) {
      const [left,right,y]=outlets[id], scale=w/frame[2];
      ctx.save();ctx.globalCompositeOperation='lighter';
      for(const tip of [left,right]) {
        const cx=(tip-frame[0])*scale-w/2, cy=(y-frame[1])*scale-h;
        ctx.drawImage(jet,cx-w*.073,cy,w*.146,w*.86);
      }
      ctx.restore();
    }
    return true;
  }
  return {drawBackground,drawRoad,drawProp,drawKart,drawSpeed};
}
