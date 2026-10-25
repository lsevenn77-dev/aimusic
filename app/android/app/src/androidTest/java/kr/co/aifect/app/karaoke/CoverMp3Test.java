package kr.co.aifect.app.karaoke;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

public class CoverMp3Test {
 @Test public void finalExportIs256KbpsAndUploadMimeMatchesLegacyDrafts()throws Exception{
  android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();assertTrue(context.getPackageName().endsWith(".test"));
  File dir=new File(context.getExternalFilesDir(null),"polish-264-audio");dir.mkdirs();File wav=new File(dir,"fixture.wav"),mp3=new File(dir,"fixture.mp3");
  try(OutputStream out=new BufferedOutputStream(new FileOutputStream(wav))){PcmFiles.wavHeader(out,96000,32000,2);for(int i=0;i<96000;i++){short value=(short)(10000*Math.sin(2*Math.PI*440*i/32000));for(int c=0;c<2;c++){out.write(value&255);out.write((value>>8)&255);}}}
  CoverMp3.export(wav,mp3);assertTrue(mp3.length()*100<wav.length()*27);assertFalse(new File(mp3.getPath()+".part").exists());
  MediaExtractor extractor=new MediaExtractor();try{extractor.setDataSource(mp3.getPath());MediaFormat f=extractor.getTrackFormat(0);assertEquals("audio/mpeg",f.getString(MediaFormat.KEY_MIME));assertEquals(32000,f.getInteger(MediaFormat.KEY_SAMPLE_RATE));assertEquals(2,f.getInteger(MediaFormat.KEY_CHANNEL_COUNT));assertEquals(256000,f.getInteger(MediaFormat.KEY_BIT_RATE));assertTrue(Math.abs(f.getLong(MediaFormat.KEY_DURATION)-3000000)<100000);}finally{extractor.release();}
  for(File file:new File[]{mp3,wav}){
   try(ServerSocket server=new ServerSocket(0,1,InetAddress.getByName("127.0.0.1"))){
    AtomicReference<String> headers=new AtomicReference<>();AtomicReference<Throwable> failure=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
    Thread worker=new Thread(()->{try(Socket socket=server.accept()){
     socket.setSoTimeout(10000);InputStream input=socket.getInputStream();ByteArrayOutputStream h=new ByteArrayOutputStream();int previous=0,marker=0,b;while((b=input.read())!=-1){h.write(b);marker=(marker<<8)|b;if(marker==0x0d0a0d0a)break;if(h.size()>16000)throw new IOException("headers");}headers.set(h.toString("UTF-8"));
     ByteArrayOutputStream body=new ByteArrayOutputStream();for(long left=file.length();left>0;left--){b=input.read();if(b<0)throw new EOFException();body.write(b);}assertArrayEquals(java.nio.file.Files.readAllBytes(file.toPath()),body.toByteArray());socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}".getBytes());
    }catch(Throwable e){failure.set(e);}finally{done.countDown();}});worker.start();
    new KaraokeApi("http://127.0.0.1:"+server.getLocalPort(),"").upload("fixture",file);assertTrue(done.await(10,TimeUnit.SECONDS));if(failure.get()!=null)throw new AssertionError(failure.get());
    assertTrue(headers.get().contains(file==mp3?"audio/mpeg":"audio/wav"));assertTrue(headers.get().startsWith("PUT /api/uploads/fixture/audio"));
   }
  }
  File invalid=new File(dir,"invalid.wav");try(FileOutputStream out=new FileOutputStream(invalid)){out.write(new byte[44]);}try{CoverMp3.export(invalid,new File(dir,"invalid.mp3"));fail("Invalid WAV must fail");}catch(IOException expected){}assertFalse(new File(dir,"invalid.mp3.part").exists());invalid.delete();
 }
}
