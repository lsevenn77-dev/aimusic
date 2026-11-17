import { THEME } from './manifest.js';
import { coverTransform, project, chooseRaster, canvasBudget, referenceViewport, modulo } from './geometry.js';

const TAU = Math.PI * 2;
const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
const defaultRoot = new URL('../', import.meta.url);
function image(url) { return new Promise((resolve,reject) => { const im=new Image(); im.decoding='async'; im.onload=()=>resolve(im); im.onerror=()=>reject(new Error(`Image load failed: ${url}`)); im.src=url; }); }
function rectPath(c, x,y,w,h,r) { r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

/**
 * Drop-in VISUAL UNDERLAY. Does not own audio, WebRTC, chat, navigation or UI.
 * Browser/WebView implementation. Native screens need the documented adapter.
 * Missing approved portrait assets are a deliberate, explicit deployment gate.
 */
export class AifectChristmasTheme {
  constructor(host, options={}) {
    if (!(host instanceof HTMLElement)) throw new TypeError('host must be an HTMLElement');
    this.host=host; this.config=options.manifest || THEME;
    this.root=new URL(options.assetRoot || defaultRoot, document.baseURI);
    this.options={ fps:30, quality:'auto', portraitDiagnostic:false, protection:true, ...options };
    this.time=0; this.elapsedSinceDraw=0; this.lastStamp=null; this.raf=0;
    this.dead=false; this.ready=false; this.visible=true; this.active=true; this.intersecting=true;
    this.motion=true; this.manual=false; this.low=options.quality==='low'; this.level=this.low?2:0;
    this.loadToken=0; this.layoutToken=0; this.currentSource=''; this.sprites=new Map(); this.scaled=new Map();
    this.metrics={draws:0, totalDrawMS:0, maxDrawMS:0, resizeCount:0, blockedPortrait:false, quality:this.low?'low':'normal', error:null};
    this.delays=[]; this.costs=[]; this.adaptAt=0; this.pendingResize=0;
    this.hadClass=host.classList.contains('af-theme-scene'); host.classList.add('af-theme-scene');
    this.layer=document.createElement('div'); this.layer.className='af-theme-underlay'; this.layer.setAttribute('aria-hidden','true');
    this.photo=document.createElement('img'); this.photo.className='af-theme-photo'; this.photo.alt=''; this.photo.draggable=false;
    this.shade=document.createElement('div'); this.shade.className='af-theme-shade';
    this.canvas=document.createElement('canvas'); this.canvas.className='af-theme-fx';
    this.layer.append(this.photo,this.shade,this.canvas); host.prepend(this.layer);
    this.ctx=this.canvas.getContext('2d', {alpha:true});
    this.mask=document.createElement('canvas'); this.mctx=this.mask.getContext('2d');
    this.reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
    this.handlers={
      visibility:()=>{this.visible=!document.hidden;this.sync();},
      pagehide:()=>{this.visible=false;this.sync();},
      pageshow:()=>{this.visible=!document.hidden;this.queueResize();this.sync();},
      reduce:()=>{this.sync();if(this.ready)this.draw(this.time);},
      layout:()=>this.queueResize(),
      contextlost:(e)=>{e.preventDefault();this.contextLost=true;this.sync();},
      contextrestored:()=>{this.contextLost=false;this.queueResize();this.sync();}
    };
    document.addEventListener('visibilitychange',this.handlers.visibility);
    window.addEventListener('pagehide',this.handlers.pagehide);
    window.addEventListener('pageshow',this.handlers.pageshow);
    window.addEventListener('resize',this.handlers.layout,{passive:true});
    if(this.reduce.addEventListener)this.reduce.addEventListener('change',this.handlers.reduce);else this.reduce.addListener?.(this.handlers.reduce);
    this.canvas.addEventListener('contextlost',this.handlers.contextlost);
    this.canvas.addEventListener('contextrestored',this.handlers.contextrestored);
    this.ro=('ResizeObserver' in window)?new ResizeObserver(this.handlers.layout):null; this.ro?.observe(host);
    if ('IntersectionObserver' in window) { this.io=new IntersectionObserver(es=>{this.intersecting=es[0].isIntersecting;this.sync();},{threshold:0.001});this.io.observe(host); }
    this.visible=!document.hidden;
    this.initialized=this.init();
  }
  url(path) { return new URL(path,this.root).href; }
  async init() {
    try {
      if(!this.ctx) {this.metrics.error='Canvas unavailable; static background only';}
      const names=[...this.config.effect.bokeh.map(p=>p.asset), ...this.config.effect.snow.map(p=>p.asset),'dust-v61.webp','bulb-glow-v61.webp','bulb-dim.webp'];
      await Promise.all([...new Set(names)].map(async p=>{const loaded=await image(this.url('assets/'+p));if(!this.dead)this.sprites.set(p,loaded);}));
      if(this.dead)return;
      await this.resize();
      if(this.dead)return;
      this.ready=true; this.draw(this.time); this.sync();
    } catch(e) { this.metrics.error=String(e); this.fail(e); }
    return this;
  }
  fail(error) { if(this.dead)return;this.stop();this.layer.hidden=true;this.metrics.error=String(error);this.host.dispatchEvent(new CustomEvent('aifect-theme-error',{detail:{message:String(error)},bubbles:true})); }
  queueResize() {
    if(this.dead || this.pendingResize)return;
    this.pendingResize=requestAnimationFrame(()=>{this.pendingResize=0;this.resize().catch(e=>this.fail(e));});
  }
  async resize() {
    if(this.dead)return;
    const token=++this.layoutToken;
    const box=this.host.getBoundingClientRect();
    if(this.layoutLock && Math.abs(box.width-this.layoutLock.width)>2)this.layoutLock=null;
    const w=this.layoutLock?.width || box.width, h=this.layoutLock?.height || box.height;
    if(w<1||h<1){this.sized=false;this.sync();return;}
    this.sized=true; this.w=w;this.h=h;this.metrics.resizeCount++;
    this.layer.style.width=w+'px';this.layer.style.height=h+'px';
    const portrait=w/h<.94;
    let profile=portrait?this.config.profiles.portrait:this.config.profiles.landscape;
    this.metrics.blockedPortrait=portrait && !profile?.sources?.length;
    this.host.dataset.themeAssetState=this.metrics.blockedPortrait?'portrait-source-required':'ready';
    if(this.metrics.blockedPortrait && !this.options.portraitDiagnostic) {
      this.assetBlocked=true;this.layer.hidden=true;this.stop();
      this.host.dispatchEvent(new CustomEvent('aifect-theme-source-required',{detail:{profile:'portrait',reason:profile?.reason},bubbles:true}));
      return;
    }
    this.assetBlocked=false;this.layer.hidden=false;
    if(!profile?.sources?.length)profile=this.config.profiles.landscape;
    this.profile=profile;
    const ratio=w/h;
    const adaptive=ratio<1.45?[0,.5]:ratio<1.78?[.18,.5]:[.5,.60];
    const pos=this.metrics.blockedPortrait?[.18,.50]:(profile.positionOverride || (portrait?(profile.position||[.5,.5]):adaptive));
    this.geometry=coverTransform(profile.width,profile.height,w,h,pos);
    const g=this.geometry;
    Object.assign(this.photo.style,{width:g.width+'px',height:g.height+'px',left:g.x+'px',top:g.y+'px'});
    const maxDPR=this.level===0?this.config.limits.normalMaxDPR:1;
    const maxPixels=this.level===0?this.config.limits.normalCanvasPixels:this.config.limits.lowCanvasPixels;
    const budget=canvasBudget(w,h,window.devicePixelRatio,maxPixels,maxDPR);
    this.dpr=budget.ratio; this.canvas.width=budget.width;this.canvas.height=budget.height;
    this.ctx?.setTransform(this.dpr,0,0,this.dpr,0,0);
    // Full-resolution photo stays separate from the lower-resolution effects canvas.
    const raster=chooseRaster(profile.sources,g.width*Math.min(window.devicePixelRatio||1,2));
    this.metrics.source=raster.url;this.metrics.sourceLimited=raster.width+1<g.width*(window.devicePixelRatio||1);
    this.metrics.canvasPixels=budget.width*budget.height;this.metrics.canvasSize=[budget.width,budget.height];
    this.metrics.profile=portrait?'portrait':'landscape';this.metrics.cssSize=[w,h];
    if(this.currentSource!==raster.url){
      const local=++this.loadToken;
      const loaded=await image(this.url(raster.url));
      if(this.dead||local!==this.loadToken||token!==this.layoutToken)return;
      this.photo.src=loaded.src;this.currentSource=raster.url;
    }
    if(!profile.sunMask){this.sunImage=null;this.sunURL=null;}
    if(profile.sunMask && this.sunURL!==profile.sunMask){
      const sun=await image(this.url(profile.sunMask));
      if(this.dead||token!==this.layoutToken)return;
      this.sunImage=sun;this.sunURL=profile.sunMask;
    }
    if(this.dead||token!==this.layoutToken)return;
    this.particleScale=referenceViewport(w,h).scale;
    this.scaled.clear(); this.buildMask();this.draw(this.time);this.sync();
  }
  /** Cached smooth per-pixel protection; UI rectangles cannot cause a particle-wide flash. */
  buildMask() {
    if(!this.ctx||this.dead)return;
    this.mask.width=this.canvas.width; this.mask.height=this.canvas.height;
    const c=this.mctx, d=this.dpr; c.setTransform(d,0,0,d,0,0);
    c.globalCompositeOperation='source-over';c.fillStyle='#fff';c.fillRect(0,0,this.w,this.h);
    if(!this.options.protection)return;
    const bounds=this.host.getBoundingClientRect();
    for(const el of this.host.querySelectorAll('[data-theme-protect]')){
      const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
      const strength=clamp(Number(el.dataset.themeProtect)||.3,0,.92);
      c.save();c.globalCompositeOperation='destination-out';c.globalAlpha=strength;
      c.filter=`blur(${Math.max(8,14*this.particleScale)*d}px)`;c.fillStyle='#000';
      rectPath(c,r.left-bounds.left,r.top-bounds.top,r.width,r.height,Math.min(r.height/2,18));c.fill();c.restore();
    }
  }
  sprite(name, cssW, cssH=cssW) {
    // v6.1 sprites have a transparent guard band and zero-alpha support.
    // Cache the target raster once per size/DPR. No per-frame blur/gradient/ImageData.
    if(!Number.isFinite(cssW)||!Number.isFinite(cssH)||cssW<=0||cssH<=0)return null;
    const bw=Math.max(1,Math.round(cssW*this.dpr)),bh=Math.max(1,Math.round(cssH*this.dpr));
    const key=name+':'+bw+':'+bh;
    if(!this.scaled.has(key)){
      const src=this.sprites.get(name);if(!src)return null;
      const cv=document.createElement('canvas');cv.width=bw;cv.height=bh;
      const c=cv.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(src,0,0,bw,bh);
      // High-quality downsampling can round a bokeh edge back to alpha 1/255.
      // Enforce the transparent border once on the cached raster.
      if(name.startsWith('bokeh-') && bw>2 && bh>2){
        c.clearRect(0,0,bw,1);c.clearRect(0,bh-1,bw,1);
        c.clearRect(0,1,1,bh-2);c.clearRect(bw-1,1,1,bh-2);
      }
      this.scaled.set(key,cv);
    }
    return this.scaled.get(key);
  }
  blit(name,x,y,size,opacity,height=size) {
    if(opacity<=0.001||x+size<0||y+height<0||x-size>this.w||y-height>this.h)return;
    const spr=this.sprite(name,size,height);if(!spr)return;
    this.ctx.globalAlpha=clamp(opacity,0,1);this.ctx.drawImage(spr,x-size/2,y-height/2,size,height);
  }
  curve(index,t) {
    const c=this.config.effect.curves[index % this.config.effect.curves.length];
    const f=modulo(t,this.config.effect.period)*this.config.effect.curveFPS;
    const i=Math.floor(f)%c.length;return c[i]+(c[(i+1)%c.length]-c[i])*(f-Math.floor(f));
  }
  draw(t) {
    if(this.dead||!this.ctx||!this.geometry||!Number.isFinite(this.particleScale)||!this.mask.width||!this.mask.height||this.assetBlocked||this.contextLost)return;
    const begin=performance.now(),c=this.ctx,g=this.geometry,p=this.profile;
    const a=TAU*modulo(t,this.config.effect.period)/this.config.effect.period;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.clearRect(0,0,this.w,this.h);
    // Fixed source-space sunshine mask; only opacity changes, not shadow geometry.
    if(this.sunImage){c.globalAlpha=.035+.11*(.5-.5*Math.cos(a));c.drawImage(this.sunImage,g.x,g.y,g.width,g.height);}
    // Light anchors use EXACTLY the same transform as the background image.
    for(const b of p.bulbs || []){
      const q=project(b,g,p.width,p.height),v=this.curve(b.curve,t),s=b.radius*g.scale;
      this.blit('bulb-dim.webp',q.x,q.y,s*3,.82*(1-v));
      this.blit('bulb-glow-v61.webp',q.x,q.y,s*3,.12+.72*v*v);
    }
    const s=this.particleScale;
    for(const b of this.config.effect.bokeh){
      const x=b.x*this.w+b.dx*s*Math.sin(a+TAU*b.phase),y=b.y*this.h+b.dy*s*Math.cos(a+TAU*b.phase);
      this.blit(b.asset,x,y,(b.extent*2+1)*s,b.opacity*(.90+.10*Math.sin(a*b.harmonic+b.phase*TAU)));
    }
    this.config.effect.snow.forEach((p,i)=>{
      const q=modulo(t/this.config.effect.period+p.phase,1),fade=Math.min(1,q/.19,(1-q)/.20);
      const x=p.x*this.w+(p.dx*(q-.5)+6*Math.sin(TAU*q+i*1.73))*s,y=p.y*this.h+p.dy*(q-.5)*s;
      this.blit(p.asset,x,y,p.size*s,p.opacity*fade);
    });
    this.config.effect.dust.forEach((p,i)=>{
      const q=modulo(t/this.config.effect.period+p.phase,1),fade=Math.min(1,q/.22,(1-q)/.22);
      this.blit('dust-v61.webp',p.x*this.w+10*s*Math.sin(TAU*q+i*.57),p.y*this.h-50*s*(q-.5),p.radius*6*s,p.opacity*fade);
    });
    if(this.options.protection){c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='destination-in';c.drawImage(this.mask,0,0);c.restore();}
    c.globalCompositeOperation='source-over';c.globalAlpha=1;
    const cost=performance.now()-begin;this.metrics.draws++;this.metrics.totalDrawMS+=cost;this.metrics.maxDrawMS=Math.max(cost,this.metrics.maxDrawMS);
    this.costs.push(cost);if(this.costs.length>120)this.costs.shift();
  }
  sync() {
    const play=this.ready && this.sized && !this.dead && this.ctx && !this.assetBlocked && !this.contextLost && this.active && this.visible && this.intersecting && this.motion && !this.reduce.matches && !this.manual;
    if(play && !this.raf){this.lastStamp=null;this.elapsedSinceDraw=0;this.raf=requestAnimationFrame(ts=>this.tick(ts));}
    else if(!play)this.stop();
  }
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;this.lastStamp=null;}
  tick(ts) {
    this.raf=0;
    if(this.dead||!this.active||!this.visible||!this.intersecting||this.manual||this.reduce.matches||!this.motion||this.assetBlocked)return;
    const delta=this.lastStamp==null?0:Math.max(0,ts-this.lastStamp);this.lastStamp=ts;
    // Pause rather than jumping past unseen motion when the tab/process was suspended.
    const dt=delta>250?0:Math.min(delta,100);this.time+=dt/1000;this.elapsedSinceDraw+=dt;
    const fps=this.level>=2?15:this.options.fps;const interval=1000/fps;
    if(this.elapsedSinceDraw+0.1>=interval){this.elapsedSinceDraw%=interval;this.draw(this.time);}
    if(delta>0 && delta<250){this.delays.push(delta);if(this.delays.length>180)this.delays.shift();}
    if(this.options.quality==='auto' && ts-this.adaptAt>6000 && this.costs.length>=90){
      const sorted=[...this.costs].sort((a,b)=>a-b);const p95=sorted[Math.floor(sorted.length*.95)];
      const long=this.delays.filter(x=>x>48).length/Math.max(1,this.delays.length);
      if(this.level<2 && (p95>10||long>.25)){this.level++;this.metrics.quality=this.level===1?'reduced-resolution':'15fps';this.queueResize();}
      // Preserve the approved particle count; only backing resolution, then cadence, changes.
      this.adaptAt=ts;
    }
    this.raf=requestAnimationFrame(s=>this.tick(s));
  }
  setLayoutLock(size){this.layoutLock=size?{width:size.width,height:size.height}:null;this.queueResize();}
  setActive(active){this.active=!!active;this.sync();}
  setMotion(enabled){this.motion=!!enabled;this.sync();if(!enabled)this.draw(this.time);}
  setQuality(q){if(!['auto','high','low'].includes(q))throw new RangeError('quality must be auto/high/low');this.options.quality=q;this.level=q==='low'?2:0;this.metrics.quality=q;this.queueResize();}
  /** Native host must use explicit lifecycle calls; never pause the audio system here. */
  setAppState(state){this.setActive(state==='active');}
  /** Inspection/recording only: deterministic frame. Never required for production playback. */
  seek(seconds){if(!Number.isFinite(seconds))throw new TypeError('seconds must be finite');this.manual=true;this.stop();this.time=modulo(seconds,this.config.effect.period);this.draw(this.time);}
  resume(){this.manual=false;this.sync();}
  refreshProtection(){if(!this.dead)this.buildMask();}
  getDiagnostics(){return {...this.metrics,time:this.time,running:!!this.raf,level:this.level,actualBackground:this.currentSource,meanDrawMS:this.metrics.totalDrawMS/Math.max(1,this.metrics.draws),anchors:this.geometry?(this.profile.bulbs||[]).map(b=>project(b,this.geometry,this.profile.width,this.profile.height)):[]};}
  destroy(){
    if(this.dead)return;this.dead=true;this.stop();this.loadToken++;this.layoutToken++;
    if(this.pendingResize)cancelAnimationFrame(this.pendingResize);
    this.ro?.disconnect();this.io?.disconnect();
    document.removeEventListener('visibilitychange',this.handlers.visibility);
    window.removeEventListener('pagehide',this.handlers.pagehide);window.removeEventListener('pageshow',this.handlers.pageshow);window.removeEventListener('resize',this.handlers.layout);
    if(this.reduce.removeEventListener)this.reduce.removeEventListener('change',this.handlers.reduce);else this.reduce.removeListener?.(this.handlers.reduce);
    this.canvas.removeEventListener('contextlost',this.handlers.contextlost);this.canvas.removeEventListener('contextrestored',this.handlers.contextrestored);
    this.canvas.width=this.canvas.height=this.mask.width=this.mask.height=1;this.scaled.clear();this.sprites.clear();this.layer.remove();
    delete this.host.dataset.themeAssetState;if(!this.hadClass)this.host.classList.remove('af-theme-scene');
  }
}
