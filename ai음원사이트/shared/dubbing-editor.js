const newId=()=>crypto.randomUUID();
export function editorLine(sceneId,roleId,text=''){
 return {id:newId(),sceneId,roleId,order:0,text,emotion:'',direction:'',durationSeconds:Math.min(40,Math.max(1,Math.round(text.length/4)||3)),gapSeconds:.6};
}
export function editorCue(sceneId,lineId,kind,prompt='',anchor='start'){
 const music=kind==='bgm';
 return {id:newId(),sceneId,lineId,kind,prompt,anchor,offsetSeconds:0,durationSeconds:music?10:2,generationSeconds:music?10:2,volume:music?.24:.35,fadeInSeconds:0,fadeOutSeconds:.15};
}
export function orderEditorLines(script){
 const order=new Map(script.scenes.map((s,i)=>[s.id,i]));
 script.lines.sort((a,b)=>order.get(a.sceneId)-order.get(b.sceneId));
 script.lines.forEach((line,i)=>{line.order=i+1;});
}
export function duplicateEditorScene(script,id){
 const source=script.scenes.find(s=>s.id===id);
 const lines=script.lines.filter(l=>l.sceneId===id),cues=script.soundCues.filter(c=>c.sceneId===id);
 const roleBgm=script.soundCues.filter(c=>c.kind==='bgm').length+cues.filter(c=>c.kind==='bgm').length;
 if(script.scenes.length>=12||script.lines.length+lines.length>120||script.soundCues.length+cues.length>24||roleBgm>3)throw Error('복제하면 장면·대사 또는 음향 개수를 초과합니다.');
 const scene={...source,id:newId(),title:source.title};
 script.scenes.splice(script.scenes.indexOf(source)+1,0,scene);
 const ids=new Map(lines.map(l=>[l.id,newId()]));
 script.lines.push(...lines.map(l=>({...l,id:ids.get(l.id),sceneId:scene.id})));
 script.soundCues.push(...cues.map(c=>({...c,id:newId(),sceneId:scene.id,lineId:ids.get(c.lineId)??'',...(c.endLineId?{endLineId:ids.get(c.endLineId)??c.endLineId}:{})})));
 orderEditorLines(script);
 return scene.id;
}
export function parseDubbingPaste(raw,genres=['일상']){
 const script={version:1,title:'',genres:[...genres],roles:[],scenes:[],lines:[],soundCues:[]},notes=[];
 let scene=null,description=false,pending=[];
 function makeScene(title){settle();scene={id:newId(),title,description:''};script.scenes.push(scene);description=false;}
 function settle(){if(!pending.length)return;const prev=script.lines.findLast(l=>l.sceneId===scene.id);for(const c of pending){c.lineId=prev?.id||'';c.anchor=prev?'after':'start';}pending=[];}
 function note(value){scene.description+=(scene.description?'\n':'')+value;}
 for(const [index,original] of String(raw).split(/\r\n|\r|\n/).entries()){
  const value=original.trim();if(!value)continue;
  const heading=value.match(/^(?:SCENE|씬|장면)\s*(\d+)\s*(?:[.:\-—–]\s*)?(.*)$/i);
  if(heading){makeScene(heading[2]||'장면 '+heading[1]);continue;}
  if(!scene)makeScene('첫 장면');
  const sound=value.match(/^\[(SFX|효과음|BGM|배경음악)\s*[:：]\s*(.*?)\]$/i)||value.match(/^\[(SFX|효과음|BGM|배경음악)\]\s+(.+)$/i);
  if(sound){const c=editorCue(scene.id,'',/^(BGM|배경음악)$/i.test(sound[1])?'bgm':'sfx',sound[2]);script.soundCues.push(c);pending.push(c);description=false;continue;}
  const setting=value.match(/^\[(상황|장면 설명)(?:\s*[:：]\s*([^\]]*))?\]\s*(.*)$/);
  if(setting){description=true;if(setting[2]||setting[3])note([setting[2],setting[3]].filter(Boolean).join(' '));continue;}
  const dialogue=value.match(/^(?:\[([^\]]{1,40})\]\s*|([^:：\[\]]{1,40})\s*[:：]\s*)(.+)$/);
  const named=dialogue?.[1]?.match(/^[A-F]\s*[·.]\s*(.+)$/i);
  if(dialogue&&(!dialogue[1]||named||script.roles.some(r=>r.name===dialogue[1]))){const name=(named?.[1]||dialogue[1]||dialogue[2]).trim();
   let role=script.roles.find(r=>r.name===name);if(!role){role={id:newId(),name,gender:'unspecified',personality:''};script.roles.push(role);}
   const line=editorLine(scene.id,role.id,dialogue[3]);script.lines.push(line);
   for(const c of pending){c.lineId=line.id;c.anchor=c.kind==='bgm'?'start':'before';}pending=[];description=false;continue;
  }
  note(original);if(!description)notes.push({sceneId:scene.id,row:index+1,text:original});
 }
 if(!scene)makeScene('첫 장면');settle();orderEditorLines(script);
 if(!script.roles.length)script.roles.push({id:newId(),name:'배역 1',gender:'unspecified',personality:''});
 return {script,notes,raw};
}
