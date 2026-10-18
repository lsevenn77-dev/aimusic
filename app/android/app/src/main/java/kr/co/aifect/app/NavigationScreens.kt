@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

@Composable internal fun NavigationSheet(m:MusicModel,close:()->Unit){
 ModalBottomSheet(onDismissRequest=close,sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=Ink){
  Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp).testTag("all-navigation")){
   Text("AIFECT",fontSize=24.sp,color=Pink);Spacer(Modifier.height(16.dp))
   @Composable fun entry(label:String,icon:ImageVector,action:()->Unit){
    TextButton(onClick={close();action()},modifier=Modifier.fillMaxWidth().testTag("menu-$label"),colors=ButtonDefaults.textButtonColors(contentColor=SoftText),contentPadding=PaddingValues(12.dp)){
     Icon(icon,null,Modifier.size(22.dp),tint=Violet);Text(label,Modifier.weight(1f).padding(start=16.dp));Icon(Icons.Outlined.ChevronRight,null,tint=Muted)
    }
   }
   entry("홈",Icons.Outlined.Home){m.selectTab(0);m.listenPage="추천"}
   entry("부르기",Icons.Outlined.MicNone){m.selectTab(2)}
   entry("커뮤니티",Icons.Outlined.PeopleOutline){m.selectTab(3)}
   entry("선물함",Icons.Outlined.CardGiftcard){m.openGifts()}
   entry("메시지",Icons.Outlined.ChatBubbleOutline){m.openMessages()}
   entry("알림 기록",Icons.Outlined.NotificationsNone){if(m.authenticated())m.showNotifications=true}
   entry("마이",Icons.Outlined.PersonOutline){m.selectTab(6)}
   entry("내 보관함",Icons.Outlined.LibraryMusic){m.library("보관함")}
   entry("창작자 스튜디오",Icons.Outlined.Tune){m.openStudio()}
   HorizontalDivider(Modifier.padding(vertical=12.dp),color=Stroke)
   entry("인기 차트",Icons.Outlined.BarChart){m.selectTab(0);m.listenPage="차트"}
   entry("기분 · 장르별 발견",Icons.Outlined.Explore){m.selectTab(1)}
   entry("공개 플레이리스트",Icons.Outlined.QueueMusic){m.directoryKind="playlists";m.selectTab(8)}
   entry("AI 아티스트",Icons.Outlined.PeopleOutline){m.directoryKind="artists";m.selectTab(8)}
   entry("팔로우",Icons.Outlined.PersonAddAlt){m.library("팔로잉")}
   entry("아이템 보관함",Icons.Outlined.Inventory2){if(m.authenticated())m.showInventory=true}
   entry("오늘의 실버",Icons.Outlined.Stars){if(m.authenticated())m.showRewards=true}
   entry("다이아 · 내 정산",Icons.Outlined.AccountBalanceWallet){if(m.authenticated())m.showDiamonds=true}
  }
 }
}

@Composable internal fun MusicDirectoryScreen(m:MusicModel){
 val artists=m.directoryKind=="artists"
 var entries by remember(artists){mutableStateOf<List<JSONObject>>(emptyList())}
 var error by remember(artists){mutableStateOf<String?>(null)}
 var busy by remember(artists){mutableStateOf(true)}
 var retry by remember{mutableIntStateOf(0)}
 LaunchedEffect(artists,retry){busy=true;try{
  val data=m.api.call(if(artists)"/api/catalog" else "/api/playlists",fresh=true)
  entries=data.optJSONArray(if(artists)"artists" else "playlists").objects();error=null
 }catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}
 LazyColumn(Modifier.fillMaxSize().testTag("music-directory"),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
  item{Heading(if(artists)"AI 아티스트" else "공개 플레이리스트");if(busy)LinearProgressIndicator(Modifier.fillMaxWidth());error?.let{Text(it);TextButton(onClick={retry++}){Text("다시 불러오기")}}}
  items(entries,key={it.getString("id")}){p->
   if(artists)Row(Modifier.fillMaxWidth().clickable{m.openProfile(p.getString("id"),"artist")}.padding(12.dp),verticalAlignment=Alignment.CenterVertically){
    Avatar(p.optString("name"),JSONObject(p.toString()).put("profile_kind","artist"),56);Column(Modifier.weight(1f).padding(start=14.dp)){Text(p.optString("name"));Text(p.optString("genre"),color=Muted,fontSize=12.sp)};Icon(Icons.Outlined.ChevronRight,null)
   }else PlaylistRow(p,m)
  }
  if(!busy&&error==null&&entries.isEmpty())item{Text("아직 공개된 항목이 없어요.",color=Muted)}
 }
}
