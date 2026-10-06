package kr.co.aifect.app.karaoke;

import android.content.Context;
import kr.co.aifect.app.NativeSession;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Only metadata is loaded. Dry PCM stays private and is never read to draw the list. */
public final class RecordingDraftStore {
 public static JSONArray list(Context context,String origin,String account){
  JSONArray result=new JSONArray();if(account==null||account.isEmpty())return result;
  Set<String> owners=new HashSet<>();owners.add(KaraokeActivity.draftOwner(origin,"user:"+account));String cookie=NativeSession.cookie(context);if(!cookie.isEmpty())owners.add(KaraokeActivity.draftOwner(origin,cookie));
  File[] folders=context.getFilesDir().listFiles(file->file.isDirectory()&&file.getName().startsWith("karaoke-"));if(folders==null)return result;
  ArrayList<JSONObject> entries=new ArrayList<>();
  for(File folder:folders)try{
   String owner=owners.stream().filter(id->folder.getName().endsWith("-"+id)).findFirst().orElse(null);if(owner==null)continue;
   File audio=new File(folder,"voice.pcm"),session=new File(folder,"session.json");if(audio.length()<=PcmFiles.RATE/5||!session.isFile()||session.length()>512000)continue;
   JSONObject data=new JSONObject(new String(java.nio.file.Files.readAllBytes(session.toPath()),StandardCharsets.UTF_8));String stem=folder.getName().substring(8,folder.getName().length()-owner.length()-1),track=stem,mode="solo",part="",parent="";int split=stem.indexOf("-duet-");
   if(split>=0){track=stem.substring(0,split);String rest=stem.substring(split+6);int at=rest.indexOf('-');if(at<0)continue;mode="duet";part=rest.substring(0,at);parent=rest.substring(at+1);if(parent.equals("first"))parent="";}
   track=data.optString("trackId",track);mode=data.optString("coverMode",mode);part=data.optString("duetPart",part);parent=data.optString("duetParent",parent);
   if(!track.matches("[\\w-]{1,80}")||!parent.isEmpty()&&!parent.matches("[\\w-]{1,80}")||!mode.equals("solo")&&!mode.equals("duet"))continue;
   String expected="karaoke-"+track+(mode.equals("duet")?"-duet-"+part+"-"+(parent.isEmpty()?"first":parent):"")+"-"+owner;if(!folder.getName().equals(expected))continue;
   entries.add(new JSONObject().put("trackId",track).put("coverMode",mode).put("duetPart",part).put("duetParent",parent).put("title",data.optString("title","임시 저장한 녹음")).put("duration",audio.length()/2.0/PcmFiles.RATE).put("updated",session.lastModified()));
  }catch(Exception ignored){}
  entries.sort((a,b)->Long.compare(b.optLong("updated"),a.optLong("updated")));for(JSONObject entry:entries)result.put(entry);return result;
 }
 private RecordingDraftStore(){}
}
