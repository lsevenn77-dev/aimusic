package kr.co.aifect.app

import android.app.Application
import android.content.ComponentName
import android.net.Uri
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.*
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import android.util.Base64

class MusicModel(app:Application):AndroidViewModel(app) {
 val api=NativeApi(app)
 var tab by mutableIntStateOf(0)
 var loading by mutableStateOf(true)
 var refreshing by mutableStateOf(false)
 var error by mutableStateOf<String?>(null)
 var notice by mutableStateOf<String?>(null)
 var home by mutableStateOf<List<Song>>(emptyList())
 var latest by mutableStateOf<List<Song>>(emptyList())
 var recentCovers by mutableStateOf<List<Song>>(emptyList())
 var listenPage by mutableStateOf("추천")
 var libraryPage by mutableStateOf("좋아요")
 var collection by mutableStateOf<MusicCollection?>(null)
 var collectionBusy by mutableStateOf(false)
 var collectionError by mutableStateOf<String?>(null)
 var searchLists by mutableStateOf<List<JSONObject>>(emptyList())
 var myTracks by mutableStateOf<List<Song>>(emptyList())
 var studioBusy by mutableStateOf(false)
 var studioError by mutableStateOf<String?>(null)
 var singable by mutableStateOf<List<Song>>(emptyList())
 var feed by mutableStateOf<List<Song>>(emptyList())
 var publicLists by mutableStateOf<List<JSONObject>>(emptyList())
 var people by mutableStateOf<List<JSONObject>>(emptyList())
 var search by mutableStateOf("")
 var searchResults by mutableStateOf<List<Song>>(emptyList())
 var searchPeople by mutableStateOf<List<JSONObject>>(emptyList())
 var searching by mutableStateOf(false)
 var searched by mutableStateOf(false)
 var user by mutableStateOf<JSONObject?>(null)
 var membership by mutableStateOf(JSONObject())
 var providers by mutableStateOf<List<String>>(emptyList())
 var googleClientId by mutableStateOf("")
 var emailEnabled by mutableStateOf(false)
 var likes by mutableStateOf<List<Song>>(emptyList())
 var playlists by mutableStateOf<List<JSONObject>>(emptyList())
 var follows by mutableStateOf<List<JSONObject>>(emptyList())
 var history by mutableStateOf<List<Song>>(emptyList())
 var showLogin by mutableStateOf(false)
 var showAccount by mutableStateOf(false)
 var busy by mutableStateOf(false)
 var detail by mutableStateOf<Song?>(null)
 var detailBusy by mutableStateOf(false)
 var comments by mutableStateOf<List<JSONObject>>(emptyList())
 var selectedList by mutableStateOf<JSONObject?>(null)
 var listSongs by mutableStateOf<List<Song>>(emptyList())
 var profile by mutableStateOf<JSONObject?>(null)
 var profileSongs by mutableStateOf<List<Song>>(emptyList())
 var profileCovers by mutableStateOf<List<Song>>(emptyList())
 var profileFollowers by mutableIntStateOf(0)
 var current by mutableStateOf<Song?>(null)
 var playing by mutableStateOf(false)
 var buffering by mutableStateOf(false)
 var position by mutableLongStateOf(0)
 var duration by mutableLongStateOf(0)
 var shuffle by mutableStateOf(false)
 var repeat by mutableIntStateOf(0)
 var playerError by mutableStateOf<String?>(null)
 var fullPlayer by mutableStateOf(false)
 var lyric by mutableStateOf("")
 var lyricRows by mutableStateOf<List<Pair<Double,String>>>(emptyList())
 var lyricsAccess by mutableStateOf("line")
 var controller:MediaController?=null
 var rankOpen by mutableStateOf(false)
 var rankPeriod by mutableStateOf("today")
 var rankKind by mutableStateOf("tracks")
 var rankOriginal by mutableStateOf<Song?>(null)
 var rankGenre by mutableStateOf("전체")
 var rankQuery by mutableStateOf("")
 var rankTracks by mutableStateOf<List<Song>>(emptyList())
 var rankSingers by mutableStateOf<List<JSONObject>>(emptyList())
 var rankBusy by mutableStateOf(false)
 var rankError by mutableStateOf<String?>(null)
 var rankHighlights by mutableStateOf<Map<String,Song?>>(emptyMap())
 var highlightsBusy by mutableStateOf(false)
 var highlightsError by mutableStateOf<String?>(null)
 private var rankJob:Job?=null
 private var highlightsJob:Job?=null
 private val songs=mutableMapOf<String,Song>()
 private var searchJob:Job?=null
 private var detailJob:Job?=null
 private var feedJob:Job?=null
 private var collectionJob:Job?=null
 private var studioJob:Job?=null
 private var authJob:Job?=null
 private var lyricUntil=-1.0
 private var lyricFrom=-1.0
 private var lyricId=""
 private var lyricExpiry=Long.MAX_VALUE
 var feedFilter by mutableStateOf("전체")
    private set
 @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
 private val future=MediaController.Builder(app,SessionToken(app,ComponentName(app,PlaybackService::class.java))).buildAsync()

 init {
  future.addListener({
   runCatching { controller=future.get();controller?.addListener(object:Player.Listener {
    override fun onEvents(player:Player,events:Player.Events) { syncPlayer() }
    override fun onPlayerError(e:PlaybackException) { playerError="재생을 시작하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.";notice=playerError }
   });syncPlayer() }.onFailure { notice="플레이어를 준비하지 못했어요. 앱을 다시 열어주세요." }
  },ContextCompat.getMainExecutor(app))
  viewModelScope.launch { while(isActive){syncPlayer();delay(350)} }
  refresh()
 }
 private fun syncPlayer() {
  val c=controller?:return
  playing=c.isPlaying;buffering=c.playbackState==Player.STATE_BUFFERING
  position=c.currentPosition.coerceAtLeast(0);duration=c.duration.coerceAtLeast(0);shuffle=c.shuffleModeEnabled;repeat=c.repeatMode
  val item=c.currentMediaItem
  current=if(item==null)null else songs[item.mediaId] ?: item.mediaMetadata.extras?.getString("song")?.let { runCatching { Song(JSONObject(it)) }.getOrNull() } ?: Song(JSONObject().apply{
   put("id",item.mediaId);put("title",item.mediaMetadata.title);put("artist",item.mediaMetadata.artist)
  })
 }
 fun authenticated():Boolean { if(user==null){showLogin=true;return false};return true }
 fun action(block:suspend ()->Unit) {
  if(busy)return
  viewModelScope.launch { busy=true;try{block()}catch(e:Exception){if(e is CancellationException)throw e;failure(e)}finally{busy=false} }
 }
 private fun failure(e:Exception) {
  if(e is ApiException && e.status==401){user=null;showLogin=true}
  notice=e.message?: "연결을 확인하고 다시 시도해주세요."
 }
 fun refresh() {
  if(refreshing)return
  viewModelScope.launch {
   refreshing=true;error=null
   supervisorScope {
    listOf(
     async { runCatching { loadMe() }.onFailure { error="계정 상태를 불러오지 못했어요." } },
     async { runCatching { home=api.call("/api/catalog?section=tracks&chart=top").tracks() }.onFailure { error=it.message } },
     async { runCatching { latest=api.call("/api/catalog?section=tracks&limit=40").tracks() }.onFailure { error="최신곡을 불러오지 못했어요. 새로고침해주세요." } },
     async { runCatching { recentCovers=api.call("/api/community?kind=cover").tracks() }.onFailure { error="커버곡을 불러오지 못했어요. 새로고침해주세요." } },
     async { runCatching { singable=api.call("/api/karaoke").tracks() }.onFailure { error=it.message } },
     async { val filter=feedFilter;runCatching { val result=api.call(communityPath(filter)).tracks();if(feedFilter==filter)feed=result }.onFailure { error=it.message } },
     async { runCatching { publicLists=api.call("/api/playlists?sort=popular").optJSONArray("playlists").objects() } },
     async { runCatching { people=api.call("/api/catalog?section=producers&limit=20").optJSONArray("producers").objects() } }
    ).awaitAll()
   }
   loading=false;refreshing=false
  }
 }
 suspend fun loadMe(){
  val me=api.call("/api/me");user=me.optJSONObject("user");membership=me.optJSONObject("membership")?:JSONObject()
  SongAdBreaks.configure(getApplication(),user?.optString("id"),membership.optLong("premium_until",0))
  providers=me.optJSONArray("providers")?.let { a->(0 until a.length()).map { a.getString(it) } }?:emptyList()
  emailEnabled=me.optBoolean("emailEnabled")
  googleClientId=me.optString("googleClientId","")
  if(user!=null)loadLibrary() else {likes=emptyList();playlists=emptyList();history=emptyList();follows=emptyList();selectedList=null;listSongs=emptyList();myTracks=emptyList();studioJob?.cancel();dismissCollection();if(feedFilter=="팔로잉")community("전체")}
 }
 suspend fun loadLibrary(){
  val data=api.call("/api/library");likes=data.tracks("likes");playlists=data.optJSONArray("collections").objects();follows=data.optJSONArray("follows").objects()
  history=api.call("/api/history").tracks()
 }
 fun selectTab(index:Int) {
  tab=index
  if(index==4 && user!=null)action{loadLibrary()}
 }
 fun library(page:String){libraryPage=page;selectTab(4)}
 fun showCollection(title:String,tracks:List<Song>,caption:String=""){
  collectionJob?.cancel();collectionBusy=false;collectionError=null;collection=MusicCollection(title,caption,tracks)
 }
 fun dismissCollection(){collectionJob?.cancel();collection=null;collectionBusy=false;collectionError=null}
 fun browseCollection(title:String,path:String,caption:String="",resultKey:String="tracks"){
  collectionJob?.cancel();collection=MusicCollection(title,caption,emptyList(),path,resultKey);collectionBusy=true;collectionError=null
  collectionJob=viewModelScope.launch {
   try{val tracks=api.call(path).tracks(resultKey);collection=MusicCollection(title,caption,tracks,path,resultKey)}
   catch(e:Exception){if(e !is CancellationException)collectionError=e.message?:"음악을 불러오지 못했어요."}
   finally{if(isActive)collectionBusy=false}
  }
 }
 fun openRanking(period:String="today",original:Song?=null){
  detail=null;rankOpen=true;rankPeriod=period;rankKind="tracks";rankOriginal=original;rankGenre="전체";rankQuery="";loadRankings()
 }
 fun dismissRanking(){rankOpen=false;rankJob?.cancel();rankBusy=false}
 fun loadRankings(debounce:Boolean=false){
  rankJob?.cancel();rankBusy=true;rankError=null;rankTracks=emptyList();rankSingers=emptyList()
  val path="/api/cover-rankings?period=$rankPeriod&kind=$rankKind"+
   (rankOriginal?.let{"&original_id=${it.id}"}?:"")+
   (if(rankGenre=="전체")"" else "&genre="+URLEncoder.encode(rankGenre,"UTF-8"))+
   (if(rankQuery.isBlank())"" else "&q="+URLEncoder.encode(rankQuery.trim(),"UTF-8"))
  rankJob=viewModelScope.launch {
   try{if(debounce)delay(350);val r=api.call(path);ensureActive();rankTracks=r.tracks();rankSingers=r.optJSONArray("singers").objects()}
   catch(e:Exception){if(e !is CancellationException)rankError=e.message?:"랭킹을 불러오지 못했어요."}
   finally{if(isActive)rankBusy=false}
  }
 }
 fun loadRankHighlights(){
  highlightsJob?.cancel();highlightsBusy=true;highlightsError=null
  highlightsJob=viewModelScope.launch {
   try{val result=coroutineScope{listOf("today","week","month","all").map{period->async{period to api.call("/api/cover-rankings?period=$period&limit=1").tracks().firstOrNull()}}.awaitAll().toMap()};ensureActive();rankHighlights=result}
   catch(e:Exception){if(e !is CancellationException)highlightsError="인기 커버를 불러오지 못했어요."}
   finally{if(isActive)highlightsBusy=false}
  }
 }
 fun followPerson(id:String){if(!authenticated())return;action {
  val following=follows.any{it.optString("target_id")==id&&it.optString("kind")=="producer"}
  api.call("/api/producers/$id/follow",if(following)"DELETE" else "PUT");loadLibrary()
  if(profile?.optString("id")==id)profileFollowers=(profileFollowers+if(following)-1 else 1).coerceAtLeast(0)
  if(rankOpen)loadRankings()
 }}
 fun reportComment(comment:JSONObject,reason:String,details:String,onDone:()->Unit){if(!authenticated())return;val song=detail?:return;action {
  api.call("/api/comments/${comment.getString("id")}/report","POST",payload("reason" to reason,"details" to details))
  val updated=api.call("/api/tracks/${song.id}/comments").optJSONArray("comments").objects()
  if(detail?.id==song.id)comments=updated
  onDone();notice="신고가 접수됐어요. 운영자가 확인할게요."
 }}
 fun openCovers(song:Song){detail=null;browseCollection("${song.title} · 다른 목소리","/api/tracks/${song.id}/covers","같은 원곡을 각자의 목소리로 부른 커버곡","covers")}
 fun openOriginal(song:Song)=action{
  val original=Song(api.call("/api/tracks/${song.raw.getString("original_id")}").getJSONObject("track"));openSong(original)
 }
 fun loadStudio(){
  if(!authenticated())return
  studioJob?.cancel();studioBusy=true;studioError=null
  studioJob=viewModelScope.launch {
   try{
    val data=api.call("/api/studio");val profile=data.optJSONObject("producer");val artists=data.optJSONArray("artists").objects()
    myTracks=data.tracks().map {t->Song(JSONObject(t.raw.toString()).apply{
     put("producer",profile?.optString("name")?:user?.optString("name"));put("producer_id",profile?.optString("id")?:"")
     put("artist",if(t.cover)profile?.optString("name") else artists.find{it.optString("id")==t.raw.optString("artist_id")}?.optString("name")?:"")
    })}
   }catch(e:Exception){if(e !is CancellationException)studioError=e.message}
   finally{if(isActive)studioBusy=false}
  }
 }
 fun searchFor(value:String){
  search=value;searchJob?.cancel();searched=false
  searchResults=emptyList();searchPeople=emptyList();searchLists=emptyList()
  if(value.isBlank()){searching=false;return}
  searchJob=viewModelScope.launch {
   searching=true;delay(350)
   try{val data=api.call("/api/search?q="+URLEncoder.encode(value,"UTF-8"));if(search==value){searchResults=data.tracks();searchPeople=data.optJSONArray("producers").objects().map{it.put("profile_kind","producer")}+data.optJSONArray("artists").objects().map{it.put("profile_kind","artist")};searchLists=data.optJSONArray("playlists").objects();searched=true}}
   catch(e:Exception){if(e !is CancellationException)failure(e)}
   finally { if(search==value)searching=false }
  }
 }
 fun community(filter:String){
  if(filter=="팔로잉"&&!authenticated())return
  feedFilter=filter;feedJob?.cancel();feed=emptyList()
  feedJob=viewModelScope.launch { try{feed=api.call(communityPath(filter)).tracks()}catch(e:Exception){if(e !is CancellationException)failure(e)} }
 }
 private fun communityPath(filter:String)="/api/community"+when(filter){"커버곡"->"?kind=cover";"제작곡"->"?kind=original";"팔로잉"->"?following=1";else->""}
 fun playAll(tracks:List<Song>,shuffled:Boolean=false){tracks.takeIf{it.isNotEmpty()}?.let{play(if(shuffled)it.random() else it.first(),it,shuffled)}}
 fun play(song:Song,queue:List<Song> = listOf(song),shuffled:Boolean=false){
  val c=controller?:run {notice="플레이어를 준비하고 있어요.";return}
  songs.putAll(queue.associateBy {it.id});songs[song.id]=song
  val entries=queue.ifEmpty {listOf(song)}.distinctBy {it.id}
  val index=entries.indexOfFirst {it.id==song.id}.coerceAtLeast(0)
  val items=entries.map { t->MediaItem.Builder().setMediaId(t.id).setMediaMetadata(MediaMetadata.Builder().setTitle(t.title)
   .setArtist(t.artist).setArtworkUri(t.art?.let(Uri::parse)).setExtras(android.os.Bundle().apply {putString("song",t.raw.toString())}).build()).build() }
  SongAdBreaks.atBoundary({c.pause()}){playerError=null;c.shuffleModeEnabled=shuffled;c.setMediaItems(items,index,0);c.prepare();c.play()}
 }
 fun toggle(){controller?.let {c->
  if(c.isPlaying)c.pause()
  else if(c.playbackState==Player.STATE_ENDED)SongAdBreaks.atBoundary({}){c.seekTo(0);c.play()}
  else {if(c.playbackState==Player.STATE_IDLE)c.prepare();c.play()}
 }}
 fun closePlayer(){controller?.stop();controller?.clearMediaItems();current=null;fullPlayer=false;lyricId="";lyricRows=emptyList()}
 fun login(email:String,password:String,name:String,register:Boolean) = action {
  api.call(if(register)"/api/auth/register" else "/api/auth/login","POST",payload("email" to email.trim(),"password" to password,"name" to name.trim()))
  closePlayer();loadMe();showLogin=false;notice="반가워요, ${user?.optString("name")}님!"
 }
 fun logout()=action {
  api.call("/api/auth/logout","POST");NativeSession.put(getApplication(),"cookie","");NativeSession.put(getApplication(),"ticket","");NativeSession.put(getApplication(),"verifier","");api.clearGoogleBinding()
  runCatching{androidx.credentials.CredentialManager.create(getApplication()).clearCredentialState(androidx.credentials.ClearCredentialStateRequest())}
  if(BuildConfig.KAKAO_NATIVE_KEY.isNotBlank())runCatching{com.kakao.sdk.user.UserApiClient.instance.logout{}}
  closePlayer();loadMe();showAccount=false
 }
 fun nativeLogin(provider:String,authenticate:suspend (String,String)->String)=action {
  // A cancelled account picker must not open a browser or leave a pending login.
  try {
   val nonce=if(provider=="google")api.call("/api/auth/google/nonce","POST",payload()).getString("nonce") else ""
   val token=authenticate(googleClientId,nonce)
   val body=if(provider=="google")payload("credential" to token) else payload("accessToken" to token)
   api.call("/api/auth/$provider/token","POST",body)
   NativeSession.put(getApplication(),"ticket","");NativeSession.put(getApplication(),"verifier","")
   closePlayer();loadMe();showLogin=false;notice="반가워요, ${user?.optString("name")}님!"
  }catch(_:SignInCancelled) { /* Explicit cancellation is not an error. */ }
  catch(e:ApiException){throw e}
  catch(e:CancellationException){throw e}
  catch(_:Exception){notice="계정 인증을 완료하지 못했어요. 다시 시도해주세요."}
  finally{api.clearGoogleBinding()}
 }
 fun socialLogin(open:(String)->Unit)=action {
  val bytes=ByteArray(48);SecureRandom().nextBytes(bytes)
  val verifier=Base64.encodeToString(bytes,Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  val challenge=MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()).joinToString(""){"%02x".format(it)}
  val result=api.call("/api/auth/mobile/start","POST",payload("challenge" to challenge))
  NativeSession.put(getApplication(),"verifier",verifier);NativeSession.put(getApplication(),"ticket",result.getString("ticket"))
  open(result.getString("url")+"&provider=apple")
 }
 fun finishLogin(uri:Uri?=null){
  val ticket=NativeSession.get(getApplication(),"ticket");val verifier=NativeSession.get(getApplication(),"verifier")
  if(ticket.isBlank()||verifier.isBlank()||authJob?.isActive==true)return
  if(uri!=null && (uri.scheme!="kr.co.aifect.app"||uri.host!="auth"||uri.getQueryParameter("ticket")!=ticket))return
  authJob=viewModelScope.launch {
   try {
    api.call("/api/auth/mobile/exchange","POST",payload("ticket" to ticket,"verifier" to verifier))
    NativeSession.put(getApplication(),"ticket","");NativeSession.put(getApplication(),"verifier","")
    closePlayer();loadMe();showLogin=false;notice="로그인했어요. 이제 전체곡을 즐겨보세요."
   }catch(e:Exception){
    if(e is ApiException && e.status==409)return@launch
    if(e is ApiException && e.status in listOf(400,401)){NativeSession.put(getApplication(),"ticket","");NativeSession.put(getApplication(),"verifier","")}
    if(uri!=null)failure(e)
   }
  }
 }
 fun openSong(song:Song){
  detailJob?.cancel();detail=song;comments=emptyList();detailBusy=true
  detailJob=viewModelScope.launch {
   try{val data=api.call("/api/tracks/${song.id}");val responses=api.call("/api/tracks/${song.id}/comments")
    if(detail?.id==song.id){detail=Song(data.getJSONObject("track"));comments=responses.optJSONArray("comments").objects()}}
   catch(e:Exception){if(e !is CancellationException)failure(e)}finally{detailBusy=false}
  }
 }
 fun like(song:Song) {if(!authenticated())return;action {
  val liked=likes.any {it.id==song.id};api.call("/api/tracks/${song.id}/like",if(liked)"DELETE" else "PUT");loadLibrary()
  val fresh=Song(api.call("/api/tracks/${song.id}").getJSONObject("track"))
  feed=feed.map {if(it.id==song.id)fresh else it};home=home.map {if(it.id==song.id)fresh else it}
  latest=latest.map{if(it.id==song.id)fresh else it};recentCovers=recentCovers.map{if(it.id==song.id)fresh else it}
  collection=collection?.let{it.copy(tracks=it.tracks.map{t->if(t.id==song.id)fresh else t})}
  if(detail?.id==song.id)detail=fresh
  if(song.cover){if(rankOpen)loadRankings();loadRankHighlights()}
 }}
 fun comment(body:String,onSuccess:()->Unit={}) {if(!authenticated()||body.isBlank())return;val song=detail?:return;action {
  api.call("/api/tracks/${song.id}/comments","POST",payload("body" to body.trim()))
  if(detail?.id==song.id){comments=api.call("/api/tracks/${song.id}/comments").optJSONArray("comments").objects();detail=Song(api.call("/api/tracks/${song.id}").getJSONObject("track"))}
  onSuccess();notice="댓글을 남겼어요."
 }}
 fun commentLike(comment:JSONObject){if(!authenticated())return;action {
  api.call("/api/comments/${comment.getString("id")}/like",if(comment.optInt("liked")==1)"DELETE" else "PUT")
  detail?.let {comments=api.call("/api/tracks/${it.id}/comments").optJSONArray("comments").objects()}
 }}
 fun deleteComment(comment:JSONObject){val song=detail?:return;action {
  api.call("/api/comments/${comment.getString("id")}","DELETE")
  val updated=api.call("/api/tracks/${song.id}/comments").optJSONArray("comments").objects()
  if(detail?.id==song.id){comments=updated;detail=Song(api.call("/api/tracks/${song.id}").getJSONObject("track"))}
 }}
 fun createList(name:String,public:Boolean,onDone:()->Unit) {if(!authenticated())return;action {
  val r=api.call("/api/playlists","POST",payload("name" to name.trim(),"is_public" to public));loadLibrary()
  val data=api.call("/api/playlists/${r.getString("id")}");selectedList=data.getJSONObject("playlist");listSongs=data.tracks();onDone()
 }}
 fun openList(id:String) = action {
  val data=api.call("/api/playlists/$id");selectedList=data.getJSONObject("playlist");listSongs=data.tracks()
 }
 fun addToList(id:String,song:Song)=action {
  api.call("/api/playlists/$id/tracks/${song.id}","PUT");loadLibrary()
  if(selectedList?.optString("id")==id){val d=api.call("/api/playlists/$id");selectedList=d.getJSONObject("playlist");listSongs=d.tracks()}
  notice="플레이리스트에 담았어요."
 }
 fun removeFromList(song:Song){val p=selectedList?:return;action {
  api.call("/api/playlists/${p.getString("id")}/tracks/${song.id}","DELETE");listSongs=listSongs.filterNot {it.id==song.id};loadLibrary()
 }}
 fun moveSong(index:Int,delta:Int){val p=selectedList?:return;val target=index+delta;if(target !in listSongs.indices)return;action {
  val updated=listSongs.toMutableList();updated.add(target,updated.removeAt(index))
  api.call("/api/playlists/${p.getString("id")}/order","PUT",payload("track_ids" to JSONArray(updated.map {it.id})));listSongs=updated
 }}
 fun renameList(name:String,public:Boolean){val p=selectedList?:return;action {
  api.call("/api/playlists/${p.getString("id")}","PATCH",payload("name" to name,"is_public" to public))
  selectedList=JSONObject(p.toString()).put("name",name).put("is_public",if(public)1 else 0);loadLibrary()
 }}
 fun deleteList(){val p=selectedList?:return;action {api.call("/api/playlists/${p.getString("id")}","DELETE");selectedList=null;loadLibrary()}}
 fun saveList(){if(!authenticated())return;val p=selectedList?:return;action {
  api.call("/api/playlists/${p.getString("id")}/save",if(p.optInt("saved")==1)"DELETE" else "PUT")
  selectedList=JSONObject(p.toString()).put("saved",if(p.optInt("saved")==1)0 else 1);loadLibrary()
 }}
 fun openProfile(id:String,kind:String="producer",showCovers:Boolean=false)=action {
  val type=if(kind=="artist")"artist" else "producer"
  val data=api.call("/api/${type}s/$id");profile=data.getJSONObject("profile").put("profile_kind",type).put("show_covers",showCovers);profileSongs=data.tracks();profileCovers=data.tracks("covers");profileFollowers=data.optInt("followers");detail=null
 }
 fun follow(){if(!authenticated())return;val p=profile?:return;action {
  val kind=p.optString("profile_kind","producer")
  val following=follows.any {it.optString("target_id")==p.optString("id")&&it.optString("kind")==kind}
  api.call("/api/${kind}s/${p.getString("id")}/follow",if(following)"DELETE" else "PUT");loadLibrary();profileFollowers=(profileFollowers+if(following)-1 else 1).coerceAtLeast(0)
 }}
 suspend fun lyricsAt(song:Song,seconds:Double){
  if(lyricsAccess=="full" && System.currentTimeMillis()/1000>=lyricExpiry){lyricId="";lyricRows=emptyList();lyricsAccess="line"}
  if(lyricId!=song.id){
   lyricId=song.id;lyric="";lyricUntil=-1.0;lyricFrom=-1.0;lyricRows=emptyList()
   try{
    val t=api.call("/api/tracks/${song.id}").getJSONObject("track");lyricsAccess=t.optString("lyrics_access");lyricExpiry=t.optLong("lyrics_access_until",Long.MAX_VALUE)
    if(lyricsAccess=="full"){
     lyricRows=Regex("\\[(\\d+):(\\d+(?:\\.\\d+)?)\\]([^\\r\\n]*)").findAll(t.optString("lyrics")).map { (it.groupValues[1].toDouble()*60+it.groupValues[2].toDouble()) to it.groupValues[3] }.toList()
     if(lyricRows.isEmpty())lyric="등록된 가사가 없어요.";return
    }
    if(t.optString("lyrics_mode")!="synced"){lyric="등록된 가사가 없어요.";lyricUntil=Double.MAX_VALUE;lyricFrom=0.0;return}
   }catch(e:Exception){lyricId="";lyric="가사를 연결하지 못했어요.";return}
  }
  if(lyricsAccess=="full")return
  if(seconds>=lyricFrom&&seconds<lyricUntil)return
  try{
   val line=api.call("/api/tracks/${song.id}/lyrics/line?at=${seconds.coerceIn(0.0,song.duration.coerceAtLeast(0.0))}").optJSONObject("line")
   lyric=line?.optString("text")?.ifBlank {"♪"}?:"등록된 가사가 없어요.";lyricFrom=line?.optDouble("from")?:0.0;lyricUntil=line?.optDouble("until")?.coerceAtLeast(seconds+1)?:Double.MAX_VALUE
  }catch(e:Exception){lyric="가사를 연결하지 못했어요.";lyricFrom=seconds;lyricUntil=seconds+10}
 }
 override fun onCleared(){MediaController.releaseFuture(future);super.onCleared()}
}
