package kr.co.aifect.app

/** User intent outlives HTTP responses, never an interruption or a newer tap. Main-thread only. */
internal class VoiceMicIntent {
 var revision=0L; private set
 var wantsOn=false; private set
 var pending=false; private set
 fun request(enabled:Boolean):Long {revision++;wantsOn=enabled;pending=true;return revision}
 fun isCurrent(token:Long)=revision==token
 fun complete(token:Long){if(isCurrent(token))pending=false}
 fun interrupt(){revision++;wantsOn=false;pending=false}
 fun permits(serverAuthorized:Boolean)=wantsOn&&serverAuthorized
}
