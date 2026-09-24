package kr.co.aifect.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable internal fun CommentReportDialog(m:MusicModel,dismiss:()->Unit,send:(String,String)->Unit){
 val reasons=listOf("abuse" to "욕설·괴롭힘", "spam" to "도배·광고", "privacy" to "개인정보 노출", "sexual" to "음란·불쾌한 내용", "other" to "기타")
 var reason by remember{mutableStateOf("")}
 var details by remember{mutableStateOf("")}
 AlertDialog(onDismissRequest={if(!m.busy)dismiss()},title={Text("댓글 신고")},text={
  Column(Modifier.verticalScroll(rememberScrollState())){
   Text("신고 사유를 선택해주세요. 운영자가 내용을 확인해요.",fontSize=12.sp,color=Muted)
   reasons.forEach{(code,label)->FilterChip(reason==code,{reason=code},label={Text(label)},modifier=Modifier.fillMaxWidth())}
   OutlinedTextField(details,{details=it.take(500)},label={Text("추가 설명 (선택)",fontSize=12.sp)},modifier=Modifier.fillMaxWidth().padding(top=8.dp),maxLines=4)
  }
 },confirmButton={TextButton(onClick={send(reason,details)},enabled=reason.isNotBlank()&&!m.busy){Text("신고 접수")}},dismissButton={TextButton(onClick=dismiss,enabled=!m.busy){Text("취소")}})
}
