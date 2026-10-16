package kr.co.aifect.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.request.CachePolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable internal fun MyWalletPanel(m:MusicModel){
 val account=m.user?.optString("id")
 var wallet by remember(account){mutableStateOf<JSONObject?>(null)}
 var failed by remember(account){mutableStateOf(false)}
 var revision by remember{mutableIntStateOf(0)}
 LaunchedEffect(account,revision,m.showGifts,m.showRewards,m.showBilling,m.showDiamonds){
  if(account==null)return@LaunchedEffect
  try{val d=m.api.call("/api/gold/balance",fresh=true);if(account==m.user?.optString("id")){wallet=d;failed=false}}catch(e:Exception){if(e is CancellationException)throw e;failed=true}
 }
 Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
  OutlinedButton(onClick={m.showRewards=true},modifier=Modifier.weight(1f)){Text("실버 ${wallet?.let{"${it.optInt("silver_balance")} S"}?:"—"}")}
  OutlinedButton(onClick={m.showBilling=true},modifier=Modifier.weight(1f)){Text("골드 ${wallet?.let{"${it.optInt("balance")} G"}?:"—"}")}
 }
 if(failed)TextButton(onClick={revision++}){Text("잔액 다시 불러오기")}
}

/** Private playlist covers are never written to the public image cache. */
@Composable internal fun PlaylistCoverImage(p:JSONObject,modifier:Modifier){
 val context=LocalContext.current
 val session=NativeSession.cookie(context)
 val api=remember(session){NativeApi(context)}
 val loader=remember(session){ImageLoader.Builder(context).okHttpClient(api.client).diskCachePolicy(CachePolicy.DISABLED).memoryCachePolicy(CachePolicy.DISABLED).build()}
 DisposableEffect(loader){onDispose{loader.shutdown()}}
 AsyncImage(Endpoint.url("/media/playlist/${p.optString("id")}/image?v=${p.optString("image_version")}"),"플레이리스트 표지",imageLoader=loader,modifier=modifier,contentScale=ContentScale.Crop)
}

@Composable internal fun PlaylistImageEditor(m:MusicModel,p:JSONObject){
 var working by remember(p.optString("id")){mutableStateOf(false)}
 val account=m.user?.optString("id")
 val scope=rememberCoroutineScope()
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->
  if(uri!=null&&!working)scope.launch{
   working=true
   try{m.api.uploadWebp("/api/playlists/${p.optString("id")}/image",uri);m.api.invalidateReads();if(m.user?.optString("id")==account){m.openList(p.optString("id"));m.refreshLibrary(true);m.notice="플레이리스트 사진을 변경했어요."}}
   catch(e:Exception){if(e is CancellationException)throw e;if(m.user?.optString("id")==account)m.notice=e.message}finally{working=false}
  }
 }
 TextButton(onClick={picker.launch("image/*")},enabled=!working&&!p.optBoolean("locked"),modifier=Modifier.testTag("playlist-cover-edit")){Icon(Icons.Rounded.AddPhotoAlternate,null,Modifier.size(19.dp));Text(if(working)"사진 저장 중…" else "플레이리스트 사진 변경",Modifier.padding(start=6.dp))}
}

@Composable internal fun AlbumImageEditor(m:MusicModel,song:Song){
 if(song.cover||song.raw.optString("user_id")!=m.user?.optString("id"))return
 val account=m.user?.optString("id")
 var working by remember(song.id){mutableStateOf(false)}
 val scope=rememberCoroutineScope()
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->
  if(uri!=null&&!working)scope.launch{working=true;try{m.api.uploadWebp("/api/studio/tracks/${song.id}/image",uri);m.api.invalidateReads();if(account==m.user?.optString("id")){m.openSong(song);m.loadStudio();m.notice="앨범 커버를 변경했어요."}}catch(e:Exception){if(e is CancellationException)throw e;if(account==m.user?.optString("id"))m.notice=e.message}finally{working=false}}
 }
 TextButton(onClick={picker.launch("image/*")},enabled=!working,modifier=Modifier.testTag("album-cover-edit")){Icon(Icons.Rounded.AddPhotoAlternate,null,Modifier.size(18.dp));Text(if(working)"사진 저장 중…" else "앨범 커버 변경",Modifier.padding(start=6.dp))}
}

@Composable internal fun SongCoverTabs(m:MusicModel,song:Song,sing:(Song)->Unit){
 var tab by remember(song.id){mutableStateOf("솔로")}
 var tracks by remember(song.id,tab){mutableStateOf<List<Song>>(emptyList())}
 var busy by remember(song.id,tab){mutableStateOf(true)}
 var error by remember(song.id,tab){mutableStateOf<String?>(null)}
 var revision by remember{mutableIntStateOf(0)}
 val path="/api/tracks/${song.id}/covers?mode="+(if(tab=="랭킹")"all" else if(tab=="듀엣")"duet" else "solo")+"&sort="+(if(tab=="랭킹")"plays" else "recent")
 LaunchedEffect(path,revision){busy=true;try{tracks=m.api.call(path,fresh=true).tracks("covers");error=null}catch(e:Exception){if(e is CancellationException)throw e;error=e.message}finally{busy=false}}
 Column(Modifier.fillMaxWidth().padding(vertical=12.dp).testTag("song-cover-tabs")){
  Text("커버곡",fontSize=20.sp);Chips(listOf("솔로","듀엣","랭킹"),tab){tab=it}
  if(tab=="랭킹")Text("누적 조회수 순",fontSize=12.sp,color=Muted)
  if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
  error?.let{Text(it,color=Pink);TextButton(onClick={revision++}){Text("다시 불러오기")}}
  tracks.take(5).forEachIndexed{index,cover->
   Row(verticalAlignment=Alignment.CenterVertically){if(tab=="랭킹")Text("${index+1}",color=Pink,modifier=Modifier.width(26.dp));Box(Modifier.weight(1f)){SongRow(cover,m,tracks)}}
   if(cover.raw.optInt("duet_open")==1&&cover.raw.optString("user_id")!=m.user?.optString("id"))TextButton(onClick={sing(cover)}){Text("이 듀엣에 참여하기")}
  }
  if(!busy&&error==null&&tracks.isEmpty())Text("아직 공개된 ${if(tab=="랭킹")"" else "$tab "}커버가 없어요.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(vertical=16.dp))
  if(tracks.size>5)TextButton(onClick={m.detail=null;m.browseCollection("${song.title} · $tab",path,if(tab=="랭킹")"누적 조회수 순" else "",resultKey="covers")}){Text("커버 더 보기")}
 }
}
