package kr.co.aifect.app.karaoke;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

public class RecordingDraftStoreTest {
 private final Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
 private final String origin="http://127.0.0.1:4175",account="draft-list-test";
 private final ArrayList<File> created=new ArrayList<>();
 private File seed(String id,String mode,String part,String parent,String user,int seconds,boolean legacy,long updated)throws Exception{
  String owner=KaraokeActivity.draftOwner(origin,"user:"+user);File folder=new File(context.getFilesDir(),"karaoke-"+id+(mode.equals("duet")?"-duet-"+part+"-"+(parent.isEmpty()?"first":parent):"")+"-"+owner);folder.mkdirs();created.add(folder);
  try(RandomAccessFile audio=new RandomAccessFile(new File(folder,"voice.pcm"),"rw")){audio.setLength(seconds*48000L*2);}
  JSONObject data=new JSONObject().put("title",id+" 초안");if(!legacy)data.put("trackId",id).put("coverMode",mode).put("duetPart",part).put("duetParent",parent);
  File session=new File(folder,"session.json");try(FileOutputStream out=new FileOutputStream(session)){out.write(data.toString().getBytes(StandardCharsets.UTF_8));}session.setLastModified(updated);return folder;
 }
 @After public void cleanup(){for(File folder:created){File[] files=folder.listFiles();if(files!=null)for(File file:files)file.delete();folder.delete();}}
 @Test public void listPreservesAudioAndScopesLegacySoloAndDuetDraftsToTheirOwner()throws Exception{
  assertTrue(context.getPackageName().endsWith(".test"));long now=System.currentTimeMillis();File solo=seed("draft-solo","solo","","",account,3,false,now-3000);seed("draft-first","duet","male","",account,4,true,now-2000);seed("draft-second","duet","female","parent-take",account,5,false,now-1000);seed("draft-other","solo","","","another-user",3,false,now);seed("draft-empty","duet","male","",account,0,false,now);
  long length=new File(solo,"voice.pcm").length(),stamp=new File(solo,"session.json").lastModified();JSONArray entries=RecordingDraftStore.list(context,origin,account);assertEquals(3,entries.length());assertEquals("draft-second",entries.getJSONObject(0).getString("trackId"));assertEquals("parent-take",entries.getJSONObject(0).getString("duetParent"));assertEquals("female",entries.getJSONObject(0).getString("duetPart"));assertEquals("duet",entries.getJSONObject(1).getString("coverMode"));assertEquals("draft-first",entries.getJSONObject(1).getString("trackId"));assertEquals(3d,entries.getJSONObject(2).getDouble("duration"),.01);assertEquals(length,new File(solo,"voice.pcm").length());assertEquals(stamp,new File(solo,"session.json").lastModified());assertEquals(0,RecordingDraftStore.list(context,origin,null).length());
 }
}
