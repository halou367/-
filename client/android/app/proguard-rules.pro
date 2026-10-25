-optimizationpasses 5
-allowaccessmodification

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

-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}

-dontwarn go.**
-dontwarn libv2ray.**
-dontwarn seq.**
-dontwarn **
