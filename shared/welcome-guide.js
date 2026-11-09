// One owner-approved campaign. Redeploying must never create another delivery.
export const WELCOME_CAMPAIGN_ID = 'welcome-guide-20261108-v1';
export const WELCOME_PEER_ID = 'aifect-guide';
export const WELCOME_PREVIEW = '아이팩트에 오신 걸 환영해요! 이용 안내를 확인해보세요.';
export const WELCOME_GUIDE = {
 greeting: '{닉네임}님, 반가워요! 👋\n아이팩트에 오신 걸 환영해요.',
 intro: [
  '좋아하는 노래를 부르고, 사람들과 이야기를 나누고, 내가 만든 음악도 들려주세요.',
  '아이팩트에서 무엇을 할 수 있는지 소개해드릴게요. 마음이 끌리는 것부터 가볍게 시작해보세요! 💚'
 ],
 sections: [
  {id:'play',title:'🎤 오늘 부를 노래는, 플레이에서',body:'플레이에서 다양한 곡을 둘러보고 마음에 드는 노래를 찾아보세요. 듣고 싶은 곡을 감상하고, 부르고 싶은 곡은 내 목소리로 불러보세요.',label:'노래하러 가기',href:'#karaoke'},
  {id:'karaoke',title:'🎶 사람들과 함께 즐기는 노래방',body:'노래방에서는 사람들과 실시간으로 노래를 즐길 수 있어요. 서로의 노래를 듣고, 내 차례에는 직접 한 곡 불러보세요.',label:'노래방 가기',href:'#live?mode=karaoke'},
  {id:'talking',title:'💬 편하게 이야기 나누는 토킹룸',body:'음악 취향부터 소소한 일상까지, 토킹룸에서 자유롭게 이야기해보세요. 가벼운 인사로 새로운 사람들과 만나보세요.',label:'토킹룸 가기',href:'#voice?mode=talk'},
  {id:'crew',title:'🎮 크루에 가입하고 크루게임도 즐겨요',body:'마음에 드는 크루에 가입하고, 크루원들과 함께 크루게임에 참여해보세요. 크루 페이지에서 참여할 수 있는 게임을 확인할 수 있어요.',label:'크루 둘러보기',href:'#community/crews'},
  {id:'duet',title:'🎙️ 두 목소리가 어우러지는 듀엣',body:'함께 부르고 싶은 곡을 찾아 듀엣에 참여해보세요. 서로의 목소리가 어우러진 노래를 함께 완성해보세요.',label:'듀엣 참여하기',href:'#karaoke/duets'},
  {id:'dubbing',title:'🎧 여러 목소리로 완성하는 더빙',body:'참여하고 싶은 더빙 작품을 찾아 내 목소리를 더해보세요. 여러 사람과 함께 하나의 작품을 완성하는 즐거움을 느껴보세요.',label:'더빙 참여하기',href:'#karaoke/dubbing?tab=join'},
  {id:'artists',title:'✨ 나의 취향에 맞는 AI 아티스트',body:'개성 있는 AI 아티스트들을 만나고, 마음에 드는 아티스트를 팔로우해보세요. 응원의 한마디로 좋아하는 마음도 전해보세요.',label:'아티스트 만나기',href:'#artists'},
  {id:'studio',title:'🎼 스튜디오에서 내 제작곡을 소개해요',body:'만들어둔 곡이 있다면 스튜디오에 올려보세요. 내 음악을 사람들에게 들려주고, 나의 노래를 좋아하는 사람들을 만나보세요.',label:'제작곡 올리기',href:'#upload'},
  {id:'premium',title:'💎 더 많은 제작곡을 올리고 싶다면',body:'소개하고 싶은 내 음악이 더 있나요? 더 많은 제작곡을 올릴 수 있는 프리미엄 혜택을 살펴보세요.',label:'프리미엄 혜택 보기',href:'#membership'}
 ],
 closing: ['노래 한 곡, 짧은 인사, 나만의 작품 하나로 시작해보세요.','아이팩트에서 즐거운 시간 보내세요! 💚']
};
