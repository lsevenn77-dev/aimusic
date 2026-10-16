package kr.co.aifect.app

/** One checked total is used by the wallet, confirmation and request. */
internal data class GiftSelection(val id:String,val silver:Boolean,val unitCost:Int,val quantity:Int) {
 val total:Long get()=unitCost.toLong()*quantity
 val valid:Boolean get()=id.isNotBlank()&&unitCost>0&&quantity in 1..100&&(silver||total<=100000)
 fun affordable(balance:Int)=valid&&total<=balance
 val unit:String get()=if(silver)"S" else "G"
}
