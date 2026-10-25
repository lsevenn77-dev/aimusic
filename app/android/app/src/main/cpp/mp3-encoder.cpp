#include <jni.h>
#include <cstdint>
#include <lame.h>
static lame_t handle(jlong p) { return reinterpret_cast<lame_t>(static_cast<intptr_t>(p)); }
extern "C" JNIEXPORT jlong JNICALL Java_kr_co_aifect_app_karaoke_CoverMp3_create(JNIEnv*,jclass,jint rate,jint frames) {
 lame_t g=lame_init(); if(!g) return 0;
 if(lame_set_in_samplerate(g,rate)<0||lame_set_out_samplerate(g,rate)<0||lame_set_num_channels(g,2)<0||lame_set_num_samples(g,frames)<0||lame_set_VBR(g,vbr_off)<0||lame_set_brate(g,256)<0||lame_set_quality(g,2)<0||lame_set_bWriteVbrTag(g,1)<0||lame_init_params(g)<0){lame_close(g);return 0;}
 return static_cast<jlong>(reinterpret_cast<intptr_t>(g));
}
extern "C" JNIEXPORT jint JNICALL Java_kr_co_aifect_app_karaoke_CoverMp3_encode(JNIEnv* e,jclass,jlong p,jshortArray pcm,jint frames,jbyteArray output) {
 if(!p||frames<0||frames>e->GetArrayLength(pcm)/2)return -1;
 auto* in=e->GetShortArrayElements(pcm,nullptr);if(!in)return -1;
 auto* out=e->GetByteArrayElements(output,nullptr);if(!out){e->ReleaseShortArrayElements(pcm,in,JNI_ABORT);return -1;}
 int n=lame_encode_buffer_interleaved(handle(p),in,frames,reinterpret_cast<unsigned char*>(out),e->GetArrayLength(output));
 e->ReleaseShortArrayElements(pcm,in,JNI_ABORT);e->ReleaseByteArrayElements(output,out,0);return n;
}
extern "C" JNIEXPORT jint JNICALL Java_kr_co_aifect_app_karaoke_CoverMp3_flush(JNIEnv* e,jclass,jlong p,jbyteArray output) {
 if(!p)return -1;auto* out=e->GetByteArrayElements(output,nullptr);if(!out)return -1;
 int n=lame_encode_flush(handle(p),reinterpret_cast<unsigned char*>(out),e->GetArrayLength(output));e->ReleaseByteArrayElements(output,out,0);return n;
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_kr_co_aifect_app_karaoke_CoverMp3_tag(JNIEnv* e,jclass,jlong p) {
 unsigned char bytes[16384];size_t n=lame_get_lametag_frame(handle(p),bytes,sizeof(bytes));if(n==0||n>sizeof(bytes))return nullptr;
 auto result=e->NewByteArray(static_cast<jsize>(n));if(result)e->SetByteArrayRegion(result,0,static_cast<jsize>(n),reinterpret_cast<jbyte*>(bytes));return result;
}
extern "C" JNIEXPORT void JNICALL Java_kr_co_aifect_app_karaoke_CoverMp3_close(JNIEnv*,jclass,jlong p){if(p)lame_close(handle(p));}
