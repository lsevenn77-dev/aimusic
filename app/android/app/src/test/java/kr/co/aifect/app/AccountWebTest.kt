package kr.co.aifect.app

import org.junit.Assert.*
import org.junit.Test

class AccountWebTest {
 @Test fun bridgeIsRestrictedToAccountPage() {
  assertTrue(accountPage("https://aifect.co.kr/#account"))
  for(page in listOf("https://aifect.co.kr/#home","https://aifect.co.kr/foo#account","https://example.org/#account",null)) {
   assertFalse(page,accountPage(page))
  }
 }
 @Test fun policyAndStoreLinksUseExistingDestinations() {
  for(link in listOf("https://aifect.co.kr/contact","https://aifect.co.kr/refund","https://aifect.co.kr/terms","https://aifect.co.kr/privacy",
     "https://play.google.com/store/account/subscriptions","https://play.google.com/store/account/orderhistory","https://apps.apple.com/account/subscriptions","https://reportaproblem.apple.com/"))assertTrue(link,accountExternalUrl(link))
  for(link in listOf("https://example.org/contact","https://aifect.co.kr/","http://aifect.co.kr/terms","https://play.google.com/","",":"))assertFalse(link,accountExternalUrl(link))
 }
}