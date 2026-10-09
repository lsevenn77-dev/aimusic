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
 var showBilling by mutableStateOf(false)
 var playBilling:PlayBilling?=null
 var tab by mutableIntStateOf(0)
 var playlistTarget by mutableStateOf<Song?>(null)
 var feedLoading by mutableStateOf(false)
 var feedError by mutableStateOf<String?>(null)
 fun pickPlaylist(song:Song){playlistTarget=song;if(user!=null)refreshLibrary()}
 var loading by mutableStateOf(true)
 var refreshing by mutableStateOf(false)
 var error by mutableStateOf<String?>(null)
 var notice by mutableStateOf<String?>(null)
 var home by mutableStateOf<List<Song>>(emptyList())
 var latest by mutableStateOf<List<Song>>(emptyList())
 var recentCovers by mutableStateOf<List<Song>>(emptyList())
 var listenPage by mutableStateOf("추천")
 var libraryPage by mutableStateOf("플레이리스트")
 var collection by mutableStateOf<MusicCollection?>(null)
 var collectionBusy by mutableStateOf(false)
 var collectionError by mutableStateOf<String?>(null)
 var searchLists by mutableStateOf<List<JSONObject>>(emptyList())
 var myTracks by mutableStateOf<List<Song>>(emptyList())
 var studioBusy by mutableStateOf(false)
 var studioError by mutableStateOf<String?>(null)
 var singable by mutableStateOf<List<Song>>(emptyList())
 var duetInvitations by mutableStateOf<List<Song>>(emptyList())
 var duetError by mutableStateOf<String?>(null)
 fun loadDuets(){
  val scope=readScope();api.peek("/api/duets")?.let{if(currentRead(scope))duetInvitations=it.tracks()}
  viewModelScope.launch{try{val tracks=api.call("/api/duets",fresh=true).tracks();ensureRead(scope);duetInvitations=tracks;duetError=null}catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)){if(e is ApiException&&e.status==401)failure(e);duetError="듀엣 목록을 불러오지 못했어요."}}}
 }
 var feed by mutableStateOf<List<Song>>(emptyList())
 internal var communityCrewMode by mutableStateOf(false)
 internal var communityCrewTarget by mutableStateOf<String?>(null)
 internal var crewBrowsing by mutableStateOf(false)
 // A destination hint only. Every crew reopen verifies membership on the server.
 internal var lastKnownCrewId by mutableStateOf<String?>(null)
 private data class CrewPublicSnapshot(val scope:ReadScope,val at:Long,val source:String)
 private val crewPublicSnapshots=linkedMapOf<String,CrewPublicSnapshot>()
 private val crewDirectoryFlights=mutableMapOf<String,Pair<ReadScope,Deferred<JSONObject>>>()
 private var feedReadScope:ReadScope?=null
 private var feedRequest=0L
 var publicLists by mutableStateOf<List<JSONObject>>(emptyList())
 var people by mutableStateOf<List<JSONObject>>(emptyList())
 var search by mutableStateOf("")
 var searchResults by mutableStateOf<List<Song>>(emptyList())
 var searchPeople by mutableStateOf<List<JSONObject>>(emptyList())
 var searching by mutableStateOf(false)
 var searched by mutableStateOf(false)
 private var activeUser by mutableStateOf<JSONObject?>(null)
 var user:JSONObject?
  get()=activeUser
  set(value){
   if(activeUser?.optString("id")!=value?.optString("id")){
    val stopPlayback=activeUser!=null
    accountGeneration++;api.invalidateReads();clearPrivateState(stopPlayback)
    PushNotifications.bind(getApplication(),value?.optString("id"))
   }
   activeUser=value
  }
 var membership by mutableStateOf(JSONObject())
 var providers by mutableStateOf<List<String>>(emptyList())
 var googleClientId by mutableStateOf("")
 var emailEnabled by mutableStateOf(false)
 var likes by mutableStateOf<List<Song>>(emptyList())
 var playlists by mutableStateOf<List<JSONObject>>(emptyList())
 var follows by mutableStateOf<List<JSONObject>>(emptyList())
 private var followRevision=0
 private var followPending=false
 var karaokeChart by mutableStateOf(false)
 var history by mutableStateOf<List<Song>>(emptyList())
 var showLogin by mutableStateOf(false)
 var showAccount by mutableStateOf(false)
 var showAccountSettings by mutableStateOf(false)
 var showRecordingDrafts by mutableStateOf(false)
 var accountError by mutableStateOf<String?>(null)
 var nicknameCheck by mutableStateOf<String?>(null)
 var showProfileEdit by mutableStateOf(false)
 var showRewards by mutableStateOf(false)
 var showMessages by mutableStateOf(false)
 var messagePeer by mutableStateOf<String?>(null)
 var messageCrew by mutableStateOf<String?>(null)
 var unreadMessages by mutableIntStateOf(0)
 var inboxCrew by mutableStateOf<JSONObject?>(null)
 suspend fun refreshMessageSummary(){val account=user?.optString("id")?:return;val d=api.call("/api/dm/summary");if(user?.optString("id")==account){unreadMessages=d.optInt("unread");inboxCrew=d.optJSONObject("crew")}}
 fun openCrewMessages(cid:String){openMessages();messageCrew=cid}
 var ownProfile by mutableStateOf(JSONObject())
 fun editProfile(){if(!authenticated())return;showProfileEdit=true;ownProfileJob?.cancel();ownProfileJob=viewModelScope.launch{try{loadOwnProfile()}catch(e:Exception){if(e is CancellationException)throw e;failure(e)}}}
 suspend fun loadOwnProfile(fresh:Boolean=false){
  if(user==null)return
  val scope=readScope()
  if(!fresh)api.peek("/api/me/profile")?.let{if(currentRead(scope))ownProfile=it}
  try{val data=api.call("/api/me/profile",fresh=true);ensureRead(scope);ownProfile=data}catch(e:Exception){if(sameAccount(scope)&&e is ApiException&&e.status in listOf(403,404))ownProfile=JSONObject();throw e}
 }
 fun saveProfile(name:String,bio:String,image:Uri?,done:()->Unit)=action{
  api.call("/api/me/profile","PUT",payload("name" to name,"bio" to bio))
  if(image!=null)api.profileImage(image)
  loadMe();loadOwnProfile(fresh=true);done();notice="프로필을 저장했어요."
 }
 fun singTarget(song:Song,sing:(Song)->Unit)=action{
  if(song.cover&&song.raw.optInt("duet_open")==1){sing(song);return@action}
  val id=if(song.cover)song.raw.optString("original_id") else song.id
  val original=Song(api.call("/api/tracks/$id",fresh=true).getJSONObject("track"))
  if(original.raw.optBoolean("karaoke_ready"))sing(original) else notice="이 곡은 아직 부르기를 준비하고 있어요."
 }
 fun deleteCover(song:Song)=action{
  api.call("/api/uploads/${song.id}","DELETE");myTracks=myTracks.filterNot{it.id==song.id};if(current?.id==song.id)closePlayer();detail=null;loadLibrary();notice="커버곡을 삭제했어요."
 }
 var busy by mutableStateOf(false)
 var detail by mutableStateOf<Song?>(null)
 var showGifts by mutableStateOf(false)
 var giftTarget by mutableStateOf<Song?>(null)
 var giftPerson by mutableStateOf<JSONObject?>(null)
 fun openPersonGift(person:JSONObject){if(!authenticated())return;giftTarget=null;giftPerson=person;showGifts=true}
 fun openGifts(song:Song?=null){if(!authenticated())return;giftPerson=null;giftTarget=song;showGifts=true}
 var detailBusy by mutableStateOf(false)
 var comments by mutableStateOf<List<JSONObject>>(emptyList())
 var selectedList by mutableStateOf<JSONObject?>(null)
 var listSongs by mutableStateOf<List<Song>>(emptyList())
 var listLoading by mutableStateOf(false)
 var profile by mutableStateOf<JSONObject?>(null)
 var profileSongs by mutableStateOf<List<Song>>(emptyList())
 var profileCovers by mutableStateOf<List<Song>>(emptyList())
 var profileFollowers by mutableIntStateOf(0)
 var profileLoading by mutableStateOf(false)
 var profileError by mutableStateOf<String?>(null)
 private data class ProfilePage(val person:JSONObject,val tracks:List<Song>,val covers:List<Song>,val followers:Int)
 private var profileJob:Job?=null
 private var retryProfileLoad:(()->Unit)?=null
 private val profileCache=linkedMapOf<String,Pair<Long,ProfilePage>>()
 private var messageSourceProfile:ProfilePage?=null
 val messagesReturnToProfile get()=messageSourceProfile!=null
 private fun profilePage()=profile?.let{ProfilePage(it,profileSongs,profileCovers,profileFollowers)}
 private fun displayProfile(page:ProfilePage){profile=page.person;profileSongs=page.tracks;profileCovers=page.covers;profileFollowers=page.followers;detail=null}
 fun dismissProfile(){profileRequest++;profileJob?.cancel();profileJob=null;profile=null;profileLoading=false;profileError=null}
 fun retryProfile(){retryProfileLoad?.invoke()}
 fun openMessages(peerId:String?=null){
  if(!authenticated())return
  if(tab!=5&&!showMessages)messageSourceProfile=profilePage()
  if(tab==5)messageSourceProfile=null
  dismissProfile();messageCrew=null;messagePeer=peerId;showMessages=tab!=5
 }
 fun dismissMessages(){
  dismissProfile();showMessages=false;messagePeer=null;messageCrew=null
  messageSourceProfile?.let{displayProfile(it)};messageSourceProfile=null
 }
 var current by mutableStateOf<Song?>(null)
 var playing by mutableStateOf(false)
 var buffering by mutableStateOf(false)
 var position by mutableLongStateOf(0)
 var duration by mutableLongStateOf(0)
 var shuffle by mutableStateOf(false)
 var repeat by mutableIntStateOf(0)
 var playerError by mutableStateOf<String?>(null)
 var playbackBitrateKbps by mutableIntStateOf(0)
 var playbackPreview by mutableStateOf(false)
 var playbackHighQualityPending by mutableStateOf(false)
 val playbackQualityLabel get()=if(playbackBitrateKbps==0)null else "${if(playbackPreview)"60초 미리 듣기 · " else ""}AAC ${playbackBitrateKbps}kbps${if(playbackHighQualityPending)" · 고음질 준비 중" else ""}"
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
 private var libraryJob:Job?=null
 private var ownProfileJob:Job?=null
 private var listJob:Job?=null
 private var originalJob:Job?=null
 private var authJob:Job?=null
 private var accountGeneration=0L
 private var mutationRevision=0L
 private var collectionRequest=0L
 private var rankingRequest=0L
 private var listRequest=0L
 private var profileRequest=0L
 private var displayedFeedPath:String?=null
 private var displayedRankPath:String?=null
 private var displayedSearchPath:String?=null
 private data class ReadScope(val account:String?,val generation:Long,val mutation:Long,val apiRevision:Long)
 private fun readScope()=ReadScope(user?.optString("id"),accountGeneration,mutationRevision,api.readRevision)
 private fun sameAccount(scope:ReadScope)=scope.account==user?.optString("id")&&scope.generation==accountGeneration
 private fun currentRead(scope:ReadScope)=sameAccount(scope)&&scope.mutation==mutationRevision&&scope.apiRevision==api.readRevision
 private suspend fun ensureRead(scope:ReadScope){currentCoroutineContext().ensureActive();if(!currentRead(scope))throw CancellationException("A newer account or action replaced this read")}
 private fun clearPrivateState(stopPlayback:Boolean){
  listOf(libraryJob,ownProfileJob,listJob,studioJob,profileJob,detailJob,feedJob,searchJob,collectionJob,rankJob,highlightsJob,originalJob).forEach{it?.cancel()}
  likes=emptyList();playlists=emptyList();history=emptyList();follows=emptyList();ownProfile=JSONObject();myTracks=emptyList()
  membership=JSONObject();followRevision++;followPending=false
  selectedList=null;listSongs=emptyList();listLoading=false;playlistTarget=null;collection=null;collectionBusy=false;collectionError=null
  detail=null;comments=emptyList();detailBusy=false;profile=null;profileSongs=emptyList();profileCovers=emptyList();profileFollowers=0
  profileCache.clear();retryProfileLoad=null;profileLoading=false;profileError=null;messageSourceProfile=null
  showMessages=false;messagePeer=null;messageCrew=null;unreadMessages=0;inboxCrew=null;showProfileEdit=false;showAccountSettings=false;showRecordingDrafts=false;showRewards=false;showGifts=false;giftTarget=null;giftPerson=null
  showAccount=false;accountError=null;nicknameCheck=null;studioBusy=false;studioError=null
  feed=emptyList();feedFilter="전체";feedLoading=false;feedError=null;displayedFeedPath=null
  feedRequest++;feedReadScope=null;communityCrewMode=false;communityCrewTarget=null;crewBrowsing=false;lastKnownCrewId=null
  invalidateCrewPreviews()
  search="";searchResults=emptyList();searchPeople=emptyList();searchLists=emptyList();searching=false;searched=false;displayedSearchPath=null
  rankOpen=false;rankTracks=emptyList();rankSingers=emptyList();rankHighlights=emptyMap();rankBusy=false;highlightsBusy=false;displayedRankPath=null
  collectionRequest++;rankingRequest++;listRequest++;profileRequest++
  resetLyrics();if(stopPlayback)closePlayer()
  SongAdBreaks.configure(getApplication(),null,0)
 }
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
  val quality=c.sessionExtras
  val qualityCurrent=item?.localConfiguration?.uri?.toString()?.let{it==quality.getString("playback_uri")}==true
  playbackBitrateKbps=if(qualityCurrent)quality.getInt("bitrate_kbps").takeIf{it in listOf(128,256)}?:0 else 0
  playbackPreview=qualityCurrent&&quality.getBoolean("preview")
  playbackHighQualityPending=qualityCurrent&&quality.getBoolean("high_quality_pending")
  current=if(item==null)null else songs[item.mediaId] ?: item.mediaMetadata.extras?.getString("song")?.let { runCatching { Song(JSONObject(it)) }.getOrNull() } ?: Song(JSONObject().apply{
   put("id",item.mediaId);put("title",item.mediaMetadata.title);put("artist",item.mediaMetadata.artist)
  })
 }
 fun authenticated():Boolean { if(user==null){showLogin=true;return false};return true }
 fun openPush(kind:String,target:String,recipient:String){
  if(user?.optString("id")!=recipient||!Regex("[a-zA-Z0-9-]{1,80}").matches(target))return
  if(kind=="dm")openMessages(target)
  else if(kind=="crew")openCrewMessages(target)
  else if(kind=="person_gift")openProfile(target)
  else if(kind in setOf("comment","gift"))action{
   val song=api.call("/api/tracks/$target",fresh=true).optJSONObject("track")?:return@action
   if(user?.optString("id")==recipient)openSong(Song(song))
  }
 }
 fun action(block:suspend ()->Unit) {
  if(busy)return
  busy=true;mutationRevision++;profileCache.clear()
  viewModelScope.launch { try{block()}catch(e:Exception){if(e is CancellationException)throw e;failure(e)}finally{busy=false} }
 }
 private fun failure(e:Exception) {
  if(e is ApiException && e.status==401){user=null;showLogin=true}
  notice=e.message?: "연결을 확인하고 다시 시도해주세요."
 }
 fun refresh() {
  if(refreshing)return
  viewModelScope.launch {
   refreshing=true;error=null
   try{
    hydratePublic()
    try{loadMe(loadPrivate=false)}catch(e:Exception){if(e is CancellationException)throw e;failure(e);error="계정 상태를 불러오지 못했어요."}
    val scope=readScope();hydratePublic();if(user!=null)refreshLibrary(fresh=true)
    suspend fun update(path:String,apply:(JSONObject)->Unit){
     try{val data=api.call(path,fresh=true);ensureRead(scope);apply(data)}catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)){if(e is ApiException&&e.status==401)failure(e);error=e.message}}
    }
    supervisorScope {
     listOf(
      async{update("/api/catalog?section=tracks&chart=top"){home=it.tracks()}},
      async{update("/api/catalog?section=tracks&limit=40"){latest=it.tracks()}},
      async{update("/api/community?kind=cover"){recentCovers=it.tracks()}},
      async{update("/api/duets"){duetInvitations=it.tracks();duetError=null}},
      async{update("/api/karaoke"){singable=it.tracks()}},
      async{val path=communityPath(feedFilter);update(path){if(communityPath(feedFilter)==path){feed=it.tracks();displayedFeedPath=path}}},
      async{update("/api/playlists?sort=popular"){publicLists=it.optJSONArray("playlists").objects()}},
      async{update("/api/catalog?section=producers&limit=20"){people=it.optJSONArray("producers").objects()}}
     ).awaitAll()
    }
   }finally{loading=false;refreshing=false}
  }
 }
 private fun hydratePublic(){
  api.peek("/api/catalog?section=tracks&chart=top")?.let{home=it.tracks()}
  api.peek("/api/catalog?section=tracks&limit=40")?.let{latest=it.tracks()}
  api.peek("/api/community?kind=cover")?.let{recentCovers=it.tracks()}
  api.peek("/api/duets")?.let{duetInvitations=it.tracks()}
  api.peek("/api/playlists?sort=popular")?.let{publicLists=it.optJSONArray("playlists").objects()}
  api.peek("/api/catalog?section=producers&limit=20")?.let{people=it.optJSONArray("producers").objects()}
 }
 suspend fun loadMe(loadPrivate:Boolean=true){
  val generation=accountGeneration
  val me=api.call("/api/me",fresh=true);currentCoroutineContext().ensureActive();if(generation!=accountGeneration)throw CancellationException("Account changed while loading its state")
  val nextMembership=me.optJSONObject("membership")?:JSONObject()
  if(user?.optString("id")==me.optJSONObject("user")?.optString("id")&&membership.optLong("premium_until")!=nextMembership.optLong("premium_until")){api.invalidateReads();profileCache.clear();resetLyrics()}
  user=me.optJSONObject("user");membership=nextMembership
  SongAdBreaks.configure(getApplication(),user?.optString("id"),membership.optLong("premium_until",0))
  providers=me.optJSONArray("providers")?.let { a->(0 until a.length()).map { a.getString(it) } }?:emptyList()
  emailEnabled=me.optBoolean("emailEnabled")
  googleClientId=me.optString("googleClientId","")
  if(user!=null&&loadPrivate)loadLibrary(fresh=true)
 }
 suspend fun loadLibrary(fresh:Boolean=false){
  if(user==null)return
  val scope=readScope();val revision=followRevision
  fun apply(path:String,data:JSONObject){if(!currentRead(scope))return;when(path){
   "/api/library"->{likes=data.tracks("likes");playlists=data.optJSONArray("collections").objects();if(revision==followRevision&&!followPending)follows=data.optJSONArray("follows").objects()}
   "/api/history"->history=data.tracks()
   "/api/me/profile"->ownProfile=data
  }}
  val paths=listOf("/api/library","/api/history","/api/me/profile")
  if(!fresh)paths.forEach{path->api.peek(path)?.let{apply(path,it)}}
  supervisorScope {
   paths.map { path -> async {
    try { val data=api.call(path,fresh=true);ensureRead(scope);apply(path,data) }
    catch(e:Exception) {
     if(e is CancellationException)throw e
     if(sameAccount(scope)) {
      if(e is ApiException&&e.status in listOf(403,404))when(path) {
       "/api/library"->{likes=emptyList();playlists=emptyList();follows=emptyList()}
       "/api/history"->history=emptyList()
       "/api/me/profile"->ownProfile=JSONObject()
      }
      failure(e)
     }
    }
   }}.awaitAll()
  }
 }
 fun refreshLibrary(fresh:Boolean=false){
  if(user==null)return
  if(libraryJob?.isActive==true){if(!fresh)return;libraryJob?.cancel()}
  libraryJob=viewModelScope.launch{try{loadLibrary(fresh)}catch(e:Exception){if(e is CancellationException)throw e;failure(e)}}
 }
 fun selectTab(index:Int) {
  tab=if(index==1)0 else index
  if(index==1)listenPage="발견"
  if(index in listOf(4,6) && user!=null)refreshLibrary()
  if(index==5){messagePeer=null;messageCrew=null}
 }
 fun library(page:String){libraryPage=page;selectTab(4)}
 fun showCollection(title:String,tracks:List<Song>,caption:String=""){
  collectionRequest++;collectionJob?.cancel();collectionBusy=false;collectionError=null;collection=MusicCollection(title,caption,tracks)
 }
 fun dismissCollection(){collectionRequest++;collectionJob?.cancel();collection=null;collectionBusy=false;collectionError=null}
 fun browseCollection(title:String,path:String,caption:String="",resultKey:String="tracks"){
  collectionJob?.cancel();val request=++collectionRequest;val scope=readScope()
  val cached=api.peek(path)?.tracks(resultKey)
  val retained=collection?.takeIf{it.path==path&&it.resultKey==resultKey}?.tracks
  collection=MusicCollection(title,caption,cached?:retained?:emptyList(),path,resultKey);collectionBusy=true;collectionError=null
  collectionJob=viewModelScope.launch {
   try{val tracks=api.call(path,fresh=true).tracks(resultKey);ensureRead(scope);if(request==collectionRequest)collection=MusicCollection(title,caption,tracks,path,resultKey)}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&request==collectionRequest){if(e is ApiException&&e.status==401)failure(e);if(e is ApiException&&e.status in listOf(403,404))collection=collection?.copy(tracks=emptyList());collectionError=e.message?:"음악을 불러오지 못했어요."}}
   finally{if(sameAccount(scope)&&request==collectionRequest)collectionBusy=false}
  }
 }
 fun openRanking(period:String="today",original:Song?=null,chart:Boolean=false){
  karaokeChart=chart
  detail=null;rankOpen=true;rankPeriod=period;rankKind="tracks";rankOriginal=original;rankGenre="전체";rankQuery="";loadRankings()
 }
 fun dismissRanking(){rankingRequest++;rankOpen=false;rankJob?.cancel();rankBusy=false}
 private fun rankingPath()="/api/cover-rankings?period=$rankPeriod&kind=$rankKind"+(if(karaokeChart)"&include_unranked=1" else "")+
  (rankOriginal?.let{"&original_id=${it.id}"}?:"")+
  (if(rankGenre=="전체")"" else "&genre="+URLEncoder.encode(rankGenre,"UTF-8"))+
  (if(rankQuery.isBlank())"" else "&q="+URLEncoder.encode(rankQuery.trim(),"UTF-8"))
 fun loadRankings(debounce:Boolean=false){
  rankJob?.cancel();val request=++rankingRequest;val scope=readScope();val path=rankingPath()
  val cached=api.peek(path)
  if(cached!=null){rankTracks=cached.tracks();rankSingers=cached.optJSONArray("singers").objects()}
  else if(displayedRankPath!=path){rankTracks=emptyList();rankSingers=emptyList()}
  displayedRankPath=path;rankBusy=true;rankError=null
  rankJob=viewModelScope.launch {
   try{if(debounce&&cached==null)delay(350);val r=api.call(path,fresh=true);ensureRead(scope);if(request==rankingRequest&&rankingPath()==path){rankTracks=r.tracks();rankSingers=r.optJSONArray("singers").objects()}}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&request==rankingRequest){if(e is ApiException&&e.status==401)failure(e);if(e is ApiException&&e.status in listOf(403,404)){rankTracks=emptyList();rankSingers=emptyList()};rankError=e.message?:"랭킹을 불러오지 못했어요."}}
   finally{if(sameAccount(scope)&&request==rankingRequest)rankBusy=false}
  }
 }
 fun loadRankHighlights(){
  highlightsJob?.cancel();val scope=readScope();highlightsBusy=true;highlightsError=null
  val periods=listOf("today","week","month","all")
  periods.forEach{period->api.peek("/api/cover-rankings?period=$period&limit=1")?.let{rankHighlights=rankHighlights+(period to it.tracks().firstOrNull())}}
  highlightsJob=viewModelScope.launch {
   try{val result=coroutineScope{periods.map{period->async{period to api.call("/api/cover-rankings?period=$period&limit=1",fresh=true).tracks().firstOrNull()}}.awaitAll().toMap()};ensureRead(scope);rankHighlights=result}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)){if(e is ApiException&&e.status==401)failure(e);highlightsError="인기 커버를 불러오지 못했어요."}}
   finally{if(isActive&&sameAccount(scope))highlightsBusy=false}
  }
 }
 fun followPerson(id:String)=toggleFollow("producer",id)
 private fun toggleFollow(kind:String,id:String){
  if(!authenticated()||busy)return
  action {
   val scope=readScope();val old=follows;val following=old.any{it.optString("target_id")==id&&it.optString("kind")==kind};val oldCount=profileFollowers
   followRevision++;followPending=true
   follows=if(following)old.filterNot{it.optString("target_id")==id&&it.optString("kind")==kind}else old+payload("target_id" to id,"kind" to kind,"name" to (profile?.optString("name")?:""))
   if(profile?.optString("id")==id)profileFollowers=(oldCount+if(following)-1 else 1).coerceAtLeast(0)
   try{
    val d=api.call("/api/${kind}s/$id/follow",if(following)"DELETE" else "PUT")
    if(sameAccount(scope)){d.optJSONObject("profile")?.let{p->follows=follows.map{if(it.optString("target_id")==id&&it.optString("kind")==kind)JSONObject(p.toString()).put("kind",kind).put("target_id",id)else it}};if(profile?.optString("id")==id&&d.has("followers"))profileFollowers=d.optInt("followers")}
   }catch(e:Exception){if(sameAccount(scope)){follows=old;if(profile?.optString("id")==id)profileFollowers=oldCount};throw e}finally{if(sameAccount(scope)){followPending=false;followRevision++}}
  }
 }
 fun reportComment(comment:JSONObject,reason:String,details:String,onDone:()->Unit){if(!authenticated())return;val song=detail?:return;action {
  api.call("/api/comments/${comment.getString("id")}/report","POST",payload("reason" to reason,"details" to details))
  val updated=api.call("/api/tracks/${song.id}/comments",fresh=true).optJSONArray("comments").objects()
  if(detail?.id==song.id)comments=updated
  onDone();notice="신고가 접수됐어요. 운영자가 확인할게요."
 }}
 fun openCovers(song:Song){detail=null;browseCollection("${song.title} · 다른 목소리","/api/tracks/${song.id}/covers","같은 원곡을 각자의 목소리로 부른 커버곡","covers")}
 fun openOriginal(song:Song){
  originalJob?.cancel();val scope=readScope()
  originalJob=viewModelScope.launch{try{val original=Song(api.call("/api/tracks/${song.raw.getString("original_id")}",fresh=true).getJSONObject("track"));ensureRead(scope);openSong(original)}catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope))failure(e)}}
 }
 fun loadStudio(){
  if(!authenticated())return
  studioJob?.cancel();val scope=readScope();studioBusy=true;studioError=null
  studioJob=viewModelScope.launch {
   try{
    val data=api.call("/api/studio",fresh=true);ensureRead(scope);val profile=data.optJSONObject("producer");val artists=data.optJSONArray("artists").objects()
    myTracks=data.tracks().map {t->Song(JSONObject(t.raw.toString()).apply{
     put("producer",profile?.optString("name")?:user?.optString("name"));put("producer_id",profile?.optString("id")?:"")
     put("artist",if(t.cover)profile?.optString("name") else artists.find{it.optString("id")==t.raw.optString("artist_id")}?.optString("name")?:"")
    })}
   }catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)){if(e is ApiException&&e.status==401)failure(e);studioError=e.message}}
   finally{if(isActive&&sameAccount(scope))studioBusy=false}
  }
 }
 private fun displaySearch(path:String,data:JSONObject){
  searchResults=data.tracks();searchPeople=data.optJSONArray("producers").objects().map{JSONObject(it.toString()).put("profile_kind","producer")}+data.optJSONArray("artists").objects().map{JSONObject(it.toString()).put("profile_kind","artist")}
  searchLists=data.optJSONArray("playlists").objects();displayedSearchPath=path;searched=true
 }
 fun searchFor(value:String){
  search=value;searchJob?.cancel()
  if(value.isBlank()){searching=false;searched=false;searchResults=emptyList();searchPeople=emptyList();searchLists=emptyList();displayedSearchPath=null;return}
  val scope=readScope();val path="/api/search?q="+URLEncoder.encode(value,"UTF-8");val cached=api.peek(path)
  if(cached!=null)displaySearch(path,cached)else if(displayedSearchPath!=path){searchResults=emptyList();searchPeople=emptyList();searchLists=emptyList();searched=false}
  searching=true
  searchJob=viewModelScope.launch {
   try{if(cached==null)delay(350);val data=api.call(path,fresh=true);ensureRead(scope);if(search==value)displaySearch(path,data)}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&search==value)failure(e)}
   finally {if(isActive&&sameAccount(scope)&&search==value)searching=false}
  }
 }
 fun community(filter:String,refresh:Boolean=false){
  if(filter=="팔로잉"&&!authenticated())return
  val scope=readScope();val path=communityPath(filter);val cached=api.peek(path)
  if(!refresh&&feedFilter==filter&&displayedFeedPath==path&&feedJob?.isActive==true&&feedReadScope==scope)return
  feedFilter=filter;feedJob?.cancel();val request=++feedRequest;feedReadScope=scope
  if(cached!=null)feed=cached.tracks()else if(displayedFeedPath!=path)feed=emptyList()
  displayedFeedPath=path;feedLoading=feed.isEmpty();feedError=null
  feedJob=viewModelScope.launch {try{val result=api.call(path,fresh=refresh).tracks();ensureRead(scope);if(request==feedRequest&&feedFilter==filter)feed=result}catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&request==feedRequest&&feedFilter==filter){if(e is ApiException&&e.status==401)failure(e);if(e is ApiException&&e.status in listOf(403,404))feed=emptyList();feedError=e.message?:"음악을 불러오지 못했어요."}}finally{if(request==feedRequest&&sameAccount(scope)&&feedFilter==filter)feedLoading=false}}
 }
 internal fun peekCrewDirectory(query:String="")=peekCrewPublic("directory:"+query.take(80))
 internal fun peekCrewDetail(id:String):JSONObject? {
  peekCrewPublic("detail:$id")?.let{return it}
  // A crew card already contains safe name/level/count metadata for its next screen.
  crewPublicSnapshots.keys.filter{it.startsWith("directory:")}.toList().forEach{key->
   peekCrewPublic(key)?.optJSONArray("crews").objects().find{it.optString("id")==id}?.let{return payload("crew" to it)}
  }
  return null
 }
 private fun peekCrewPublic(key:String):JSONObject? {
  val saved=crewPublicSnapshots[key]?:return null
  if(saved.scope!=readScope()||System.currentTimeMillis()-saved.at>90_000){crewPublicSnapshots.remove(key);return null}
  return JSONObject(saved.source)
 }
 private fun rememberCrewPublic(key:String,data:JSONObject,fields:List<String>){
  val visible=JSONObject();fields.forEach{field->if(data.has(field))visible.put(field,data.get(field))}
  val source=visible.toString();if(source.toByteArray(Charsets.UTF_8).size>512*1024)return
  crewPublicSnapshots.remove(key);crewPublicSnapshots[key]=CrewPublicSnapshot(readScope(),System.currentTimeMillis(),source)
  while(crewPublicSnapshots.size>8||crewPublicSnapshots.values.sumOf{it.source.toByteArray(Charsets.UTF_8).size}>2*1024*1024)crewPublicSnapshots.remove(crewPublicSnapshots.keys.first())
 }
 internal fun rememberCrewDetail(data:JSONObject){
  val id=data.optJSONObject("crew")?.optString("id")?.takeIf{it.isNotBlank()}?:return
  rememberCrewPublic("detail:$id",data,listOf("crew","members","tracks","rules","roles"))
 }
 internal fun forgetCrewDetail(id:String){crewPublicSnapshots.remove("detail:$id");if(lastKnownCrewId==id)lastKnownCrewId=null}
 internal fun invalidateCrewPreviews(){
  crewPublicSnapshots.clear();crewDirectoryFlights.values.toList().forEach{it.second.cancel()};crewDirectoryFlights.clear()
 }
 internal suspend fun readCrewDirectory(query:String=""):JSONObject {
  val q=query.take(80);val scope=readScope()
  val pending=crewDirectoryFlights[q]?.takeIf{it.first==scope&&it.second.isActive}?.second
  val work=pending?:viewModelScope.async(start=CoroutineStart.LAZY){
   val data=api.call("/api/crews?q="+URLEncoder.encode(q,"UTF-8"),fresh=true);ensureRead(scope)
   rememberCrewPublic("directory:$q",data,listOf("crews","tracks","rules"))
   lastKnownCrewId=data.optString("mine").takeIf{it.isNotBlank()&&it!="null"}
   data
  }.also{created->
   crewDirectoryFlights[q]=scope to created
   created.invokeOnCompletion{viewModelScope.launch{if(crewDirectoryFlights[q]?.second===created)crewDirectoryFlights.remove(q)}}
   created.start()
  }
  val data=work.await();ensureRead(scope);return JSONObject(data.toString())
 }
 private fun communityPath(filter:String)="/api/community"+when(filter){"커버곡"->"?kind=cover&cover_mode=solo";"듀엣"->"?kind=cover&cover_mode=duet";"제작곡"->"?kind=original";"팔로잉"->"?following=1";else->""}
 fun playAll(tracks:List<Song>,shuffled:Boolean=false){tracks.takeIf{it.isNotEmpty()}?.let{play(if(shuffled)it.random() else it.first(),it,shuffled)}}
 fun play(song:Song,queue:List<Song> = listOf(song),shuffled:Boolean=false){
  val c=controller?:run {notice="플레이어를 준비하고 있어요.";return}
  songs.putAll(queue.associateBy {it.id});songs[song.id]=song
  val entries=queue.ifEmpty {listOf(song)}.distinctBy {it.id}
  val index=entries.indexOfFirst {it.id==song.id}.coerceAtLeast(0)
  val items=entries.map { t->MediaItem.Builder().setMediaId(t.id).setMediaMetadata(MediaMetadata.Builder().setTitle(t.title)
   .setArtist(t.credit).setArtworkUri(t.art?.let(Uri::parse)).setExtras(android.os.Bundle().apply {putString("song",t.raw.toString())}).build()).build() }
  SongAdBreaks.finishCurrentListen?.invoke()
  SongAdBreaks.atBoundary({c.pause()}){playerError=null;c.shuffleModeEnabled=shuffled;c.setMediaItems(items,index,0);c.prepare();c.play()}
 }
 fun toggle(){controller?.let {c->
  if(c.isPlaying)c.pause()
  else if(c.playbackState==Player.STATE_ENDED)SongAdBreaks.atBoundary({}){c.seekTo(0);c.play()}
  else {if(c.playbackState==Player.STATE_IDLE)c.prepare();c.play()}
 }}
 fun resetLyrics(){lyricId="";lyric="";lyricRows=emptyList();lyricsAccess="line";lyricUntil=-1.0;lyricFrom=-1.0}
 fun closePlayer(){controller?.stop();controller?.clearMediaItems();current=null;fullPlayer=false;lyricId="";lyricRows=emptyList();playbackBitrateKbps=0;playbackPreview=false;playbackHighQualityPending=false}
 fun login(email:String,password:String,name:String,register:Boolean) = action {
  api.call(if(register)"/api/auth/register" else "/api/auth/login","POST",payload("email" to email.trim(),"password" to password,"name" to name.trim()))
  closePlayer();loadMe();showLogin=false;notice="반가워요, ${user?.optString("name")}님!"
 }
 fun openAccountSettings(){if(!authenticated())return;showAccount=false;accountError=null;nicknameCheck=null;showAccountSettings=true}
 fun checkNickname(name:String)=action {try{val result=api.call("/api/account/nickname?name="+java.net.URLEncoder.encode(name,"UTF-8"));nicknameCheck=if(result.optBoolean("available"))"사용할 수 있는 아이디입니다." else result.optString("message")}catch(e:Exception){if(e is CancellationException)throw e;accountError=e.message}}
 fun saveNickname(name:String)=action {accountError=null;try{api.call("/api/account/nickname","PUT",payload("name" to name));loadMe();loadOwnProfile(fresh=true);nicknameCheck="아이디를 변경했습니다.";notice="아이디를 변경했어요."}catch(e:Exception){if(e is CancellationException)throw e;accountError=e.message}}
 fun changePassword(current:String,next:String,done:()->Unit)=action {accountError=null;try{api.call("/api/account/password","PUT",payload("current_password" to current,"new_password" to next));done();notice="비밀번호를 변경했어요. 다른 기기는 다시 로그인해주세요."}catch(e:Exception){if(e is CancellationException)throw e;accountError=e.message}}
 fun logout()=action {
  var remoteFailure:Exception?=null
  try{api.call("/api/auth/logout","POST")}
  catch(e:Exception){if(e is CancellationException)throw e;remoteFailure=e}
  finally{
   // Local logout must finish even when the server cannot revoke this session.
   NativeSession.put(getApplication(),"cookie","");NativeSession.put(getApplication(),"ticket","");NativeSession.put(getApplication(),"verifier","")
   api.clearGoogleBinding();api.invalidateReads()
   user=null;membership=JSONObject();closePlayer();showLogin=false;showAccount=false
   runCatching{androidx.credentials.CredentialManager.create(getApplication()).clearCredentialState(androidx.credentials.ClearCredentialStateRequest())}
   if(BuildConfig.KAKAO_NATIVE_KEY.isNotBlank())runCatching{com.kakao.sdk.user.UserApiClient.instance.logout{}}
  }
  notice=if(remoteFailure==null)"로그아웃했어요." else "이 기기에서 로그아웃했어요. 연결 문제로 서버 로그아웃은 확인하지 못했어요."
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
  detailJob?.cancel();val scope=readScope();detail=song;comments=emptyList();detailBusy=true
  detailJob=viewModelScope.launch {
   try{val data=api.call("/api/tracks/${song.id}",fresh=true);val responses=api.call("/api/tracks/${song.id}/comments",fresh=true);ensureRead(scope)
    if(detail?.id==song.id){detail=Song(data.getJSONObject("track"));comments=responses.optJSONArray("comments").objects()}}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope))failure(e)}finally{if(isActive&&sameAccount(scope)&&detail?.id==song.id)detailBusy=false}
  }
 }
 fun like(song:Song) {if(!authenticated())return;action {
  val liked=likes.any {it.id==song.id};api.call("/api/tracks/${song.id}/like",if(liked)"DELETE" else "PUT");loadLibrary(fresh=true)
  val fresh=Song(api.call("/api/tracks/${song.id}",fresh=true).getJSONObject("track"))
  feed=feed.map {if(it.id==song.id)fresh else it};home=home.map {if(it.id==song.id)fresh else it}
  latest=latest.map{if(it.id==song.id)fresh else it};recentCovers=recentCovers.map{if(it.id==song.id)fresh else it}
  collection=collection?.let{it.copy(tracks=it.tracks.map{t->if(t.id==song.id)fresh else t})}
  if(detail?.id==song.id)detail=fresh
  if(song.cover){if(rankOpen)loadRankings();loadRankHighlights()}
 }}
 fun comment(body:String,parentId:String?=null,onSuccess:()->Unit={}) {if(!authenticated()||body.isBlank())return;val song=detail?:return;action {
  api.call("/api/tracks/${song.id}/comments","POST",payload("body" to body.trim(),"parent_id" to parentId))
  if(detail?.id==song.id){comments=api.call("/api/tracks/${song.id}/comments",fresh=true).optJSONArray("comments").objects();detail=Song(api.call("/api/tracks/${song.id}",fresh=true).getJSONObject("track"))}
  onSuccess();notice="댓글을 남겼어요."
 }}
 fun commentLike(comment:JSONObject){if(!authenticated())return;action {
  api.call("/api/comments/${comment.getString("id")}/like",if(comment.optInt("liked")==1)"DELETE" else "PUT")
  detail?.let {comments=api.call("/api/tracks/${it.id}/comments",fresh=true).optJSONArray("comments").objects()}
 }}
 fun deleteComment(comment:JSONObject){val song=detail?:return;action {
  api.call("/api/comments/${comment.getString("id")}","DELETE")
  val updated=api.call("/api/tracks/${song.id}/comments",fresh=true).optJSONArray("comments").objects()
  if(detail?.id==song.id){comments=updated;detail=Song(api.call("/api/tracks/${song.id}",fresh=true).getJSONObject("track"))}
 }}
 fun createList(name:String,public:Boolean,initialSong:Song?=null,onDone:()->Unit) {if(!authenticated())return;action {
  val r=api.call("/api/playlists","POST",payload("name" to name.trim(),"is_public" to public).apply{initialSong?.let{put("track_ids",JSONArray(listOf(it.id)))}});loadLibrary(fresh=true)
  val data=api.call("/api/playlists/${r.getString("id")}",fresh=true);selectedList=data.getJSONObject("playlist");listSongs=data.tracks();onDone()
 }}
 fun openList(id:String){
  listJob?.cancel();val request=++listRequest;val scope=readScope();val path="/api/playlists/$id"
  val cached=api.peek(path)
  if(cached?.optJSONObject("playlist")?.optString("id")==id){selectedList=cached.getJSONObject("playlist");listSongs=cached.tracks()}
  else if(selectedList?.optString("id")!=id){selectedList=(playlists+publicLists+searchLists).find{it.optString("id")==id}?.let{JSONObject(it.toString())};listSongs=emptyList()}
  val shown=selectedList!=null;listLoading=true
  listJob=viewModelScope.launch{
   try{val data=api.call(path,fresh=true);ensureRead(scope);if(request==listRequest&&(selectedList?.optString("id")==id||!shown&&selectedList==null)){selectedList=data.getJSONObject("playlist");listSongs=data.tracks()}}
   catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&request==listRequest){if(e is ApiException&&e.status in listOf(403,404)){selectedList=null;listSongs=emptyList()};failure(e)}}
   finally{if(sameAccount(scope)&&request==listRequest)listLoading=false}
  }
 }
 fun addToList(id:String,song:Song)=action {
  api.call("/api/playlists/$id/tracks/${song.id}","PUT");loadLibrary(fresh=true)
  if(selectedList?.optString("id")==id){val d=api.call("/api/playlists/$id",fresh=true);selectedList=d.getJSONObject("playlist");listSongs=d.tracks()}
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
 fun openFollower(p:JSONObject){
  if(!p.isNull("id")&&p.optString("id").isNotBlank())openProfile(p.getString("id"),seed=p)
  else {
   val uid=p.getString("user_id")
   requestProfile("follower:$uid",JSONObject(p.toString()).put("id",uid).put("profile_kind","listener")){
    val listener=api.call("/api/followers/$uid",fresh=true).getJSONObject("profile")
    if(!listener.isNull("id")&&listener.optString("id").isNotBlank()){
     val data=api.call("/api/producers/${listener.getString("id")}",fresh=true)
     ProfilePage(data.getJSONObject("profile").put("profile_kind","producer"),data.tracks(),data.tracks("covers"),data.optInt("followers"))
    }else ProfilePage(listener.put("profile_kind","listener"),emptyList(),emptyList(),0)
   }
  }
 }
 fun openProfile(id:String,kind:String="producer",showCovers:Boolean=false,seed:JSONObject?=null){
  val type=if(kind=="artist")"artist" else "producer"
  val path="/api/${type}s/$id"
  fun page(data:JSONObject)=ProfilePage(data.getJSONObject("profile").put("profile_kind",type).put("show_covers",showCovers).put("gallery",data.optJSONArray("gallery")).put("can_manage",data.optBoolean("can_manage")),data.tracks(),data.tracks("covers"),data.optInt("followers"))
  requestProfile("$type:$id:$showCovers",JSONObject(seed?.toString()?:"{}").put("id",id).put("profile_kind",type).put("show_covers",showCovers),api.peek(path)?.let{page(it)}){page(api.call(path,fresh=true))}
 }
 private fun copyProfile(page:ProfilePage)=ProfilePage(JSONObject(page.person.toString()),page.tracks.map{Song(JSONObject(it.raw.toString()))},page.covers.map{Song(JSONObject(it.raw.toString()))},page.followers)
 private fun requestProfile(key:String,placeholder:JSONObject,snapshot:ProfilePage?=null,fetch:suspend ()->ProfilePage){
  profileJob?.cancel();val request=++profileRequest;val scope=readScope();val cacheKey="${scope.account}:${scope.generation}:${scope.apiRevision}:${scope.mutation}:$key"
  profileError=null;retryProfileLoad={requestProfile(key,placeholder,null,fetch)}
  val cached=snapshot?:profileCache[cacheKey]?.takeIf{System.currentTimeMillis()-it.first<90_000}?.second
  displayProfile(copyProfile(cached?:ProfilePage(placeholder,emptyList(),emptyList(),0)));profileLoading=cached==null
  profileJob=viewModelScope.launch{
   try{
    val page=fetch();ensureRead(scope);if(request!=profileRequest)return@launch
    displayProfile(copyProfile(page));profileCache[cacheKey]=System.currentTimeMillis() to copyProfile(page)
    while(profileCache.size>30)profileCache.remove(profileCache.keys.first())
   }catch(e:Exception){if(e is CancellationException)throw e;if(sameAccount(scope)&&request==profileRequest){if(e is ApiException&&e.status==401)failure(e);if(e is ApiException&&e.status in listOf(403,404)){profileCache.remove(cacheKey);profileSongs=emptyList();profileCovers=emptyList()};profileError=e.message?:"프로필을 불러오지 못했어요."}}
   finally{if(sameAccount(scope)&&request==profileRequest)profileLoading=false}
  }
 }
 fun follow(){val p=profile?:return;toggleFollow(p.optString("profile_kind","producer"),p.getString("id"))}
 suspend fun lyricsAt(song:Song,seconds:Double){
  val scope=readScope()
  if(lyricsAccess=="full" && System.currentTimeMillis()/1000>=lyricExpiry){lyricId="";lyricRows=emptyList();lyricsAccess="line"}
  if(lyricId!=song.id){
   lyricId=song.id;lyric="";lyricUntil=-1.0;lyricFrom=-1.0;lyricRows=emptyList()
   try{
    val t=api.call("/api/tracks/${song.id}",fresh=true).getJSONObject("track");ensureRead(scope);lyricsAccess=t.optString("lyrics_access");lyricExpiry=t.optLong("lyrics_access_until",Long.MAX_VALUE)
    if(lyricsAccess=="full"){
     lyricRows=parseDisplayLyrics(t.optString("lyrics"))
     if(lyricRows.isEmpty())lyric="등록된 가사가 없어요.";return
    }
    if(t.optString("lyrics_mode")!="synced"){lyric="등록된 가사가 없어요.";lyricUntil=Double.MAX_VALUE;lyricFrom=0.0;return}
   }catch(e:Exception){if(e is CancellationException){if(sameAccount(scope)&&lyricId==song.id)lyricId="";throw e};if(!sameAccount(scope))return;lyricId="";lyric="가사를 연결하지 못했어요.";return}
  }
  if(lyricsAccess=="full")return
  if(seconds>=lyricFrom&&seconds<lyricUntil)return
  try{
   val response=api.call("/api/tracks/${song.id}/lyrics/line?at=${seconds.coerceIn(0.0,song.duration.coerceAtLeast(0.0))}",fresh=true);ensureRead(scope);val line=response.optJSONObject("line")
   lyricRows=response.optJSONArray("lines").objects().map{it.optDouble("time") to it.optString("text")}
   lyric=line?.optString("text")?.ifBlank {"♪"}?:"등록된 가사가 없어요.";lyricFrom=line?.optDouble("from")?:0.0;lyricUntil=line?.optDouble("until")?.coerceAtLeast(seconds+1)?:Double.MAX_VALUE
  }catch(e:Exception){if(e is CancellationException)throw e;if(!sameAccount(scope))return;lyric="가사를 연결하지 못했어요.";lyricFrom=seconds;lyricUntil=seconds+10}
 }
 override fun onCleared(){MediaController.releaseFuture(future);super.onCleared()}
}
