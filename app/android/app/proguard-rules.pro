# Kakao's Retrofit 2.9 APIs and DTOs use runtime reflection. Preserve both ends
# of method signatures in R8 full mode (including Call<Void>).
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault
-keep class com.kakao.sdk.** { *; }
-keep interface com.kakao.sdk.** { *; }
-keep interface retrofit2.Call { *; }
-keep class retrofit2.Response { *; }
# This WebRTC AAR has no consumer rules. Its native library looks up Java
# classes, methods, fields, enums, and callback implementations by name.
-keep class org.webrtc.** { *; }
-keep interface org.webrtc.** { *; }
# WebRTC 150 initializes JNI Zero from native JNI_OnLoad. These bridge classes
# have no reachable Java call sites; removing them aborts the process on room entry.
-keepclasseswithmembers,includedescriptorclasses class org.jni_zero.** {
    @org.jni_zero.CalledByNative <methods>;
}
-keepclasseswithmembers,includedescriptorclasses class org.jni_zero.** {
    @org.jni_zero.CalledByNativeUnchecked <methods>;
}

# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
