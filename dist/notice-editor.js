(() => {
 const rich=()=>globalThis.AifectOfficialNotice;
 const stickers=()=>globalThis.AifectStickers;
 const tools=[
  ['bold','굵게','B'],['italic','기울임','I'],['underline','밑줄','U'],['strikeThrough','취소선','S'],
  ['mint','민트 강조','민트'],['purple','보라 강조','보라'],
  ['justifyLeft','왼쪽 정렬','왼쪽'],['justifyCenter','가운데 정렬','가운데'],['justifyRight','오른쪽 정렬','오른쪽'],
  ['insertUnorderedList','글머리 목록','• 목록'],['insertOrderedList','번호 목록','1. 목록'],['insertHorizontalRule','구분선','구분선'],
  ['link','링크','링크'],['image','이미지 넣기','이미지'],['emoji','이모티콘','이모티콘'],
  ['undo','실행 취소','↶'],['redo','다시 실행','↷'],['removeFormat','서식 초기화','서식 초기화']
 ];
 const colors={mint:'#8eddd2',purple:'#9a82ff'};
 const unicode=['😀','😊','😂','🥹','😍','🥳','🙂','😎','🤔','😮','😢','🙌','👏','👍','👋','💜','💚','❤️','✨','🎵','🎤','🎉','🎁','📌','📢','✅'];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const blank=()=>({format:1,title:'',blocks:[]});
 const supported=['P','H2','H3','DIV','LI'];

 function inlineRuns(node,marks={}){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent?[{...marks,text:node.textContent}]:[];
  if(node.nodeType!==Node.ELEMENT_NODE)return [];
  if(node.dataset.noticeSticker)return [{sticker:node.dataset.noticeSticker}];
  const tag=node.tagName;
  if(tag==='BR')return [{...marks,text:'\n'}];
  if(['IMG','FIGURE','SCRIPT','STYLE'].includes(tag))return [];
  const next={...marks},style=node.style;
  if(['B','STRONG'].includes(tag)||style.fontWeight==='bold'||Number(style.fontWeight)>=600)next.bold=true;
  if(['I','EM'].includes(tag)||style.fontStyle==='italic')next.italic=true;
  if(tag==='U'||style.textDecorationLine.includes('underline'))next.underline=true;
  if(['S','STRIKE','DEL'].includes(tag)||style.textDecorationLine.includes('line-through'))next.strike=true;
  const color=(node.getAttribute('color')||style.color||'').toLowerCase().replace(/\s+/g,'');
  if(node.dataset.noticeColor)next.color=node.dataset.noticeColor;
  if([colors.mint,'rgb(142,221,210)'].includes(color))next.color='mint';
  if([colors.purple,'rgb(154,130,255)'].includes(color))next.color='purple';
  if(tag==='A')next.href=node.getAttribute('href')||'';
  return Array.from(node.childNodes).flatMap(child=>inlineRuns(child,next));
 }
 function textBlock(node,{list,align}={}){
  const tag=node.tagName,type=tag==='LI'?'li':['H2','H3'].includes(tag)?tag.toLowerCase():'p';
  const runs=Array.from(node.childNodes)
   .filter(child=>!['UL','OL'].includes(child.tagName))
   .flatMap(child=>inlineRuns(child));
  if(runs.length===1&&runs[0].text==='\n')runs.length=0;
  return {type,align:node.style.textAlign||node.getAttribute('align')||node.dataset.align||align||'left',...(list?{list}:{}),runs};
 }
 function readBlocks(root){
  const blocks=[],pending=[];
  const flush=()=>{if(pending.length)blocks.push({type:'p',align:'left',runs:pending.splice(0)});};
  const walk=node=>{
   if(node.nodeType!==Node.ELEMENT_NODE){pending.push(...inlineRuns(node));return;}
   if(node.dataset.noticeAsset){
    flush();blocks.push({type:'image',asset:node.dataset.noticeAsset,width:Number(node.dataset.width)||100,
     align:node.dataset.align||'left',href:node.dataset.href||undefined,alt:node.querySelector('img')?.alt||''});
   }else if(node.tagName==='HR'){flush();blocks.push({type:'hr'});}
   else if(['OL','UL'].includes(node.tagName)){
    flush();
    for(const child of node.children){
     if(child.tagName!=='LI')continue;
     blocks.push(textBlock(child,{list:node.tagName.toLowerCase(),align:node.style.textAlign||node.getAttribute('align')}));
     for(const nested of child.children)if(['UL','OL'].includes(nested.tagName))walk(nested);
    }
   }else if(supported.includes(node.tagName)){
    flush();
    if(node.tagName==='DIV'&&Array.from(node.children).some(el=>supported.includes(el.tagName)||['UL','OL','HR','FIGURE'].includes(el.tagName))){
     for(const child of node.childNodes)walk(child);
     flush();
    }else blocks.push(textBlock(node,{...(node.tagName==='LI'?{list:'ul'}:{})}));
   }else pending.push(...inlineRuns(node));
  };
  for(const child of root.childNodes)walk(child);
  flush();
  return blocks;
 }

 async function webp(file){
  const prepared=await optimizeUploadImage(file,{allowFallback:true});
  if(prepared.type==='image/webp')return prepared;
  const bitmap=await decodeUploadImage(prepared);
  try{const {encodeCrewWebp}=await import('./crew-webp.js');return await encodeCrewWebp(bitmap);}
  finally{bitmap.close();}
 }

 function create(host,{onChange,onUpload,upload}){
  host.innerHTML=`<label class="notice-field">제목 <input data-title type="text" autocomplete="off" placeholder="공지 제목을 입력해 주세요."></label>
   <div class="notice-editor">
    <div class="notice-toolbar" role="group" aria-label="본문 서식">
     <select data-heading aria-label="문단 서식"><option value="p">본문</option><option value="h2">제목</option><option value="h3">소제목</option></select>
     ${tools.map(([key,label,mark])=>'<button type="button" data-command="'+key+'" aria-label="'+label+'" title="'+label+'">'+mark+'</button>').join('')}
    </div>
    <div class="official-rich-body notice-editable" contenteditable="true" role="textbox" aria-label="본문" aria-multiline="true" data-body></div>
    <div class="notice-editor-meta"><output data-length>0자</output><span data-upload role="status"></span><button type="button" data-retry hidden>다시 업로드</button><button type="button" data-dismiss hidden>실패한 파일 제외</button></div>
   </div>
   <input data-files type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
   <div data-picture class="notice-image-settings" hidden>
    <label>정렬 <select data-align><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>
    <label>너비 <input data-width type="number" min="10" max="100" value="100">%</label>
    <label>대체 텍스트 <input data-alt type="text" maxlength="300"></label>
    <label>이미지 링크 <input data-image-link type="text" inputmode="url"></label>
    <button type="button" data-picture-op="apply">적용</button><button type="button" data-picture-op="up">위로</button>
    <button type="button" data-picture-op="down">아래로</button><button type="button" data-picture-op="replace">교체</button>
    <button type="button" data-picture-op="remove">삭제</button>
   </div>
   <dialog data-link-dialog class="notice-dialog" aria-label="본문 링크">
    <h2>링크</h2><label class="notice-field">표시 문구 <input data-link-label type="text"></label>
    <label class="notice-field">URL <input data-link-url type="text" inputmode="url" placeholder="https:// 또는 #song/…"></label>
    <label class="notice-field">아이팩트 메뉴 <select data-link-menu><option value="">메뉴 선택</option>${Object.entries(rich().noticeLinks).map(([path,label])=>'<option value="'+esc(path)+'">'+esc(label)+'</option>').join('')}</select></label>
    <p data-link-error role="alert"></p><div class="notice-actions"><button type="button" data-link-op="remove">링크 제거</button><button type="button" data-link-op="cancel">취소</button><button type="button" data-link-op="apply" class="notice-primary">적용</button></div>
   </dialog>
   <dialog data-emoji-dialog class="notice-dialog notice-emoji-dialog" aria-label="이모티콘">
    <h2>이모티콘</h2><div class="notice-unicode" role="group" aria-label="기본 이모지">${unicode.map(mark=>'<button type="button" aria-label="'+mark+'" data-unicode="'+mark+'">'+mark+'</button>').join('')}</div>
    <div class="cat-picker notice-cat-picker" data-cat-picker></div><div class="notice-actions"><button type="button" data-emoji-close>닫기</button></div>
   </dialog>`;
  const $=s=>host.querySelector(s),body=$('[data-body]'),title=$('[data-title]'),files=$('[data-files]'),
   picture=$('[data-picture]'),link=$('[data-link-dialog]'),emoji=$('[data-emoji-dialog]');
  const pictureField=selector=>picture.querySelector(selector);
  let range=null,image=null,replace=false,activeLink=null,failed=null,uploading=false,writable=true;
  let current=null;
  const undo=[],redo=[];
  const editingOptions=()=>({imageURL:rich().adminNoticeAssetURL,renderStickers:stickers()?.render,editing:true});
  const read=()=>({format:1,title:title.value,blocks:readBlocks(body)});
  function report(content){$('[data-length]').value=rich().noticeLength(content).toLocaleString('ko-KR')+'자';onChange(content);}
  function updated(){
   const content=read(),serialized=JSON.stringify(content);
   if(current!==serialized){
    if(current!=null)undo.push(current);
    if(undo.length>60)undo.shift();
    redo.length=0;current=serialized;report(content);
   }
  }
  function paint(content){
   range=null;image=null;picture.hidden=true;
   title.value=content.title;
   body.innerHTML=rich().renderNoticeBody(content,editingOptions());
   if(!body.childNodes.length)body.innerHTML='<p><br></p>';
   $('[data-length]').value=rich().noticeLength(content).toLocaleString('ko-KR')+'자';
  }
  function load(content=blank()){
   paint(content);current=JSON.stringify(read());undo.length=0;redo.length=0;
   failed=null;showUpload('');
  }
  function moveHistory(back){
   const origin=back?undo:redo,target=back?redo:undo,next=origin.pop();
   if(!next)return;
   target.push(current);current=next;
   const content=JSON.parse(next);paint(content);select();report(content);
  }
  function outsideWidget(point){
   const start=point.startContainer;
   const element=start.nodeType===Node.ELEMENT_NODE?start:start.parentElement;
   const widget=element?.closest('[contenteditable="false"]');
   if(point.collapsed&&widget&&body.contains(widget))point.setStartAfter(widget);
   return point;
  }
  function capture(){
   const selection=getSelection();
   if(selection.rangeCount&&body.contains(selection.getRangeAt(0).commonAncestorContainer))range=outsideWidget(selection.getRangeAt(0).cloneRange());
  }
  function select(target){
   if(target&&body.contains(target)){
    range=document.createRange();range.selectNode(target);
   }
   body.focus({preventScroll:true});
   const selection=getSelection(),point=range&&body.contains(range.commonAncestorContainer)?range:document.createRange();
   if(point!==range){point.selectNodeContents(body);point.collapse(false);}
   selection.removeAllRanges();selection.addRange(point);
   return point;
  }
  function command(key,value=null,target=null){
   if(!writable)return false;
   if(key==='undo'||key==='redo'){moveHistory(key==='undo');return true;}
   const point=select(target);
   const applied=document.execCommand(key,false,value);
   if(!applied&&key==='insertHTML')return insertMarkup(value,point);
   capture();updated();
   return applied;
  }
  function insertMarkup(markup,point,{block=false}={}){
   const fragment=point.createContextualFragment(markup),last=fragment.lastChild;
   if(!last)return false;
   point.deleteContents();
   let top=point.startContainer;
   while(top!==body&&top.parentNode!==body)top=top.parentNode;
   if(block&&top!==body&&top.nodeType===Node.ELEMENT_NODE&&['P','DIV','H2','H3'].includes(top.tagName)){
    const after=document.createRange();
    after.setStart(point.startContainer,point.startOffset);after.setEnd(top,top.childNodes.length);
    const tail=top.cloneNode(false);tail.append(after.extractContents());
    top.after(fragment);
    if(tail.hasChildNodes())last.after(tail);
   }else if(block&&top!==body&&top.nodeType===Node.ELEMENT_NODE){
    top.after(fragment);
   }else point.insertNode(fragment);
   range=document.createRange();range.setStartAfter(last);range.collapse(true);select();capture();updated();
   return true;
  }
  function insert(blocks,target=null){
   const markup=rich().renderNoticeBody({blocks},editingOptions());
   if(target&&body.contains(target)){
    const fragment=document.createRange().createContextualFragment(markup);
    target.replaceWith(fragment);range=null;updated();return true;
   }
   return insertMarkup(markup,outsideWidget(select()),{block:true});
  }
  function showUpload(message){
   $('[data-upload]').textContent=message;
   $('[data-retry]').hidden=!failed||uploading;
   $('[data-dismiss]').hidden=!failed||uploading;
   onUpload(uploading||!!failed,message);
  }
  function chooseImage(node){
   image=node;picture.hidden=!node;
   if(!node)return;
   pictureField('[data-align]').value=node.dataset.align||'left';
   pictureField('[data-width]').value=node.dataset.width||'100';
   pictureField('[data-alt]').value=node.querySelector('img').alt;
   pictureField('[data-image-link]').value=node.dataset.href||'';
  }
  function imageBlock(node){
   return {type:'image',asset:node.dataset.noticeAsset,align:node.dataset.align,
    width:Number(node.dataset.width),alt:node.querySelector('img').alt,href:node.dataset.href||undefined};
  }
  async function addImages(all,replacing=null){
   if(!writable||uploading||!all.length)return;
   const existing=read().blocks.filter(block=>block.type==='image').length;
   if(existing+all.length-(replacing?1:0)>rich().noticeImageLimit){showUpload('이미지는 10장까지 첨부할 수 있습니다.');return;}
   const at=range?.cloneRange();
   uploading=true;failed=null;
   try{
    for(let i=0;i<all.length;i++){
     showUpload('이미지 '+(i+1)+' / '+all.length+' 업로드 중');
     try{
      const file=await webp(all[i]),asset=await upload(file);
      if(replacing&&!replacing.isConnected)throw new Error('교체할 이미지를 다시 선택해 주세요.');
      if(i===0&&at&&body.contains(at.commonAncestorContainer))range=at;
      const next={type:'image',align:'left',width:100,alt:'',...(replacing?imageBlock(replacing):{}),asset:asset.id};
      if(!insert([next],replacing))throw new Error('이미지를 본문에 삽입할 수 없습니다.');
      if(replacing)chooseImage(body.querySelector('[data-notice-asset="'+asset.id+'"]'));
     }catch(error){failed={files:all.slice(i),replacing,error};break;}
    }
   }finally{
    uploading=false;
    showUpload(failed?failed.error.message:'이미지를 업로드했습니다.');
   }
  }

  function openLink(){
   capture();
   const selected=getSelection(),node=selected.anchorNode?.parentElement;
   activeLink=node?.closest('a');
   if(!activeLink||!body.contains(activeLink))activeLink=null;
   $('[data-link-label]').value=activeLink?.textContent||selected.toString();
   $('[data-link-url]').value=activeLink?.getAttribute('href')||'';
   $('[data-link-menu]').value='';$('[data-link-error]').textContent='';
   link.showModal();
  }
  $('[data-link-menu]').addEventListener('change',event=>{$('[data-link-url]').value=event.target.value;});
  link.addEventListener('click',event=>{
   const action=event.target.closest('button')?.dataset.linkOp;
   if(!action)return;
   if(action==='cancel'){link.close();return;}
   if(action==='remove'){link.close();command('unlink',null,activeLink);return;}
   const href=rich().noticeHref($('[data-link-url]').value.trim()),label=$('[data-link-label]').value.trim()||href;
   if(!href){$('[data-link-error]').textContent='등록된 아이팩트 경로나 HTTPS 링크를 입력해 주세요.';return;}
   link.close();
   command('insertHTML','<a href="'+esc(href)+'">'+esc(label)+'</a>',activeLink);
  });
  emoji.addEventListener('click',event=>{
   if(event.target.closest('[data-emoji-close]'))emoji.close();
   const mark=event.target.closest('[data-unicode]')?.dataset.unicode;
   if(mark)command('insertText',mark);
  });
  stickers()?.bind({picker:$('[data-cat-picker]'),form:host,input:body,
   toggle:$('[data-command="emoji"]'),close:()=>emoji.close(),inline:{
    insertSticker:key=>{
     const html=stickers().render('[aifect:'+key+']',esc);
     return command('insertHTML','<span contenteditable="false" data-notice-sticker="'+esc(key)+'">'+html+'</span>');
    },get:()=>'',insertionWarning:()=> '본문에서 이모티콘을 삽입할 위치를 선택해 주세요.'
   }});
  host.querySelector('.notice-toolbar').addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
  host.querySelector('.notice-toolbar').addEventListener('click',event=>{
   const action=event.target.closest('[data-command]')?.dataset.command;
   if(!action||!writable)return;
   if(action==='link')openLink();
   else if(action==='emoji'){capture();emoji.show();}
   else if(action==='image'){capture();replace=false;files.click();}
   else if(action in colors)command('foreColor',colors[action]);
   else if(action==='removeFormat'){
    command('removeFormat');command('formatBlock','p');
   }else command(action);
  });
  $('[data-heading]').addEventListener('change',event=>command('formatBlock',event.target.value));
  for(const type of ['keyup','pointerup','focusout'])body.addEventListener(type,capture);
  body.addEventListener('input',()=>{capture();updated();});
  body.addEventListener('keydown',event=>{
   const key=event.key.toLowerCase();
   if((event.ctrlKey||event.metaKey)&&['z','y'].includes(key)){
    event.preventDefault();moveHistory(key==='z'&&!event.shiftKey);
   }
  });
  body.addEventListener('click',event=>{
   const node=event.target.closest('[data-notice-asset]');
   chooseImage(node);if(event.target.closest('a'))event.preventDefault();
  });
  body.addEventListener('paste',event=>{
   event.preventDefault();capture();
   const pictures=Array.from(event.clipboardData?.files??[]).filter(item=>item.type.startsWith('image/'));
   if(pictures.length)void addImages(pictures);
   else command('insertText',event.clipboardData?.getData('text/plain')??'');
  });
  body.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  body.addEventListener('drop',event=>{
   event.preventDefault();
   const point=document.caretRangeFromPoint?.(event.clientX,event.clientY);
   if(point&&body.contains(point.commonAncestorContainer))range=point;
   const dropped=Array.from(event.dataTransfer?.files??[]);
   if(dropped.length)void addImages(dropped);
   else command('insertText',event.dataTransfer?.getData('text/plain')??'');
  });
  title.addEventListener('input',updated);
  files.addEventListener('change',()=>{void addImages(Array.from(files.files),replace&&image?.isConnected?image:null);files.value='';replace=false;});
  $('[data-retry]').onclick=()=>{if(failed)void addImages(failed.files,failed.replacing);};
  $('[data-dismiss]').onclick=()=>{failed=null;showUpload('');};
  picture.addEventListener('click',event=>{
   const action=event.target.closest('button')?.dataset.pictureOp;
   if(!image?.isConnected||!action||!writable||uploading)return;
   if(action==='replace'){replace=true;files.click();return;}
   if(action==='remove'){image.remove();chooseImage(null);range=null;updated();return;}
   if(action==='apply'){
    const href=pictureField('[data-image-link]').value.trim(),width=Number(pictureField('[data-width]').value);
    if(href&&!rich().noticeHref(href)){showUpload('등록된 아이팩트 경로나 HTTPS 이미지 링크를 입력해 주세요.');return;}
    if(!Number.isInteger(width)||width<10||width>100){showUpload('이미지 너비를 10~100%로 입력해 주세요.');return;}
    const block={...imageBlock(image),width,align:pictureField('[data-align]').value,alt:pictureField('[data-alt]').value,href};
    insert([block],image);chooseImage(body.querySelector('[data-notice-asset="'+block.asset+'"]'));
    return;
   }
   const adjacent=action==='up'?image.previousElementSibling:image.nextElementSibling;
   if(!adjacent)return;
   if(action==='up')adjacent.before(image);else adjacent.after(image);
   range=null;updated();
  });
  return {read,load,focus:()=>title.focus(),busy:()=>uploading||!!failed,setWritable(value){
   writable=value;title.disabled=!value;body.contentEditable=String(value);
   for(const control of host.querySelectorAll('.notice-toolbar button,.notice-toolbar select'))control.disabled=!value;
  }};
 }
 globalThis.AifectNoticeEditor={create,blank};
})();
