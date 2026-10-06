package kr.co.aifect.app.karaoke;

import java.io.*;

/** Bounded PCM handoff. Every write wakes the reader, including a partial codec block. */
final class AudioPipe extends InputStream {
    private final byte[] data;
    private int at, size;
    private boolean ended, closed;
    private IOException failure;
    AudioPipe(int capacity){if(capacity<=0)throw new IllegalArgumentException();data=new byte[capacity];}
    private void await()throws IOException{
        try{wait();}catch(InterruptedException e){Thread.currentThread().interrupt();throw new InterruptedIOException();}
    }
    private void writable()throws IOException{if(closed||ended)throw new IOException("Audio pipe closed");}
    private void append(byte[] b,int offset,int length){
        int end=(at+size)%data.length,first=Math.min(length,data.length-end);
        System.arraycopy(b,offset,data,end,first);System.arraycopy(b,offset+first,data,0,length-first);
        size+=length;notifyAll();
    }
    synchronized void write(byte[] b,int offset,int length)throws IOException{
        while(length>0){writable();while(size==data.length){await();writable();}
            int n=Math.min(length,data.length-size);append(b,offset,n);offset+=n;length-=n;
        }
    }
    /** Capture must never wait on storage, or silently discard samples. */
    synchronized boolean offer(byte[] b,int offset,int length)throws IOException{
        writable();if(length>data.length-size)return false;append(b,offset,length);return true;
    }
    synchronized void finish(IOException error){failure=error;ended=true;notifyAll();}
    @Override public synchronized int available(){return size;}
    @Override public int read()throws IOException{byte[] one=new byte[1];return read(one,0,1)<0?-1:one[0]&255;}
    @Override public synchronized int read(byte[] b,int offset,int length)throws IOException{
        if(offset<0||length<0||length>b.length-offset)throw new IndexOutOfBoundsException();
        if(length==0)return 0;
        while(size==0&&!ended&&!closed)await();
        if(closed)throw new IOException("Audio pipe closed");
        if(size==0){if(failure!=null)throw failure;return -1;}
        int n=Math.min(length,size),first=Math.min(n,data.length-at);
        System.arraycopy(data,at,b,offset,first);System.arraycopy(data,0,b,offset+first,n-first);
        at=(at+n)%data.length;size-=n;notifyAll();return n;
    }
    @Override public synchronized void close(){closed=true;notifyAll();}
}
