package kr.co.aifect.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import coil.compose.AsyncImage
import org.json.JSONObject

internal data class ProfilePhotoPreview(val title:String,val url:String?)
internal fun MusicModel.viewProfilePhoto(p:JSONObject){
 val id=p.optString("id");val version=p.optString("image_version")
 val kind=if(p.optString("profile_kind")=="artist")"artist" else "producer"
 val url=if(CurrentNavigation.safeID(id)&&version.isNotBlank()&&version!="0"&&version!="null")Endpoint.url("/media/$kind/$id?v=${CurrentNavigation.query(version)}")else null
 photoPreview=ProfilePhotoPreview(p.optString("name").ifBlank{"프로필 사진"},url)
}

@Composable internal fun ProfilePhotoViewer(photo:ProfilePhotoPreview,close:()->Unit){
 var zoom by remember(photo){mutableFloatStateOf(1f)}
 var pan by remember(photo){mutableStateOf(Offset.Zero)}
 AppPage(title=photo.title,onDismissRequest=close,containerColor=Color.Black){
  Box(Modifier.fillMaxSize().clip(RoundedCornerShape(0.dp)).testTag("profile-photo-viewer")
   .pointerInput(photo){detectTapGestures(onDoubleTap={zoom=if(zoom>1f)1f else 2f;pan=Offset.Zero})}
   .pointerInput(photo){detectTransformGestures{_,move,scale,_->
    zoom=(zoom*scale).coerceIn(1f,4f)
    val limitX=size.width*(zoom-1f)/2;val limitY=size.height*(zoom-1f)/2
    pan=if(zoom==1f)Offset.Zero else Offset((pan.x+move.x).coerceIn(-limitX,limitX),(pan.y+move.y).coerceIn(-limitY,limitY))
   }},contentAlignment=Alignment.Center){
   val imageModifier=Modifier.fillMaxWidth().graphicsLayer(scaleX=zoom,scaleY=zoom,translationX=pan.x,translationY=pan.y)
   if(photo.url!=null)AsyncImage(photo.url,"${photo.title} 사진 크게 보기",imageModifier.fillMaxHeight(),contentScale=ContentScale.Fit)
   else DefaultProfileArtwork(photo.title,imageModifier.aspectRatio(1f))
   Text("두 손가락 또는 두 번 터치로 확대",color=Color.White.copy(alpha=.65f),fontSize=12.sp,modifier=Modifier.align(Alignment.BottomCenter).padding(18.dp))
  }
 }
}

@Composable internal fun PublicProfileGallery(m:MusicModel,p:JSONObject){
 val photos=p.optJSONArray("gallery").objects()
 Column(Modifier.fillMaxWidth().testTag("profile-public-gallery"),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   Text("갤러리",fontSize=18.sp,fontWeight=FontWeight.Bold);Text(" ${photos.size}",fontSize=14.sp,color=Muted)
   Spacer(Modifier.weight(1f))
   if(photos.isNotEmpty())TextButton(onClick={m.openCurrentWorkspace("profile-gallery/${p.optString("id")}","갤러리")}){Text("전체보기",fontSize=12.sp)}
  }
  if(photos.isEmpty())Text("공개된 사진이 없어요.",color=Muted,fontSize=13.sp,modifier=Modifier.padding(bottom=8.dp))
  else BoxWithConstraints(Modifier.fillMaxWidth()){
   val size=((maxWidth-12.dp)/2).coerceAtMost(156.dp)
   LazyRow(horizontalArrangement=Arrangement.spacedBy(12.dp)){
    items(photos,key={it.optString("id",it.optString("url"))}){photo->val path=photo.optString("url");val url=if(path.startsWith('/'))Endpoint.url(path)else path
     AsyncImage(url,"${p.optString("name")} 갤러리 사진",Modifier.size(size).clip(RoundedCornerShape(12.dp)).background(Raised).testTag("profile-gallery-${photo.optString("id")}").clickable{m.photoPreview=ProfilePhotoPreview(p.optString("name")+" 갤러리",url)},contentScale=ContentScale.Crop)
    }
   }
  }
 }
}
