package kr.co.aifect.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

@Composable internal fun OfficialAiBadge(person:JSONObject){
 if(person.optString("account_type")=="ai_bot")
  Text("AI",fontSize=9.sp,color=Violet,modifier=Modifier.padding(start=5.dp).background(Violet.copy(alpha=.18f),RoundedCornerShape(4.dp)).padding(horizontal=4.dp,vertical=1.dp).semantics{contentDescription="공식 AI 응원 계정"})
}
