package kr.co.aifect.app

import org.junit.Assert.assertEquals
import org.junit.Test

class DiamondPreviewTest {
 @Test fun zeroAndSmallAmountsPreserveTheServerTaxExemption(){
  assertEquals(DiamondCashPreview(0,0,0,0),diamondCashPreview(0))
  assertEquals(DiamondCashPreview(100,0,0,100),diamondCashPreview(1))
  assertEquals(DiamondCashPreview(5000,0,0,5000),diamondCashPreview(50))
  assertEquals(DiamondCashPreview(10000,0,0,10000),diamondCashPreview(100))
  assertEquals(DiamondCashPreview(33300,0,0,33300),diamondCashPreview(333))
 }

 @Test fun firstTaxableAmountMatchesTheServerTenWonTruncation(){
  // The previous app showed 32,298 here by retaining a two-won income-tax remainder.
  assertEquals(DiamondCashPreview(33400,1000,100,32300),diamondCashPreview(334))
  assertEquals(DiamondCashPreview(33700,1010,100,32590),diamondCashPreview(337))
  assertEquals(DiamondCashPreview(36700,1100,110,35490),diamondCashPreview(367))
 }

 @Test fun maximumSubmissionAndSevenDigitUnsubmittedInputKeepTheirFullValues(){
  assertEquals(DiamondCashPreview(100000000,3000000,300000,96700000),diamondCashPreview(1000000))
  // Invalid-for-submission input still needs a safe preview before the user corrects it.
  assertEquals(DiamondCashPreview(999999900,29999990,2999990,966999920),diamondCashPreview(9999999))
 }

 @Test(expected=IllegalArgumentException::class) fun rejectsNegativePreviewInput(){diamondCashPreview(-1)}
 @Test(expected=IllegalArgumentException::class) fun rejectsOverflowingPreviewInput(){diamondCashPreview(Long.MAX_VALUE)}
}
