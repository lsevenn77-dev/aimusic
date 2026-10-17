package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GroupAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

@Composable internal fun ProfileCrewInvite(m:MusicModel,p:JSONObject){
 // The server determines membership, capacity, recruiting, blocked/self/AI exclusions.
 val crew=p.optJSONObject("invite_crew")?:return
 val account=m.user?.optString("id")?:return
 val id=p.optString("id")
 val request=remember(account,id,crew.optString("id")){UUID.randomUUID().toString()}
 val scope=rememberCoroutineScope()
 var sending by remember(account,id){mutableStateOf(false)}
 var error by remember(account,id){mutableStateOf<String?>(null)}
 OutlinedButton(onClick={scope.launch{
  sending=true;error=null
  try{val d=m.api.call("/api/dm/$id/crew-invite","POST",payload("crew_id" to crew.getString("id"),"request_id" to request))
   if(m.user?.optString("id")==account){m.notice="크루 초대 메시지를 보냈어요.";m.openMessages(d.getString("peer_id"))}
  }catch(e:Exception){if(e is CancellationException)throw e;if(m.user?.optString("id")==account)error=e.message}finally{sending=false}
 }},enabled=!sending,modifier=Modifier.fillMaxWidth().testTag("profile-crew-invite")){
  Icon(Icons.Outlined.GroupAdd,null,Modifier.size(18.dp));Text(if(sending)"초대 보내는 중…" else "내 크루에 초대",Modifier.padding(start=6.dp))
 }
 error?.let{Text(it,color=Pink,fontSize=12.sp)}
}
