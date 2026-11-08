package kr.co.aifect.app

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import org.junit.Assert.assertEquals
import org.junit.Test

class StickerInputTest {
 private val token="[aifect:cat_basic_love]"
 private fun v(text:String,cursor:Int=text.length)=TextFieldValue(text,TextRange(cursor))

 @Test fun backspaceAfterStickerRemovesWholeToken(){
  val old=v("안녕 $token")
  val next=keepStickersWhole(old,v("안녕 "+token.dropLast(1)))
  assertEquals("안녕 ",next.text);assertEquals(3,next.selection.start)
 }

 @Test fun deletingInsideAStickerRemovesItAndKeepsSurroundingText(){
  val old=v("a${token}b")
  val next=keepStickersWhole(old,v("a"+token.removeRange(5,6)+"b",6))
  assertEquals("ab",next.text);assertEquals(1,next.selection.start)
 }

 @Test fun ordinaryTypingIsUntouched(){
  val old=v("$token 좋아")
  val typed=v("$token 좋아요")
  assertEquals(typed,keepStickersWhole(old,typed))
 }

 @Test fun replacingASelectionThatTouchesAStickerTakesTheWholeSticker(){
  val old=v("x${token}y")
  val next=keepStickersWhole(old,v("x"+token.substring(0,3)+"Zy"))
  assertEquals("xZy",next.text)
 }
}
