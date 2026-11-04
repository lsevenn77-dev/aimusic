package kr.co.aifect.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.espresso.Espresso
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class InventoryDecorationConfirmTest {
 @get:Rule val ui=createComposeRule()

 @Test fun storedItemConfirmationShowsRealDetailsAndPreservesBusyCancelAndErrorStates(){
  val item=JSONObject().put("id","stored-theme").put("source","decoration_stock").put("stored",true).put("available",true).put("period_code","P7D").put("product",JSONObject().put("kind","TALKING_ROOM_THEME").put("name","별빛 라운지"))
  var busy by mutableStateOf(false)
  var error by mutableStateOf<String?>(null)
  var useCount=0
  var dismissCount=0
  ui.setContent{MaterialTheme(colorScheme=Scheme){InventoryDecorationConfirm(item,busy,error,{dismissCount++},{useCount++;busy=true})}}
  ui.onNodeWithTag("inventory-use-dialog").assertIsDisplayed()
  ui.onNodeWithTag("inventory-use-image").assertIsDisplayed()
  ui.onNodeWithTag("inventory-use-name").assertTextEquals("별빛 라운지")
  ui.onNodeWithTag("inventory-use-period").assertTextEquals("7일 · 사용 시작부터 적용")
  assertEquals(0,useCount)
  ui.onNodeWithTag("inventory-use-confirm").assertIsDisplayed().performClick()
  assertEquals(1,useCount)
  ui.onNodeWithTag("inventory-use-confirm").assertIsNotEnabled()
  ui.onNodeWithTag("inventory-use-cancel").assertIsNotEnabled()
  Espresso.pressBack();ui.waitForIdle();assertEquals(0,dismissCount)
  ui.runOnIdle{busy=false;error="연결을 다시 확인해주세요."}
  ui.onNodeWithTag("inventory-use-error").assertTextEquals("연결을 다시 확인해주세요.")
  ui.onNodeWithTag("inventory-use-cancel").performClick()
  assertEquals(1,dismissCount);assertEquals(1,useCount)
 }

 @Test fun inventoryStatusKeepsStoredAndFramesSeparateFromActivatedThemePeriod(){
  fun item(source:String,available:Boolean,kind:String="TALKING_ROOM_THEME")=JSONObject().put("source",source).put("available",available).put("product",JSONObject().put("kind",kind))
  assertEquals("보관 중",inventoryDecorationStatus(item("decoration_stock",true)))
  assertEquals("사용 보류",inventoryDecorationStatus(item("decoration_stock",false)))
  assertEquals("적용 중",inventoryDecorationStatus(item("decoration",true)))
  assertEquals("사용 가능",inventoryDecorationStatus(item("other",true)))
  assertEquals("기간 만료",inventoryDecorationStatus(item("decoration",false).put("expires_at",10),100))
  assertEquals("사용 불가",inventoryDecorationStatus(item("decoration",false).put("expires_at",200),100))
  assertEquals("장착",inventoryDecorationStatus(item("decoration",true,"PROFILE_FRAME")))
  assertEquals("장착 중",inventoryDecorationStatus(item("decoration",true,"PROFILE_FRAME").put("equipped",true)))
  assertEquals("보관 중",inventoryDecorationStatus(item("decoration_stock",true,"PROFILE_FRAME")))
 }
}
