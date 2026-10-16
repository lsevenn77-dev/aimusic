package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class GiftSelectionTest {
 @Test fun quantitiesMultiplyTheSelectedCurrencyAndCheckBalance(){
  val silver=GiftSelection("silver-letter",true,2,5)
  assertEquals(10L,silver.total);assertEquals("S",silver.unit)
  assertFalse(silver.affordable(9));assertTrue(silver.affordable(10))
  val gold=GiftSelection("crown",false,777,10)
  assertEquals(7770L,gold.total);assertEquals("G",gold.unit)
  assertTrue(gold.affordable(7770));assertFalse(gold.affordable(7769))
 }
 @Test fun refusesInvalidCountsAndOverflowingGold(){
  for(n in listOf(-1,0,101,Int.MAX_VALUE))assertFalse(GiftSelection("moon",false,2000,n).valid)
  assertTrue(GiftSelection("moon",false,2000,50).valid)
  assertFalse(GiftSelection("moon",false,2000,51).valid)
  assertFalse(GiftSelection("",true,2,1).valid)
  assertFalse(GiftSelection("unknown",false,0,1).valid)
  assertTrue(GiftSelection("silver-music-box",true,1000,100).valid)
 }
}
