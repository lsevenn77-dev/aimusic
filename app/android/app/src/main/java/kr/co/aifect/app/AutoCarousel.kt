package kr.co.aifect.app

import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

/** The large logical range lets the last card advance to the first in the same direction. */
@Composable internal fun rememberAutoCarousel(count:Int,visible:Boolean=true):PagerState {
 val pager=key(count){rememberPagerState(initialPage=if(count>1)(Int.MAX_VALUE/2/count)*count else 0,pageCount={if(count>1)Int.MAX_VALUE else count})}
 val dragged by pager.interactionSource.collectIsDraggedAsState()
 val covered=appPageIsOpen()
 val lifecycle=LocalLifecycleOwner.current.lifecycle
 LaunchedEffect(pager,count,visible,dragged,covered,lifecycle){
  if(count<2||!visible||dragged||covered)return@LaunchedEffect
  lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED){
   while(isActive){
    delay(3000)
    if(!pager.isScrollInProgress)pager.animateScrollToPage(pager.currentPage+1,animationSpec=tween(350))
   }
  }
 }
 return pager
}
