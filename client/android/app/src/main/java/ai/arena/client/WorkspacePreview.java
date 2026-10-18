package ai.arena.client;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Read-only workspace documents in a SEPARATE WebView. Never add a JavascriptInterface. */
final class WorkspacePreview {
    static final int MAX_BODY = 16 * 1024 * 1024, MAX_FILE = 128 * 1024 * 1024;
    // URL interception alone does not stop WebRTC/STUN. Fail closed on old WebViews.
    static final String LOCKDOWN = "(()=>{for(const n of Object.getOwnPropertyNames(globalThis)){if(/^(?:webkit|moz)?RTC/.test(n)){try{Object.defineProperty(globalThis,n,{value:undefined,writable:false,configurable:false});}catch{throw Error('Cannot isolate real-time network capability');}}}})();";
    static final String CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'self'; worker-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'";
    final Activity activity;
    final Handler ui = new Handler(Looper.getMainLooper());
    final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    WorkspacePreview(Activity a) { activity = a; }
    static class Pending {
        final CountDownLatch done = new CountDownLatch(1);
        final String method;
        volatile WebResourceResponse response;
        Pending(String m) { method = m; }
    }
    static class Session {
        String id, origin; WebView owner, web; Dialog dialog; volatile boolean closed;
        final ConcurrentHashMap<String, Pending> pending = new ConcurrentHashMap<>();
    }
    static boolean validId(String id) { return id != null && id.matches("[a-zA-Z0-9-]{1,80}"); }
    static WebResourceResponse error(int code, String text) {
        Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control","no-store"); headers.put("Content-Security-Policy", CSP);
        return new WebResourceResponse("text/plain", "UTF-8", code, "Workspace preview", headers, new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
    }
    void event(Session s, JSONObject obj) {
        ui.post(() -> { if (s.owner != null && s.owner.getUrl() != null) try { s.owner.evaluateJavascript("window.__ancPreviewEvent&&window.__ancPreviewEvent(" + obj.toString() + ")", null); } catch (Exception ignored) {} });
    }
    void close(Session s, String why) {
        if (s == null || s.closed) return; s.closed = true; sessions.remove(s.id, s);
        for (Pending p : s.pending.values()) { p.response = error(410,"Preview closed"); p.done.countDown(); } s.pending.clear();
        try { JSONObject e = new JSONObject().put("id",s.id).put("closed",true); if (why != null) e.put("error",why); event(s,e); } catch (Exception ignored) {}
        ui.post(() -> {
            if (s.dialog != null && s.dialog.isShowing()) s.dialog.dismiss();
            if (s.web != null) { s.web.stopLoading(); s.web.setWebChromeClient(null); s.web.setWebViewClient(new WebViewClient()); if (s.web.getParent() instanceof ViewGroup) ((ViewGroup)s.web.getParent()).removeView(s.web); s.web.destroy(); }
            if (s.origin != null) WebStorage.getInstance().deleteOrigin(s.origin);
        });
    }
    void closeOwner(WebView owner) { if (owner != null) for (Session s : sessions.values()) if (s.owner == owner) close(s,null); }
    void closeAll() { for (Session s : sessions.values()) close(s,null); }
    void closeId(WebView owner, String id) { Session s = sessions.get(id); if (s != null && s.owner == owner) close(s,null); }
    String open(WebView owner, String json) {
        try {
            JSONObject opt = new JSONObject(json); String id = opt.optString("id"), path = opt.optString("path");
            if (owner == null || !validId(id) || path.length() > 8192 || path.startsWith("/") || path.contains("\\") || path.matches("(?s).*[\\x00-\\x1F].*")) return "{\"ok\":false,\"error\":\"无效预览请求\"}";
            Session s = new Session(); s.id = id; s.owner = owner; s.origin = "https://" + UUID.randomUUID().toString().replace("-", "") + ".preview.invalid";
            ui.post(() -> {
                try {
                    String u = owner.getUrl();
                    if (activity.isFinishing() || u == null || !(u.equals("https://arena.ai") || u.startsWith("https://arena.ai/") || u.startsWith("file:///android_asset/"))) { close(s,"账号页面已关闭"); return; }
                    closeOwner(owner); sessions.put(id,s);
                    Dialog d = new Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar); s.dialog = d; d.requestWindowFeature(Window.FEATURE_NO_TITLE);
                    LinearLayout box = new LinearLayout(activity); box.setOrientation(LinearLayout.VERTICAL); box.setBackgroundColor(Color.rgb(31,30,28));
                    // 顶部细条：标题一行 + ‹ › ⟳ ✕ 扁平按钮（原来是白底大灰按钮，像临时界面）
                    float dp = activity.getResources().getDisplayMetrics().density;
                    LinearLayout bar = new LinearLayout(activity); bar.setOrientation(LinearLayout.HORIZONTAL); bar.setGravity(android.view.Gravity.CENTER_VERTICAL);
                    bar.setPadding((int)(14*dp),(int)(6*dp),(int)(4*dp),(int)(6*dp)); box.addView(bar,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));
                    TextView title = new TextView(activity); title.setText(opt.optString("title","Workspace")); title.setTextColor(Color.rgb(236,235,232)); title.setTextSize(14);
                    title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);
                    TextView sub = new TextView(activity); sub.setText("隔离预览 · 外网已禁用"); sub.setTextColor(Color.rgb(133,130,123)); sub.setTextSize(11); sub.setSingleLine(true);
                    LinearLayout tbox = new LinearLayout(activity); tbox.setOrientation(LinearLayout.VERTICAL); tbox.addView(title); tbox.addView(sub);
                    bar.addView(tbox,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
                    WebView w = new WebView(activity); s.web = w;
                    String[][] btns = {{"‹","返回"},{"›","前进"},{"⟳","刷新"},{"✕","关闭"}};
                    for (String[] it : btns) {
                        final String label = it[1]; TextView b = new TextView(activity); b.setText(it[0]); b.setContentDescription(label);
                        b.setTextColor(Color.rgb(185,182,175)); b.setTextSize(label.equals("刷新") ? 18 : 22); b.setGravity(android.view.Gravity.CENTER);
                        android.util.TypedValue tv = new android.util.TypedValue(); activity.getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true); b.setBackgroundResource(tv.resourceId);
                        bar.addView(b,new LinearLayout.LayoutParams((int)(42*dp),(int)(40*dp)));
                        b.setOnClickListener(v -> { if (label.equals("关闭")) close(s,null); else if (label.equals("刷新")) w.reload(); else if (label.equals("返回") && w.canGoBack()) w.goBack(); else if (label.equals("前进") && w.canGoForward()) w.goForward(); });
                    }
                    WebSettings st = w.getSettings(); st.setJavaScriptEnabled(true); st.setDomStorageEnabled(true); st.setAllowFileAccess(false); st.setAllowContentAccess(false);
                    st.setAllowFileAccessFromFileURLs(false); st.setAllowUniversalAccessFromFileURLs(false); st.setBlockNetworkLoads(true); st.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                    st.setGeolocationEnabled(false); st.setMediaPlaybackRequiresUserGesture(true); st.setJavaScriptCanOpenWindowsAutomatically(false); st.setSupportMultipleWindows(true);
                    st.setBuiltInZoomControls(true); st.setDisplayZoomControls(false); st.setUseWideViewPort(true); st.setLoadWithOverviewMode(true); st.setCacheMode(WebSettings.LOAD_NO_CACHE);
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                        WebViewCompat.addDocumentStartJavaScript(w, LOCKDOWN, Collections.singleton("*"));
                    } else {
                        st.setJavaScriptEnabled(false);
                        sub.setText("系统 WebView 较旧：安全静态模式");
                    }
                    CookieManager.getInstance().setAcceptThirdPartyCookies(w,false);
                    w.setDownloadListener((url,ua,disposition,mime,length) -> sub.setText("请返回工作区使用“下载”"));
                    w.setWebChromeClient(new WebChromeClient() {
                        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
                        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) { cb.invoke(origin,false,false); }
                        @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams p) { cb.onReceiveValue(null); return true; }
                        @Override public boolean onJsAlert(WebView v,String u,String m,JsResult r) { r.cancel(); return true; }
                        @Override public boolean onJsConfirm(WebView v,String u,String m,JsResult r) { r.cancel(); return true; }
                        @Override public boolean onJsPrompt(WebView v,String u,String m,String def,JsPromptResult r) { r.cancel(); return true; }
                    });
                    w.setWebViewClient(new WebViewClient() {
                        boolean allowed(Uri u) { return u != null && "https".equals(u.getScheme()) && s.origin.equals(u.getScheme()+"://"+u.getAuthority()); }
                        @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) { return !allowed(r.getUrl()); }
                        @Override public boolean shouldOverrideUrlLoading(WebView v,String u) { return !allowed(Uri.parse(u)); }
                        @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
                            if (!s.closed && ("data".equals(r.getUrl().getScheme()) || "blob".equals(r.getUrl().getScheme()))) return null; // built-in decoders only, never network fallback
                            if (s.closed || !allowed(r.getUrl()) || !("GET".equals(r.getMethod()) || "HEAD".equals(r.getMethod()))) return error(403,"External network and writes are disabled");
                            if (s.pending.size() >= 128) return error(429,"Too many workspace resources");
                            String rid = UUID.randomUUID().toString(); Pending p = new Pending(r.getMethod()); s.pending.put(rid,p);
                            try {
                                String range = ""; for (Map.Entry<String,String> h : r.getRequestHeaders().entrySet()) if (h.getKey().equalsIgnoreCase("Range")) range = h.getValue();
                                String rp = r.getUrl().getEncodedPath(); if (r.getUrl().getEncodedQuery() != null) rp += "?" + r.getUrl().getEncodedQuery();
                                event(s,new JSONObject().put("id",s.id).put("request",rid).put("method",r.getMethod()).put("path",rp).put("range",range));
                                if (!p.done.await(50,TimeUnit.SECONDS)) return error(504,"Workspace owner did not respond");
                                return p.response != null ? p.response : error(410,"Preview closed");
                            } catch (InterruptedException ex) { Thread.currentThread().interrupt(); return error(410,"Preview closed"); }
                            catch (Exception ex) { return error(502,"Workspace resource failed"); }
                            finally { s.pending.remove(rid); }
                        }
                        @Override public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e) { h.cancel(); }
                        @Override public void onReceivedHttpAuthRequest(WebView v,HttpAuthHandler h,String host,String realm) { h.cancel(); }
                        @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail) { close(s,"预览进程已退出"); return true; }
                    });
                    box.addView(w,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1)); d.setContentView(box);
                    d.setOnDismissListener(x -> close(s,null)); d.show(); d.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT);
                    // This WebView has NO addJavascriptInterface, preload, account profile or network fallback.
                    w.loadUrl(s.origin + "/" + path);
                } catch (Exception ex) { close(s,"无法创建预览：" + ex.getMessage()); }
            });
            return "{\"ok\":true}";
        } catch (Exception ex) { return "{\"ok\":false,\"error\":\"无效预览参数\"}"; }
    }
    boolean respond(WebView owner, String json) {
        Pending p = null;
        try {
            JSONObject r = new JSONObject(json); Session s = sessions.get(r.optString("id"));
            if (s == null || s.closed || s.owner != owner) return false;
            p = s.pending.get(r.optString("request")); if (p == null || p.done.getCount() == 0) return false;
            int status = r.optInt("status",502); String mime = r.optString("mime",""), body = r.optString("body","");
            if (!Arrays.asList(200,206,403,404,405,413,416,429,500,502,504).contains(status) || body.length() > ((MAX_BODY+2)/3)*4+8 || !mime.matches("[a-zA-Z0-9][a-zA-Z0-9.+-]*/[a-zA-Z0-9][a-zA-Z0-9.+-]*")) throw new IllegalArgumentException();
            byte[] bytes = Base64.decode(body,Base64.DEFAULT); if (bytes.length > MAX_BODY) throw new IllegalArgumentException();
            Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control","no-store"); headers.put("Content-Security-Policy",CSP); headers.put("X-Content-Type-Options","nosniff"); headers.put("Referrer-Policy","no-referrer"); headers.put("X-DNS-Prefetch-Control","off"); headers.put("Accept-Ranges","bytes");
            long size = r.optLong("size",-1), start = r.optLong("start",-1), end = r.optLong("end",-1);
            if (status == 206) {
                if (start < 0 || end < start || end >= size || size > MAX_FILE || (!p.method.equals("HEAD") && bytes.length != end-start+1)) throw new IllegalArgumentException();
                headers.put("Content-Range","bytes " + start + "-" + end + "/" + size);
            } else if (status == 416 && size >= 0) headers.put("Content-Range","bytes */" + size);
            headers.put("Content-Length",String.valueOf(p.method.equals("HEAD") ? Math.max(0,r.optLong("length",0)) : bytes.length));
            boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("xml") || mime.contains("javascript");
            p.response = new WebResourceResponse(mime,text ? "UTF-8" : null,status,"Workspace preview",headers,new ByteArrayInputStream(p.method.equals("HEAD") ? new byte[0] : bytes));
            p.done.countDown(); return true;
        } catch (Exception ex) { if (p != null) { p.response = error(502,"Invalid workspace response"); p.done.countDown(); } return false; }
    }
}
