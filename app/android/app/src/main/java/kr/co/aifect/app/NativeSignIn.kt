package kr.co.aifect.app

import androidx.activity.ComponentActivity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.kakao.sdk.common.KakaoSdk
import com.kakao.sdk.common.model.ClientError
import com.kakao.sdk.common.model.ClientErrorCause
import com.kakao.sdk.auth.model.OAuthToken
import com.kakao.sdk.user.UserApiClient
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class SignInCancelled:Exception()

class NativeSignIn(private val activity:ComponentActivity) {
 init { if(BuildConfig.KAKAO_NATIVE_KEY.isNotBlank())KakaoSdk.init(activity.applicationContext,BuildConfig.KAKAO_NATIVE_KEY) }
 suspend fun google(clientId:String,nonce:String):String {
  require(clientId.isNotBlank()) { "Google 로그인을 준비하고 있어요." }
  try {
   val option=GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
   val credential=CredentialManager.create(activity).getCredential(activity,GetCredentialRequest.Builder().addCredentialOption(option).build()).credential
   if(credential !is CustomCredential || credential.type!=GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL)throw IllegalStateException("Google 계정을 다시 선택해주세요.")
   return GoogleIdTokenCredential.createFrom(credential.data).idToken
  }catch(e:GetCredentialCancellationException){throw SignInCancelled()}
 }
 suspend fun kakao():String=suspendCancellableCoroutine { continuation->
  if(BuildConfig.KAKAO_NATIVE_KEY.isBlank()) { continuation.resumeWithException(IllegalStateException("카카오 앱 로그인을 준비하고 있어요."));return@suspendCancellableCoroutine }
  val callback:(OAuthToken?,Throwable?)->Unit={ token,error->
   if(continuation.isActive){
    when {
     error is ClientError && error.reason==ClientErrorCause.Cancelled -> continuation.resumeWithException(SignInCancelled())
     error!=null -> continuation.resumeWithException(IllegalStateException("카카오 인증을 완료하지 못했어요. 다시 시도해주세요."))
     token!=null -> continuation.resume(token.accessToken)
     else -> continuation.resumeWithException(IllegalStateException("카카오 인증 정보를 받지 못했어요."))
    }
   }
  }
  if(UserApiClient.instance.isKakaoTalkLoginAvailable(activity)) {
   UserApiClient.instance.loginWithKakaoTalk(activity,callback=callback)
  } else UserApiClient.instance.loginWithKakaoAccount(activity,callback=callback)
 }
}
