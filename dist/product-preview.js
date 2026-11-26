(async () => {
 const source=document.getElementById('product-review-data'), main=document.querySelector('#main');
 if(!source||!main)return;
 // The normal commerce and room templates render fixture data without binding
 // any commerce, WebRTC, audio, chat, equipment or navigation commands.
 const data=JSON.parse(source.textContent);
 const stopEvent=event=>{
  if(event.target.closest?.('button,a,input,select,textarea,form,[role=button],[contenteditable]')){
   event.preventDefault();event.stopImmediatePropagation();
  }
 };
 for(const type of ['click','submit','keydown','beforeinput'])document.addEventListener(type,stopEvent,true);
 const safeTime=1764115200;
 const periodLabels={P7D:'7일',P1M:'1개월',P3M:'3개월',PERMANENT:'영구'};
 const profile={id:'qa-profile-1',user_id:'qa-member-1',name:'아리아',public_id:'QAA0001',bio:'상품 적용 검수용 프로필입니다.'};
 const viewer={id:'qa-member-2',profile_id:'qa-profile-2',name:'소리',public_id:'QAA0002'};
 const signedIn={id:profile.user_id,profile_id:profile.id,name:profile.name,public_id:profile.public_id};
 if(data.surface==='messages')me=viewer;
 else if(data.surface!=='shop'&&data.surface!=='profile')me=signedIn;
 const frameArt=data.type==='frame'?data.base.fallback||data.base.base:null;
 const pictures=keys=>frameArt?keys.map(profile_id=>({profile_id,artwork:frameArt,effect:data.decor.assetPaths.effect,expires_at:0})):[];
 async function inventory(){
  const period=Object.keys(data.decor?.periodPrices||{})[0];
  const player={server_now:safeTime,inventory:[],decorations:[],stored_decorations:data.decor?[{
   id:'qa-entitlement',item_key:data.id,product:data.decor,period_code:period,permanent:period==='PERMANENT',
   stored:true,available:true,giftable:true
  }]:[]};
  const gifts={items:data.gift?[{id:'qa-gift',gift_type:data.id,gift_name:data.gift.name,
   image:data.gift.image,expires_at:0,available:true,giftable:true}]:[]};
  main.dataset.route='inventory';
  main.innerHTML=(await unifiedInventoryView('inventory',async path=>path==='/api/me/player'?player:gifts)).html;
 }
 function room(){
  const live=data.surface.startsWith('karaoke'),mode=live?'karaoke':'talk';
  const pc=matchMedia('(min-width:801px) and (hover:hover) and (pointer:fine)').matches;
  main.dataset.route=live?'live/qa-room':'voice/qa-room';setVoiceFocus(true);
  main.innerHTML=live?liveKaraokeRoomHTML('qa-room'):voiceRoomHTML('qa-room');
  const host=main.querySelector('[data-voice-room]');host.toggleAttribute('data-room-pc-controls',pc);
  const skin=AifectPlayer.DEFAULT_ROOM_SKIN;
  const theme={sku:data.type==='theme'?data.id:skin.sku,
   assets:data.type==='theme'?data.decor.assetPaths:skin.assetPaths,
   artwork:data.decor?.themeArtwork,
   uiMode:data.surface.endsWith('-light')?'light':'dark',expires_at:data.type==='theme'?4102444800:0};
  const names=['아리아','소리','코러스','별빛','은하','선율','라임','루나','하늘'];
  const members=names.map((name,i)=>({id:'qa-member-'+(i+1),profile_id:'qa-profile-'+(i+1),name,
   seat:i<8?i:null,role:i===0?'host':'member',muted:data.surface.endsWith('-muted')&&i===1}));
  const chat=[
   {id:'qa-chat-1',sequence:1,body:'오늘도 함께 들어요.',user_id:'qa-member-2',profile_id:'qa-profile-2',name:'소리',created:safeTime*1000},
   {id:'qa-chat-2',sequence:2,body:'환영합니다!',user_id:'qa-member-1',profile_id:'qa-profile-1',name:'아리아',created:safeTime*1000+2000}
  ];
  const client=Object.assign(Object.create(VoiceRoomClient.prototype),{
   host,liveMode:live,micState:'muted',closed:false,joined:true,seenGifts:new Set(),talkGiftQueue:[],preferences:{music:1,voice:1},
   state:{self:'qa-member-1',members,room:{id:'qa-room',title:live?'라이브 노래방':'토킹룸',max_members:30,host_id:'qa-member-1',mode,theme},chat,
    music:{queue:[],index:0,revision:1,volume:1,balance:.5,playing:false}},
   warmMicrophone(){},updateListening(){},updateRoomNotice(){},async safe(){},
   paintMusic(){if(!live)this.paintFinalMusic();}
  });
  productionVoicePaint.call(client);
  const elapsed=host.querySelector('[data-room-elapsed]');if(elapsed)elapsed.textContent='12:34';
  host.dataset.themeSku=theme.sku;
  AifectProductThemePreview(host,theme,pictures(members.map(p=>p.profile_id)));
  if(live){
   client.liveWords=[{s:0,w:[{s:0,t:'별이 빛나는 밤에'}]},{s:4,w:[{s:4,t:'우리의 노래가 들려요'}]},
    {s:9,w:[{s:9,t:'같은 하늘을 보며'}]}];liveRenderLyrics(client,5);
   host.querySelector('#live-timer').textContent='0:05 / 3:20';host.querySelector('#live-progress').value=2.5;
  }
  bindRoomViewport(client);
  window.addEventListener('pagehide',()=>{
   client.roomLayoutEvents.abort();client.roomResizeObserver?.disconnect();
   cancelAnimationFrame(client.roomLayoutFrame);client.talkGiftQueue.length=0;client.finishTalkGift();
  },{once:true});
  if(data.gift){
   const receiver=members[data.surface.endsWith('unseated')?8:1];
   setTimeout(()=>client.animateGift({from:'아리아',to:receiver.name,gift:{...data.gift,type:data.id,name:data.gift.name,quantity:1,target_id:receiver.id}}),380);
  }
 }
 try{
  updateAccount();
  if(data.surface==='shop'){
   main.dataset.route='gifts';
   const category=data.type==='theme'?'themes':data.type==='frame'?'frames':'gifts';
   const fixture={gifts:data.gift&&!data.gift.free?[data.gift]:[],silver_gifts:data.gift?.free?[data.gift]:[]};
   main.innerHTML=await finalGiftShopView(category,async path=>path==='/api/decorations'?{products:data.decor?[data.decor]:[],periods:periodLabels}:fixture);
   bindShopShelves();
  }else if(data.surface==='inventory')await inventory();
  else if(data.surface==='gift-picker'){
   main.dataset.route='gifts';
   history.replaceState(history.state,'','#gifts');
   dialog(giftPickerHTML({profile:{...profile,kind:'producer'},canChange:true,choices:[data.gift],ownedHTML:'',
    wallet:{balance:120000,free:{balance:10000}},selected:data.id,activeCategory:'gifts'}));
  }else if(data.surface==='my'){
   main.dataset.route='profile';
   const fixture={profile,followers:3,following_count:4,tracks:[],covers:[],dubbings:[],artists:[],gallery:[]};
   main.innerHTML=(await myPageView('profile','','profile',async ()=>fixture)).html;
   AifectProductThemePreview(null,null,pictures([profile.id]));
  }else if(data.surface==='messages'){
   main.dataset.route='dm/'+profile.id;
   rememberDmInbox({conversations:[{...profile,updated:safeTime,last_message:'오늘도 함께 들어요.'}]});
   const messages=[
    {id:'qa-message-1',sender_id:profile.user_id,body:'오늘도 함께 들어요.',created:safeTime},
    {id:'qa-message-2',sender_id:viewer.id,body:'좋아요!',created:safeTime+2}
   ];
   main.innerHTML=(await dmRouteView(profile.id,main.dataset.route,async ()=>({peer:profile,messages,settings:{}}))).html;
   AifectProductThemePreview(null,null,pictures([profile.id]));
  }else if(data.surface==='profile'){
   main.dataset.route='profile';
   main.innerHTML=profilePreviewHTML({profile,followers:3,following_count:4});
   AifectProductThemePreview(null,null,pictures([profile.id]));
  }else room();
  const route=main.dataset.route?.split('/')[0];
  for(const link of document.querySelectorAll('.nav-link[data-view]'))link.classList.toggle('active',link.dataset.view===route);
  icons();
  document.documentElement.dataset.previewReady='true';
 }catch(error){
  console.error(error);
  main.textContent='서비스 구성 요소를 표시할 수 없습니다.';
  document.documentElement.dataset.previewReady='error';
 }
})();
