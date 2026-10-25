# Keep Brana AI Android bridge classes and WebView @JavascriptInterface methods
-keep class ai.arena.client.** { *; }
-keep class libv2ray.** { *; }
-keep class go.** { *; }
-keep class seq.** { *; }

-keepclasseswithmembernames class * {
    native <methods>;
}

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-dontwarn go.**
-dontwarn libv2ray.**
-dontwarn seq.**
-dontwarn **
