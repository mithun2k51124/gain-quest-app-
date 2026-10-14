# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Expo & React Native standard keep rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class expo.modules.** { *; }
-keep class * implements expo.modules.core.interfaces.Package { *; }
-keep class * implements expo.modules.kotlin.modules.Module { *; }
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-dontwarn com.facebook.react.**
-dontwarn expo.modules.**
