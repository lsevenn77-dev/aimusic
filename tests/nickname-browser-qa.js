// Loaded only by the disposable local preview with --nicknames. Never bundled.
addEventListener('load',()=>{
 const panel=document.createElement('aside');panel.id='nickname-qa';
 panel.style.cssText='position:fixed;bottom:12px;right:12px;z-index:9999;background:#17202d;color:white;padding:12px;max-width:90vw;font:12px sans-serif;border:1px solid #8eddd2';
 panel.innerHTML='<button type="button" id="nickname-qa-run">닉네임 회귀 검사 실행</button><output id="nickname-qa-result" style="display:block;max-height:180px;overflow:auto"></output>';
 document.body.append(panel);
 panel.querySelector('button').onclick=async()=>{
  const results=[],output=panel.querySelector('output'),button=panel.querySelector('button');button.disabled=true;
  const host=document.createElement('section');host.id='nickname-qa-fixture';host.style.cssText='position:fixed;inset:70px 10px 210px;z-index:9000;overflow:auto;background:#101722';document.body.append(host);
  const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Popup timeout');};
  try{
   await accountReady;
   const t=(await api('/api/tracks/one')).track,p=(await api('/api/playlists/qa-playlist')).playlist;
   const person={id:'friend',profile_id:'friend',user_id:'other',name:'코코(별)',role:'member',created:0};
   const playlist={...p,owner_name:'Veil',owner_profile_id:'producer',user_id:'owner',tracks:1,covers:[t]};
   const comment={...person,id:'qa-comment',parent_id:null,timestamp:null,body:'댓글 본문',likes:0};
   const cases=[
    ['추천 플레이리스트 카드',()=>recommendedPlaylistCard(playlist)],
    ['홈 플레이리스트 카드',()=>homePlaylistCard(playlist,null,{compact:true})],
    ['내 보관함 플레이리스트 카드',()=>collectionCard(playlist)],
    ['플레이리스트 상세 제작자·곡',async()=> (await explorerView('playlist','qa-playlist','playlist/qa-playlist')).html],
    ['홈 곡',()=>homeCard(t)],
    ['인기 차트',()=>chartPageTable([{...t,chart_rank:1,chart_plays:1}],'top')],
    ['커버 차트',()=>chartPageTable([{...t,chart_rank:1,chart_covers:1}],'covers')],
    ['신곡 차트',()=>chartPageTable([{...t,chart_rank:1,chart_plays:1}],'releases')],
    ['곡 상세 제작자·AI 아티스트',()=>songDetailCreditsHTML(t)],
    ['댓글·대댓글',()=>commentsHTML([comment,{...comment,id:'reply',parent_id:'qa-comment'}],t)],
    ['DM 대화 상대',()=>'<a href="#dm/friend">'+conversationCopyHTML(person,person.name,'')+'</a>'],
    ['크루 관리 버튼 안 닉네임',()=>crewPeopleHTML({crew:{id:'qa-crew'},membership:{role:'owner'},members:[person]})],
    ['토킹룸 목록 방장',()=>talkingRoomCard({id:'local-room',mode:'talk',title:'로컬 방',host_name:person.name,host_profile:person})],
    ['라이브 노래방 목록 방장',()=>talkingRoomCard({id:'local-room',mode:'karaoke',title:'로컬 방',host_name:person.name,host_profile:person})],
    ['토킹룸 참여자 채팅',()=>voiceChatMessageHTML({...person,body:'검증 메시지'},false)],
    ['노래방 참여자 채팅',()=>voiceChatMessageHTML({...person,body:'검증 메시지'},true)],
    ['AI 아티스트 카드',()=>homeProfileCard({id:'friend-artist',name:'Preview Artist'},'artist')],
    ['알림 작성자',()=>activityRowHTML({id:'qa',kind:'comment',actor_name:person.name,actor_profile_id:'friend',actor_user_id:'other',available:true,target:'one',created:0})],
    ['듀엣 양쪽 참여자',()=>songCredits({...t,kind:'cover',duet_partner_id:'producer',duet_partner:'Veil',original_id:'one',original_title:'원곡',original_producer:'코코(별)',original_producer_id:'friend'})],
    ['더빙 참여 조합',()=>castingStageHTML({stage:1,selected:'combo',data:{root:{id:'root',title:'대본',ownerName:'코코(별)',ownerId:'other',roleCount:2,roles:[{id:'role',name:'역할'}]},combinations:[{id:'combo',count:1,state:'open',members:[{...person,roleId:'role'}]}]}})],
    ['선물 수신자',()=>giftCompactRecipient({...person,kind:'producer'},true)],
    ['AI 아티스트 선물 수신자',()=>giftCompactRecipient({id:'friend-artist',name:'Preview Artist',kind:'artist'},true)]
   ];
   for(const liveMode of [false,true])cases.push([liveMode?'노래방 참여자 목록':'토킹룸 참여자 목록',()=>{
    host.innerHTML='<div id="voice-announcement"><span id="voice-announcement-text"></span></div><div id="voice-members-list"></div><div id="voice-member-tools"></div><div id="voice-seat-invitation"></div><div id="voice-settings-readonly"></div><form id="voice-settings-form"></form>';
    VoiceRoomClient.prototype.paintFinalControls.call({state:{self:'owner',room:{host_id:'owner'},members:[{id:'owner',profile_id:'producer',name:'Veil',role:'host'},{...person,id:'other'}],karaoke:{queue:[]}},host,liveMode,canManageMember:()=>true,closeMemberTools(){}});
    return host.innerHTML;
   }]);
   for(const [name,render,selector='[data-user-nickname]'] of cases){
    try{
     host.innerHTML=await render();const targets=[...host.querySelectorAll(selector)];if(!targets.length)throw Error('No nickname target');
     let parents=0;host.onclick=()=>parents++;host.onpointerdown=()=>parents++;
     for(const target of targets){
      const hash=location.hash,key=target.dataset.profilePreview||target.getAttribute('href'),expected=key.includes('artist')?'artist':'user';
      const expectedName=key.includes('artist')?'Preview Artist':key.includes('producer')||key.includes('owner')?'Veil':'코코(별)';
      target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));target.click();
      await wait(()=>document.querySelector('dialog.profile-preview[open]'));
      const popup=document.querySelector('dialog.profile-preview[open]'),kind=popup.querySelector('[data-profile-kind]').dataset.profileKind;
      if(kind!==expected||popup.querySelector('h2').textContent!==expectedName)throw Error('Wrong identity '+key+' → '+kind+'/'+popup.querySelector('h2').textContent);
      if(location.hash!==hash||parents)throw Error('Parent action or URL changed');
      if(popup.scrollWidth>popup.clientWidth+2)throw Error('Popup horizontal overflow');
      popup.querySelector('[data-preview-close]').click();
     }
     // The surrounding action is still a separate target; do not invoke any real action.
     results.push({name,status:'PASS',nicknames:targets.length});
    }catch(e){results.push({name,status:'FAIL',error:e.message});closeProfilePreview();}
    output.textContent=JSON.stringify({width:innerWidth,height:innerHeight,results},null,2);
   }
  }catch(e){results.push({name:'setup',status:'FAIL',error:e.message});}
  host.remove();button.disabled=false;output.textContent=JSON.stringify({width:innerWidth,height:innerHeight,passed:results.filter(x=>x.status==='PASS').length,total:results.length,results},null,2);
 };
});
