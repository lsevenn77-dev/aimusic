#include <jni.h>
#include <aaudio/AAudio.h>
#include <atomic>
#include <array>
#include <vector>
#include <algorithm>
#include <cmath>
#include <dlfcn.h>
#include <time.h>
namespace {
constexpr int RATE=48000,CAPACITY=RATE*4,MAX_BLOCK=4096;
float clamp(float x,float lo,float hi){return std::isfinite(x)?std::max(lo,std::min(hi,x)):lo;}
float limit(float x){float a=std::abs(x);return a<=.8f?x:std::copysign(.8f+.19f*(1-std::exp(-(a-.8f)/.19f)),x);}
struct Delay{std::vector<float> data;int at=0;float damp=0;explicit Delay(float seconds):data(std::max(1,int(std::round(RATE*seconds)))){}float comb(float x,float fb){float y=data[at];damp=y*.65f+damp*.35f;data[at]=x+damp*fb;if(++at==int(data.size()))at=0;return y;}float pass(float x){float y=data[at]-x;data[at]=x+data[at]*.5f;if(++at==int(data.size()))at=0;return y;}float tap(float x,float fb){float y=data[at];data[at]=x+y*fb;if(++at==int(data.size()))at=0;return y;}};
struct HighPass{double b0,b1,a1,a2,z1=0,z2=0;explicit HighPass(int hz){double w=2*M_PI*hz/RATE,c=std::cos(w),alpha=std::sin(w)/std::sqrt(2),a0=1+alpha;b0=(1+c)/2/a0;b1=-(1+c)/a0;a1=-2*c/a0;a2=(1-alpha)/a0;}double process(double x){double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b0*x-a2*y;return y;}};
double coefficient(double seconds){return 1-std::exp(-1.0/(RATE*seconds));}
struct Effects{
 std::array<std::array<HighPass,2>,4> filters{{{{HighPass(65),HighPass(65)}},{{HighPass(80),HighPass(80)}},{{HighPass(100),HighPass(100)}},{{HighPass(120),HighPass(120)}}}};
 Delay echo{.235f},pre{.012f};std::array<Delay,4> combs{Delay(.0297f),Delay(.0371f),Delay(.0411f),Delay(.0437f)};std::array<Delay,2> passes{Delay(.005f),Delay(.0017f)};
 double low=0,lowEnv=0,env=0,gain=1,rumble=1,blend=0,tLow=0,tHigh=0,tEnv=0,tAmount=0,rLow=0,rHigh=0;float echoLevel=0,roomLevel=0,size=.5;
 float process(float raw,float echoSetting,float roomSetting,float sizeSetting,float toneSetting,int noise){
  double x=clamp(raw,-1,1),filtered=x;noise=std::max(0,std::min(4,noise));for(int i=0;i<4;i++){double y=filters[i][1].process(filters[i][0].process(x));if(i==noise-1)filtered=y;}
  double attack=coefficient(.002),release=coefficient(.12),up=coefficient(.003),down=coefficient(.07);low+=(x-low)*(1-std::exp(-2*M_PI*90/RATE));lowEnv+=(std::abs(low)-lowEnv)*attack;double a=std::abs(filtered);env+=(a-env)*(a>env?attack:release);const double thresholds[]={0,.004,.008,.016,.032};double ratio=noise==0?1:std::min(1.0,env/thresholds[noise]),target=.005+.995*ratio*ratio;gain+=(target-gain)*(target>gain?up:down);double targetR=noise>=2&&lowEnv>.04&&lowEnv>env*2.5?std::max(.16,env/(lowEnv*.8)):1;rumble+=(targetR-rumble)*(targetR<rumble?coefficient(.001):down);blend+=((noise>0?1:0)-blend)*up;x+=(filtered*gain*rumble-x)*blend;
  double smooth=coefficient(.015);tAmount+=(toneSetting-tAmount)*smooth;tLow+=(x-tLow)*(1-std::exp(-2*M_PI*250/RATE));tHigh+=(x-tHigh)*(1-std::exp(-2*M_PI*3500/RATE));double shaped=x-tLow*.22+(x-tHigh)*.10;a=std::abs(shaped);tEnv+=(a-tEnv)*(a>tEnv?coefficient(.008):release);double tGain=tEnv>.18?std::pow(.18/tEnv,.6):1;x+=(shaped*tGain*1.18-x)*tAmount;
  echoLevel+=(echoSetting-echoLevel)*smooth;roomLevel+=(roomSetting*.5-roomLevel)*smooth;size+=(sizeSetting-size)*smooth;float delayed=echo.tap(x,.32f);rLow+=(x-rLow)*(1-std::exp(-2*M_PI*140/RATE));rHigh+=(x-rLow-rHigh)*(1-std::exp(-2*M_PI*5500/RATE));float wet=pre.tap(rHigh,0),sum=0;for(auto &c:combs)sum+=c.comb(wet,.57f+size*.2f);wet=sum*.25f;for(auto &p:passes)wet=p.pass(wet);return x+delayed*echoLevel+wet*roomLevel;
 }
};
struct Monitor{
 AAudioStream *input=nullptr,*output=nullptr;int deviceId=0;std::atomic<bool> failed{false},stopping{false},enabled{false};std::atomic<uint64_t> written{0},read{0};std::array<float,CAPACITY> queue{};std::array<float,MAX_BLOCK> captured{};Effects fx;
 std::atomic<float> echo{0},room{0},size{.5},voice{1},hear{.3},tone{0};std::atomic<int> noise{0};
 static void error(AAudioStream*,void* user,aaudio_result_t){static_cast<Monitor*>(user)->failed.store(true);}
 static aaudio_data_callback_result_t callback(AAudioStream*,void* user,void* data,int32_t frames){
  auto &m=*static_cast<Monitor*>(user);auto *out=static_cast<float*>(data);std::fill(out,out+frames*2,0);if(m.stopping.load()||m.failed.load())return AAUDIO_CALLBACK_RESULT_STOP;if(m.deviceId>0&&AAudioStream_getDeviceId(m.output)!=m.deviceId){m.failed.store(true);m.enabled.store(false);return AAUDIO_CALLBACK_RESULT_STOP;}
  float echo=m.echo.load(),room=m.room.load(),size=m.size.load(),voice=m.voice.load(),hear=m.hear.load(),tone=m.tone.load();int noise=m.noise.load();bool hearNow=m.enabled.load();
  for(int offset=0;offset<frames;){int count=std::min(MAX_BLOCK,frames-offset),n=AAudioStream_read(m.input,m.captured.data(),count,0);if(n<0){m.failed.store(true);return AAUDIO_CALLBACK_RESULT_STOP;}uint64_t written=m.written.load(std::memory_order_relaxed),read=m.read.load(std::memory_order_acquire);if(written+n-read>CAPACITY){m.failed.store(true);return AAUDIO_CALLBACK_RESULT_STOP;}
   for(int i=0;i<n;i++){float dry=m.captured[i];m.queue[(written+i)%CAPACITY]=dry;float vocal=m.fx.process(dry,echo,room,size,tone,noise)*voice*hear;if(hearNow)out[(offset+i)*2]=out[(offset+i)*2+1]=limit(vocal);}
   m.written.store(written+n,std::memory_order_release);offset+=count;
  }return AAUDIO_CALLBACK_RESULT_CONTINUE;
 }
 ~Monitor(){stopping.store(true);if(output){AAudioStream_requestStop(output);AAudioStream_close(output);}if(input){AAudioStream_requestStop(input);AAudioStream_close(input);}}
};
bool openStream(Monitor &m,bool input,int device,int sdk,aaudio_sharing_mode_t sharing){
 AAudioStreamBuilder *b=nullptr;if(AAudio_createStreamBuilder(&b)!=AAUDIO_OK)return false;AAudioStreamBuilder_setDirection(b,input?AAUDIO_DIRECTION_INPUT:AAUDIO_DIRECTION_OUTPUT);AAudioStreamBuilder_setFormat(b,AAUDIO_FORMAT_PCM_FLOAT);AAudioStreamBuilder_setSampleRate(b,RATE);AAudioStreamBuilder_setChannelCount(b,input?1:2);AAudioStreamBuilder_setPerformanceMode(b,AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);AAudioStreamBuilder_setSharingMode(b,sharing);if(device>0)AAudioStreamBuilder_setDeviceId(b,device);
 if(input&&sdk>=28){using SetPreset=void(*)(AAudioStreamBuilder*,aaudio_input_preset_t);auto preset=reinterpret_cast<SetPreset>(dlsym(RTLD_DEFAULT,"AAudioStreamBuilder_setInputPreset"));if(preset)preset(b,static_cast<aaudio_input_preset_t>(sdk>=29?10:6));}
 AAudioStreamBuilder_setErrorCallback(b,Monitor::error,&m);if(!input)AAudioStreamBuilder_setDataCallback(b,Monitor::callback,&m);AAudioStream **target=input?&m.input:&m.output;auto result=AAudioStreamBuilder_openStream(b,target);AAudioStreamBuilder_delete(b);if(result!=AAUDIO_OK)return false;
 if(AAudioStream_getSampleRate(*target)!=RATE||AAudioStream_getFormat(*target)!=AAUDIO_FORMAT_PCM_FLOAT||AAudioStream_getChannelCount(*target)!=(input?1:2)){AAudioStream_close(*target);*target=nullptr;return false;}return true;
}
Monitor* ptr(jlong handle){return reinterpret_cast<Monitor*>(handle);}
}
extern "C" JNIEXPORT jlong JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_create(JNIEnv*,jclass,jint output,jint input,jint sdk){
 auto *m=new Monitor();if(!(openStream(*m,true,input,sdk,AAUDIO_SHARING_MODE_EXCLUSIVE)||openStream(*m,true,input,sdk,AAUDIO_SHARING_MODE_SHARED))||!(openStream(*m,false,output,sdk,AAUDIO_SHARING_MODE_EXCLUSIVE)||openStream(*m,false,output,sdk,AAUDIO_SHARING_MODE_SHARED))){delete m;return 0;}
 m->deviceId=output;if(output>0&&AAudioStream_getDeviceId(m->output)!=output){delete m;return 0;}AAudioStream_setBufferSizeInFrames(m->output,AAudioStream_getFramesPerBurst(m->output)*2);if(AAudioStream_requestStart(m->input)!=AAUDIO_OK||AAudioStream_requestStart(m->output)!=AAUDIO_OK){delete m;return 0;}return reinterpret_cast<jlong>(m);
}
extern "C" JNIEXPORT void JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_configure(JNIEnv*,jclass,jlong handle,jfloat echo,jfloat room,jfloat size,jfloat voice,jfloat hear,jfloat tone,jint noise,jboolean enabled){auto *m=ptr(handle);m->echo.store(clamp(echo,0,.65));m->room.store(clamp(room,0,1));m->size.store(clamp(size,0,1));m->voice.store(clamp(voice,0,2));m->hear.store(clamp(hear,0,1));m->tone.store(clamp(tone,0,1));m->noise.store(std::max(0,std::min(4,int(noise))));m->enabled.store(enabled);}
extern "C" JNIEXPORT jint JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_pull(JNIEnv* env,jclass,jlong handle,jshortArray target,jint count){auto *m=ptr(handle);if(m->failed.load())return -1;uint64_t read=m->read.load(std::memory_order_relaxed),written=m->written.load(std::memory_order_acquire);count=std::min({count,int(env->GetArrayLength(target)),int(written-read),MAX_BLOCK});std::array<jshort,MAX_BLOCK> block{};for(int i=0;i<count;i++)block[i]=std::round(clamp(m->queue[(read+i)%CAPACITY],-1,1)*32767);if(count>0)env->SetShortArrayRegion(target,0,count,block.data());m->read.store(read+count,std::memory_order_release);return count;}
extern "C" JNIEXPORT jboolean JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_stamp(JNIEnv* env,jclass,jlong handle,jlongArray target){int64_t frame=0,nanos=0;auto result=AAudioStream_getTimestamp(ptr(handle)->input,CLOCK_MONOTONIC,&frame,&nanos);if(result!=AAUDIO_OK)return false;jlong values[]={frame,nanos};env->SetLongArrayRegion(target,0,2,values);return true;}
extern "C" JNIEXPORT jint JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_performance(JNIEnv*,jclass,jlong handle){return AAudioStream_getPerformanceMode(ptr(handle)->output);}
extern "C" JNIEXPORT jint JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_bufferFrames(JNIEnv*,jclass,jlong handle){return AAudioStream_getBufferSizeInFrames(ptr(handle)->output);}
extern "C" JNIEXPORT void JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_halt(JNIEnv*,jclass,jlong handle){auto *m=ptr(handle);m->enabled.store(false);m->stopping.store(true);}
extern "C" JNIEXPORT void JNICALL Java_kr_co_aifect_app_karaoke_DirectMonitor_destroy(JNIEnv*,jclass,jlong handle){delete ptr(handle);}
