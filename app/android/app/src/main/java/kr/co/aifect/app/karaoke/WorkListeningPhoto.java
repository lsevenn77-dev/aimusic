package kr.co.aifect.app.karaoke;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.AtomicFile;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

public final class WorkListeningPhoto {
    static final int MAX_BYTES=5*1024*1024;

    static boolean supported(String type){
        return "image/jpeg".equals(type)||"image/png".equals(type)||"image/webp".equals(type);
    }
    public static Bitmap store(InputStream input,File destination)throws IOException{
        if(input==null)throw new IOException("커버사진을 열 수 없습니다.");
        ByteArrayOutputStream data=new ByteArrayOutputStream();
        byte[] chunk=new byte[8192];
        int length;
        while((length=input.read(chunk))!=-1){
            if(data.size()+length>MAX_BYTES)throw new IOException("이미지는 5MB 이하로 선택해 주세요.");
            data.write(chunk,0,length);
        }
        byte[] bytes=data.toByteArray();
        BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if(!supported(options.outMimeType)||options.outWidth<=0||options.outHeight<=0||(long)options.outWidth*options.outHeight>64_000_000)
            throw new IOException("JPG·PNG·WebP 커버사진을 다시 선택해 주세요.");
        int width=Math.max(options.outWidth,options.outHeight);
        options.inJustDecodeBounds=false;options.inSampleSize=Math.max(1,Integer.highestOneBit(width/1500));
        Bitmap bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
        if(bitmap==null)throw new IOException("커버사진을 열 수 없습니다.");
        int largest=Math.max(bitmap.getWidth(),bitmap.getHeight());
        if(largest>1600){
            float scale=1600f/largest;
            Bitmap smaller=Bitmap.createScaledBitmap(bitmap,Math.max(1,Math.round(bitmap.getWidth()*scale)),Math.max(1,Math.round(bitmap.getHeight()*scale)),true);
            if(smaller!=bitmap){bitmap.recycle();bitmap=smaller;}
        }
        ByteArrayOutputStream encoded=new ByteArrayOutputStream();
        Bitmap.CompressFormat format=Build.VERSION.SDK_INT>=30?Bitmap.CompressFormat.WEBP_LOSSY:Bitmap.CompressFormat.WEBP;
        if(!bitmap.compress(format,86,encoded)||encoded.size()>MAX_BYTES)throw new IOException("커버사진을 저장할 수 없습니다.");
        AtomicFile file=new AtomicFile(destination);
        FileOutputStream output=file.startWrite();
        try{encoded.writeTo(output);file.finishWrite(output);}
        catch(IOException|RuntimeException error){file.failWrite(output);throw error;}
        return bitmap;
    }
}
