package kr.co.aifect.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PeopleOutline
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Icon
import coil.compose.AsyncImage
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale

/**
 * Native AI artist directory. Only the name, real follower count and follow action
 * are displayed on top of a square, edge-to-edge portrait. No genre placeholder.
 */
@Composable
internal fun AIArtistDirectoryGrid(
 entries:List<JSONObject>,
 m:MusicModel,
 busy:Boolean,
 error:String?,
 onRetry:()->Unit
){
 LazyVerticalGrid(
  columns=GridCells.Fixed(2),
  modifier=Modifier.fillMaxSize().testTag("music-directory"),
  contentPadding=PaddingValues(start=16.dp,end=16.dp,top=16.dp,bottom=26.dp),
  horizontalArrangement=Arrangement.spacedBy(12.dp),
  verticalArrangement=Arrangement.spacedBy(12.dp)
 ){
  item(span={GridItemSpan(maxLineSpan)}){
   Column {
    Heading("AI 아티스트")
    if(busy)LinearProgressIndicator(Modifier.fillMaxWidth())
    error?.let { e->
     Text(e,color=Muted)
     TextButton(onClick=onRetry){Text("다시 불러오기")}
    }
   }
  }
  items(entries,key={it.optString("id")}){a-> AIArtistSquareTile(a,m)}
  if(!busy&&error==null&&entries.isEmpty())item(span={GridItemSpan(maxLineSpan)}){
   Text("아직 공개된 AI 아티스트가 없어요.",color=Muted)
  }
 }
}

@Composable
private fun AIArtistSquareTile(a:JSONObject,m:MusicModel){
 val id=a.optString("id")
 val name=a.optString("name")
 val version=a.optString("image_version")
 val count=(m.artistFollowerCounts[id]?:a.optInt("followers")).coerceAtLeast(0)
 val following=m.follows.any{it.optString("kind")=="artist"&&it.optString("target_id")==id}
 val shape=RoundedCornerShape(17.dp)
 Box(
  Modifier.fillMaxWidth().aspectRatio(1f).clip(shape)
   .background(Panel).border(1.dp,Stroke,shape)
   .testTag("ai-artist-square-$id")
 ){
  DefaultProfileArtwork(name,Modifier.fillMaxSize())
  if(version.isNotBlank()&&version!="0"&&version!="null"){
   AsyncImage(
    model=Endpoint.url("/media/artist/$id?v=$version"),
    contentDescription="$name 아티스트 사진",
    modifier=Modifier.fillMaxSize(),
    contentScale=ContentScale.Crop
   )
  }
  Box(
   Modifier.fillMaxWidth().fillMaxHeight(.63f).align(Alignment.BottomCenter)
    .background(Brush.verticalGradient(listOf(
     Color.Transparent,
     Color(0xFF0D1123).copy(alpha=.76f),
     Color(0xFF0B1020).copy(alpha=.97f)
    )))
  )
  Box(
   Modifier.matchParentSize().clickable(onClickLabel="$name 아티스트 프로필"){
    m.openProfile(id,"artist")
   }
  )
  Column(
   Modifier.align(Alignment.BottomCenter).fillMaxWidth()
    .padding(start=10.dp,end=10.dp,bottom=9.dp)
  ){
   Text(
    name,
    fontSize=15.sp,
    lineHeight=20.sp,
    fontWeight=FontWeight.SemiBold,
    color=Color.White,
    maxLines=1,
    overflow=TextOverflow.Ellipsis,
    modifier=Modifier.fillMaxWidth().testTag("ai-artist-name-$id")
   )
   Row(
    Modifier.fillMaxWidth().padding(top=5.dp),
    verticalAlignment=Alignment.CenterVertically,
    horizontalArrangement=Arrangement.spacedBy(4.dp)
   ){
    Icon(
     Icons.Outlined.PeopleOutline,
     contentDescription=null,
     tint=Color.White.copy(alpha=.85f),
     modifier=Modifier.size(14.dp)
    )
    Text(
     NumberFormat.getIntegerInstance(Locale.KOREA).format(count),
     fontSize=11.sp,
     lineHeight=16.sp,
     color=Color.White.copy(alpha=.9f),
     maxLines=1,
     overflow=TextOverflow.Ellipsis,
     modifier=Modifier.weight(1f).testTag("ai-artist-followers-$id")
    )
    Surface(
     onClick={m.followArtist(id)},
     enabled=!m.busy,
     modifier=Modifier.height(33.dp).widthIn(min=64.dp).testTag("ai-artist-follow-$id"),
     shape=RoundedCornerShape(18.dp),
     color=if(following)Color(0xFF303441).copy(alpha=.9f)else Color(0xFF252A3F).copy(alpha=.95f),
     border=BorderStroke(1.dp,if(following)Color(0xFF777E8C)else Aqua.copy(alpha=.85f))
    ){
     Box(Modifier.padding(horizontal=9.dp),contentAlignment=Alignment.Center){
      Text("팔로우",fontSize=11.sp,lineHeight=14.sp,
       color=if(following)Color(0xFFB3B9C4)else Color.White,fontWeight=FontWeight.Medium)
     }
    }
   }
  }
 }
}
