package kr.co.aifect.app

import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import org.json.JSONObject

internal data class ProfilePhotoPreview(val title:String,val url:String?)
internal data class ProfileGalleryPreview(val title:String,val photos:List<JSONObject>,val manageId:String?=null)
internal fun profileMediaUrl(value:String):String? {
 val path=value.trim()
 return when {
  path.startsWith('/')&&!path.startsWith("//")&&!path.contains("..") -> Endpoint.url(path)
  path.startsWith(Endpoint.origin+"/")&&!path.contains("..") -> path
  else -> null
 }
}
internal fun MusicModel.viewProfilePhoto(p:JSONObject){
 val id=p.optString("id");val version=p.optString("image_version")
 val kind=if(p.optString("profile_kind")=="artist")"artist" else "producer"
 val url=if(CurrentNavigation.safeID(id)&&version.isNotBlank()&&version!="0"&&version!="null")Endpoint.url("/media/$kind/$id?v=${CurrentNavigation.query(version)}")else null
 photoPreview=ProfilePhotoPreview(p.optString("name").ifBlank{"프로필 사진"},url)
}
internal fun MusicModel.photoRequest(url:String,full:Boolean=false):ImageRequest = ImageRequest.Builder(api.appContext)
 .data(url).size(if(full)2048 else 512)
 .memoryCacheKey("${user?.optString("id").orEmpty()}:$url:${if(full)"full" else "thumb"}").build()

/** Same authenticated loader and explicit bounds for thumbnails and enlarged images. */
@Composable internal fun ProfileImage(m:MusicModel,url:String?,description:String,modifier:Modifier=Modifier,full:Boolean=false,scale:ContentScale=ContentScale.Crop){
 var state by remember(url){mutableIntStateOf(0)}
 var retry by remember(url){mutableIntStateOf(0)}
 Box(modifier,contentAlignment=Alignment.Center){
  if(url!=null)key(url,retry){AsyncImage(m.photoRequest(url,full),description,imageLoader=m.profileImages,modifier=Modifier.fillMaxSize().then(if(state==1)Modifier.testTag("profile-image-loaded")else Modifier),contentScale=scale,onSuccess={state=1},onError={state=2})}
  if(url==null||state==2)Column(horizontalAlignment=Alignment.CenterHorizontally){Text("사진을 불러오지 못했어요",color=Muted,fontSize=12.sp);if(url!=null)TextButton({state=0;retry++}){Text("다시 시도")}}
  else if(state==0)CircularProgressIndicator(Modifier.size(22.dp),color=Aqua,strokeWidth=2.dp)
 }
}
@Composable internal fun ProfilePhotoViewer(m:MusicModel,photo:ProfilePhotoPreview,close:()->Unit){
 var zoom by remember(photo){mutableFloatStateOf(1f)}
 var pan by remember(photo){mutableStateOf(Offset.Zero)}
 Dialog(onDismissRequest=close,properties=DialogProperties(usePlatformDefaultWidth=false)){
  Surface(Modifier.fillMaxWidth().fillMaxHeight(.94f).padding(horizontal=8.dp),shape=RoundedCornerShape(20.dp),color=Color.Black){
   Column(Modifier.fillMaxSize().testTag("profile-photo-viewer")){
    Row(Modifier.fillMaxWidth().padding(start=16.dp),verticalAlignment=Alignment.CenterVertically){Text(photo.title,Modifier.weight(1f),color=Color.White,fontSize=15.sp,maxLines=2);IconButton(close,Modifier.testTag("photo-close")){Icon(Icons.Rounded.Close,"사진 닫기",tint=Color.White)}}
    Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(0.dp))
     .pointerInput(photo){detectTapGestures(onDoubleTap={zoom=if(zoom>1f)1f else 2f;pan=Offset.Zero})}
     .pointerInput(photo){detectTransformGestures{_,move,scale,_->
      zoom=(zoom*scale).coerceIn(1f,4f)
      val limitX=size.width*(zoom-1f)/2;val limitY=size.height*(zoom-1f)/2
      pan=if(zoom==1f)Offset.Zero else Offset((pan.x+move.x).coerceIn(-limitX,limitX),(pan.y+move.y).coerceIn(-limitY,limitY))
     }},contentAlignment=Alignment.Center){
     val imageModifier=Modifier.fillMaxSize().graphicsLayer(scaleX=zoom,scaleY=zoom,translationX=pan.x,translationY=pan.y)
     if(photo.url!=null)ProfileImage(m,photo.url,"${photo.title} 사진 크게 보기",imageModifier,true,ContentScale.Fit)
     else DefaultProfileArtwork(photo.title,Modifier.fillMaxWidth().aspectRatio(1f))
    }
    Text("두 손가락 또는 두 번 터치로 확대",color=Color.White.copy(alpha=.65f),fontSize=12.sp,modifier=Modifier.align(Alignment.CenterHorizontally).padding(16.dp))
   }
  }
 }
}
@Composable internal fun ProfileGalleryDialog(m:MusicModel,gallery:ProfileGalleryPreview,close:()->Unit){
 Dialog(onDismissRequest=close,properties=DialogProperties(usePlatformDefaultWidth=false)){
  Surface(Modifier.fillMaxWidth().fillMaxHeight(.85f).padding(horizontal=12.dp),shape=RoundedCornerShape(22.dp),color=Ink){
   Column(Modifier.fillMaxSize().testTag("profile-gallery-popup")){
    Row(Modifier.fillMaxWidth().padding(start=18.dp,end=4.dp),verticalAlignment=Alignment.CenterVertically){
     Column(Modifier.weight(1f).padding(vertical=14.dp)){Text("갤러리",fontSize=20.sp,fontWeight=FontWeight.Bold);Text("${gallery.photos.size}장의 사진",fontSize=12.sp,color=Muted)}
     gallery.manageId?.let{id->TextButton({close();m.openCurrentWorkspace("profile-gallery/$id","갤러리 관리")}){Text("사진 관리",fontSize=12.sp)}}
     IconButton(close){Icon(Icons.Rounded.Close,"갤러리 닫기")}
    }
    if(gallery.photos.isEmpty())Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center){Text("아직 등록된 사진이 없어요.",color=Muted)}
    else LazyVerticalGrid(GridCells.Fixed(2),Modifier.weight(1f).testTag("gallery-photo-grid"),contentPadding=PaddingValues(14.dp),horizontalArrangement=Arrangement.spacedBy(10.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
     itemsIndexed(gallery.photos){index,photo->val url=profileMediaUrl(photo.optString("url"));ProfileImage(m,url,"${gallery.title} 사진 ${index+1}",Modifier.aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Raised).testTag("gallery-photo-$index").clickable{m.photoPreview=ProfilePhotoPreview(gallery.title,url)})}
    }
   }
  }
 }
}
@Composable internal fun PublicProfileGallery(m:MusicModel,p:JSONObject){
 val photos=p.optJSONArray("gallery").objects()
 Column(Modifier.fillMaxWidth().testTag("profile-public-gallery"),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   Text("갤러리",fontSize=18.sp,fontWeight=FontWeight.Bold);Text(" ${photos.size}",fontSize=14.sp,color=Muted);Spacer(Modifier.weight(1f))
   if(photos.isNotEmpty())TextButton(onClick={m.galleryPreview=ProfileGalleryPreview(p.optString("name"),photos)}){Text("전체보기",fontSize=12.sp)}
  }
  if(photos.isEmpty())Text("공개된 사진이 없어요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(bottom=8.dp))
  else BoxWithConstraints(Modifier.fillMaxWidth()){
   val size=((maxWidth-12.dp)/2).coerceAtMost(156.dp)
   LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
    items(photos){photo->val url=profileMediaUrl(photo.optString("url"));ProfileImage(m,url,"${p.optString("name")} 갤러리 사진",Modifier.size(size).clip(RoundedCornerShape(12.dp)).background(Raised).testTag("profile-gallery-${photo.optString("id")}").clickable{m.photoPreview=ProfilePhotoPreview(p.optString("name")+" 갤러리",url)})}
   }
  }
 }
}
