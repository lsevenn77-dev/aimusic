package kr.co.aifect.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import org.json.JSONObject

@Composable internal fun ArtistPhotoGallery(m:MusicModel,p:JSONObject){
 val aid=p.optString("id")
 val photos=p.optJSONArray("gallery").objects()
 val manage=p.optBoolean("can_manage")
 var selected by remember(aid){mutableStateOf<JSONObject?>(null)}
 var deleting by remember(aid){mutableStateOf<JSONObject?>(null)}
 val picker=rememberLauncherForActivityResult(ActivityResultContracts.GetContent()){uri->
  if(uri!=null)m.action{
   m.api.uploadWebp("/api/artists/$aid/gallery",uri)
   m.api.invalidateReads()
   if(m.profile?.optString("id")==aid)m.openProfile(aid,"artist")
   m.notice="갤러리에 사진을 추가했어요."
  }
 }
 Column(Modifier.fillMaxWidth().testTag("artist-photo-gallery"),verticalArrangement=Arrangement.spacedBy(12.dp)){
  Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){
   Column(Modifier.weight(1f)){Text("갤러리",fontSize=20.sp);Text("${photos.size}장의 사진",color=Muted,fontSize=14.sp)}
   if(manage)OutlinedButton(onClick={picker.launch("image/*")},enabled=!m.busy&&photos.size<30){Icon(Icons.Rounded.Add,null,Modifier.size(18.dp));Text("사진 추가")}
  }
  if(photos.isEmpty())Empty("아직 등록된 사진이 없어요",if(manage)"사진 추가를 눌러 첫 모습을 공유해보세요." else "새로운 사진이 올라오면 여기에서 만나요.")
  photos.chunked(2).forEach{pair->
   Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)){
    pair.forEach{photo->
     Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(16.dp)).background(Panel)){
      AsyncImage(Endpoint.url(photo.optString("url")),"${p.optString("name")} 갤러리 사진 크게 보기",Modifier.fillMaxSize().clickable{selected=photo},contentScale=ContentScale.Crop)
      if(manage)FilledTonalButton(onClick={deleting=photo},enabled=!m.busy,modifier=Modifier.align(Alignment.BottomEnd).padding(4.dp),contentPadding=PaddingValues(horizontal=12.dp)){Text("삭제",fontSize=14.sp)}
     }
    }
    if(pair.size==1)Spacer(Modifier.weight(1f))
   }
  }
 }
 selected?.let{photo->Dialog(onDismissRequest={selected=null}){
  Surface(shape=RoundedCornerShape(20.dp),color=Ink){Column(Modifier.fillMaxWidth()){
   Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically){Text(p.optString("name"),Modifier.weight(1f).padding(start=16.dp));IconButton(onClick={selected=null}){Icon(Icons.Rounded.Close,"사진 닫기")}}
   AsyncImage(Endpoint.url(photo.optString("url")),"${p.optString("name")} 갤러리 사진",Modifier.fillMaxWidth().heightIn(min=200.dp,max=560.dp),contentScale=ContentScale.Fit)
  }}
 }}
 deleting?.let{photo->AlertDialog(onDismissRequest={deleting=null},title={Text("이 사진을 삭제할까요?")},text={Text("AI 가수 갤러리에서 제거됩니다.")},confirmButton={TextButton(onClick={
  deleting=null;m.action{m.api.call("/api/artists/$aid/gallery/${photo.optString("id")}","DELETE");if(m.profile?.optString("id")==aid)m.openProfile(aid,"artist");m.notice="사진을 삭제했어요."}
 }){Text("사진 삭제")}},dismissButton={TextButton(onClick={deleting=null}){Text("취소")}})}
}
