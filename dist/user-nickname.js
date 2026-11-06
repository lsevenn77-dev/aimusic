const nicknameEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Shared identity text. IDs are explicit: a track/playlist/recording ID is never a user ID.
function nicknameProfileKey({profileId,userId,artistId,entityType='user',accountType}={}){
 const valid=value=>typeof value==='string'&&/^[\w-]+$/.test(value)&&!['undefined','null'].includes(value);
 if(entityType==='artist'||entityType==='ai_artist'||accountType==='ai_artist')return valid(artistId)?'artist:'+artistId:'';
 return valid(profileId)?profileId:valid(userId)?'member:'+userId:'';
}
function userNickname(nickname,identity={},options={}){
 const name=nicknameEscape(nickname||''),key=nicknameProfileKey(identity);
 const cls=options.className?' '+nicknameEscape(options.className):'';
 if(!key||!name)return options.className?`<span class="user-nickname${cls}">${name}</span>`:name;
 return `<span class="user-nickname${cls}" data-user-nickname data-profile-preview="${nicknameEscape(key)}" data-profile-stop="${options.stopPropagation===false?'false':'true'}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${name} 프로필 보기">${name}</span>`;
}
function memberNickname(p,name=p?.name,options={}){
 return userNickname(name,{profileId:p?.profile_id||p?.producer_id,userId:p?.user_id,accountType:p?.account_type},options);
}
function trackNickname(t,role='artist'){
 if(!t)return '';
 if(role==='artist'&&hasArtist(t))return userNickname(t.artist,{artistId:t.artist_id,entityType:'artist'});
 return userNickname(t.producer||t.artist||'',{profileId:t.producer_id,userId:t.user_id});
}
function trackPerformers(t){
 const partner=t.duet_partner_id?userNickname(t.duet_partner,{profileId:t.duet_partner_id})+' &amp; ':'';
 return partner+trackNickname(t,'producer');
}
function playlistOwnerNickname(p){return userNickname(p.owner_name||'리스너',{profileId:p.owner_profile_id,userId:p.user_id});}

globalThis.AifectNicknames={userNickname,nicknameProfileKey};
