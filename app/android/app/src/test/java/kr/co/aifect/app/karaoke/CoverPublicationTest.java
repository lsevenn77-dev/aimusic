package kr.co.aifect.app.karaoke;
import org.junit.Test;
import static org.junit.Assert.*;
public class CoverPublicationTest {
 @Test public void choicesSeparateSoloInvitationAndCompletedDuet(){
  CoverPublication solo=new CoverPublication("solo","");assertEquals("solo",solo.mode);assertEquals("",solo.slot);assertFalse(solo.invitation());
  CoverPublication invite=new CoverPublication("duet_invitation","");assertEquals("duet",invite.mode);assertEquals("first",invite.slot);assertTrue(invite.invitation());
  CoverPublication joined=new CoverPublication("duet_complete","partner-take");assertEquals("duet",joined.mode);assertEquals("second",joined.slot);assertFalse(joined.invitation());
 }
 @Test public void noImplicitDefaultAndPartnersCannotBeRelabeledAsSolo(){
  for(String bad:new String[]{"","solo","duet_invitation"})try{new CoverPublication(bad,"partner");fail();}catch(IllegalArgumentException expected){}
  try{new CoverPublication("duet_complete","");fail();}catch(IllegalArgumentException expected){}
 }
 @Test public void soloRecordingCannotBecomeADuetInvitation(){
  CoverPublication solo=new CoverPublication("solo","");solo.requireRecordingMode("solo");solo.requireRecordingMode("duet");
  CoverPublication invitation=new CoverPublication("duet_invitation","");invitation.requireRecordingMode("duet");
  try{invitation.requireRecordingMode("solo");fail();}catch(IllegalArgumentException expected){}
 }
 @Test public void retriesRejectAnyRemoteTypeParentOrOriginalMismatch(){
  CoverPublication solo=new CoverPublication("solo","");solo.verify("solo",null,"song","song");
  for(String[] bad:new String[][]{{"duet","","song"},{"solo","partner","song"},{"solo","","different"}})try{solo.verify(bad[0],bad[1],bad[2],"song");fail();}catch(IllegalStateException expected){}
  CoverPublication joined=new CoverPublication("duet_complete","partner");joined.verify("duet","partner","song","song");
  assertEquals("duet_invitation",CoverPublication.legacy("duet",""));assertEquals("solo",CoverPublication.legacy("solo",""));
 }
}
