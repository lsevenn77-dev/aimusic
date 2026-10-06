package kr.co.aifect.app.karaoke;

import java.io.IOException;
import org.junit.Test;
import static org.junit.Assert.*;

public class CoverSubmissionTest {
    private static class Server implements CoverSubmission.Transport {
        String state="uploading";int uploads,completes,reads;boolean premium,loseComplete,loseUpload,unreachable;
        public String status()throws Exception{reads++;if(unreachable)throw new IOException("offline");return state;}
        public void upload()throws Exception{uploads++;if(loseUpload)throw new IOException("upload interrupted");if(!state.equals("uploading"))throw new IOException("409");}
        public boolean complete()throws Exception{completes++;state="queued";if(loseComplete)throw new IOException("complete response lost");return !premium;}
        public boolean recoveredUploadAd(){return !premium;}
    }
    @Test public void newUploadKeepsNormalCompletionAndPremiumAdDecision()throws Exception{
        Server server=new Server();server.premium=true;assertFalse(CoverSubmission.submit(server,false));assertEquals(1,server.uploads);assertEquals(1,server.completes);assertEquals(0,server.reads);
    }
    @Test public void lostCompletionResponseIsRecoveredWithoutSendingAudioAgain()throws Exception{
        Server server=new Server();server.loseComplete=true;assertTrue(CoverSubmission.submit(server,false));assertEquals("queued",server.state);assertEquals(1,server.uploads);assertEquals(1,server.completes);assertEquals(1,server.reads);
        for(String state:new String[]{"queued","processing","published","hidden"}){server.state=state;assertTrue(CoverSubmission.submit(server,true));}
        assertEquals(1,server.uploads);assertEquals(1,server.completes);
    }
    @Test public void interruptedAudioRemainsRetryableWithTheSameDraft()throws Exception{
        Server server=new Server();server.loseUpload=true;
        try{CoverSubmission.submit(server,false);fail("A pending draft must not be reported as submitted");}catch(IOException expected){assertEquals("upload interrupted",expected.getMessage());}
        assertEquals("uploading",server.state);assertEquals(0,server.completes);
        server.loseUpload=false;assertTrue(CoverSubmission.submit(server,true));assertEquals(2,server.uploads);assertEquals(1,server.completes);
    }
    @Test public void retryAfterLostCompleteAndUnavailableStatusOnlyReconcilesTheExistingId()throws Exception{
        Server server=new Server();server.loseComplete=true;server.unreachable=true;
        try{CoverSubmission.submit(server,false);fail();}catch(IOException expected){assertEquals("complete response lost",expected.getMessage());assertEquals(1,expected.getSuppressed().length);}
        assertEquals("queued",server.state);server.unreachable=false;
        assertTrue(CoverSubmission.submit(server,true));assertEquals(1,server.uploads);assertEquals(1,server.completes);
    }
    @Test public void unknownOrFailedRemoteStateDoesNotOverwriteOrDiscardTheDraft()throws Exception{
        for(String state:new String[]{"failed","deleted","unknown"}){Server server=new Server();server.state=state;try{CoverSubmission.submit(server,true);fail();}catch(IOException expected){assertEquals(0,server.uploads);assertEquals(0,server.completes);}}
        Server offline=new Server();offline.unreachable=true;try{CoverSubmission.submit(offline,true);fail();}catch(IOException expected){assertEquals("offline",expected.getMessage());assertEquals(0,offline.uploads);}
    }
}
