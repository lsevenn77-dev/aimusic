package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class ChatScrollTest {
 @Test fun newMessagesAlwaysBringTheChatToTheLatest(){
  // Opening a chat lands on the latest message.
  assertTrue(chatJumpsToLatest(initialized=false,newerLatest=true,composing=false,firstVisibleIndex=0))
  // Several new messages at once keep the old last message on screen (index 3), yet the chat still moves down.
  assertTrue(chatJumpsToLatest(initialized=true,newerLatest=true,composing=false,firstVisibleIndex=3))
  // Even while reading far up, a newer message brings the latest into view.
  assertTrue(chatJumpsToLatest(initialized=true,newerLatest=true,composing=false,firstVisibleIndex=40))
 }
 @Test fun readingEarlierHistoryIsNotInterrupted(){
  // Loading older messages or a resize far from the bottom keeps the reader where they are.
  assertFalse(chatJumpsToLatest(initialized=true,newerLatest=false,composing=false,firstVisibleIndex=12))
  // Near the bottom or typing, a resize keeps the latest message anchored.
  assertTrue(chatJumpsToLatest(initialized=true,newerLatest=false,composing=false,firstVisibleIndex=1))
  assertTrue(chatJumpsToLatest(initialized=true,newerLatest=false,composing=true,firstVisibleIndex=12))
 }
}
