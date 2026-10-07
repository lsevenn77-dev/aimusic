package kr.co.aifect.app.karaoke;
import org.json.*;import java.util.*;
final class DuetGuide {
 static JSONObject empty(){try{return new JSONObject().put("version",1).put("mode","free").put("lines",new JSONArray());}catch(JSONException e){throw new IllegalStateException(e);}}
 static String part(JSONObject guide,JSONArray words,int index,double duration){
  if(guide==null)return "";JSONArray lines=guide.optJSONArray("lines");String part=lines==null?"":lines.optString(index,"");
  if(part.isEmpty()&&guide.optString("mode").equals("free")&&guide.has("activity")){JSONObject line=words.optJSONObject(index);double s=line.optDouble("s"),e=s;JSONArray w=line.optJSONArray("w");if(w!=null)for(int i=0;i<w.length();i++)e=Math.max(e,w.optJSONObject(i).optDouble("e"));if(e<=s)e=index+1<words.length()?words.optJSONObject(index+1).optDouble("s"):duration;double heard=0;JSONArray ranges=guide.optJSONArray("activity");if(ranges!=null)for(int i=0;i<ranges.length();i++){JSONObject r=ranges.optJSONObject(i);heard+=Math.max(0,Math.min(e,r.optDouble("e"))-Math.max(s,r.optDouble("s")));}double ratio=heard/Math.max(.1,e-s);part=ratio<.2?"B":ratio>.8?"A":"partial";}
  return part;
 }
 static String role(String part,boolean second){return part.equals("A")?(second?"partner":"mine"):part.equals("B")?(second?"mine":"partner"):part.equals("both")?"both":part.equals("partial")?"partial":"";}
 static String label(JSONObject guide,JSONArray words,int index,boolean second,double duration){
  if(guide==null)return "";String part=part(guide,words,index,duration);
  return part.equals("A")?(second?"파트너":"내 파트"):part.equals("B")?(second?"내 파트":"파트너"):part.equals("both")?"함께":part.equals("partial")?"빈 구간 있음 · 추정":"미지정";
 }
 static String explicitPart(JSONObject guide,int index){
  JSONArray lines=guide==null?null:guide.optJSONArray("lines");String value=lines==null?"":lines.optString(index,"");
  return value.equals("A")||value.equals("B")||value.equals("both")?value:"";
 }
 static int assigned(JSONObject guide,int count){int total=0;for(int i=0;i<count;i++)if(!explicitPart(guide,i).isEmpty())total++;return total;}
 static String manualProblem(JSONObject guide,int count){
  if(guide==null||!guide.optString("mode").equals("lyrics"))return "";
  int missing=count-assigned(guide,count);if(count==0)return "싱크 가사가 없어 자유롭게 부르기를 선택해주세요.";
  if(missing>0)return "아직 지정하지 않은 가사가 "+missing+"줄 있어요.";
  boolean first=false,second=false;for(int i=0;i<count;i++){String part=explicitPart(guide,i);first|=part.equals("A")||part.equals("both");second|=part.equals("B")||part.equals("both");}
  return first&&second?"":"내 파트와 파트너 파트를 모두 지정해주세요. 함께 부르는 줄도 가능해요.";
 }
 static void assign(JSONObject guide,int index,String part)throws JSONException{
  if(!part.isEmpty()&&!part.equals("A")&&!part.equals("B")&&!part.equals("both"))throw new IllegalArgumentException("Unknown duet part");
  JSONArray lines=guide.optJSONArray("lines");if(lines==null)lines=new JSONArray();while(lines.length()<=index)lines.put("");lines.put(index,part);guide.put("lines",lines);
 }
 static void fillPartner(JSONObject guide,int count)throws JSONException{for(int i=0;i<count;i++)if(explicitPart(guide,i).isEmpty())assign(guide,i,"B");}
 static ArrayList<double[]> remaining(JSONObject guide,double duration){ArrayList<double[]> out=new ArrayList<>();if(guide==null||!guide.has("activity"))return out;double cursor=0;JSONArray ranges=guide.optJSONArray("activity");if(ranges!=null)for(int i=0;i<ranges.length();i++){JSONObject r=ranges.optJSONObject(i);double s=r.optDouble("s"),e=r.optDouble("e");if(s-cursor>=.3)out.add(new double[]{cursor,s});cursor=Math.max(cursor,e);}if(duration-cursor>=.3)out.add(new double[]{cursor,duration});return out;}
}
