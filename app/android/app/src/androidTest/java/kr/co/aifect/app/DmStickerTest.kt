package kr.co.aifect.app

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.sp
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class DmStickerTest {
 @get:Rule val ui=createComposeRule()

 @Test fun dmComposerInsertsCatStickerAndMessagesShowItAsPicture(){
  var draft by mutableStateOf("안녕 ")
  ui.setContent{MaterialTheme(colorScheme=Scheme){Column{
   StickerText("고마워 [aifect:cat_basic_love] 또 봐",15.sp,23.sp,Modifier.testTag("sticker-message"),stickerSize=30.sp)
   Text(stickerPreview("[aifect:cat_basic_love] 잘 자"),Modifier.testTag("sticker-preview"))
   ChatComposer(draft,{draft=it},"메시지",false,tagPrefix="dm"){}
  }}}
  // 받은 메시지: 토큰 글자 대신 그림(대체 텍스트는 라벨)
  val shown=ui.onNodeWithTag("sticker-message").fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.Text].joinToString("")
  assertFalse(shown,shown.contains("[aifect:"))
  // 목록 미리보기: 웹과 같은 [라벨]
  ui.onNodeWithTag("sticker-preview").assertTextEquals("[사랑] 잘 자")
  // 입력창 옆 버튼 → 고르기 → 커서 자리에 토큰, 창은 닫힘
  ui.onNodeWithTag("dm-sticker-picker").assertDoesNotExist()
  ui.onNodeWithTag("dm-sticker-toggle").assertIsDisplayed().performClick()
  ui.onNodeWithTag("dm-sticker-picker").assertIsDisplayed()
  ui.onNode(hasContentDescription("사랑") and hasAnyAncestor(hasTestTag("dm-sticker-picker"))).performClick()
  ui.onNodeWithTag("dm-sticker-picker").assertDoesNotExist()
  ui.runOnIdle{assertEquals("안녕 [aifect:cat_basic_love]",draft)}
  // 입력창에서도 토큰 글자 대신 그림
  ui.onAllNodesWithTag("dm-input-sticker",useUnmergedTree=true).assertCountEquals(1)
  val field=ui.onNodeWithTag("dm-input").fetchSemanticsNode().config
  val visible=field.getOrElseNullable(androidx.compose.ui.semantics.SemanticsProperties.Text){null}?.joinToString("").orEmpty()
  assertFalse(visible,visible.contains("[aifect:"))
 }
}
