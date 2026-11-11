// Shared presentation for talking rooms, room DMs and the message workspace.
// Transport, permissions, message limits and sticker policies stay with each caller.
function chatIconButton(glyph,label,attributes='',kind='plain'){
 return '<button class="chat-ui-icon chat-ui-'+kind+'" aria-label="'+esc(label)+'" '+attributes+'>'+voiceGlyph(glyph)+'</button>';
}
function messageInputHTML({rich=false,id='',limit=2000,placeholder='메시지를 입력하세요…',emoji='' }={}){
 const input=rich?'<div id="'+esc(id)+'" contenteditable="true" enterkeyhint="send" role="textbox" aria-multiline="true" aria-label="메시지" aria-placeholder="'+esc(placeholder)+'" aria-description="Enter로 보내기, Shift+Enter로 줄바꿈" data-dm-editor data-limit="'+limit+'"></div>':'<textarea id="'+id+'" name="body" aria-label="메시지" aria-description="Enter로 보내기, Shift+Enter로 줄바꿈" placeholder="'+esc(placeholder)+'" maxlength="'+limit+'" rows="1" enterkeyhint="send" required></textarea>';
 return '<div class="chat-ui-field talk-message-field">'+input+emoji+'</div>';
}
function chatComposerHTML({id,rich=false,inputId='',limit=2000,emojiAttributes='',sendAttributes='',giftAttributes='',room=false,placeholder,className='',leadingHTML=''}={}){
 const emoji=emojiAttributes?chatIconButton('smile','이모티콘','type="button" aria-haspopup="dialog" aria-expanded="false" '+emojiAttributes):'';
 const send=chatIconButton('send','메시지 보내기','type="submit" '+sendAttributes,'surface');
 const field=messageInputHTML({rich,id:inputId,limit,placeholder,emoji:room?emoji+send:emoji});
 return '<form id="'+id+'" class="chat-ui-composer '+className+'">'+leadingHTML+field+(room?'':send)+(giftAttributes?chatIconButton('present','선물 보내기','type="button" '+giftAttributes,'surface'):'')+'<p class="form-error" role="alert"></p></form>';
}
function resizeChatInput(input){
 // Rich editors grow intrinsically; textareas need their scroll height measured.
 if(input.tagName!=='TEXTAREA')return;
 input.style.height='0px';
 input.style.height=Math.min(116,Math.max(44,input.scrollHeight||44))+'px';
}
function messageWorkspaceGeometry({mobile,height,offset=0,top=0,playerTop=Infinity}){
 const start=mobile?offset:top,bottom=mobile?offset+height:Math.min(offset+height,playerTop);
 if(mobile)return {top:start,height:Math.max(0,bottom-start)};
 // Keep the desktop composer comfortably above the viewport/player edge.
 // Short windows still fit the available space; mobile owns its full visual viewport.
 const available=Math.max(0,bottom-start-24),preferred=Math.min(780,Math.round(height*.8));
 return {top:start,height:Math.min(available,preferred)};
}
