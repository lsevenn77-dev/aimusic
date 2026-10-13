package kr.co.aifect.app

import org.junit.Assert.assertEquals
import org.junit.Test

class RedesignLayoutTest {
 @Test fun phonesKeepSingingCardsInOneColumn(){for(width in listOf(320f,360f,390f,430f,599f))assertEquals(1,singingCardColumns(width,1f))}
 @Test fun wideScreensUseTwoColumns(){assertEquals(2,singingCardColumns(600f,1f));assertEquals(2,singingCardColumns(1000f,1.3f))}
 @Test fun largeTextFallsBackToOneColumn(){assertEquals(1,singingCardColumns(800f,1.5f))}
 @Test fun crewGraphsClampAndHandleMissingTargets(){
  assertEquals(.24f,crewMetricFraction(12,50),.001f)
  assertEquals(.28f,crewMetricFraction(1280,2000,1000),.001f)
  assertEquals(0f,crewMetricFraction(12,0),0f)
  assertEquals(0f,crewMetricFraction(-1,50),0f)
  assertEquals(1f,crewMetricFraction(60,50),0f)
 }
}
