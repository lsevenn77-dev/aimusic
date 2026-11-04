package kr.co.aifect.app

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.math.ceil
import kotlin.math.floor

class MessageAvatarFrameTest {
 @get:Rule val ui=createComposeRule()

 @Test fun decorativeFramesRemainVisibleOutsideBothConversationAvatarSizes(){
  val person=JSONObject().put("name","프레임 확인").put("profile_frame","crew-outline")
  ui.setContent{MaterialTheme(colorScheme=Scheme){Column{
   listOf(56,46).forEach{size->
    Surface(onClick={},color=Color.Black,modifier=Modifier.width(110.dp).testTag("frame-surface-$size")){
     MessageInboxRow{androidx.compose.foundation.layout.Box(Modifier.size(size.dp).testTag("frame-photo-$size")){Avatar("프레임 확인",person,size)}}
    }
   }
  }}}
  ui.waitForIdle()
  for(size in listOf(56,46)){
   val surface=ui.onNodeWithTag("frame-surface-$size",useUnmergedTree=true)
   val root=surface.fetchSemanticsNode().boundsInRoot
   val photo=ui.onNodeWithTag("frame-photo-$size",useUnmergedTree=true).fetchSemanticsNode().boundsInRoot
   val overhang=photo.width*.13f
   assertTrue("The $size dp avatar frame has an internal left gutter",photo.left-root.left>=overhang)
   assertTrue("The $size dp avatar frame has an internal top gutter",photo.top-root.top>=overhang)
   val pixels=surface.captureToImage().toPixelMap()
   val left=floor(photo.left-root.left-overhang).toInt().coerceAtLeast(0)
   val right=ceil(photo.right-root.left+overhang).toInt().coerceAtMost(pixels.width)
   val photoLeft=floor(photo.left-root.left).toInt()
   val photoRight=ceil(photo.right-root.left).toInt()
   val midY=(photo.center.y-root.top).toInt()
   val radius=(photo.height*.15f).toInt()
   fun bluePixels(from:Int,to:Int):Int{
    var count=0
    for(y in (midY-radius).coerceAtLeast(0)..(midY+radius).coerceAtMost(pixels.height-1))for(x in from until to){
     val pixel=pixels[x,y]
     if(pixel.blue>.25f&&pixel.blue>pixel.red*1.1f)count++
    }
    return count
   }
   assertTrue("The left decorative wing of the $size dp frame is painted inside the clipped Surface",bluePixels(left,photoLeft)>0)
   assertTrue("The right decorative wing of the $size dp frame is painted inside the clipped Surface",bluePixels(photoRight,right)>0)
  }
 }
}
