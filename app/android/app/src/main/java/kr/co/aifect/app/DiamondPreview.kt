package kr.co.aifect.app

internal data class DiamondCashPreview(
 val grossKrw:Long,
 val incomeTaxKrw:Long,
 val localTaxKrw:Long,
 val netKrw:Long
)

/** Display only: mirrors shared/gifts.js withholding(); the server authorizes and settles. */
internal fun diamondCashPreview(diamonds:Long):DiamondCashPreview {
 // The amount field permits at most seven digits. Keep this helper safe for other callers too.
 require(diamonds>=0L&&diamonds<=Long.MAX_VALUE/300L)
 val gross=diamonds*100L
 val roundedIncome=gross*3L/1000L*10L
 val income=if(roundedIncome<1000L)0L else roundedIncome
 val local=income/100L*10L
 return DiamondCashPreview(gross,income,local,gross-income-local)
}
