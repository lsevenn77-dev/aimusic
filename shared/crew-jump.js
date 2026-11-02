// Fixed simulation time is the replay format. Change VERSION if physics or scoring changes.
export const VERSION='jump-crew-1';
export const HZ=60, LIMIT=3600, WIDTH=960, HEIGHT=540, FLOOR=452, RUNNER_X=190;
export const SCORE=Object.freeze({distancePointScale:0.1,starBasePoints:100,comboCap:10}); // Playtest coefficients.
const baseStep=480/HZ, gravity=2600/HZ**2, lift=900/HZ;
export const multiplier=tick=>1.2**Math.min(5,Math.floor(tick/600));
export function distanceAt(tick){
 let distance=0;
 for(let stage=0;stage<6;stage++)distance+=Math.max(0,Math.min(600,tick-stage*600))*baseStep*1.2**stage;
 return distance;
}
export function course(seed){
 let n=2166136261;
 for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619);
 const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};
 const obstacles=[],jellies=[];
 // Anchor encounters in simulation time, so the recovery gap remains playable at 2.48832x.
 for(let tick=170;tick<LIMIT-48;tick+=88+Math.floor(random()*55)){
  const r=random(),type=tick>45*HZ&&r<.26?'bird':r<.60?'spike':'block';
  const width=type==='spike'?34*(1+Math.floor(random()*3)):type==='bird'?46:62;
  const height=type==='bird'?26:type==='spike'?40:tick>14*HZ&&r>.85?150:r>.72?88:52;
  const bottom=type==='bird'?(random()<.5?20:135):0;
  const x=distanceAt(tick)+RUNNER_X;
  obstacles.push({type,width,height,bottom,x});
  const highBird=type==='bird'&&bottom>80, peak=highBird?0:height>100?190:130;
  for(let k=-2;k<=2;k++)jellies.push({x:distanceAt(tick+k*7)+RUNNER_X+width/2,height:36+peak*(1-k*k/4)});
 }
 return {obstacles,jellies};
}
export function start(seed){
 return {tick:0,distance:0,y:0,vy:0,jumps:0,landed:-99,jumped:-99,jellyPoints:0,score:0,jellies:0,combo:0,maxCombo:0,finished:null,pattern:course(seed),nextJelly:0,nextObstacle:0};
}
export function step(s,press=false){
 if(s.finished)return;
 if(++s.tick>=LIMIT){s.finished='survived';return}
 if(press&&s.jumps<2){s.vy=s.jumps?820/HZ:lift;s.jumps++;s.jumped=s.tick}
 s.vy-=gravity;s.y+=s.vy;
 if(s.y<=0){if(s.jumps)s.landed=s.tick;s.y=0;s.vy=0;s.jumps=0}
 s.distance=distanceAt(s.tick);
 const center=RUNNER_X+s.distance,obstacles=s.pattern.obstacles;
 while(s.nextObstacle<obstacles.length&&obstacles[s.nextObstacle].x+obstacles[s.nextObstacle].width<center-12)s.nextObstacle++;
 const o=obstacles[s.nextObstacle];
 if(o&&center+12>o.x&&s.y<o.height+(o.bottom||0)&&s.y+68>(o.bottom||0)){s.finished='collision';return}
 const list=s.pattern.jellies;
 while(s.nextJelly<list.length){
  const item=list[s.nextJelly],dx=item.x-center;
  if(dx < -23){s.combo=0;s.nextJelly++;continue}
  if(dx<=23&&Math.abs(item.height-(s.y+24))<34){
   s.nextJelly++;s.jellies++;s.combo++;s.maxCombo=Math.max(s.maxCombo,s.combo);
   const points=SCORE.starBasePoints+Math.min(s.combo-1,SCORE.comboCap);s.score+=points;s.jellyPoints+=points;
  }else break;
 }
 s.score+=Math.floor(s.distance*SCORE.distancePointScale)-Math.floor(distanceAt(s.tick-1)*SCORE.distancePointScale);
}
export function replay(seed,taps){
 if(!Array.isArray(taps)||taps.length>LIMIT||taps.some((n,i)=>!Number.isInteger(n)||n<1||n>=LIMIT||(i&&n<=taps[i-1])))throw Error('invalid input');
 const s=start(seed);let i=0;
 while(!s.finished){const tap=taps[i]===s.tick+1;if(tap){if(s.jumps>=2)throw Error('air jump limit');i++}step(s,tap)}
 if(i!==taps.length)throw Error('input after end');
 return s;
}
