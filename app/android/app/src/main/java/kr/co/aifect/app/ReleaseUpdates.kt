package kr.co.aifect.app
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.appupdate.*
import com.google.android.play.core.install.*
import com.google.android.play.core.install.model.*
import kotlinx.coroutines.launch

internal class ReleaseUpdates(private val activity:MainActivity,private val model:MusicModel){
 private val play=AppUpdateManagerFactory.create(activity)
 private val launcher=activity.registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()){}
 private var policyChecked=false
 private var checked=false
 private var dialog:AlertDialog?=null
 private val changed=InstallStateUpdatedListener{if(it.installStatus()==InstallStatus.DOWNLOADED)ready()}
 init{if(!BuildConfig.DEBUG)play.registerListener(changed)}
 private fun canShow()=!activity.isFinishing&&!activity.isDestroyed&&dialog?.isShowing!=true
 private fun ready(){if(canShow())dialog=AlertDialog.Builder(activity).setTitle("업데이트 준비 완료").setMessage("앱을 다시 시작해 새 버전을 적용할까요?").setPositiveButton("다시 시작"){_,_->play.completeUpdate()}.setNegativeButton("나중에",null).show()}
 fun resume(){if(BuildConfig.DEBUG)return
  if(!policyChecked){policyChecked=true;activity.lifecycleScope.launch{val minimum=runCatching{model.api.call("/api/android/release-policy").optInt("minimum_version_code",1)}.getOrDefault(1);if(minimum>BuildConfig.VERSION_CODE&&!activity.isDestroyed&&!activity.isFinishing){dialog?.dismiss();dialog=AlertDialog.Builder(activity).setTitle("새 버전이 필요해요").setMessage("이 버전의 지원이 종료됐어요. Google Play에서 업데이트해주세요.").setCancelable(false).setPositiveButton("Google Play"){_,_->runCatching{activity.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id=kr.co.aifect.app")))};activity.finish()}.setNegativeButton("닫기"){_,_->activity.finish()}.show()}}}
  play.appUpdateInfo.addOnSuccessListener{info->if(info.installStatus()==InstallStatus.DOWNLOADED)ready()
   else if(!checked){checked=true;activity.lifecycleScope.launch{
    if(!canShow())return@launch
    if(info.updateAvailability()==UpdateAvailability.UPDATE_AVAILABLE&&info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)){val prefs=activity.getSharedPreferences("app_update",0);if(prefs.getInt("offered",0)!=info.availableVersionCode()){prefs.edit().putInt("offered",info.availableVersionCode()).apply();play.startUpdateFlowForResult(info,launcher,AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build())}}
   }}}
 }
 fun close(){if(!BuildConfig.DEBUG)play.unregisterListener(changed);dialog?.dismiss()}
}
