package kr.co.aifect.app.karaoke;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

/** Uses the signed-in WebView session only with the app's trusted origin; never follows redirects. */
final class KaraokeApi {
    private final String origin,cookie;
    private volatile HttpURLConnection active;
    KaraokeApi(String origin,String cookie){this.origin=origin;this.cookie=cookie==null?"":cookie;}
    static boolean trustedOrigin(String origin,boolean debug){
        try{
            URI u=URI.create(origin);
            if(u.getRawUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||!(u.getPath().isEmpty()||u.getPath().equals("/")))return false;
            if("https".equals(u.getScheme())&&"aifect.co.kr".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443))return true;
            return debug&&"http".equals(u.getScheme())&&(u.getHost().equals("localhost")||u.getHost().equals("127.0.0.1"));
        }catch(Exception e){return false;}
    }
    private HttpURLConnection connect(String path,String method)throws IOException{
        if(!path.startsWith("/")||path.startsWith("//")||path.contains(".."))throw new IOException("잘못된 요청이에요.");
        HttpURLConnection c=(HttpURLConnection)new URL(origin+path).openConnection();active=c;
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(20000);c.setReadTimeout(45000);c.setRequestMethod(method);
        c.setRequestProperty("Cookie",cookie);c.setRequestProperty("Origin",origin);c.setRequestProperty("Accept","application/json");
        return c;
    }
    synchronized JSONObject json(String path,String method,JSONObject body)throws Exception{
        HttpURLConnection c=connect(path,method);
        try{
            if(body!=null){byte[] data=body.toString().getBytes(StandardCharsets.UTF_8);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setFixedLengthStreamingMode(data.length);try(OutputStream out=c.getOutputStream()){out.write(data);}}
            return response(c);
        }finally{c.disconnect();active=null;}
    }
    private JSONObject response(HttpURLConnection c)throws Exception{
        int status=c.getResponseCode();InputStream stream=status>=400?c.getErrorStream():c.getInputStream();
        String text=stream==null?"":new String(readBounded(stream,1024*1024),StandardCharsets.UTF_8);
        JSONObject result;try{result=new JSONObject(text);}catch(Exception ignored){result=new JSONObject();}
        if(status<200||status>=300)throw new IOException(status==401?"로그인이 만료됐어요. 다시 로그인해주세요.":result.optString("error","요청을 완료하지 못했어요. ("+status+")"));
        return result;
    }
    synchronized void download(String path,File dest)throws Exception{
        HttpURLConnection c=connect(path,"GET");
        try{
            if(c.getResponseCode()!=200){response(c);throw new IOException("반주를 불러오지 못했어요.");}
            if(c.getContentLengthLong()>80L*1024*1024)throw new IOException("반주 파일이 너무 커요.");
            try(InputStream in=c.getInputStream();OutputStream out=new BufferedOutputStream(new FileOutputStream(dest))){
                byte[] b=new byte[65536];long total=0;int n;
                while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();total+=n;if(total>80L*1024*1024)throw new IOException("반주 파일이 너무 커요.");out.write(b,0,n);}
            }
        }finally{c.disconnect();active=null;}
    }
    synchronized void upload(String id,File wav)throws Exception{
        if(!id.matches("[\\w-]{1,80}"))throw new IOException("잘못된 업로드 ID예요.");
        HttpURLConnection c=connect("/api/uploads/"+id+"/audio","PUT");
        try{
            c.setDoOutput(true);c.setRequestProperty("Content-Type","audio/wav");c.setFixedLengthStreamingMode(wav.length());
            try(InputStream in=new BufferedInputStream(new FileInputStream(wav));OutputStream out=c.getOutputStream()){
                byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1){if(Thread.currentThread().isInterrupted())throw new InterruptedIOException();out.write(b,0,n);}
            }
            response(c);
        }finally{c.disconnect();active=null;}
    }
    void cancel(){HttpURLConnection c=active;if(c!=null)c.disconnect();}
    private static byte[] readBounded(InputStream input,int max)throws IOException{
        try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>max)throw new IOException("서버 응답이 너무 커요.");out.write(b,0,n);}return out.toByteArray();
        }
    }
}
