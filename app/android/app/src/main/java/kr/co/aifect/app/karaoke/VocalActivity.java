package kr.co.aifect.app.karaoke;
import java.io.*;import java.util.*;
public final class VocalActivity {
 private VocalActivity(){}
 public static double[][] detect(File dry,int offsetMs,double duration)throws IOException{
  ArrayList<Double> energy=new ArrayList<>();byte[] raw=new byte[PcmFiles.RATE/10*2];double low=0,alpha=1-Math.exp(-2*Math.PI*150/PcmFiles.RATE);
  try(InputStream in=new BufferedInputStream(new FileInputStream(dry))){int n;while((n=PcmFiles.read(in,raw,raw.length))>0){double sum=0;for(int i=0;i<n/2;i++){double sample=PcmFiles.sample(raw,i*2)/32768.0;low+=alpha*(sample-low);double high=sample-low;sum+=high*high;}energy.add(Math.sqrt(sum/Math.max(1,n/2)));}}
  ArrayList<Double> sorted=new ArrayList<>(energy);Collections.sort(sorted);double floor=sorted.isEmpty()?0:sorted.get((int)(sorted.size()*.2)),threshold=Math.max(.006,Math.min(.025,floor*3.5));ArrayList<double[]> ranges=new ArrayList<>();int start=-1,last=-1;
  for(int i=0;i<=energy.size()+3;i++){if(i<energy.size()&&energy.get(i)>=threshold){if(start<0)start=i;last=i;}if(start>=0&&i-last>=3){if(last-start>=1){double s=Math.max(0,start*.1-.08-offsetMs/1000.0),e=Math.min(duration,(last+1)*.1+.08-offsetMs/1000.0);if(e>s)ranges.add(new double[]{Math.round(s*100)/100.0,Math.round(e*100)/100.0});}start=-1;}}
  return ranges.toArray(new double[0][]);
 }
}
