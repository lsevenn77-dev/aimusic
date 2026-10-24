package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class NativePerformanceRouteTest {
 @Test fun supportsExistingAudioAndProfileRoutes(){
  listOf("voice","voice/room-1","dubbing/project-1","dubbing/new","dubbing?tab=mine","profile").forEach{assertTrue(it,validNativePerformanceRoute(it))}
 }
 @Test fun rejectsArbitraryUrlsScriptsAndTraversal(){
  listOf("https://evil.test","//evil.test","javascript:alert(1)","voice/../admin","voice#https://evil.test","admin","voice/room<script>","voice?next=https://evil.test","voice/"+ "a".repeat(251)).forEach{assertFalse(it,validNativePerformanceRoute(it))}
 }
}
