package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import androidx.media3.common.Player

/** Real account data only; reference artwork and sample conversations are not app data. */
@Composable internal fun ReferenceLibrary(m:MusicModel){
 var playlistsOpen by rememberSaveable(m.user?.optString("id")){mutableStateOf(false)}
 Column(verticalArrangement=Arrangement.spacedBy(12.dp),modifier=Modifier.testTag("my-library-cards")){
  listOf(Triple("좋아요",Icons.Rounded.FavoriteBorder,"${m.likes.size}곡"),Triple("최근 감상",Icons.Rounded.Schedule,"${m.history.size}곡"),Triple("플레이리스트",Icons.Rounded.LibraryMusic,"${m.playlists.size}개")).forEach{(label,icon,count)->
   Surface(onClick={if(label=="플레이리스트")playlistsOpen=true else m.library(label)},color=Panel,shape=RoundedCornerShape(14.dp),border=BorderStroke(1.dp,Stroke),modifier=Modifier.fillMaxWidth().testTag(if(label=="플레이리스트")"my-playlists-open" else "my-library-$label")){
    Row(Modifier.padding(horizontal=16.dp,vertical=15.dp),verticalAlignment=Alignment.CenterVertically){
     Icon(icon,null,tint=Pink,modifier=Modifier.size(25.dp))
     Column(Modifier.weight(1f).padding(start=18.dp)){Text(label,fontSize=14.sp,lineHeight=20.sp,fontWeight=FontWeight.SemiBold);Text(count,fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.padding(top=5.dp))}
     Icon(Icons.Rounded.ChevronRight,null,tint=SoftText)
    }
   }
  }
 }
 if(playlistsOpen)ReferencePlaylistGridPage(m){playlistsOpen=false}
}

/** My's collection entry keeps square covers, while the existing detail page
 * remains the authority for playlist editing, images, ordering and deletion. */
@Composable private fun ReferencePlaylistGridPage(m:MusicModel,close:()->Unit){
 var query by rememberSaveable{mutableStateOf("")}
 var creating by rememberSaveable{mutableStateOf(false)}
 var name by rememberSaveable{mutableStateOf("")}
 var public by rememberSaveable{mutableStateOf(false)}
 val lists=m.playlists.filter{it.optString("name").contains(query.trim(),true)}
 LaunchedEffect(m.user?.optString("id")){if(m.user!=null)m.refreshLibrary(fresh=true)}
 AppPage("플레이리스트",close){
  LazyColumn(Modifier.fillMaxSize().testTag("my-playlist-grid"),contentPadding=PaddingValues(20.dp,8.dp,20.dp,28.dp),verticalArrangement=Arrangement.spacedBy(18.dp)){
   item{
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
     Text("내 플레이리스트",fontSize=17.sp,lineHeight=23.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
     TextButton({creating=true},enabled=m.user!=null,modifier=Modifier.testTag("my-playlist-create")){Icon(Icons.Rounded.Add,null,Modifier.size(17.dp));Text("새로 만들기",fontSize=12.sp,lineHeight=17.sp)}
    }
    CurrentSearch(query,{query=it},"플레이리스트 검색","my-playlist-search",Modifier.padding(top=8.dp))
   }
   items(lists.chunked(2),key={row->row.first().optString("id")}){row->
    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(14.dp)){
     row.forEach{p->ReferencePlaylistTile(p,m,Modifier.weight(1f))}
     if(row.size==1)Spacer(Modifier.weight(1f))
    }
   }
   if(lists.isEmpty())item{Empty(if(query.isBlank())"첫 플레이리스트를 만들어보세요" else "일치하는 목록이 없어요",if(query.isBlank())"좋아하는 음악을 하나씩 모아보세요." else "다른 이름으로 검색해보세요.",Icons.Rounded.LibraryMusic)}
  }
 }
 if(creating)AppFormPage(onDismissRequest={if(!m.busy)creating=false},title={Text("새 플레이리스트")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
  OutlinedTextField(name,{name=it.take(80)},label={Text("플레이리스트 이름")},singleLine=true,modifier=Modifier.fillMaxWidth().testTag("my-playlist-create-name"))
  Row(verticalAlignment=Alignment.CenterVertically){Checkbox(public,{public=it},enabled=!m.busy);Text("다른 사람에게 공개하기",fontSize=13.sp)}
 }},confirmButton={TextButton(onClick={m.createList(name,public){creating=false;name="";public=false}},enabled=name.isNotBlank()&&!m.busy,modifier=Modifier.testTag("my-playlist-create-save")){Text("저장")}},dismissButton={TextButton(onClick={creating=false},enabled=!m.busy){Text("취소")}})
}

@Composable private fun ReferencePlaylistTile(p:JSONObject,m:MusicModel,modifier:Modifier){
 val id=p.optString("id")
 Column(modifier.testTag("my-playlist-tile-$id")){
  Box(Modifier.fillMaxWidth().aspectRatio(1f)){
   PlaylistArt(p,Modifier.fillMaxSize().clickable{m.openList(id)})
   IconButton(onClick={m.playPlaylist(id)},enabled=m.playlistPlayLoading!=id,modifier=Modifier.align(Alignment.BottomEnd).padding(5.dp).testTag("playlist-play-$id")){
    if(m.playlistPlayLoading==id)CircularProgressIndicator(Modifier.size(25.dp),color=Pink,strokeWidth=2.dp)
    else Box(Modifier.size(34.dp).background(Ink,CircleShape).border(1.dp,BrandGradient,CircleShape),contentAlignment=Alignment.Center){Icon(Icons.Rounded.PlayArrow,"${p.optString("name")} 전체 재생",Modifier.size(23.dp),tint=Pink)}
   }
  }
  Text(p.optString("name"),fontSize=13.sp,lineHeight=18.sp,fontWeight=FontWeight.SemiBold,maxLines=2,overflow=TextOverflow.Ellipsis,modifier=Modifier.fillMaxWidth().padding(top=7.dp).clickable{m.openList(id)})
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   Text("${p.optInt("tracks")}곡",fontSize=11.sp,lineHeight=16.sp,color=Muted,modifier=Modifier.weight(1f))
   IconButton({m.openList(id)},modifier=Modifier.size(36.dp).testTag("my-playlist-manage-$id")){Icon(Icons.Rounded.MoreHoriz,"플레이리스트 상세 및 관리",Modifier.size(18.dp),tint=Muted)}
  }
 }
}

@Composable internal fun ReferenceActivity(m:MusicModel){
 val read=currentRead(m,"/api/notifications?filter=all",m.user!=null)
 val own=currentRead(m,"/api/me/profile?section=activity",m.user!=null)
 var expanded by remember{mutableStateOf(false)}
 val entries=(read.data?.optJSONArray("items").objects()+own.data?.optJSONArray("recent").objects().map{JSONObject(it.toString()).put("own_activity",true)}).sortedByDescending{it.optLong("created")}
 Column(Modifier.fillMaxWidth().testTag("my-activity-feed")){
  if(read.loading||own.loading)LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical=8.dp).testTag("my-activity-loading"),color=Pink,trackColor=Stroke)
  listOf("받은 소식" to read,"내 활동" to own).forEach{(label,source)->
   source.error?.let{message->Column(Modifier.fillMaxWidth().padding(vertical=12.dp)){
    Text("$label · $message",color=Muted,fontSize=14.sp)
    TextButton(onClick=source::retry){Text("$label 다시 불러오기")}
   }}
  }
  entries.take(if(expanded)50 else 8).forEach{n->
   Row(Modifier.fillMaxWidth().padding(vertical=14.dp),verticalAlignment=Alignment.Top){
    val gift=n.optString("kind") in listOf("gift","person_gift")
    val mine=n.optBoolean("own_activity")
    Icon(if(n.optString("kind")=="like")Icons.Rounded.Favorite else if(n.optString("kind")=="comment")Icons.Rounded.ChatBubbleOutline else if(gift)Icons.Rounded.CardGiftcard else Icons.Rounded.Mic,null,tint=if(gift)Pink else Aqua,modifier=Modifier.size(22.dp))
    val actor=JSONObject().put("id",n.optString("actor_profile_id")).put("image_version",n.optString("actor_image_version"))
    if(!mine)Box(Modifier.padding(start=10.dp)){Avatar(n.optString("actor_name"),actor,40)}
    Column(Modifier.weight(1f).padding(start=12.dp)){
     Text(if(mine)when(n.optString("kind")){"like"->"내가 좋아요를 남겼어요.";"comment"->"내가 댓글을 남겼어요.";else->"내가 응원 선물을 보냈어요."}else n.optString("actor_name")+if(gift)"님이 선물을 보냈습니다." else if(n.optString("kind")=="duet")"님이 듀엣에 참여했습니다." else "님이 커버를 공개했습니다.",fontSize=14.sp,lineHeight=21.sp)
     Text(if(mine)n.optString("title")else if(gift)"${n.optString("gift_name")} ${n.optInt("quantity",1)}개" else n.optString("source_title"),fontSize=12.sp,lineHeight=18.sp,color=Muted,modifier=Modifier.padding(top=5.dp))
     Text(socialTime(n.optLong("created")),fontSize=10.sp,lineHeight=15.sp,color=Muted,modifier=Modifier.padding(top=6.dp))
    }
   }
   HorizontalDivider(color=Stroke)
  }
  if(entries.isEmpty()&&!read.loading&&!own.loading&&read.error==null&&own.error==null)Empty("아직 활동이 없어요","새로운 참여와 선물 소식을 이곳에서 확인하세요.",Icons.Rounded.NotificationsNone)
  if(entries.size>8)TextButton({expanded=!expanded},modifier=Modifier.fillMaxWidth()){Text(if(expanded)"접기"else "더보기");Icon(if(expanded)Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,null)}
  TextButton(onClick={m.showNotifications=true},modifier=Modifier.fillMaxWidth()){Text("활동 전체보기");Icon(Icons.Rounded.ChevronRight,null)}
 }
}

