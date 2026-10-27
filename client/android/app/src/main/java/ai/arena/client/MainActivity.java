package ai.arena.client;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.HttpAuthHandler;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.webkit.ProfileStore;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.UserAgentMetadata;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.Authenticator;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.PasswordAuthentication;
import java.net.URL;
import java.net.URLEncoder;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;

/**
 * Brana AI Android Activity: isolated WebView profiles, session cookie bridge, and native routing tunnel.
 */
public class MainActivity extends Activity {
    static final String UI = "https://arena.ai/robots.txt";
    static final String LOGIN = "https://arena.ai/";
    static volatile String learnedCostDpl = "";
    static volatile long lastAndroidSkewDiscoverAt = 0L;
    static final java.util.List<String> costSkewPool = new java.util.concurrent.CopyOnWriteArrayList<>(java.util.Arrays.asList(
        "dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x",
        "dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa",
        "dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC"
    ));
    static final java.util.Set<String> coreCostDpls = new java.util.HashSet<>(java.util.Arrays.asList(
        "dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x",
        "dpl_4NhYCxHezktNSfr9x2GMwqJnbJPa",
        "dpl_Gxhd5ZSm5y3NhjeyXwjCYo8o3ADC"
    ));
    static final java.util.Set<String> expiredCostDpls = java.util.Collections.synchronizedSet(new java.util.HashSet<>(java.util.Arrays.asList(
        "dpl_DaEk6YQDh7utsYDiEtpTgeRc5jct",
        "dpl_6gJxa2MLrLxAx6KcYkVgvMmbV2EA",
        "dpl_D2yWTJ2pjpQeiwvqpbtqDTpsZnY4",
        "dpl_8c25ZvCYXszwFU4s19PErXPLVCzn",
        "dpl_2W47bX6FpYa8XrFCCjzBA2JNNZ4V",
        "dpl_BieRM8wzCXHw6R6ToLUsTdhu4ZBZ"
    )));
    final java.util.concurrent.ConcurrentHashMap<String, String> protoCookieCache = new java.util.concurrent.ConcurrentHashMap<>();
    final java.util.concurrent.ConcurrentHashMap<String, Long> protoCookieAt = new java.util.concurrent.ConcurrentHashMap<>();

    FrameLayout root;
    WebView web;   // 当前显示的账号的 WebView
    // 多账号：每个账号一个 WebView（后台的叠在当前的下面，保持「可见」，定时器不被节流，后台抽卡照常跑）
    final java.util.Map<String, WebView> webs = java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<>());   // 只在主线程增删；JS 桥线程只读
    final java.util.HashMap<WebView, String> ownerOf = new java.util.HashMap<>();
    final java.util.Set<String> pendEnter = java.util.Collections.synchronizedSet(new java.util.HashSet<>());   // 从选账号页进入：进入后显示「连接测试 / 缓存 / 同步」进度
    final java.util.Set<String> cmdReady = java.util.Collections.synchronizedSet(new java.util.HashSet<>());   // 页面已接好命令通道（takeCmd 之后）
    final java.util.Map<String, String> pendCmd = java.util.Collections.synchronizedMap(new java.util.HashMap<>());
    final java.util.Map<String, String> secrets = java.util.Collections.synchronizedMap(new java.util.HashMap<>());
    final java.util.HashMap<String, Long> usedAt = new java.util.HashMap<>();
    final java.util.HashMap<WebView, long[]> authHits = new java.util.HashMap<>();
    final Object acctLock = new Object(), tunLock = new Object();
    Tun multiTun; int multiPort = 0; String multiRule = null; boolean multiActive = false;
    static final int MAX_IDLE_BG = 1; static final long IDLE_REAP_MS = 12 * 60_000L;
    android.view.View switchView; android.widget.TextView switchText; String switchTo; Runnable switchTmo;
    final WorkspacePreview workspacePreview = new WorkspacePreview(this);
    final WorkspaceDownload workspaceDownload = new WorkspaceDownload(this);
    static final int FILE_REQ = 7301;
    static final int CAM_PERM_REQ = 7302;
    android.webkit.ValueCallback<Uri[]> fileCb;
    android.webkit.PermissionRequest pendingCamReq;

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req != FILE_REQ) { super.onActivityResult(req, res, data); return; }
        if (fileCb == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null) { int n = data.getClipData().getItemCount(); out = new Uri[n]; for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri(); }
            else if (data.getData() != null) out = new Uri[] { data.getData() };
        }
        fileCb.onReceiveValue(out); fileCb = null;
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == CAM_PERM_REQ) {
            android.webkit.PermissionRequest pReq = pendingCamReq;
            pendingCamReq = null;
            if (pReq != null) {
                if (res != null && res.length > 0 && res[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    try { pReq.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE}); } catch (Exception ignored) {}
                } else {
                    try { pReq.deny(); } catch (Exception ignored) {}
                }
            }
        }
    }
    final RouteSupport routeSupport = new RouteSupport(this);
    volatile String currentRouteSignature = "";
    SharedPreferences sp;
    JSONArray accounts;
    String curId;
    String bundle = "", webbarJs = "";
    boolean multiProfile, docStart, proxySupported;
    volatile boolean proxyBlocked = true;
    final java.util.concurrent.atomic.AtomicLong proxyEpoch = new java.util.concurrent.atomic.AtomicLong();
    final java.util.Set<WebView> protectedWebs = java.util.Collections.synchronizedSet(new java.util.HashSet<>());
    void blockProxyNetwork() {
        proxyBlocked = true;
        Runnable block = () -> { for (WebView w : new ArrayList<>(webs.values())) { w.stopLoading(); w.getSettings().setBlockNetworkLoads(true); } };
        if (Looper.myLooper() == Looper.getMainLooper()) block.run(); else ui.post(block);
    }
    void proxyReady(long epoch, Runnable then) {
        if (epoch != proxyEpoch.get()) return;
        proxyBlocked = false;
        for (WebView w : new ArrayList<>(webs.values())) w.getSettings().setBlockNetworkLoads(!protectedWebs.contains(w));
        if (then != null) then.run();
    }
    void proxyFailed(long epoch, String reason, Runnable then) {
        if (epoch != proxyEpoch.get()) return;
        blockProxyNetwork(); tunErr = reason; toast(reason + "；已阻断网络，不回退直连");
        if (then != null) then.run();
    }
    final Handler ui = new Handler(Looper.getMainLooper());
    final Executor exec = r -> ui.post(r);

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // 选账号页只在冷启动（新进程）或真正退出后再打开时显示；进程还在、只是界面被系统重建（后台切回来）不再显示，也不再重走 IP 测试 / 同步
        root = new FrameLayout(this);
        setContentView(root);
        edgeToEdge();
        sp = getSharedPreferences("accounts", MODE_PRIVATE);
        sp.edit().remove("multiOff").apply();   // 旧版本记住的「关闭多账号」作废（以前一次误判就永久关掉）
        { boolean sysDark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
          applyBars(sp.getInt("barBg", sysDark ? 0xFF1F1E1C : 0xFFFAF9F7), sp.getBoolean("barDark", sysDark)); }
        multiProfile = WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE);
        docStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        proxySupported = WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE);
        bundle = readAsset("ui.bundle.js"); webbarJs = readAsset("webbar.js");
        loadAccounts();
        // 上次进程里的后台抽卡状态作废（进程已经不在了）
        synchronized (acctLock) { for (int i = 0; i < accounts.length(); i++) { JSONObject a = accounts.optJSONObject(i); JSONObject st = a == null ? null : a.optJSONObject("status"); JSONObject g = st == null ? null : st.optJSONObject("gacha"); if (g != null) { try { g.put("busy", false); } catch (Exception ignored) {} } } }
        ui.postDelayed(new Runnable() { @Override public void run() { try { reap(); } catch (Exception ignored) {} ui.postDelayed(this, 60_000); } }, 60_000);
        KeepService.start(this); ui.postDelayed(tick, 1000);
        String id = sp.getString("cur", null);
        if (find(id) == null) id = accounts.optJSONObject(0).optString("id");
        // 点「任务完成」通知打开：直接进那个账号、打开那个对话（不显示选账号页）
        { Intent it0 = getIntent(); String oa = it0 == null ? null : it0.getStringExtra("acct"), os = it0 == null ? null : it0.getStringExtra("sid");
          if (it0 != null && OPEN_ACT.equals(it0.getAction()) && oa != null && find(oa) != null) { id = oa; if (os != null) pendOpen.put(oa, os); synchronized (MainActivity.class) { launchShown = true; } } }
        gProbe(); gWatch();
        openAccount(id);
        if (!multiProfile) toast("系统 WebView 版本较旧，不支持多账号隔离：所有账号共用登录状态。请更新 Android System WebView。");
    }

    // ---------- 账号 ----------
    void loadAccounts() {
        try { accounts = new JSONArray(sp.getString("list", "[]")); } catch (Exception e) { accounts = new JSONArray(); }
        if (accounts.length() == 0) {
            try { accounts.put(new JSONObject().put("id", newId()).put("name", "账号 1").put("proxy", "")); } catch (Exception ignored) {}
            saveAccounts();
        }
    }
    final Runnable saveAccountsRun = () -> saveAccountsNow();
    void saveAccountsNow() {
        ui.removeCallbacks(saveAccountsRun);
        final String listSnap, curSnap;
        synchronized (acctLock) { listSnap = accounts == null ? "[]" : accounts.toString(); curSnap = curId; }
        sp.edit().putString("list", listSnap).putString("cur", curSnap).apply();
    }
    void saveAccounts() {
        ui.removeCallbacks(saveAccountsRun);
        ui.postDelayed(saveAccountsRun, 600);
    }
    // 启动选账号页：每次启动（进程）只显示一次；选了别的账号重新载入后不再显示
    static boolean launchShown = false;
    static String newId() { return UUID.randomUUID().toString().replace("-", "").substring(0, 10); }
    JSONObject find(String id) {
        if (id == null) return null;
        for (int i = 0; i < accounts.length(); i++) { JSONObject a = accounts.optJSONObject(i); if (a != null && id.equals(a.optString("id"))) return a; }
        return null;
    }
    // 统计精简版：vendors.*.models.* 去掉 list（对话明细）；按账号缓存（统计对象没变就复用）
    final java.util.Map<String, Object[]> liteMap = new java.util.HashMap<>();
    static JSONObject without(JSONObject source, String excluded) throws org.json.JSONException {
        java.util.List<String> keys = new java.util.ArrayList<>(); java.util.Iterator<String> it = source.keys();
        while (it.hasNext()) { String key = it.next(); if (!excluded.equals(key)) keys.add(key); }
        return new JSONObject(source, keys.toArray(new String[0]));
    }
    static JSONObject liteStats(JSONObject s) {
        if (s == null) return null;
        try {
            JSONObject out = without(s, "vendors"), vendors = new JSONObject(), V = s.optJSONObject("vendors");
            if (V != null) {
                java.util.Iterator<String> it = V.keys();
                while (it.hasNext()) {
                    String key = it.next(); JSONObject v = V.optJSONObject(key); if (v == null) continue;
                    JSONObject copy = without(v, "models"), models = new JSONObject(), M = v.optJSONObject("models");
                    if (M != null) { java.util.Iterator<String> jt = M.keys(); while (jt.hasNext()) { String name = jt.next(); JSONObject m = M.optJSONObject(name); if (m != null) models.put(name, without(m, "list")); } }
                    copy.put("models", models); vendors.put(key, copy);
                }
            }
            out.put("vendors", vendors); out.put("lite", true); return out;
        } catch (Exception e) { return null; }
    }
    JSONObject pubX(JSONObject a) { JSONObject o = pub(a); try { o.put("xray", xrayExe() != null); if (a.optString("id").equals(curId)) o.put("tunErr", tunErr == null ? "" : tunErr); } catch (Exception ignored) {} return o; }
    static JSONObject pub(JSONObject a) {
        try {
            JSONObject o = new JSONObject().put("id", a.optString("id")).put("name", a.optString("name")).put("remark", a.optString("remark", "")).put("proxy", a.optString("proxy"))
                    .put("proxyIp", a.optString("proxyIp", "")).put("nodeId", a.optString("nodeId", "")).put("region", a.optString("region", "")).put("xout", a.optString("xout", ""))
                    .put("routeMode", AuthRouteState.mode(a)).put("routeAuto", a.optBoolean("routeAuto", true)).put("nodeFailover", a.optBoolean("nodeFailover", false)).put("routeAt", a.optLong("routeAt")).put("routeHome", a.optString("routeHome")).put("authLocked", AuthRouteState.locked(a)).put("authExpires", a.optJSONObject("routeAuth") == null ? 0 : a.optJSONObject("routeAuth").optLong("expires"))
                    .put("email", a.optString("email", "")).put("hasPw", !a.optString("pw", "").isEmpty());
            JSONObject st = a.optJSONObject("status"); o.put("status", st == null ? JSONObject.NULL : st);
            return o;
        } catch (Exception e) { return new JSONObject(); }
    }
    // 密码保存在应用私有的 SharedPreferences（其它应用无法读取），再做一层 base64
    static String encPw(String p) { return p == null || p.isEmpty() ? "" : "b64:" + android.util.Base64.encodeToString(p.getBytes(StandardCharsets.UTF_8), android.util.Base64.NO_WRAP); }
    static String decPw(String v) {
        if (v == null || v.isEmpty()) return "";
        try { if (v.startsWith("b64:")) return new String(android.util.Base64.decode(v.substring(4), android.util.Base64.NO_WRAP), StandardCharsets.UTF_8); } catch (Exception ignored) {}
        return "";
    }
    JSONObject byEmail(String em) {
        if (em == null || em.trim().isEmpty()) return null;
        for (int i = 0; i < accounts.length(); i++) { JSONObject a = accounts.optJSONObject(i); if (a != null && em.trim().equalsIgnoreCase(a.optString("email", ""))) return a; }
        return null;
    }
    CookieManager cookiesOf(String id) {
        if (multiProfile && id != null) { try { return ProfileStore.getInstance().getOrCreateProfile("acct-" + id).getCookieManager(); } catch (Exception ignored) {} }
        return CookieManager.getInstance();
    }

    static class Proxy { String rule, user, pass; }
    // 代理：留空 = 默认本地代理 127.0.0.1:7890；direct = 直连；vless:// 节点 = 内置 xray 内核（libxray.so）开本地入口，WebView 走它
    static final String DEFAULT_PROXY = "127.0.0.1:7890";
    static boolean isDirect(String s) { return s != null && s.trim().matches("(?i)^(direct|直连|none|off)$"); }
    static String proxyErr(String s) {
        s = s == null ? "" : s.trim();
        if (s.isEmpty() || isDirect(s) || parseProxy(s) != null) return null;
        if (s.toLowerCase().startsWith("vless://")) return null;
        return "代理格式不正确（例：127.0.0.1:7890、socks5://host:port 或 direct）";
    }
    static Proxy parseProxy(String s) {
        if (s == null) s = ""; s = s.trim(); if (s.isEmpty()) s = DEFAULT_PROXY; if (isDirect(s)) return null;
        if (s.toLowerCase().startsWith("vless://")) return null;
        if (!s.matches("^[a-zA-Z0-9]+://.*")) s = "http://" + s;
        try {
            URI u = new URI(s);
            String scheme = u.getScheme().toLowerCase();
            if (scheme.equals("socks") || scheme.equals("socks5h")) scheme = "socks5";
            if (!(scheme.equals("http") || scheme.equals("https") || scheme.equals("socks5"))) return null;
            if (u.getHost() == null || u.getPort() <= 0) return null;
            Proxy p = new Proxy();
            p.rule = scheme + "://" + u.getHost() + ":" + u.getPort();
            String ui = u.getUserInfo();
            if (ui != null) { int i = ui.indexOf(':'); p.user = i >= 0 ? ui.substring(0, i) : ui; p.pass = i >= 0 ? ui.substring(i + 1) : ""; }
            return p;
        } catch (Exception e) { return null; }
    }

    // ---------- VLESS：内置 xray 内核 ----------
    final java.util.concurrent.ConcurrentHashMap<String, String> probeJobs = new java.util.concurrent.ConcurrentHashMap<>();
    static class Tun { Process proc; int port; String sig = ""; final StringBuilder log = new StringBuilder(); }
    Tun curTun; String tunErr = "";
    File xrayExe() { try { File f = new File(getApplicationInfo().nativeLibraryDir, "libxray.so"); return f.exists() ? f : null; } catch (Exception e) { return null; } }
    static boolean alive(Process p) { if (p == null) return false; try { p.exitValue(); return false; } catch (IllegalThreadStateException e) { return true; } }
    static int freePort() throws Exception { try (java.net.ServerSocket ss = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) { return ss.getLocalPort(); } }
    static boolean waitPort(int port, long ms, Process p) {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            if (!alive(p)) return false;
            try (java.net.Socket so = new java.net.Socket()) { so.connect(new InetSocketAddress("127.0.0.1", port), 300); return true; } catch (Exception e) { try { Thread.sleep(150); } catch (InterruptedException ie) { return false; } }
        }
        return false;
    }
    // xray 日志里真正的失败原因：优先取最后一条 failed / error / refused / timeout / handshake 之类的行（去掉时间戳），没有再取最后两行
    static String tail(StringBuilder sb) {
        String t; synchronized (sb) { t = sb.toString().trim(); }
        String[] ls = t.split("\\r?\\n");
        java.util.regex.Pattern bad = java.util.regex.Pattern.compile("(?i)fail|error|refused|timeout|timed out|handshake|reset|reject|invalid|closed|no such host|unreachable|EOF");
        for (int i = ls.length - 1; i >= 0; i--) {
            String l = ls[i].replaceFirst("^\\d{4}/\\d\\d/\\d\\d \\d\\d:\\d\\d:\\d\\d(\\.\\d+)? ", "").trim();
            if (l.isEmpty() || l.contains(" started") || l.contains("accepted ")) continue;
            if (bad.matcher(l).find()) { l = l.replaceAll("\\[\\d+\\] ", ""); return l.length() > 260 ? l.substring(l.length() - 260) : l; }
        }
        StringBuilder o = new StringBuilder(); for (int i = Math.max(0, ls.length - 2); i < ls.length; i++) o.append(ls[i]).append(' ');
        String r = o.toString().trim(); return r.length() > 240 ? r.substring(r.length() - 240) : r;
    }
    // Resolve proxy endpoints using encrypted bootstrap only; tunnel destinations remain domain names.
    // No system DNS/public plaintext fallback; ECH specs are resolved to static Base64 before xray starts.
    static boolean isDomain(String s) { return s != null && !s.isEmpty() && !s.matches("[0-9.]+") && !s.contains(":"); }
    // Encrypted bootstrap is ONLY for proxy/node endpoints. No website DNS queries go to a local resolver.
    // Several IP-literal HTTPS resolvers raced in parallel (certificates verified against the IP SAN).
    // Chinese ISPs often hijack/reset 1.1.1.1 ("Hostname 1.1.1.1 not verified"), so domestic encrypted
    // resolvers go first; still no system/plaintext DNS fallback.
    static final String[] BOOT_DOH = {"https://223.5.5.5/resolve", "https://1.12.12.12/dns-query", "https://120.53.53.53/dns-query", "https://223.6.6.6/resolve", "https://1.1.1.1/dns-query", "https://8.8.8.8/resolve"};
    static JSONArray dohQuery(String base, String name, String type) throws Exception {
        javax.net.ssl.HttpsURLConnection c = (javax.net.ssl.HttpsURLConnection) new URL(base + "?name=" + URLEncoder.encode(name, "UTF-8") + "&type=" + type).openConnection(java.net.Proxy.NO_PROXY);
        c.setConnectTimeout(3500); c.setReadTimeout(4500); c.setInstanceFollowRedirects(false); c.setRequestProperty("Accept", "application/dns-json");
        try {
            if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
            StringBuilder text = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) { String line; while ((line = br.readLine()) != null) { text.append(line); if (text.length() > 65536) throw new Exception("DNS 响应过大"); } }
            JSONArray answers = new JSONObject(text.toString()).optJSONArray("Answer"), ips = new JSONArray();
            if (answers != null) for (int i = 0; i < answers.length(); i++) { JSONObject r = answers.optJSONObject(i); if (r != null && (r.optInt("type") == 1 || r.optInt("type") == 28) && r.optString("data").matches("[0-9a-fA-F:.]+")) ips.put(r.optString("data")); }
            return ips;
        } finally { c.disconnect(); }
    }
    static final java.util.concurrent.ConcurrentHashMap<String, String[]> dnsCache = new java.util.concurrent.ConcurrentHashMap<>();
    JSONArray bootstrapDns(String name) throws Exception {
        if (!name.matches("[A-Za-z0-9.-]{1,253}")) throw new Exception("无效节点域名");
        String dkey = name.toLowerCase(java.util.Locale.ROOT);
        String[] dc = dnsCache.get(dkey);
        if (dc != null && Long.parseLong(dc[1]) > System.currentTimeMillis()) return new JSONArray(dc[0]);
        final java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(BOOT_DOH.length);
        final java.util.concurrent.ExecutorCompletionService<JSONArray> cs = new java.util.concurrent.ExecutorCompletionService<>(pool);
        StringBuilder errs = new StringBuilder();
        try {
            for (final String base : BOOT_DOH) cs.submit(() -> { JSONArray v = dohQuery(base, name, "A"); return v.length() > 0 ? v : dohQuery(base, name, "AAAA"); });
            long until = System.currentTimeMillis() + 10000;
            for (int i = 0; i < BOOT_DOH.length; i++) {
                long left = until - System.currentTimeMillis(); if (left <= 0) break;
                java.util.concurrent.Future<JSONArray> f = cs.poll(left, java.util.concurrent.TimeUnit.MILLISECONDS); if (f == null) break;
                try { JSONArray v = f.get(); if (v != null && v.length() > 0) { dnsCache.put(dkey, new String[]{v.toString(), String.valueOf(System.currentTimeMillis() + 60000L)}); return v; } } catch (Exception e) { Throwable t = e.getCause() != null ? e.getCause() : e; if (errs.length() < 300) errs.append(t.getClass().getSimpleName()).append(": ").append(t.getMessage()).append("; "); }
            }
        } finally { pool.shutdownNow(); }
        throw new Exception("节点域名无法解析（加密 DNS 全部失败，禁止系统 DNS 回退）" + (errs.length() > 0 ? "：" + errs : ""));
    }
    // ECH: xray only receives static Base64. Specs ("domain", "domain+https://doh", "https://doh") are resolved here via
    // JSON DoH (any HTTPS resolver; alidns / 1.1.1.1 / dns.google as fallbacks). Cloudflare rotates keys, so live first,
    // then last-known-good, then the built-in key.
    static final String DEFAULT_ECH_DOMAIN = "cloudflare-ech.com", DEFAULT_ECH_DOH = "https://dns.alidns.com/dns-query";
    static final String BUILTIN_ECH = "AEX+DQBB9QAgACDxa/EHa0pNtQCaPvsahQYiCriBsFmBKnHqu5Ds7FevEQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=";
    static final String STALE_ECH = "AEX+DQBBrwAgACB3V6T2X69/mCGQn8NhU8fkBpvDcuxha8C+xpuUHFRPGQAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=";
    static final String STALE_ECH_2 = "AEX+DQBBmQAgACD7Shh1d6qs0wpKexZQye4mLOUQsE3TN9MW0nZe3I37bwAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=";
    static final String STALE_ECH_3 = "AE3+DQBFTQAgACBlwB13ip+UAr5g/fd8sS7C+M/b8V2y+H6f2I5h9W7e1wAEAAEAAQASY2xvdWRmbGFyZS1lY2guY29tAAA=";
    static final java.util.concurrent.ConcurrentHashMap<String, String[]> echCache = new java.util.concurrent.ConcurrentHashMap<>();
    static final java.util.concurrent.ConcurrentHashMap<String, String> echLastGood = new java.util.concurrent.ConcurrentHashMap<>();
    String resolveEch(String raw) throws Exception {
        raw = raw == null ? "" : raw.trim();
        if (raw.equals(STALE_ECH) || raw.equals(STALE_ECH_2) || raw.equals(STALE_ECH_3)) raw = DEFAULT_ECH_DOMAIN + "+" + DEFAULT_ECH_DOH;
        String domain = "", doh = "";
        int scheme = raw.indexOf("://"), plus = raw.indexOf('+');
        if (scheme >= 0) { if (plus > 0 && plus < scheme) { domain = raw.substring(0, plus).trim(); doh = raw.substring(plus + 1).trim(); } else doh = raw; }
        else if (raw.matches("(?i)[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z][a-z0-9-]*")) domain = raw;
        else return raw; // static Base64
        domain = (domain.isEmpty() ? DEFAULT_ECH_DOMAIN : domain).toLowerCase(java.util.Locale.ROOT);
        if (!domain.matches("[a-z0-9.-]{1,253}")) throw new Exception("ECH 域名不正确");
        if (doh.isEmpty()) doh = DEFAULT_ECH_DOH;
        URL du = new URL(doh); if (!"https".equalsIgnoreCase(du.getProtocol())) throw new Exception("ECH DoH 只支持 https://");
        String key = domain + "+" + doh; String[] c = echCache.get(key);
        if (c != null && Long.parseLong(c[1]) > System.currentTimeMillis()) return c[0];
        String q = "name=" + URLEncoder.encode(domain, "UTF-8") + "&type=";
        java.util.LinkedHashSet<String> urls = new java.util.LinkedHashSet<>();
        String host = du.getHost().toLowerCase(java.util.Locale.ROOT);
        if (host.endsWith("alidns.com")) { urls.add("https://223.5.5.5/resolve?" + q + "65"); urls.add("https://223.6.6.6/resolve?" + q + "65"); urls.add("https://" + du.getAuthority() + "/resolve?" + q + "65"); }
        else if (host.endsWith("dns.google")) urls.add("https://" + du.getAuthority() + "/resolve?" + q + "HTTPS");
        else urls.add(doh + (doh.contains("?") ? "&" : "?") + q + "HTTPS");
        urls.add("https://223.5.5.5/resolve?" + q + "65"); urls.add("https://223.6.6.6/resolve?" + q + "65"); urls.add("https://dns.alidns.com/resolve?" + q + "65"); urls.add("https://1.1.1.1/dns-query?" + q + "HTTPS"); urls.add("https://dns.google/resolve?" + q + "HTTPS");
        java.util.regex.Pattern pat = java.util.regex.Pattern.compile("ech=\\\\?[\"']?([A-Za-z0-9+/=_-]{20,})");
        for (String u : urls) {
            HttpURLConnection h = null;
            try {
                h = (HttpURLConnection) new URL(u).openConnection(java.net.Proxy.NO_PROXY);
                h.setConnectTimeout(5000); h.setReadTimeout(5000); h.setInstanceFollowRedirects(false); h.setRequestProperty("Accept", "application/dns-json, application/json");
                if (h.getResponseCode() != 200) continue;
                StringBuilder text = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(h.getInputStream(), StandardCharsets.UTF_8))) { String line; while ((line = br.readLine()) != null) { text.append(line); if (text.length() > 65536) break; } }
                JSONArray ans = new JSONObject(text.toString()).optJSONArray("Answer");
                if (ans != null) for (int i = 0; i < ans.length(); i++) {
                    JSONObject r = ans.optJSONObject(i); if (r == null) continue;
                    java.util.regex.Matcher m = pat.matcher(r.optString("data"));
                    if (m.find()) { String v = m.group(1); echCache.put(key, new String[]{v, String.valueOf(System.currentTimeMillis() + 30 * 60000L)}); echLastGood.put(domain, v); return v; }
                }
            } catch (Exception ignored) {
            } finally { if (h != null) h.disconnect(); }
        }
        String fb = echLastGood.get(domain);
        if (fb == null && DEFAULT_ECH_DOMAIN.equals(domain)) fb = BUILTIN_ECH;
        if (fb == null) throw new Exception("无法获取 " + domain + " 的 ECH 配置（DoH 均失败）");
        echCache.put(key, new String[]{fb, String.valueOf(System.currentTimeMillis() + 60000L)});
        return fb;
    }
    void fixDns(JSONObject cfg) throws Exception {
        JSONArray obs = cfg.optJSONArray("outbounds"); if (obs == null) return;
        java.util.LinkedHashSet<String> names = new java.util.LinkedHashSet<>();
        for (int i = 0; i < obs.length(); i++) {
            JSONObject ob = obs.optJSONObject(i); if (ob == null) continue;
            String proto = ob.optString("protocol"); if ("freedom".equals(proto) || "blackhole".equals(proto) || "dns".equals(proto)) continue;
            JSONObject st = ob.optJSONObject("settings");
            if (st != null) {
                if (isDomain(st.optString("address"))) names.add(st.optString("address"));
                for (String key : new String[]{"vnext", "servers"}) { JSONArray rows = st.optJSONArray(key); if (rows != null) for (int k = 0; k < rows.length(); k++) { JSONObject r = rows.optJSONObject(k); if (r != null && isDomain(r.optString("address"))) names.add(r.optString("address")); } }
            }
            JSONObject ss = ob.optJSONObject("streamSettings"); if (ss == null) { ss = new JSONObject(); ob.put("streamSettings", ss); }
            JSONObject so = ss.optJSONObject("sockopt"); if (so == null) { so = new JSONObject(); ss.put("sockopt", so); } so.put("domainStrategy", "UseIP");
            JSONObject tls = ss.optJSONObject("tlsSettings");
            if (tls != null) {
                String ech = tls.optString("echConfigList").trim();
                if (!ech.isEmpty()) tls.put("echConfigList", resolveEch(ech));
            }
        }
        JSONObject hosts = new JSONObject(); for (String name : names) hosts.put(name, bootstrapDns(name));
        cfg.put("dns", new JSONObject().put("hosts", hosts).put("servers", new JSONArray()).put("disableFallback", true));
        JSONObject routing = cfg.optJSONObject("routing"); if (routing == null) { routing = new JSONObject(); cfg.put("routing", routing); } routing.put("domainStrategy", "AsIs");
    }
    Tun startTun(String xout, String tag) throws Exception { return startTun(xout, tag, "warning"); }
    Tun startTun(String xout, String tag, String level) throws Exception {
        File exe = xrayExe(); if (exe == null) throw new Exception("没有找到内置 xray 内核（此设备架构不支持，请用 Clash 等本地代理）");
        if (xout == null || xout.trim().isEmpty()) throw new Exception("节点配置缺失，请在账号管理里重新保存一次节点");
        JSONObject ob = new JSONObject(xout);
        int port = freePort();
        JSONObject cfg = new JSONObject().put("log", new JSONObject().put("loglevel", level))
                .put("inbounds", new JSONArray().put(new JSONObject().put("tag", "in").put("listen", "127.0.0.1").put("port", port).put("protocol", "http").put("settings", new JSONObject())))
                .put("outbounds", new JSONArray().put(ob).put(new JSONObject().put("tag", "block").put("protocol", "blackhole")));
        fixDns(cfg);
        File dir = new File(getFilesDir(), "xray"); dir.mkdirs();
        File cf = new File(dir, tag + ".json");
        try (java.io.FileOutputStream fo = new java.io.FileOutputStream(cf)) { fo.write(cfg.toString().getBytes(StandardCharsets.UTF_8)); }
        ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "run", "-c", cf.getAbsolutePath()).directory(dir).redirectErrorStream(true);
        pb.environment().put("XRAY_LOCATION_ASSET", dir.getAbsolutePath());
        final Tun t = new Tun(); t.port = port; t.sig = xout;
        t.proc = pb.start();
        final InputStream in = t.proc.getInputStream();
        Thread rd = new Thread(() -> { try { BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)); String l; while ((l = br.readLine()) != null) { synchronized (t.log) { t.log.append(l).append('\n'); if (t.log.length() > 6000) t.log.delete(0, t.log.length() - 4000); } } } catch (Exception ignored) {} });
        rd.setDaemon(true); rd.start();
        if (!waitPort(port, 8000, t.proc)) { String m = tail(t.log); try { t.proc.destroy(); } catch (Exception ignored) {} throw new Exception("xray 启动失败" + (m.isEmpty() ? "" : "：" + m)); }
        return t;
    }
    synchronized void stopTun() { if (curTun != null) { try { curTun.proc.destroy(); } catch (Exception ignored) {} curTun = null; } }
    synchronized int ensureTun(String xout) throws Exception {
        if (curTun != null && curTun.sig.equals(xout) && alive(curTun.proc)) return curTun.port;
        stopTun(); curTun = startTun(xout, "cur"); return curTun.port;
    }
    final Object subTunLock = new Object();
    Tun subTun = null;
    int ensureSubTun(String xout) throws Exception {
        synchronized (subTunLock) {
            if (subTun != null && xout.equals(subTun.sig) && alive(subTun.proc) && subTun.port > 0) return subTun.port;
            if (subTun != null) { try { subTun.proc.destroy(); } catch (Exception ignored) {} subTun = null; }
            subTun = startTun(xout, "sub-shared");
            return subTun.port;
        }
    }
    static boolean isVless(String s) { return s != null && s.trim().toLowerCase().startsWith("vless://"); }

    String stripProxyIpFromXout(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        return raw.replaceAll("(?i)/proxyip=[^\"&?\\s/]+", "/")
                  .replaceAll("(?i)[?&]proxyip=[^\"&?\\s]+", "")
                  .replaceAll("\"path\"\\s*:\\s*\"\"", "\"path\":\"/\"");
    }
    JSONObject nodeToXout(JSONObject n) {
        if (n == null) return null;
        try {
            if (!n.optString("xout", "").isEmpty()) return new JSONObject(stripProxyIpFromXout(n.optString("xout")));
            String addr = n.optString("address", "").trim();
            int port = n.optInt("port", 0);
            String uuid = n.optString("uuid", "").trim();
            if (addr.isEmpty() || port <= 0 || uuid.isEmpty()) return null;
            String net = n.optString("type", "tcp").trim(); if (net.isEmpty()) net = "tcp";
            String sec = n.optString("security", "none").trim(); if (sec.isEmpty()) sec = "none";
            String sni = n.optString("sni", "").trim();
            String host = n.optString("host", "").trim();
            String fp = n.optString("fp", "").trim();
            String alpn = n.optString("alpn", "").trim();
            String ech = n.optString("ech", "").trim();
            String path = n.optString("path", "/").trim(); if (path.isEmpty()) path = "/";
            path = path.replaceAll("(?i)/proxyip=[^\"&?\\s/]+", "/").replaceAll("(?i)[?&]proxyip=[^\"&?\\s]+", "");
            if (path.isEmpty()) path = "/";
            JSONObject ss = new JSONObject().put("network", net).put("security", "reality".equals(sec) ? "reality" : ("tls".equals(sec) ? "tls" : "none"));
            if ("tls".equals(sec)) {
                JSONObject tls = new JSONObject().put("serverName", !sni.isEmpty() ? sni : (!host.isEmpty() ? host : addr)).put("allowInsecure", false);
                if (!fp.isEmpty()) tls.put("fingerprint", fp);
                if (!alpn.isEmpty()) {
                    JSONArray aa = new JSONArray();
                    for (String p : alpn.split(",")) if (!p.trim().isEmpty()) aa.put(p.trim());
                    if (aa.length() > 0) tls.put("alpn", aa);
                }
                if (!ech.isEmpty() && !"none".equals(ech)) tls.put("echConfigList", ech);
                ss.put("tlsSettings", tls);
            } else if ("reality".equals(sec)) {
                ss.put("realitySettings", new JSONObject()
                    .put("serverName", !sni.isEmpty() ? sni : addr)
                    .put("fingerprint", !fp.isEmpty() ? fp : "chrome")
                    .put("publicKey", n.optString("pbk", ""))
                    .put("shortId", n.optString("sid", ""))
                    .put("spiderX", n.optString("spx", "/")));
            }
            if ("ws".equals(net)) {
                JSONObject headers = new JSONObject();
                if (!host.isEmpty()) headers.put("Host", host);
                ss.put("wsSettings", new JSONObject().put("path", path).put("headers", headers));
            } else if ("grpc".equals(net)) {
                ss.put("grpcSettings", new JSONObject().put("serviceName", n.optString("path", "")).put("multiMode", false));
            } else if ("httpupgrade".equals(net)) {
                ss.put("httpupgradeSettings", new JSONObject().put("path", path).put("host", host));
            } else if ("xhttp".equals(net) || "splithttp".equals(net)) {
                ss.put("xhttpSettings", new JSONObject().put("path", path).put("host", host));
            }
            JSONObject user = new JSONObject().put("id", uuid).put("encryption", "none");
            if (!n.optString("flow", "").isEmpty()) user.put("flow", n.optString("flow"));
            JSONObject vnext = new JSONObject().put("address", addr).put("port", port).put("users", new JSONArray().put(user));
            return new JSONObject().put("tag", "proxy").put("protocol", "vless")
                .put("settings", new JSONObject().put("vnext", new JSONArray().put(vnext)))
                .put("streamSettings", ss);
        } catch (Exception e) { return null; }
    }
    // 全局 VLESS 节点（代理设置里选的）：{link, xout, name}；账号没设代理时默认走它（没有全局节点才用 127.0.0.1:7890）
    JSONObject gnode() {
        try {
            JSONObject g = new JSONObject(sp.getString("shared_gnode", "null"));
            if (isVless(g.optString("link")) && !g.optString("xout").isEmpty()) {
                return new JSONObject(g.toString()).put("xout", stripProxyIpFromXout(g.optString("xout")));
            }
        } catch (Exception ignored) {}
        try {
            JSONArray list = new JSONArray(sp.getString("shared_nodes", "[]"));
            String pickId = "";
            try { pickId = new JSONObject(sp.getString("shared_pippool", "{}")).optString("node", ""); } catch (Exception ignored) {}
            JSONObject chosen = null;
            for (int i = 0; i < list.length(); i++) {
                JSONObject it = list.optJSONObject(i);
                if (it == null) continue;
                if (!pickId.isEmpty() && pickId.equals(it.optString("id"))) { chosen = it; break; }
                if (chosen == null) chosen = it;
            }
            if (chosen != null) {
                JSONObject xo = nodeToXout(chosen);
                if (xo != null) {
                    String link = chosen.optString("link", "");
                    if (link.isEmpty()) link = "vless://" + chosen.optString("uuid") + "@" + chosen.optString("address") + ":" + chosen.optInt("port", 443);
                    return new JSONObject().put("link", link).put("xout", xo.toString()).put("name", chosen.optString("name", "VLESS 节点"));
                }
            }
        } catch (Exception ignored) {}
        return null;
    }
    JSONObject eff(JSONObject a) {
        try {
            if (a == null || !a.optString("proxy", "").trim().isEmpty()) return a;
            JSONObject g = gnode(); if (g == null) return a;
            JSONObject b = new JSONObject(a.toString()); b.put("proxy", g.optString("link")).put("xout", g.optString("xout")).put("proxyIp", ""); return b;
        } catch (Exception e) { return a; }
    }
    void applyProxy(JSONObject a0, Runnable callback) {
        final String routeSignature;
        try {
            JSONObject actual = find(a0.optString("id")); if (actual != null) AuthRouteState.assertChange(actual, a0);
            routeSignature = AuthRouteState.signature(eff(a0));
            if (!proxyBlocked && routeSignature.equals(currentRouteSignature) && (curTun == null || alive(curTun.proc))) { if (callback != null) callback.run(); return; }
            if (routeSupport.anyLocked() && !currentRouteSignature.isEmpty() && !routeSignature.equals(currentRouteSignature)) throw new Exception("认证期间禁止重置共享代理");
        } catch (Exception e) { toast(String.valueOf(e.getMessage())); return; }
        final long epoch = proxyEpoch.incrementAndGet(); if (!multiActive || multiTun == null || !alive(multiTun.proc)) blockProxyNetwork();
        final Runnable then = () -> { if (epoch == proxyEpoch.get() && !proxyBlocked) currentRouteSignature = routeSignature; if (callback != null) callback.run(); };
        final JSONObject a = eff(a0); final String px = a.optString("proxy");
        if (!proxySupported) { proxyFailed(epoch, "系统 WebView 不支持可靠代理覆盖，请升级 Android System WebView", then); return; }
        if (proxyErr(px) != null) { proxyFailed(epoch, proxyErr(px), then); return; }
        if (isVless(px) || (!isDirect(px) && xrayExe() != null)) {
            new Thread(() -> {
                try {
                    final String rule = "http://127.0.0.1:" + ensureTun(outboundOf(a).toString());
                    ui.post(() -> { if (epoch != proxyEpoch.get()) return; try { lastRule = rule; ProxyController.getInstance().setProxyOverride(pcfg(rule, false), exec, () -> proxyReady(epoch, then)); } catch (Exception e) { proxyFailed(epoch, "代理设置失败：" + e.getMessage(), then); } });
                } catch (Exception e) { ui.post(() -> proxyFailed(epoch, "节点连接失败：" + e.getMessage(), then)); }
            }).start(); return;
        }
        stopTun(); tunErr = ""; Proxy p = parseProxy(px);
        try {
            if (isDirect(px)) { lastRule = null; ProxyController.getInstance().clearProxyOverride(exec, () -> proxyReady(epoch, then)); }
            else if (p == null) proxyFailed(epoch, "代理配置无效", then);
            else { if (isDomain(new URI(p.rule).getHost())) { proxyFailed(epoch, "缺少内置内核时代理地址必须为 IP，禁止本地 DNS 解析", then); return; } lastRule = p.rule; ProxyController.getInstance().setProxyOverride(pcfg(p.rule, false), exec, () -> proxyReady(epoch, then)); }
        } catch (Exception e) { proxyFailed(epoch, "代理设置失败：" + e.getMessage(), then); }
    }

    // Google/reCAPTCHA have NO special route. Old settings and IPC remain read-only compatibility stubs.
    volatile int gNet = 0; volatile long gNetAt = 0, gNetMs = 0; volatile boolean gProbing = false;
    String lastRule = null; boolean lastG = false;
    boolean gWanted() { return false; }
    boolean gOn() { return false; }
    ProxyConfig pcfg(String rule, boolean ignored) {
        return new ProxyConfig.Builder().addProxyRule(rule).removeImplicitRules().build();
    }
    void gReapply() { }
    void gProbe() { }
    void gWatch() { }

    // ---------- 多账号模式 ----------
    // 多账号模式只在「本次运行」里关闭（以前记住后永远关掉，抽卡按钮再也不出来）；下次打开 App 重新尝试
    volatile boolean multiOffSession = false;
    boolean multiOn() { return multiProfile && proxySupported && xrayExe() != null && !multiOffSession; }
    String secretOf(String id) { synchronized (secrets) { String s = secrets.get(id); if (s == null) { s = UUID.randomUUID().toString().replace("-", ""); secrets.put(id, s); } return s; } }
    static JSONObject blackhole() throws Exception { return new JSONObject().put("protocol", "blackhole"); }
    // 一个账号的出站：节点（xray 出站配置）/ 自定义 HTTP、SOCKS 代理 / 直连；配置有问题 = 黑洞（宁可断网也不串 IP、不漏真实 IP）
    JSONObject outboundOf(JSONObject a0) throws Exception {
        JSONObject a = eff(a0); String px = a.optString("proxy", "").trim();
        if (isVless(px)) { String xo = a.optString("xout", ""); return xo.trim().isEmpty() ? blackhole() : new JSONObject(xo); }
        if (isDirect(px)) return new JSONObject().put("protocol", "freedom").put("settings", new JSONObject().put("domainStrategy", "AsIs"));
        Proxy p = parseProxy(px); if (p == null) return blackhole();
        URI u = new URI(p.rule); String sc = u.getScheme();
        JSONObject st = new JSONObject().put("address", u.getHost()).put("port", u.getPort());
        if (p.user != null) st.put("user", p.user).put("pass", p.pass == null ? "" : p.pass);
        JSONObject ob = new JSONObject().put("protocol", sc.startsWith("socks") ? "socks" : "http").put("settings", st);
        if ("https".equals(sc)) ob.put("streamSettings", new JSONObject().put("security", "tls").put("tlsSettings", new JSONObject().put("serverName", u.getHost())));
        return ob;
    }
    // ---- 验证码专用线路（可选，默认关闭）：shared_caproute = "local"（本机网络）或 http(s):// / socks5:// 备用代理 ----
    static JSONArray capDomains() { return new JSONArray().put("domain:google.com").put("domain:gstatic.com").put("domain:recaptcha.net").put("domain:googleapis.com").put("domain:youtube.com"); }
    String capSpec() {
        try { Object o = new org.json.JSONTokener(sp.getString("shared_caproute", "null")).nextValue(); return o instanceof String ? ((String) o).trim() : ""; } catch (Exception e) { return ""; }
    }
    /** 规范化并校验：null = 无效；"" = 不启用 */
    String capNormalize(String v) {
        if (v == null) return "";
        v = v.trim(); if (v.isEmpty() || "null".equals(v)) return "";
        if (v.length() > 300 || v.matches(".*\\s.*")) return null;
        if ("local".equalsIgnoreCase(v)) return "local";
        return parseProxy(v) == null ? null : v;
    }
    JSONObject capOutbound() {
        try {
            String v = capNormalize(capSpec()); if (v == null || v.isEmpty()) return null;
            if ("local".equals(v)) return new JSONObject().put("tag", "cap").put("protocol", "freedom").put("settings", new JSONObject().put("domainStrategy", "AsIs"));
            Proxy p = parseProxy(v); if (p == null) return null;
            URI u = new URI(p.rule); String sc = u.getScheme();
            JSONObject st = new JSONObject().put("address", u.getHost()).put("port", u.getPort());
            if (p.user != null) st.put("user", p.user).put("pass", p.pass == null ? "" : p.pass);
            JSONObject ob = new JSONObject().put("tag", "cap").put("protocol", sc.startsWith("socks") ? "socks" : "http").put("settings", st);
            if ("https".equals(sc)) ob.put("streamSettings", new JSONObject().put("security", "tls").put("tlsSettings", new JSONObject().put("serverName", u.getHost())));
            return ob;
        } catch (Exception e) { return null; }
    }
    JSONObject buildMulti() throws Exception {
        JSONArray users = new JSONArray(), obs = new JSONArray(), rules = new JSONArray();
        obs.put(new JSONObject().put("tag", "block").put("protocol", "blackhole"));   // 默认出站 = 黑洞：对不上账号的请求一律不放行
        final JSONObject cap = capOutbound();
        if (cap != null) obs.put(cap);
        synchronized (acctLock) {
            for (JSONObject a : routeSupport.muxAccounts()) { if (a == null) continue;
                String id = a.optString("id"), tag = "a-" + id;
                JSONObject ob; try { ob = outboundOf(routeSupport.outboundAccount(a)); } catch (Exception e) { ob = blackhole(); }
                obs.put(ob.put("tag", tag));
                users.put(new JSONObject().put("user", id).put("pass", secretOf(id)));
                // 验证码专用线路（可选）：节点账号的 Google / reCAPTCHA 域名改走 cap 出站，其余照旧走账号出站（规则必须在账号规则之前）
                if (cap != null && isVless(eff(a).optString("proxy", "").trim())) rules.put(new JSONObject().put("type", "field").put("user", new JSONArray().put(id)).put("domain", capDomains()).put("outboundTag", "cap"));
                rules.put(new JSONObject().put("type", "field").put("user", new JSONArray().put(id)).put("outboundTag", tag));
            }
        }
        return new JSONObject().put("log", new JSONObject().put("loglevel", "warning"))
                .put("inbounds", new JSONArray().put(new JSONObject().put("tag", "in").put("listen", "127.0.0.1").put("port", 0).put("protocol", "http").put("settings", new JSONObject().put("accounts", users))))
                .put("outbounds", obs).put("routing", new JSONObject().put("domainStrategy", "AsIs").put("rules", rules));
    }
    // 启动 / 更新多账号 xray（配置没变就复用；尽量沿用同一个端口，WebView 的代理设置不用变）
    int ensureMulti() throws Exception {
        synchronized (tunLock) {
            JSONObject cfg = buildMulti(); String sig = cfg.toString();
            routeSupport.guardMux(sig);
            if (multiTun != null && sig.equals(multiTun.sig) && alive(multiTun.proc)) return multiTun.port;
            File exe = xrayExe(); if (exe == null) throw new Exception("没有找到内置 xray 内核");
            JSONObject resolvedCfg = new JSONObject(sig);
            fixDns(resolvedCfg);
            if (multiTun != null) { try { multiTun.proc.destroy(); multiTun.proc.waitFor(); } catch (Exception ignored) {} multiTun = null; }
            Exception last = null;
            for (int k = 0; k < 2; k++) {
                int port = k == 0 && multiPort > 0 ? multiPort : freePort();
                JSONObject c = new JSONObject(resolvedCfg.toString());
                c.getJSONArray("inbounds").getJSONObject(0).put("port", port);
                JSONObject dns = c.optJSONObject("dns"); if (dns == null) { dns = new JSONObject(); c.put("dns", dns); } dns.put("tag", "dnsq");
                File dir = new File(getFilesDir(), "xray"); dir.mkdirs();
                File cf = new File(dir, "multi.json");
                try (java.io.FileOutputStream fo = new java.io.FileOutputStream(cf)) { fo.write(c.toString().getBytes(StandardCharsets.UTF_8)); }
                ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "run", "-c", cf.getAbsolutePath()).directory(dir).redirectErrorStream(true);
                pb.environment().put("XRAY_LOCATION_ASSET", dir.getAbsolutePath());
                final Tun t = new Tun(); t.port = port; t.sig = sig; t.proc = pb.start();
                final InputStream in = t.proc.getInputStream();
                Thread rd = new Thread(() -> { try { BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)); String l; while ((l = br.readLine()) != null) { synchronized (t.log) { t.log.append(l).append('\n'); if (t.log.length() > 20000) t.log.delete(0, t.log.length() - 12000); } } } catch (Exception ignored) {} });
                rd.setDaemon(true); rd.start();
                if (waitPort(port, 8000, t.proc)) { multiTun = t; multiPort = port; return port; }
                last = new Exception("xray 启动失败：" + tail(t.log)); try { t.proc.destroy(); } catch (Exception ignored) {}
            }
            throw last;
        }
    }
    // 在后台线程里准备好多账号 xray，然后（主线程）把 WebView 代理指向它，再执行 then
    void ensureMultiThen(Runnable then) {
        try { if (multiActive && !proxyBlocked && multiTun != null && alive(multiTun.proc) && ("http://127.0.0.1:" + multiPort).equals(multiRule) && multiTun.sig.equals(buildMulti().toString())) { if (then != null) then.run(); return; } }
        catch (Exception ignored) {}
        if (routeSupport.anyLocked() && multiTun != null) { toast("认证期间共享线路不可重置，请完成或取消认证后检查"); return; }
        try { if (multiActive && !proxyBlocked && multiTun != null && alive(multiTun.proc) && multiTun.sig.equals(buildMulti().toString())) { if (then != null) then.run(); return; } } catch (Exception ignored) { }
        final long epoch = proxyEpoch.incrementAndGet(); blockProxyNetwork();
        new Thread(() -> {
            try {
                final String r = "http://127.0.0.1:" + ensureMulti();
                ui.post(() -> { if (epoch != proxyEpoch.get()) return;
                    try { ProxyController.getInstance().setProxyOverride(pcfg(r, false), exec, () -> { if (epoch != proxyEpoch.get()) return; multiRule = r; multiActive = true; proxyReady(epoch, then); }); }
                    catch (Exception e) { proxyFailed(epoch, "代理设置失败：" + e.getMessage(), then); }
                });
            } catch (Exception e) { ui.post(() -> proxyFailed(epoch, "代理内核启动失败：" + e.getMessage(), then)); }
        }).start();
    }
    // 账号 / 代理变了：多账号模式下重建 xray（端口不变，各账号连接自动重连）；单账号模式下只切当前账号
    void proxyChanged(JSONObject a) {
        if (multiActive) { ensureMultiThen(() -> { for (WebView w : new ArrayList<>(webs.values())) { String u = w.getUrl(); if (u != null && u.startsWith("file:")) w.loadUrl(UI); } }); return; }
        if (a != null && a.optString("id").equals(curId)) applyProxy(a, () -> { if (web != null && web.getUrl() != null && web.getUrl().startsWith("file:")) web.loadUrl(UI); });
    }
    // 代理认证「看起来」有问题（一个页面短时间内被要求认证很多次 / 主页面报代理认证错误）：
    // 先实测本地 xray 入口的认证——同时打开好几个账号时新页面会并发很多连接，认证请求多是正常的，不能据此就关掉多账号模式。
    //   认证正常（任何非 407 回应）→ 什么都不做（报错的页面稍后重新载入）
    //   连不上入口 → xray 挂了：重启 xray，不退回
    //   407 → 强制重建 xray 再测一次，仍然 407 才退回单账号模式（只限本次运行）
    volatile long suspectAt = 0; volatile boolean suspectBusy = false;
    int authProbe(String id) {
        int port = multiPort; if (port <= 0 || id == null) return -1;
        try (java.net.Socket so = new java.net.Socket()) {
            so.connect(new InetSocketAddress("127.0.0.1", port), 3000); so.setSoTimeout(6000);
            String cred = android.util.Base64.encodeToString((id + ":" + secretOf(id)).getBytes(StandardCharsets.UTF_8), android.util.Base64.NO_WRAP);
            so.getOutputStream().write(("CONNECT arena.ai:443 HTTP/1.1\r\nHost: arena.ai:443\r\nProxy-Authorization: Basic " + cred + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            so.getOutputStream().flush();
            BufferedReader br = new BufferedReader(new InputStreamReader(so.getInputStream(), StandardCharsets.UTF_8));
            String l = br.readLine(); if (l == null) return 0;
            String[] ps = l.trim().split(" "); return ps.length > 1 ? Integer.parseInt(ps[1]) : 0;
        } catch (java.net.SocketTimeoutException e) { return 200; }   // 入口收下了、正在连外面（认证已通过）
        catch (Exception e) { return -1; }
    }
    void multiSuspect(String why, final WebView view) {
        if (routeSupport.anyLocked() || routeSupport.applying.get()) { ui.post(() -> toast("认证或换线期间网络异常：已保留节点和出口，请完成或取消认证后检查")); return; }
        if (!multiActive || multiOffSession) return;
        long t = System.currentTimeMillis();
        if (suspectBusy || t - suspectAt < 20000) { if (view != null) ui.postDelayed(() -> { try { if (!routeSupport.anyLocked() && !routeSupport.applying.get() && webs.containsValue(view)) view.reload(); } catch (Exception ignored) {} }, 4000); return; }
        suspectBusy = true; suspectAt = t;
        final String id = view != null && ownerOf.get(view) != null ? ownerOf.get(view) : curId;
        new Thread(() -> {
            try {
                int c = authProbe(id);
                if (c == 407) {
                    synchronized (tunLock) { synchronized (acctLock) { if (routeSupport.anyLocked() || routeSupport.applying.get()) return; proxyBlocked = true; ui.post(this::blockProxyNetwork); if (multiTun != null) multiTun.sig = ""; } }   // 强制重建
                    try { ensureMulti(); } catch (Exception ignored) {}
                    c = authProbe(id);
                    if (c == 407) { multiFallback(why); return; }
                } else if (c < 0) {
                    synchronized (tunLock) { synchronized (acctLock) { if (routeSupport.anyLocked() || routeSupport.applying.get()) return; proxyBlocked = true; ui.post(this::blockProxyNetwork); if (multiTun != null) multiTun.sig = ""; } }
                    try { ensureMulti(); } catch (Exception ignored) {}
                }
                synchronized (authHits) { authHits.clear(); }
                ui.post(() -> { if (multiActive && !multiOffSession && !routeSupport.anyLocked() && !routeSupport.applying.get()) ensureMultiThen(null); });   // 重建后端口若变了，WebView 代理跟着改
                if (view != null) ui.postDelayed(() -> { try { if (!routeSupport.anyLocked() && !routeSupport.applying.get() && webs.containsValue(view)) view.reload(); } catch (Exception ignored) {} }, 1500);
            } finally { suspectBusy = false; }
        }).start();
    }
    // 多账号模式确实不可用（实测认证被拒绝）：本次运行退回单账号模式
    void multiFallback(String why) {
        if (routeSupport.anyLocked() || routeSupport.applying.get()) { ui.post(() -> toast("账号正在认证或换线，禁止自动降级或重建会话；请完成或取消认证后检查")); return; }
        if (!multiActive || multiOffSession) return;
        multiOffSession = true;
        toast("多账号后台模式暂时不可用（" + why + "），本次先用单账号模式；下次打开 App 会自动重试");
        ui.post(() -> {
            for (WebView w : new ArrayList<>(webs.values())) destroyWeb(ownerOf.get(w));
            synchronized (tunLock) { if (multiTun != null) { try { multiTun.proc.destroy(); } catch (Exception ignored) {} multiTun = null; } }
            multiActive = false; multiRule = null; web = null;
            openAccount(curId);
        });
    }
    // ---------- 任务完成通知 ----------
    static final String OPEN_ACT = "ai.arena.client.OPEN_CHAT";
    final java.util.Map<String, String> pendOpen = java.util.Collections.synchronizedMap(new java.util.HashMap<>());
    void handleOpen(Intent it) {
        if (it == null || !OPEN_ACT.equals(it.getAction())) return;
        final String acct = it.getStringExtra("acct"), sid = it.getStringExtra("sid");
        if (acct == null || find(acct) == null) return;
        if (sid != null) pendOpen.put(acct, sid);
        synchronized (MainActivity.class) { launchShown = true; }
        final String js = "try{window.__ancOpenSid&&window.__ancOpenSid(" + JSONObject.quote(sid == null ? "" : sid) + ")}catch(e){}";
        ui.post(() -> {
            WebView have = webs.get(acct);
            if (acct.equals(curId) && have != null) { have.evaluateJavascript(js, null); return; }
            openAccount(acct);
            ui.postDelayed(() -> { WebView w = webs.get(acct); if (w != null) w.evaluateJavascript(js, null); }, 900);   // 页面还没载入时由页面启动后自己取（takeOpen）
        });
    }
    void postDone(String acct, String title, String body, String sid) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            android.app.Notification.Builder b;
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel("done") == null) { android.app.NotificationChannel c = new android.app.NotificationChannel("done", "任务完成", android.app.NotificationManager.IMPORTANCE_DEFAULT); c.setDescription("App 在后台时，对话回复完成 / 等待你回答时提醒（抽卡不提醒）"); nm.createNotificationChannel(c); }
                b = new android.app.Notification.Builder(this, "done");
            } else b = new android.app.Notification.Builder(this);
            int nid = (acct + "|" + sid).hashCode();
            Intent open = new Intent(this, MainActivity.class).setAction(OPEN_ACT).putExtra("acct", acct).putExtra("sid", sid).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(this, nid, open, android.app.PendingIntent.FLAG_UPDATE_CURRENT | (android.os.Build.VERSION.SDK_INT >= 23 ? android.app.PendingIntent.FLAG_IMMUTABLE : 0));
            String who; synchronized (acctLock) { JSONObject a = find(acct); who = a == null ? "" : a.optString("email", a.optString("name", "")); int at = who.indexOf('@'); if (at > 0) who = who.substring(0, at); }
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle(title).setContentText(body).setStyle(new android.app.Notification.BigTextStyle().bigText(body))
             .setAutoCancel(true).setContentIntent(pi).setWhen(System.currentTimeMillis()).setShowWhen(true);
            if (webs.size() > 1 || !acct.equals(curId)) b.setSubText(who);
            nm.notify(nid, b.build());
        } catch (Exception ignored) {}
    }

    // ---------- 后台持续运行 ----------
    // 各账号页面报告的工作：{抽卡, 排队条数, 回复中, 报告时间}
    final java.util.HashMap<String, long[]> work = new java.util.HashMap<>();
    volatile boolean inBg = false; long lastBusy = 0; int tickN = 0;
    boolean workBusy(String id) { synchronized (work) { long[] w = work.get(id); return w != null && System.currentTimeMillis() - w[3] < 90000 && (w[0] > 0 || w[1] > 0 || w[2] > 0); } }
    void recalcWork() {
        long t = System.currentTimeMillis(); int g = 0, q = 0, st = 0;
        synchronized (work) {
            for (java.util.Iterator<java.util.Map.Entry<String, long[]>> it = work.entrySet().iterator(); it.hasNext(); ) {
                java.util.Map.Entry<String, long[]> e = it.next(); long[] w = e.getValue();
                if (t - w[3] > 90000 || !webs.containsKey(e.getKey())) { it.remove(); continue; }
                if (w[0] > 0) g++; q += (int) w[1]; st += (int) w[2];
            }
        }
        boolean starting = !pendCmd.isEmpty() || !bgQ.isEmpty();
        boolean busy = g > 0 || q > 0 || st > 0 || starting;
        if (busy) lastBusy = t;
        StringBuilder sb = new StringBuilder();
        if (g > 0) sb.append(" · 抽卡 ").append(g).append(" 个账号"); else if (starting) sb.append(" · 抽卡启动中");
        if (q > 0) sb.append(" · 队列 ").append(q).append(" 条");
        if (st > 0) sb.append(" · 回复中 ").append(st);
        KeepService.update(busy ? "后台运行中" + sb : "后台待命", busy || t - lastBusy < 120000);   // 闲下来 2 分钟后才放掉唤醒锁
    }
    // 每秒一次：后台时唤醒各页面被系统压住的定时器；每 15 秒检查代理内核是否还活着（被系统杀掉就重启）
    final Runnable tick = new Runnable() { @Override public void run() {
        try {
            tickN++;
            if (inBg) for (WebView w : new ArrayList<>(webs.values())) { try { w.evaluateJavascript("try{window.__ancPump&&__ancPump()}catch(e){}", null); } catch (Exception ignored) {} }
            if (tickN % 5 == 0) recalcWork();
            if (tickN % 15 == 0) xrayWatch();
        } catch (Exception ignored) {}
        ui.postDelayed(this, 1000);
    } };
    void xrayWatch() {
        if (multiActive && !multiOffSession) {
            boolean dead; synchronized (tunLock) { dead = multiTun == null || !alive(multiTun.proc); }
            if (dead && !webs.isEmpty()) ensureMultiThen(null);
            return;
        }
        Tun t = curTun;
        if (t != null && !alive(t.proc)) { JSONObject a; synchronized (acctLock) { a = find(curId); } if (a != null) applyProxy(a, () -> {}); }
    }
    // 页面渲染进程被系统回收 / 崩溃：只重建这个页面（不让整个 App 闪退）；在抽卡的后台账号自动重新开始抽，当前页面重新载入（队列、输入框、持续抽卡都会恢复）
    boolean renderGone(WebView view) {
        final String id = ownerOf.get(view); final boolean front = view == web; final boolean busy = id != null && (bgBusy(id) || workBusy(id));
        ui.post(() -> {
            if (id == null) { try { root.removeView(view); view.destroy(); } catch (Exception ignored) {} return; }
            destroyWeb(id);
            JSONObject a; synchronized (acctLock) { a = find(id); } if (a == null) return;
            if (front || id.equals(curId)) { WebView nw = createWebView(a); bringFront(nw, false); }
            else if (busy && multiActive) { pendCmd.put(id, "gacha-start"); markGacha(id, true, "页面被系统回收，重新启动中"); bgCreate(id); }
        });
        return true;
    }
    void openSys(Intent it) { try { ownAct = true; it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(it); } catch (Exception e) { ownAct = false; throw new RuntimeException(e); } }

    // 从账号选择页一次给好几个账号开抽卡：后台页面一个一个建（间隔 2.5 秒），不同时挤在一起
    final java.util.ArrayDeque<String> bgQ = new java.util.ArrayDeque<>(); boolean bgRun = false;
    void bgCreate(String id) {
        if (!bgQ.contains(id)) bgQ.add(id);
        if (bgRun) return; bgRun = true; bgNext();
    }
    void bgNext() {
        String id = bgQ.poll(); if (id == null) { bgRun = false; return; }
        final JSONObject a; synchronized (acctLock) { a = find(id); }
        if (a == null || webs.containsKey(id)) { bgNext(); return; }
        ensureMultiThen(() -> { if (!webs.containsKey(id) && multiActive) createWebView(a); ui.postDelayed(this::bgNext, 2500); });
    }

    volatile String removingId;
    static String jsonErr(String m) { try { return new JSONObject().put("error", m).toString(); } catch (Exception e) { return "null"; } }
    /** 删除账号。失败一律返回 {"error":原因}（以前只返回 "false"，界面只能显示「删除失败」，看不出是哪个条件拦住了）。 */
    String removeAccountChecked(String id) {
        if (id == null || id.isEmpty()) return jsonErr("账号 ID 为空");
        if (routeSupport.applying.get()) return jsonErr("账号线路正在保存或切换，请等几秒再删除");
        JSONObject target; String lockedOther = null; int count; String other = null;
        synchronized (acctLock) {
            target = find(id); count = accounts.length();
            for (int i = 0; i < accounts.length(); i++) {
                JSONObject a = accounts.optJSONObject(i); if (a == null || id.equals(a.optString("id"))) continue;
                if (other == null) other = a.optString("id");
                if (lockedOther == null && AuthRouteState.locked(a)) lockedOther = a.optString("email", "").isEmpty() ? a.optString("name", "另一个账号") : a.optString("email");
            }
        }
        if (target == null) return jsonErr("找不到这个账号（可能已经删除），请刷新账号列表");
        // 认证租约不会自己过期（超时后仍锁定，必须明确取消）。别的账号正在认证时不能动共享线路，所以拦住并说清是哪个账号；
        // 被删的账号自己带着租约则允许删除——租约随账号一起作废，否则「注册 / 登录没完成留下的账号」永远删不掉。
        if (lockedOther != null) return jsonErr("账号「" + lockedOther + "」正在认证（登录 / 注册 / 重置密码），期间不能删除其他账号；请先在那个账号里完成或取消认证，或者直接删除那个账号");
        if (count <= 1 || other == null) return jsonErr("至少保留一个账号，请先添加其他账号");
        // 删除当前账号（选账号页左滑删除）：先切到另一个账号，再删
        if (id.equals(curId)) {
            final String o = other; removingId = id;
            ui.post(() -> {
                MainActivity.this.openAccount(o);
                ui.postDelayed(() -> {
                    removingId = null;
                    if (id.equals(curId)) { toast("没能切换到其他账号，当前账号未删除"); return; }
                    String r = removeAccountChecked(id);
                    if (!"true".equals(r)) { String why = ""; try { why = new JSONObject(r).optString("error", ""); } catch (Exception ignored) {} toast("删除失败：" + (why.isEmpty() ? "未知原因" : why)); }
                }, 800);
            });
            return "true";
        }
        synchronized (acctLock) {
            JSONArray n = new JSONArray();
            for (int i = 0; i < accounts.length(); i++) { JSONObject a = accounts.optJSONObject(i); if (a != null && !id.equals(a.optString("id"))) n.put(a); }
            accounts = n; saveAccounts();
        }
        ui.post(() -> { destroyWeb(id); if (multiActive) ensureMultiThen(null); if (multiProfile) { try { ProfileStore.getInstance().deleteProfile("acct-" + id); } catch (Exception ignored) {} } });
        return "true";
    }

    void openAccount(String id) {
        if (!multiActive && routeSupport.anyLocked() && curId != null && !curId.equals(id) && !curId.equals(removingId)) { toast("当前账号正在认证，请先完成或取消认证再切换账号"); return; }
        JSONObject a = find(id); if (a == null) return;
        curId = id; saveAccounts(); usedAt.put(id, System.currentTimeMillis());
        if (!multiOn()) {
            // 单账号模式：整体换成这个账号（关掉其他账号的页面）
            for (WebView w : new ArrayList<>(webs.values())) destroyWeb(ownerOf.get(w));
            web = null;
            applyProxy(a, () -> bringFront(createWebView(a), false));
            return;
        }
        WebView have = webs.get(id);
        if (have != null) {
            hideSwitching(); switchTo = null;
            // 从选账号页进入：先让页面盖上「连接测试」进度层，再切到前面（不先露出旧画面）
            if (pendEnter.remove(id)) { have.evaluateJavascript("try{window.__ancEnter&&window.__ancEnter()}catch(e){}", v -> ui.postDelayed(() -> { if (id.equals(curId)) bringFront(have, true); }, 60)); reap(); return; }
            bringFront(have, true); reap(); return;
        }
        if (web == null) { ensureMultiThen(() -> { if (id.equals(curId) && webs.get(id) == null) bringFront(createWebView(a), false); }); return; }
        // 新开的账号在当前页面下面载入，载入好了再切过去；这期间当前页面上显示切换动画（不白屏）
        showSwitching(a);
        switchTo = id;
        ensureMultiThen(() -> {
            if (!id.equals(switchTo)) return;
            if (webs.get(id) == null) createWebView(a);
            if (switchTmo != null) ui.removeCallbacks(switchTmo);
            switchTmo = () -> finishSwitch(id); ui.postDelayed(switchTmo, 15000);
        });
    }
    // 页面报告「界面已就绪」（或超时）：切到这个账号
    void finishSwitch(String id) {
        if (id == null || !id.equals(switchTo)) return;
        switchTo = null; if (switchTmo != null) { ui.removeCallbacks(switchTmo); switchTmo = null; }
        WebView w = webs.get(id);
        if (w != null && id.equals(curId)) bringFront(w, true);
        hideSwitching(); reap();
    }
    void syncBgWebState(WebView active, WebView keepVisible) {
        for (WebView o : new ArrayList<>(webs.values())) {
            if (o == null || o == active) continue;
            String oid = ownerOf.get(o);
            boolean busy = oid != null && (bgBusy(oid) || workBusy(oid) || oid.equals(switchTo));
            if (o != keepVisible && (oid == null || !oid.equals(switchTo))) o.setVisibility(android.view.View.GONE);
            if (!busy) { try { o.onPause(); } catch (Exception ignored) {} }
            else { try { o.onResume(); } catch (Exception ignored) {} }
        }
    }
    void bringFront(WebView w, boolean anim) {
        if (w == null) return;
        WebView prev = web; web = w;
        w.setVisibility(android.view.View.VISIBLE);
        try { w.onResume(); } catch (Exception ignored) {}
        try { if (prev != null && prev != w) { android.view.inputmethod.InputMethodManager im = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE); if (im != null) im.hideSoftInputFromWindow(prev.getWindowToken(), 0); prev.clearFocus(); } } catch (Exception ignored) {}
        for (WebView o : webs.values()) { boolean fg = o == w; o.setFocusable(fg); o.setFocusableInTouchMode(fg); o.setImportantForAccessibility(fg ? android.view.View.IMPORTANT_FOR_ACCESSIBILITY_AUTO : android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS); }
        w.bringToFront();
        if (switchView != null) switchView.bringToFront();
        if (anim && prev != null && prev != w) {
            syncBgWebState(w, prev);
            w.setAlpha(0f);
            w.animate().alpha(1f).setDuration(180).withEndAction(() -> syncBgWebState(web, null)).start();
        } else {
            w.setAlpha(1f);
            syncBgWebState(w, null);
        }
        w.evaluateJavascript("try{window.__ancFront&&window.__ancFront()}catch(e){}", null);
    }
    void destroyWeb(String id) {
        if (id == null) return;
        WebView w = webs.remove(id); if (w == null) return; protectedWebs.remove(w);
        workspacePreview.closeOwner(w); workspaceDownload.closeOwner(w);
        ownerOf.remove(w); authHits.remove(w); cmdReady.remove(id);
        try { root.removeView(w); w.stopLoading(); w.destroy(); } catch (Exception ignored) {}
        if (w == web) web = null;
        synchronized (acctLock) { JSONObject a = find(id); JSONObject st = a == null ? null : a.optJSONObject("status"); JSONObject g = st == null ? null : st.optJSONObject("gacha"); if (g != null) { try { g.put("busy", false); } catch (Exception ignored) {} } }
    }
    boolean bgBusy(String id) {
        synchronized (acctLock) {
            JSONObject a = find(id); JSONObject st = a == null ? null : a.optJSONObject("status"); if (st == null) return pendCmd.containsKey(id);
            JSONObject g = st.optJSONObject("gacha");
            return (g != null && g.optBoolean("busy")) || !st.optString("statsBusy", "").isEmpty() || pendCmd.containsKey(id);
        }
    }
    // 后台页面回收：在抽卡 / 统计的一直保留；空闲的只留最近用过的 2 个，且 20 分钟没用就关掉（释放内存）
    void reap() {
        if (!multiActive) return;
        List<String> idle = new ArrayList<>();
        for (String id : new ArrayList<>(webs.keySet())) { if (id.equals(curId) || id.equals(switchTo) || bgBusy(id) || workBusy(id)) continue; idle.add(id); }
        idle.sort((x, y) -> Long.compare(usedAt.getOrDefault(y, 0L), usedAt.getOrDefault(x, 0L)));
        long t = System.currentTimeMillis();
        for (int i = 0; i < idle.size(); i++) { String id = idle.get(i); if (i >= MAX_IDLE_BG || t - usedAt.getOrDefault(id, 0L) > IDLE_REAP_MS) destroyWeb(id); }
    }
    // 切换动画：盖在当前页面上的半透明层 + 转圈 + 「正在切换到 …」
    void showSwitching(JSONObject a) {
        String name = a.optString("name", ""); if (name.isEmpty()) name = a.optString("email", "账号");
        if (switchView == null) {
            FrameLayout f = new FrameLayout(this);
            f.setBackgroundColor(0x66000000); f.setClickable(true);
            android.widget.LinearLayout box = new android.widget.LinearLayout(this);
            box.setOrientation(android.widget.LinearLayout.HORIZONTAL); box.setGravity(android.view.Gravity.CENTER_VERTICAL);
            int pad = (int) (16 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad * 3 / 4, pad * 5 / 4, pad * 3 / 4);
            android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
            boolean dark = sp.getBoolean("barDark", true);
            bg.setColor(dark ? 0xF02A2826 : 0xF7FFFFFF); bg.setCornerRadius(pad * 1.5f); box.setBackground(bg);
            box.setElevation(pad / 2f);
            android.widget.ProgressBar pb = new android.widget.ProgressBar(this);
            int sz = (int) (22 * getResources().getDisplayMetrics().density);
            if (android.os.Build.VERSION.SDK_INT >= 21) pb.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(dark ? 0xFFE8E6E3 : 0xFF3A3835));
            box.addView(pb, new android.widget.LinearLayout.LayoutParams(sz, sz));
            android.widget.TextView tv = new android.widget.TextView(this);
            tv.setTextColor(dark ? 0xFFE8E6E3 : 0xFF2A2826); tv.setTextSize(15); tv.setPadding(pad * 3 / 4, 0, 0, 0); tv.setMaxLines(1); tv.setEllipsize(android.text.TextUtils.TruncateAt.END);
            box.addView(tv);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, android.view.Gravity.CENTER);
            f.addView(box, lp);
            switchView = f; switchText = tv;
            root.addView(f, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            f.setAlpha(0f); f.animate().alpha(1f).setDuration(150).start();
            android.view.View b = box; b.setScaleX(.92f); b.setScaleY(.92f); b.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(new android.view.animation.OvershootInterpolator(1.4f)).start();
        }
        switchText.setText("正在切换到 " + name + "…");
        switchView.bringToFront();
    }
    void hideSwitching() {
        final android.view.View v = switchView; if (v == null) return;
        switchView = null; switchText = null;
        v.animate().alpha(0f).setDuration(160).withEndAction(() -> root.removeView(v)).start();
    }
    // 发给某个账号页面的命令（后台抽卡开始 / 停止）
    void sendCmd(String id, JSONObject m) {
        WebView w = webs.get(id); if (w == null) return;
        w.evaluateJavascript("try{window.__ancCmd&&window.__ancCmd(" + m.toString() + ")}catch(e){}", null);
    }
    void markGacha(String id, boolean busy, String phase) {
        synchronized (acctLock) {
            JSONObject a = find(id); if (a == null) return;
            try {
                JSONObject st = a.optJSONObject("status"); if (st == null) { st = new JSONObject(); a.put("status", st); }
                JSONObject g = st.optJSONObject("gacha"); if (g == null) g = new JSONObject();
                g.put("busy", busy).put("phase", phase).put("err", "").put("at", System.currentTimeMillis()); if (busy) g.put("done", 0);
                st.put("gacha", g);
            } catch (Exception ignored) {}
        }
    }

    CookieManager cookies() {
        if (multiProfile && curId != null) {
            try { return ProfileStore.getInstance().getOrCreateProfile("acct-" + curId).getCookieManager(); } catch (Exception ignored) {}
        }
        return CookieManager.getInstance();
    }

    WebView createWebView(JSONObject a) {
        final String aid = a.optString("id");
        if (webs.containsKey(aid)) destroyWeb(aid);
        WebView w = new WebView(this);
        if (multiProfile) {
            try { ProfileStore.getInstance().getOrCreateProfile("acct-" + a.optString("id")); WebViewCompat.setProfile(w, "acct-" + a.optString("id")); }
            catch (Exception e) { toast("账号隔离失败：" + e.getMessage()); }
        }
        w.setBackgroundColor(Color.TRANSPARENT);
        // 渲染进程在后台 / 熄屏时也保持「重要」，不被系统优先回收
        if (android.os.Build.VERSION.SDK_INT >= 26) { try { w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Exception ignored) {} }
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setBlockNetworkLoads(true); s.setGeolocationEnabled(false);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        // 禁止双指缩放整个界面（看大图时由页面自己处理缩放）
        s.setSupportZoom(false); s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // 去掉 WebView 标识，避免被当成内嵌浏览器拦截
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+\\.\\d+ ", ""));
        googleReady(s);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.addJavascriptInterface(new Bridge(aid), "BranaAndroid");
        routeSupport.install(w, aid);
        w.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null || url.isEmpty()) return;
            String js = "window.__ancDownloadUrl&&window.__ancDownloadUrl(" + JSONObject.quote(url) + "," + JSONObject.quote(contentDisposition == null ? "" : contentDisposition) + "," + JSONObject.quote(mimetype == null ? "" : mimetype) + ")";
            ui.post(() -> { try { w.evaluateJavascript(js, null); } catch (Throwable ignored) {} });
        });
        if (docStart) {
            try {
                String guard = readAsset("rtc-lockdown.js"); if (guard.isEmpty()) throw new Exception("缺少隐私脚本");
                WebViewCompat.addDocumentStartJavaScript(w, guard, Collections.singleton("*"));
                String capSolver = readAsset("captcha-solver.js");
                if (!capSolver.isEmpty()) WebViewCompat.addDocumentStartJavaScript(w, capSolver, Collections.singleton("*"));
                WebViewCompat.addDocumentStartJavaScript(w, bundle, Collections.singleton("https://arena.ai"));
                protectedWebs.add(w);
            } catch (Exception e) { s.setJavaScriptEnabled(false); toast("隐私保护加载失败：禁止外网，请更新客户端 / WebView"); }
        } else { s.setJavaScriptEnabled(false); toast("WebView 太旧，无法在页面执行前禁用 WebRTC，已阻断外网；请更新系统 WebView"); }
        s.setBlockNetworkLoads(proxyBlocked || !protectedWebs.contains(w));
        w.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if (!"http".equals(scheme) && !"https".equals(scheme)) return null;
                if ("https".equals(scheme) && "arena.ai".equals(request.getUrl().getHost()) && "/robots.txt".equals(request.getUrl().getPath()) && ("1".equals(request.getUrl().getQueryParameter("browse")) || (request.isForMainFrame() && protectedWebs.contains(view)))) {
                    return new WebResourceResponse("text/plain", "UTF-8", 200, "OK", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream("User-agent: *\nAllow: /\n".getBytes(StandardCharsets.UTF_8)));
                }
                if (proxyBlocked || !protectedWebs.contains(view)) return new WebResourceResponse("text/plain", "UTF-8", 503, "Privacy protection", java.util.Collections.emptyMap(), new java.io.ByteArrayInputStream("Network blocked by privacy policy".getBytes(StandardCharsets.UTF_8)));
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap fav) { workspacePreview.closeOwner(view); workspaceDownload.closeOwner(view); String o = ownerOf.get(view); if (o != null) cmdReady.remove(o); }
            @Override public void onPageFinished(WebView view, String url) {
                // No late fallback: remote scripts must never run before the privacy guard.
                view.evaluateJavascript(insetJs(), null);
                // 客户端界面以外的网页（Brana 官网、邮箱、Google 登录等）：底部浏览条（后退 / 前进 / 刷新 / 地址栏 / 返回客户端）
                if (url != null && url.startsWith("https://") && !url.startsWith(UI) && !webbarJs.isEmpty()) view.evaluateJavascript(insetJs() + "window.__ancBarPos='top';" + webbarJs, null);
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail d) { return renderGone(view); }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // 主页面连接失败（代理填错、代理没开等）：打开本地离线页，可直接改代理 / 改直连 / 切换账号
                if (!req.isForMainFrame()) return;
                if (multiActive && err.getErrorCode() == WebViewClient.ERROR_PROXY_AUTHENTICATION) { multiSuspect("代理认证失败", view); return; }
                // Google 登录流程里的外部页面（accounts.google.com、auth.arena.ai 等）：线路偶发不稳定，自动重试，不跳「无法连接 arena.ai」
                if (extAuth(req.getUrl().toString())) { extFail(view, req.getUrl().toString(), err.getErrorCode(), String.valueOf(err.getDescription())); return; }
                showOffline(view, String.valueOf(err.getErrorCode()), String.valueOf(err.getDescription()), req.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String url = req.getUrl().toString();
                String cur = view.getUrl();
                // 子框架（reCAPTCHA 验证框等）里的跳转一律放行：以前会被当成外部链接拦下，验证做完卡在最后一步
                if (!req.isForMainFrame()) return false;
                if (url.startsWith("https://www.google.com/recaptcha/") || url.startsWith("https://recaptcha.google.com/") || url.startsWith("https://www.recaptcha.net/")) return false;
                if (req.isRedirect() && url.startsWith("https://")) return false; // 邮件链接跳转链
                if (cur != null && cur.startsWith(UI) && !url.startsWith("https://arena.ai/") && !extAuth(url)) { openExternal(url); return true; }
                if (!url.startsWith("http")) { openExternal(url); return true; }
                return false;
            }
            @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
                // 多账号模式：本地 xray 入口要求认证 → 用这个 WebView 所属账号的用户名 / 密码应答（xray 按用户名分流到该账号的出站）
                String own = ownerOf.get(view);
                if (multiActive && own != null && ("127.0.0.1".equals(host) || (host != null && host.startsWith("127.0.0.1")))) {
                    long[] hit; long t = System.currentTimeMillis();
                    synchronized (authHits) { hit = authHits.get(view); if (hit == null || t - hit[1] > 30000) { hit = new long[] { 0, t }; authHits.put(view, hit); } hit[0]++; }
                    // 认证请求很多：先实测（新页面并发连接多，多数是正常的）；多到明显在死循环才取消这一次
                    if (hit[0] > 12) multiSuspect("认证被拒绝", null);
                    if (hit[0] > 60) { handler.cancel(); return; }
                    handler.proceed(own, secretOf(own)); return;
                }
                JSONObject acct = find(own != null ? own : curId);
                Proxy p = acct == null ? null : parseProxy(acct.optString("proxy"));
                if (p != null && p.user != null) handler.proceed(p.user, p.pass); else super.onReceivedHttpAuthRequest(view, handler, host, realm);
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                if (request == null) return;
                runOnUiThread(() -> {
                    try {
                        String[] rs = request.getResources();
                        boolean wantsVideo = false;
                        if (rs != null) {
                            for (String r : rs) {
                                if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) { wantsVideo = true; break; }
                            }
                        }
                        if (!wantsVideo) { request.deny(); return; }
                        if (android.os.Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.CAMERA) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            if (pendingCamReq != null) { try { pendingCamReq.deny(); } catch (Exception ignored) {} }
                            pendingCamReq = request;
                            ownAct = true;
                            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, CAM_PERM_REQ);
                        } else {
                            request.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        }
                    } catch (Exception e) {
                        try { request.deny(); } catch (Exception ignored) {}
                    }
                });
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) { callback.invoke(origin, false, false); }
            // 输入框「+」添加附件：打开系统文件选择器
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    Intent it = new Intent(Intent.ACTION_GET_CONTENT);
                    it.addCategory(Intent.CATEGORY_OPENABLE); it.setType("*/*");
                    it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                    ownAct = true;
                    startActivityForResult(Intent.createChooser(it, "选择附件"), FILE_REQ);
                } catch (Exception e) { fileCb = null; cb.onReceiveValue(null); Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        // 新页面放在最下面（不挡住当前页面）；切过去时再提到最上面
        root.addView(w, 0, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        webs.put(aid, w); ownerOf.put(w, aid); usedAt.put(aid, System.currentTimeMillis());
        w.setFocusable(false); w.setFocusableInTouchMode(false);
        if (proxyBlocked || !protectedWebs.contains(w)) showOffline(w,"PRIVACY_BLOCK", "代理或隐私保护不可用，未连接外网", UI); else w.loadUrl(UI);
        return w;
    }

    void showOffline(WebView v, String code, String desc, String url) {
        if (v == null) return;
        try {
            boolean isArena = url == null || url.isEmpty() || url.startsWith("https://arena.ai");
            if (isArena && !"PRIVACY_BLOCK".equals(code)) {
                try { v.getSettings().setBlockNetworkLoads(false); } catch (Exception ignored) {}
                v.loadUrl(UI + "?browse=1&offline=1&code=" + URLEncoder.encode(code == null ? "" : code, "UTF-8") + "&desc=" + URLEncoder.encode(desc == null ? "" : desc, "UTF-8"));
                return;
            }
            v.loadUrl("file:///android_asset/offline.html?code=" + URLEncoder.encode(code, "UTF-8") + "&desc=" + URLEncoder.encode(desc, "UTF-8") + "&url=" + URLEncoder.encode(url == null ? "" : url, "UTF-8"));
        } catch (Exception ignored) {}
    }

    static boolean contains(int[] a, int n, int v) { for (int i = 0; i < n; i++) if (a[i] == v) return true; return false; }
    static String[] httpGet(int port, String url, int tmo) throws Exception {
        java.net.Proxy jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", port));
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(jp);
        try {
            c.setConnectTimeout(tmo); c.setReadTimeout(tmo); c.setUseCaches(false); c.setInstanceFollowRedirects(false);
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            StringBuilder sb = new StringBuilder();
            if (in != null) { BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)); String l; while ((l = r.readLine()) != null && sb.length() < 4000) sb.append(l).append('\n'); }
            return new String[] { String.valueOf(code), sb.toString() };
        } finally { c.disconnect(); }
    }
    static JSONObject delayOne(int port, String url, int tmo) {
        JSONObject o = new JSONObject();
        try {
            long t0 = System.currentTimeMillis();
            String[] a = httpGet(port, url, tmo);
            long cold = System.currentTimeMillis() - t0, ms = cold;
            try { long t1 = System.currentTimeMillis(); httpGet(port, url, tmo); ms = Math.min(cold, System.currentTimeMillis() - t1); } catch (Exception ignored) {}
            o.put("ok", true).put("status", Integer.parseInt(a[0])).put("ms", ms).put("cold", cold);
        } catch (Exception e) { try { o.put("ok", false).put("error", e instanceof java.net.SocketTimeoutException ? "超时" : String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
        return o;
    }
    static JSONObject probeOne(int port, int tmo) {
        JSONObject o = new JSONObject();
        try {
            long t0 = System.currentTimeMillis();
            String[] t = httpGet(port, "https://arena.ai/cdn-cgi/trace", tmo);
            if (!"200".equals(t[0])) return o.put("error", "trace HTTP " + t[0]);
            for (String l : t[1].split("\n")) { if (l.startsWith("ip=")) o.put("ip", l.substring(3)); else if (l.startsWith("loc=")) o.put("loc", l.substring(4)); }
            o.put("ms", System.currentTimeMillis() - t0);
            long t1 = System.currentTimeMillis();
            String[] r = httpGet(port, "https://arena.ai/robots.txt", tmo);
            o.put("ms", Math.min(o.getLong("ms"), System.currentTimeMillis() - t1));
            int code = Integer.parseInt(r[0]); boolean ok = code == 200 && r[1].toLowerCase().contains("user-agent");
            o.put("status", code).put("brana", ok);
            if (!ok) o.put("error", code == 403 || code == 503 ? "Brana 返回验证页（HTTP " + code + "）" : code == 429 ? "Brana 限流（429）" : "Brana 访问异常（HTTP " + code + "）");
            else purity(port, o);   // 测延迟顺带测纯净度：IPPure + ip-api（经同一条隧道，并行）
        } catch (Exception e) { try { o.put("error", e instanceof java.net.SocketTimeoutException ? "超时" : String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
        return o;
    }

    static void purity(int port, JSONObject o) { RouteSupport.purity(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", port)), o); }
    static boolean socksOk(int port) {
        try (java.net.Socket s = new java.net.Socket()) {
            s.connect(new InetSocketAddress("127.0.0.1", port), 600); s.setSoTimeout(900);
            s.getOutputStream().write(new byte[] { 5, 1, 0 }); s.getOutputStream().flush();
            InputStream in = s.getInputStream(); int a = in.read(), b = in.read(); return a == 5 && b == 0;
        } catch (Exception e) { return false; }
    }
    String localScan(String json) {
        java.util.concurrent.ExecutorService ex = java.util.concurrent.Executors.newFixedThreadPool(16);
        try {
            JSONArray a = new JSONArray(json == null || json.isEmpty() ? "[]" : json);
            java.util.Set<Integer> own = new java.util.HashSet<>(); Tun c = curTun, mt = multiTun; if (c != null) own.add(c.port); if (mt != null) own.add(mt.port); if (multiPort > 0) own.add(multiPort);
            List<Integer> ports = new ArrayList<>();
            for (int i = 0; i < a.length() && ports.size() < 64; i++) { int p = a.optInt(i); if (p > 0 && p < 65536 && !own.contains(p) && !ports.contains(p)) ports.add(p); }
            List<java.util.concurrent.Future<Integer>> fs = new ArrayList<>();
            for (final int p : ports) fs.add(ex.submit(() -> { try (java.net.Socket s = new java.net.Socket()) { s.connect(new InetSocketAddress("127.0.0.1", p), 500); return p; } catch (Exception e) { return 0; } }));
            List<Integer> open = new ArrayList<>();
            for (java.util.concurrent.Future<Integer> f : fs) { try { int p = f.get(3, java.util.concurrent.TimeUnit.SECONDS); if (p > 0) open.add(p); } catch (Exception ignored) {} }
            List<java.util.concurrent.Future<JSONObject>> ts = new ArrayList<>();
            for (final int p : open.subList(0, Math.min(open.size(), 10))) ts.add(ex.submit(() -> {
                for (String px : new String[] { "127.0.0.1:" + p, "socks5://127.0.0.1:" + p }) {
                    if (px.startsWith("socks5") && !socksOk(p)) break;   // 不是 SOCKS 的端口不去白等超时
                    long t0 = System.currentTimeMillis(); JSONObject o = new JSONObject(testIpNow(px));
                    if (o.has("ip")) return o.put("port", p).put("proxy", px).put("ms", System.currentTimeMillis() - t0);
                }
                return null;
            }));
            JSONArray out = new JSONArray();
            for (java.util.concurrent.Future<JSONObject> f : ts) { try { JSONObject o = f.get(25, java.util.concurrent.TimeUnit.SECONDS); if (o != null) out.put(o); } catch (Exception ignored) {} }
            JSONArray op = new JSONArray(); for (int p : open) op.put(p);
            return new JSONObject().put("open", op).put("list", out).toString();
        } catch (Exception e) { try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"失败\"}"; } }
        finally { ex.shutdownNow(); }
    }
    // 用给定代理访问 arena.ai/cdn-cgi/trace 测出口 IP（在 JS 桥线程里执行，不阻塞界面）
    String testIpNow(String proxyStr) {
        HttpURLConnection c = null; Tun nativeTun = null; String nativeTag = null;
        try {
            if (proxyErr(proxyStr) != null) return new JSONObject().put("error", proxyErr(proxyStr)).toString();
            if (isVless(proxyStr)) return new JSONObject().put("error", "VLESS 需要内核检测，不允许回退直连").toString();
            Proxy p = parseProxy(proxyStr);
            if (p == null && !isDirect(proxyStr)) throw new Exception("代理无效，未直连");
            java.net.Proxy jp = java.net.Proxy.NO_PROXY;
            if (p != null) {
                URI u = new URI(p.rule);
                if (!"http".equals(u.getScheme()) || isDomain(u.getHost()) || p.user != null) {
                    nativeTag = "ip-check-" + newId();
                    nativeTun = startTun(outboundOf(new JSONObject().put("proxy", proxyStr)).toString(), nativeTag);
                    jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", nativeTun.port));
                } else jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress(u.getHost(), u.getPort()));
            }
            c = (HttpURLConnection) new URL("https://arena.ai/cdn-cgi/trace").openConnection(jp);
            c.setConnectTimeout(10000); c.setReadTimeout(10000); c.setUseCaches(false);
            int code = c.getResponseCode();
            if (code != 200) return new JSONObject().put("error", "HTTP " + code).toString();
            BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
            String line, ip = null, loc = null;
            while ((line = r.readLine()) != null) { if (line.startsWith("ip=")) ip = line.substring(3); else if (line.startsWith("loc=")) loc = line.substring(4); }
            JSONObject o = new JSONObject(); if (ip != null) o.put("ip", ip); if (loc != null) o.put("loc", loc); if (ip == null) o.put("error", "没有返回 IP");
            return o.toString();
        } catch (Exception e) {
            try { return new JSONObject().put("error", e.getClass().getSimpleName() + (e.getMessage() != null ? "：" + e.getMessage() : "") + (proxyStr == null || proxyStr.trim().isEmpty() ? "（默认代理 127.0.0.1:7890）" : "")).toString(); } catch (Exception x) { return "{\"error\":\"失败\"}"; }
        } finally { if (c != null) c.disconnect(); if (nativeTun != null) nativeTun.proc.destroy(); if (nativeTag != null) new File(new File(getFilesDir(), "xray"), nativeTag + ".json").delete(); }
    }

    // 经代理访问任意网址，返回 HTTP 状态码（失败 = -1）
    static int reach(String proxyStr, String url) {
        HttpURLConnection c = null;
        try {
            URI u = new URI(proxyStr);
            if (!"http".equals(u.getScheme()) || isDomain(u.getHost())) return -1; // This diagnostic accepts only a literal-IP HTTP tunnel.
            java.net.Proxy jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress(u.getHost(), u.getPort()));
            c = (HttpURLConnection) new URL(url).openConnection(jp);
            c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setUseCaches(false); c.setInstanceFollowRedirects(false);
            return c.getResponseCode();
        } catch (Exception e) { return -1; }
        finally { if (c != null) c.disconnect(); }
    }
    // 出站配置里带的 ProxyIP（ws / xhttp 路径里的 /proxyip=…）
    static String xoutPip(String xout) {
        try { java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?i)proxyip=([^/?&\"\\\\]+)").matcher(xout == null ? "" : xout); return m.find() ? m.group(1) : ""; } catch (Exception e) { return ""; }
    }
    void openExternal(String url) {
        ownAct = true;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { ownAct = false; toast("无法打开链接"); }
    }
    void toast(String m) { ui.post(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (Exception e) { return "document.body.innerText='界面资源缺失：" + e.getMessage() + "'"; }
    }

    // ---------- 全面屏适配 ----------
    // 页面铺满整个屏幕（包括状态栏、底部手势条 / 导航栏后面）；顶部 / 底部留白由页面按 --sa-top / --sa-bottom 自己留，
    // 这样顶栏、侧栏、弹窗遮罩的颜色会一直填到屏幕边缘。左右（横屏时的导航栏 / 刘海）由外层留白；键盘弹出时外层底部让出键盘高度
    int saT = 0, saB = 0; String saSig = "";
    void edgeToEdge() {
        android.view.Window win = getWindow();
        try {
            if (android.os.Build.VERSION.SDK_INT >= 28) { android.view.WindowManager.LayoutParams lp = win.getAttributes(); lp.layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES; win.setAttributes(lp); }
            if (android.os.Build.VERSION.SDK_INT >= 30) win.setDecorFitsSystemWindows(false);
            else { android.view.View d = win.getDecorView(); d.setSystemUiVisibility(d.getSystemUiVisibility() | android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION); }
            if (android.os.Build.VERSION.SDK_INT >= 29) { win.setStatusBarContrastEnforced(false); win.setNavigationBarContrastEnforced(false); }
        } catch (Exception ignored) {}
        root.setOnApplyWindowInsetsListener((v, ins) -> {
            int t, b, l, r, ime;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets sb = ins.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                t = sb.top; b = sb.bottom; l = sb.left; r = sb.right;
                ime = ins.isVisible(android.view.WindowInsets.Type.ime()) ? ins.getInsets(android.view.WindowInsets.Type.ime()).bottom : 0;
            } else {
                t = ins.getSystemWindowInsetTop(); l = ins.getSystemWindowInsetLeft(); r = ins.getSystemWindowInsetRight();
                int sys = ins.getSystemWindowInsetBottom(), st = ins.getStableInsetBottom();
                b = Math.min(sys, st); ime = sys > st ? sys : 0;
                if (android.os.Build.VERSION.SDK_INT >= 28 && ins.getDisplayCutout() != null) { android.view.DisplayCutout c = ins.getDisplayCutout(); t = Math.max(t, c.getSafeInsetTop()); l = Math.max(l, c.getSafeInsetLeft()); r = Math.max(r, c.getSafeInsetRight()); }
            }
            boolean kb = ime > b;
            v.setPadding(l, 0, r, kb ? ime : 0);
            float d = getResources().getDisplayMetrics().density;
            setInsets(Math.round(t / d), kb ? 0 : Math.round(b / d));
            return android.os.Build.VERSION.SDK_INT >= 30 ? android.view.WindowInsets.CONSUMED : ins.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }
    String insetJs() { return "try{var s=document.documentElement.style;s.setProperty('--sa-top','" + saT + "px');s.setProperty('--sa-bottom','" + saB + "px');window.__ancInsets&&window.__ancInsets(" + saT + "," + saB + ")}catch(e){}"; }
    void setInsets(int t, int b) {
        String sig = t + "," + b; if (sig.equals(saSig)) return; saSig = sig; saT = t; saB = b;
        String js = insetJs();
        for (WebView w : new ArrayList<>(webs.values())) { try { w.evaluateJavascript(js, null); } catch (Exception ignored) {} }
    }

    void applyBars(int bg, boolean dark) {
        android.view.Window win = getWindow();
        win.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        // 全面屏：状态栏 / 导航栏透明，页面自己画到顶和底（颜色跟着页面走：顶栏、侧栏、遮罩都能填满）
        win.setStatusBarColor(Color.TRANSPARENT);
        win.setNavigationBarColor(Color.TRANSPARENT);
        if (root != null) root.setBackgroundColor(bg);
        android.view.View d = win.getDecorView();
        int f = d.getSystemUiVisibility();
        if (android.os.Build.VERSION.SDK_INT >= 23) f = dark ? (f & ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f | android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (android.os.Build.VERSION.SDK_INT >= 26) f = dark ? (f & ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        d.setSystemUiVisibility(f);
        sp.edit().putInt("barBg", bg).putBoolean("barDark", dark).apply();
    }

    // ---------- JS 桥 ----------
    class Bridge {
        final String acctId;
        Bridge(String id) { acctId = id; }
        WebView own() { return webs.get(acctId); }
        // 状态栏 / 导航栏颜色跟随界面深浅色（只听当前显示的账号页面的）
        @JavascriptInterface public void setBars(String json) {
            if (!acctId.equals(curId)) return;
            try {
                JSONObject o = new JSONObject(json);
                final int bg = Color.parseColor(o.optString("bg", "#faf9f7"));
                final boolean dark = o.optBoolean("dark", false);
                runOnUiThread(() -> applyBars(bg, dark));
            } catch (Exception ignored) {}
        }
        @JavascriptInterface public String info() {
            try {
                JSONObject a; synchronized (acctLock) { a = find(acctId); }
                return new JSONObject().put("platform", "android").put("version", BuildConfigVersion()).put("account", a == null ? JSONObject.NULL : pubX(a))
                        .put("privacy", new JSONObject().put("webrtc", docStart ? "disabled" : "network-blocked").put("google", "account-proxy").put("blocked", proxyBlocked).put("timezone", java.util.TimeZone.getDefault().getID()).put("locale", java.util.Locale.getDefault().toLanguageTag()).put("warning", "安卓沿用系统时区和语言，避免仅修改 JS 导致请求头/Worker 不一致；无法保证完整浏览器指纹隔离"))
                        .put("routeDraft", true).put("multiProfile", multiProfile).put("multi", multiOn()).put("bg", !acctId.equals(curId)).put("proxySupported", proxySupported).put("gnode", gnode() == null ? JSONObject.NULL : gnode().optString("name", "VLESS 节点")).toString();
            } catch (Exception e) { return "{}"; }
        }
        // Do not serialize accounts while blocking WebView's JavaScript thread.
        // Result expires even if the page closes before collecting it.
        private final java.util.concurrent.ConcurrentHashMap<String, String> accountJobs = new java.util.concurrent.ConcurrentHashMap<>();
        @JavascriptInterface public String listAccountsStart(final String lite) {
            final String mode = "1".equals(lite) ? "1" : "0", id = newId();
            String existing = accountJobs.putIfAbsent(mode, id); if (existing != null) return existing;
            probeJobs.put(id, "");
            ui.postDelayed(() -> probeJobs.remove(id), 30000);
            Thread t = new Thread(() -> {
                String result;
                try { result = "1".equals(lite) ? listAccountsLite() : listAccounts(); }
                catch (Exception e) { result = "{\"error\":\"账号列表读取失败\"}"; }
                probeJobs.replace(id, result);
                accountJobs.remove(mode, id);
            }, "account-list");
            t.setDaemon(true); t.start(); return id;
        }
        @JavascriptInterface public String listAccounts() {
            JSONArray r = new JSONArray();
            synchronized (acctLock) { for (int i = 0; i < accounts.length(); i++) { JSONObject o = pubX(accounts.optJSONObject(i)); try { o.put("live", webs.containsKey(o.optString("id"))); } catch (Exception ignored) {} r.put(o); } return r.toString(); }
        }
        // 精简版：统计里去掉每个型号的对话明细（最大的部分）。选账号页每秒刷新抽卡进度用这个，不再每次序列化几百 KB
        @JavascriptInterface public String listAccountsLite() {
            JSONArray r = new JSONArray();
            synchronized (acctLock) {
                for (int i = 0; i < accounts.length(); i++) {
                    JSONObject o = pubX(accounts.optJSONObject(i));
                    try {
                        o.put("live", webs.containsKey(o.optString("id")));
                        JSONObject st = o.optJSONObject("status");
                        if (st != null && st.has("stats")) {
                            JSONObject full = st.optJSONObject("stats"), lite = null; String aid = o.optString("id");
                            Object[] c = liteMap.get(aid);
                            if (c != null && c[0] == full) lite = (JSONObject) c[1]; else { lite = liteStats(full); liteMap.put(aid, new Object[] { full, lite }); }
                            java.util.List<String> keys = new java.util.ArrayList<>(); java.util.Iterator<String> it = st.keys();
                            while (it.hasNext()) { String k = it.next(); if (!"stats".equals(k)) keys.add(k); }
                            JSONObject s2 = new JSONObject(st, keys.toArray(new String[0]));
                            if (lite != null) s2.put("stats", lite);
                            o.put("status", s2);
                        }
                    } catch (Exception ignored) {}
                    r.put(o);
                }
                return r.toString(); // Snapshot under the same lock as status updates.
            }
        }
        // ---- 多账号：后台抽卡 / 命令 / 界面就绪 ----
        @JavascriptInterface public String bgWork(String json) {
            try { JSONObject o = new JSONObject(json); synchronized (work) { work.put(acctId, new long[] { o.optBoolean("gacha") ? 1 : 0, o.optInt("queue"), o.optInt("stream"), System.currentTimeMillis() }); } ui.post(MainActivity.this::recalcWork); } catch (Exception ignored) {}
            return "true";
        }
        @JavascriptInterface public String gnet() {
            if (System.currentTimeMillis() - gNetAt > 60_000) gProbe();
            try { return new JSONObject().put("ok", gNet == 1).put("tested", gNet >= 0).put("ms", gNetMs).put("wanted", gWanted()).put("on", gOn()).toString(); } catch (Exception e) { return "null"; }
        }
        @JavascriptInterface public String bgStatus() {
            try {
                boolean ign = true;
                if (android.os.Build.VERSION.SDK_INT >= 23) { android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE); ign = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()); }
                return new JSONObject().put("battery", ign).put("service", KeepService.inst != null).put("busy", KeepService.busy).put("text", KeepService.text).put("maker", String.valueOf(android.os.Build.MANUFACTURER)).put("front", acctId.equals(curId)).put("asked", sp.getBoolean("bgAsked", false)).toString();
            } catch (Exception e) { return "null"; }
        }
        @JavascriptInterface public String bgAllow(String kind) {
            ui.post(() -> {
                String k = kind == null ? "battery" : kind;
                if ("asked".equals(k)) { sp.edit().putBoolean("bgAsked", true).apply(); return; }
                if ("battery".equals(k) && android.os.Build.VERSION.SDK_INT >= 23) {
                    try { openSys(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); return; } catch (Exception ignored) {}
                    try { openSys(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); return; } catch (Exception ignored) {}
                }
                if ("autostart".equals(k)) {
                    String[][] cs = { { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" }, { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" }, { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" }, { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" }, { "com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity" }, { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" }, { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" }, { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity" } };
                    for (String[] c : cs) { try { openSys(new Intent().setComponent(new android.content.ComponentName(c[0], c[1]))); return; } catch (Exception ignored) {} }
                }
                try { openSys(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) {}
            });
            return "true";
        }
        @JavascriptInterface public String multiOk() { return multiOn() ? "true" : "false"; }
        // 不能后台多开时（单账号模式）：切换到那个账号，载入后自动开始抽卡
        @JavascriptInterface public String gachaSwitch(String id) {
            final JSONObject a; synchronized (acctLock) { a = find(id); }
            if (a == null) return "{\"error\":\"账号不存在\"}";
            pendCmd.put(id, "gacha-start"); ui.post(() -> openAccount(id));
            return "{\"ok\":true}";
        }
        // 任务完成通知：App 在前台、而且就是这个账号在最前面时不弹（正看着呢）
        @JavascriptInterface public String notify(String json) {
            try {
                JSONObject o = new JSONObject(json);
                if (!inBg && acctId.equals(curId)) return "skip";
                final String t = o.optString("title", "任务完成"), b = o.optString("body", ""), sid = o.optString("sid", "");
                ui.post(() -> postDone(acctId, t, b, sid));
                return "ok";
            } catch (Exception e) { return "err"; }
        }
        @JavascriptInterface public String notifyPerm(String ask) {
            try {
                boolean g = android.os.Build.VERSION.SDK_INT < 33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                boolean asked = sp.getBoolean("notifAsked", false);
                if (!g && "1".equals(ask) && !asked) { sp.edit().putBoolean("notifAsked", true).apply(); ui.post(() -> { try { ownAct = true; requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 77); } catch (Exception ignored) {} }); }
                return new JSONObject().put("granted", g).put("asked", asked).toString();
            } catch (Exception e) { return "null"; }
        }
        @JavascriptInterface public String takeOpen() { String s = pendOpen.remove(acctId); return s == null ? "null" : JSONObject.quote(s); }
        @JavascriptInterface public String takeCmd() { cmdReady.add(acctId); String c = pendCmd.remove(acctId); return c == null ? "null" : JSONObject.quote(c); }
        @JavascriptInterface public String ready() { ui.post(() -> finishSwitch(acctId)); return "true"; }
        @JavascriptInterface public String gachaAccount(String id, String cmd) {
            try {
                if (!multiOn()) return new JSONObject().put("error", "此设备不支持多账号后台运行（需要新版 Android System WebView）").toString();
                if (!"start".equals(cmd) && !"stop".equals(cmd)) return new JSONObject().put("error", "参数不正确").toString();
                final JSONObject a; synchronized (acctLock) { a = find(id); }
                if (a == null) return new JSONObject().put("error", "账号不存在").toString();
                ui.post(() -> {
                    if (webs.containsKey(id) && cmdReady.contains(id)) { try { sendCmd(id, new JSONObject().put("gacha", cmd)); } catch (Exception ignored) {} if ("start".equals(cmd)) markGacha(id, true, "启动中"); return; }
                    if (webs.containsKey(id)) { if ("start".equals(cmd)) { pendCmd.put(id, "gacha-start"); markGacha(id, true, "后台启动中"); } else { pendCmd.remove(id); markGacha(id, false, ""); } return; }   // 页面还在载入：等它启动时取
                    if ("stop".equals(cmd)) { pendCmd.remove(id); markGacha(id, false, ""); return; }
                    pendCmd.put(id, "gacha-start"); markGacha(id, true, bgQ.isEmpty() && !bgRun ? "后台启动中" : "排队启动中");
                    bgCreate(id);
                });
                return new JSONObject().put("ok", true).put("hidden", !webs.containsKey(id)).toString();
            } catch (Exception e) { return "{\"error\":\"失败\"}"; }
        }
        // Name-only update: keep proxy/xout/region/password/status and the running profile untouched.
        @JavascriptInterface public String renameAccount(String id, String value) {
            synchronized (acctLock) {
                try {
                    JSONObject a = find(id);
                    String name = value == null ? "" : value.trim();
                    if (a == null) throw new Exception("账号已删除，请重新打开账号列表");
                    if (name.isEmpty() || name.length() > 40 || name.matches("(?s).*[\\x00-\\x1f\\x7f].*")) throw new Exception("名称须为 1–40 个字符，不能包含控制字符");
                    Object before = a.opt("remark");
                    a.put("remark", name);
                    if (!sp.edit().putString("list", accounts.toString()).putString("cur", curId).commit()) { if (before == null) a.remove("remark"); else a.put("remark", before); throw new Exception("名称保存失败，请检查存储空间后重试"); }
                    return new JSONObject().put("ok", true).put("id", id).put("name", name).put("remark", name).toString();
                } catch (Exception e) {
                    try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception ignored) { return "null"; }
                }
            }
        }
        @JavascriptInterface public String saveAccount(String json) { synchronized (acctLock) { return saveAccount0(json); } }
        String saveAccount0(String json) {
            try {
                JSONObject in = new JSONObject(json);
                if (routeSupport.applying.get()) throw new Exception("账号线路正在保存，请等待结果");
                String id = in.optString("id", "");
                String email = in.has("email") && !in.isNull("email") ? in.optString("email", "").trim() : null;
                JSONObject a = id.isEmpty() ? null : find(id);
                if (a == null && id.isEmpty() && email != null) a = byEmail(email);
                // 带了账号 ID 但本机已经没有这个账号 = 它刚被删除，这是一次过期的保存（后台线路池 / 测速 / 旧页面还拿着删除前的列表）。
                // 以前这里会当成「新账号」建出来，删掉的账号就又冒出来了。
                if (!id.isEmpty() && a == null) throw new Exception("这个账号已被删除或不存在，已忽略本次保存");
                // A metadata-only identity update must not reset the account's route.
                String proxy = in.has("proxy") && !in.isNull("proxy") ? in.optString("proxy", "").trim() : (a == null ? "" : a.optString("proxy", ""));
                if (proxyErr(proxy) != null) throw new Exception(proxyErr(proxy));
                JSONObject other = email == null || email.isEmpty() ? null : byEmail(email);
                if (other != null && a != null && other != a) throw new Exception("该邮箱已在另一个账号里：" + other.optString("name"));
                String pip = in.has("proxyIp") && !in.isNull("proxyIp") ? in.optString("proxyIp", "").trim() : (a == null ? "" : a.optString("proxyIp", ""));
                String xout = in.has("xout") && !in.isNull("xout") ? in.optString("xout", "") : (a == null ? "" : a.optString("xout", ""));
                if (!isVless(proxy)) { pip = ""; xout = ""; }
                if (!pip.isEmpty()) for (int i = 0; i < accounts.length(); i++) { JSONObject x = accounts.optJSONObject(i); if (x != null && x != a && pip.equalsIgnoreCase(x.optString("proxyIp", "").trim())) throw new Exception("ProxyIP「" + pip + "」已被账号「" + x.optString("name") + "」使用，每个账号的 ProxyIP 不能相同"); }
                routeSupport.guardChange(a, in, a == null);
                if (in.has("routeMode") && !AuthRouteState.validMode(in.optString("routeMode"))) throw new Exception("连接模式无效");
                boolean changed = false, isNew = a == null;
                if (a == null) { a = new JSONObject().put("id", newId()); accounts.put(a); }
                else changed = !proxy.equals(a.optString("proxy")) || !pip.equals(a.optString("proxyIp", "")) || !xout.equals(a.optString("xout", ""));
                if (in.has("routeMode")) AuthRouteState.prefs(a, in.optString("routeMode"));
                if (in.has("nodeFailover") && "node".equals(AuthRouteState.mode(a))) a.put("nodeFailover", in.optBoolean("nodeFailover"));
                a.put("proxyIp", pip).put("xout", xout);
                if (in.has("nodeId") && !in.isNull("nodeId")) a.put("nodeId", in.optString("nodeId", ""));
                if (in.has("region") && !in.isNull("region")) a.put("region", in.optString("region", "").toUpperCase().replaceAll("[^A-Z]", ""));
                String name = in.optString("name", "").trim();
                if (name.isEmpty()) name = a.optString("name", "");
                if (name.isEmpty()) name = email != null && !email.isEmpty() ? email : "账号";
                if (in.has("remark") && !in.isNull("remark")) { String remark = in.optString("remark", "").trim().replaceAll("[\\x00-\\x1f\\x7f]", ""); a.put("remark", remark.substring(0, Math.min(40, remark.length()))); }
                a.put("name", name).put("proxy", proxy);
                if (email != null) { if (!email.equals(a.optString("email", ""))) a.remove("status"); a.put("email", email); }
                if (in.has("password") && !in.isNull("password") && !in.optString("password", "").isEmpty()) { String pw = in.optString("password", ""); a.put("pw", encPw(pw)); if (!pw.isEmpty()) a.put("noAuto", false); }
                if (in.optBoolean("clearPassword", false)) { a.remove("pw"); a.put("noAuto", true); }
                saveAccounts();
                final JSONObject fa = a;
                if (!in.optBoolean("deferProxy", false) && (changed || isNew)) ui.post(() -> proxyChanged(fa));
                return pubX(a).toString();
            } catch (Exception e) { try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "null"; } }
        }
        @JavascriptInterface public String removeAccount(String id) { return MainActivity.this.removeAccountChecked(id); }
        @JavascriptInterface public String openAccount(String id) { ui.post(() -> MainActivity.this.openAccount(id)); return "true"; }
        @JavascriptInterface public String enterAccount(String id) { pendEnter.add(id); ui.post(() -> MainActivity.this.openAccount(id)); return "true"; }
        @JavascriptInterface public String takeEnter() { return pendEnter.remove(acctId) ? "1" : "0"; }
        @JavascriptInterface public String insets() { return "[" + saT + "," + saB + "]"; }
        @JavascriptInterface public String login() { ui.post(() -> { WebView w = own(); if (w != null) w.loadUrl(LOGIN); }); return "true"; }
        // 注册 / 找回密码邮件里的链接：在当前账号的 WebView 里打开（只接受 https）
        @JavascriptInterface public String openAuth(String url) {
            final String u;
            try { Uri parsed = Uri.parse(url == null ? "" : url); String host = parsed.getHost();
                if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getUserInfo() != null || (parsed.getPort() != -1 && parsed.getPort() != 443) || !("arena.ai".equalsIgnoreCase(host) || "auth.arena.ai".equalsIgnoreCase(host))) return "false";
                u = parsed.toString();
            } catch (Exception e) { return "false"; }
            ui.post(() -> { WebView w = own(); if (w != null) w.loadUrl(u); }); return "true";
        }
        @JavascriptInterface public String back() { return back(""); }
        @JavascriptInterface public String back(final String mode) {
            ui.post(() -> {
                WebView w = own(); if (w == null) return;
                final String target = "browse".equals(mode) ? (UI + "?browse=1") : UI;
                if ("browse".equals(mode)) { try { w.getSettings().setBlockNetworkLoads(false); } catch (Exception ignored) {} w.loadUrl(target); return; }
                if (multiActive) ensureMultiThen(() -> w.loadUrl(target)); else w.loadUrl(target);
            });
            return "true";
        }
        @JavascriptInterface public String logout() {
            synchronized (acctLock) {
                JSONObject a = find(acctId);
                if (a != null) { try { a.put("noAuto", true); JSONObject st = a.optJSONObject("status"); if (st == null) st = new JSONObject(); a.put("status", st.put("loggedIn", false)); } catch (Exception ignored) {} saveAccounts(); }
            }
            ui.post(() -> { final CookieManager cm = cookiesOf(acctId); cm.removeAllCookies(v -> { cm.flush(); WebView w = own(); if (w != null) w.loadUrl(UI); }); });
            return "true";
        }
        @JavascriptInterface public String getCred() {
            try {
                JSONObject a; synchronized (acctLock) { a = find(acctId); }
                if (a == null || a.optBoolean("noAuto") || a.optString("email", "").isEmpty()) return "null";
                String pw = decPw(a.optString("pw", ""));
                return pw.isEmpty() ? "null" : new JSONObject().put("email", a.optString("email")).put("password", pw).toString();
            } catch (Exception e) { return "null"; }
        }
        @JavascriptInterface public String launchPick() {
            synchronized (MainActivity.class) { if (launchShown) return "0"; launchShown = true; return "1"; }
        }
        @JavascriptInterface public String noteAccount(String json) { synchronized (acctLock) { return noteAccount0(json); } }
        String noteAccount0(String json) {
            try {
                JSONObject in = new JSONObject(json), a = find(acctId);
                if (a == null) return "false";
                JSONObject st = a.optJSONObject("status"); if (st == null) st = new JSONObject();
                for (String k : new String[]{"loggedIn", "ip", "loc"}) if (in.has(k) && !in.isNull(k)) st.put(k, in.get(k));
                if (in.has("email") && !in.isNull("email")) st.put("me", in.optString("email"));
                JSONObject q = in.optJSONObject("quota");
                if (q != null) { JSONObject old = st.optJSONObject("quota"); if (old == null) old = new JSONObject(); java.util.Iterator<String> it = q.keys(); while (it.hasNext()) { String k = it.next(); if (!q.isNull(k)) old.put(k, q.get(k)); } st.put("quota", old); }
                // 账号统计（各厂商 / 各型号对话数、金色传说），启动选账号页用
                JSONObject so = in.optJSONObject("stats");
                if (so != null && so.toString().length() < 800000) { st.put("stats", so); liteMap.put(acctId, new Object[] { so, liteStats(so) }); }
                // 抽卡进度（账号菜单 / 账号面板里显示各账号的后台抽卡状态）
                JSONObject g = in.optJSONObject("gacha");
                if (g != null) {
                    JSONArray lg = g.optJSONArray("log");
                    if (lg != null && lg.length() > 12) { JSONArray t = new JSONArray(); for (int i = lg.length() - 12; i < lg.length(); i++) t.put(lg.get(i)); g.put("log", t); }
                    g.put("at", System.currentTimeMillis()); st.put("gacha", g);
                }
                if (in.has("statsBusy") && !in.isNull("statsBusy")) st.put("statsBusy", in.optString("statsBusy", ""));
                if (in.optBoolean("statsDone")) { st.put("statsBusy", ""); st.put("statsErr", in.optString("statsErr", "")); st.put("statsAt", System.currentTimeMillis()); }
                st.put("at", System.currentTimeMillis());
                a.put("status", st);
                if (in.optBoolean("loggedIn")) a.put("noAuto", false);
                if (a.optString("email", "").isEmpty() && in.has("email") && byEmail(in.optString("email")) == null) a.put("email", in.optString("email"));
                saveAccounts();
                return "true";
            } catch (Exception e) { return "false"; }
        }
        @JavascriptInterface public String fingerprintStart(final String op,final String revision,final String payload) {
            if(payload!=null&&payload.length()>FingerprintStore.LIMIT)return null;
            if(FingerprintStore.PENDING.incrementAndGet()>8){FingerprintStore.PENDING.decrementAndGet();return null;}
            final String id=newId();probeJobs.put(id, "");ui.postDelayed(()->probeJobs.remove(id),120000);
            FingerprintStore.IO.execute(()->{try{probeJobs.replace(id,FingerprintStore.request(getFilesDir(),op,revision,payload));}finally{FingerprintStore.PENDING.decrementAndGet();}});
            return id;
        }
        @JavascriptInterface public String sharedGet(String k) {
            if (k != null && k.matches("mailtok@[\\w-]{1,64}")) {   // 邮箱令牌：刷新令牌 / 注册密码编码保存
                try { JSONObject f = new JSONObject(sp.getString("shared_" + k, "null")); String rt = decPw(f.optString("rt", "")); return rt.isEmpty() ? "null" : new JSONObject().put("email", f.optString("email")).put("clientId", f.optString("clientId")).put("refreshToken", rt).put("pw", decPw(f.optString("pw", ""))).put("at", f.optLong("at")).toString(); } catch (Exception e) { return "null"; }
            }
            if ("fixedpw".equals(k)) {   // 固定密码 {on, pw}：落盘时和记住的账号密码一样做编码，读出来时还原
                try { JSONObject f = new JSONObject(sp.getString("shared_fixedpw", "null")); String pw = decPw(f.optString("pw", "")); return f.optBoolean("on") && !pw.isEmpty() ? new JSONObject().put("on", true).put("pw", pw).toString() : "null"; } catch (Exception e) { return "null"; }
            }
            if ("caproute".equals(k)) { String c = capSpec(); try { return c.isEmpty() ? "null" : JSONObject.quote(c); } catch (Exception e) { return "null"; } }
            if (!"prefs".equals(k) && !"gacha".equals(k) && !"nodes".equals(k) && !"nodesubs".equals(k) && !"proxyips".equals(k) && !"pippool".equals(k) && !"archbl".equals(k) && !"strsamples".equals(k) && !"fmtcal".equals(k) && !"gnode".equals(k) && !"pelshots".equals(k) && !"pelican".equals(k) && !"habitLearnBank".equals(k) && !"habitCalibration".equals(k) && !(k != null && (k.matches("(gacha|draft|gtok|signup|mailtok|webreg)@[\\w-]{1,64}") || k.matches("(hist|models)@[\\w-]{1,64}")))) return "null";
            return sp.getString("shared_" + k, "null");
        }
        @JavascriptInterface public String sharedSet(String k, String v) {
            if (k != null && k.matches("mailtok@[\\w-]{1,64}")) {
                try {
                    if (v == null || "null".equals(v)) return sp.edit().remove("shared_" + k).commit() ? "true" : "false";
                    JSONObject f = new JSONObject(v); String rt = f.optString("refreshToken", ""), pw = f.optString("pw", ""), em = f.optString("email", ""), cid = f.optString("clientId", "");
                    if (!em.contains("@") || !cid.matches("[0-9a-fA-F-]{36}") || rt.length() < 20 || rt.length() > 8000 || pw.length() > 200) return "false";
                    return sp.edit().putString("shared_" + k, new JSONObject().put("email", em).put("clientId", cid).put("rt", encPw(rt)).put("pw", encPw(pw)).put("at", System.currentTimeMillis()).toString()).commit() ? "true" : "false";
                } catch (Exception e) { return "false"; }
            }
            if ("fixedpw".equals(k)) {
                try {
                    if (v == null || "null".equals(v)) return sp.edit().remove("shared_fixedpw").commit() ? "true" : "false";
                    JSONObject f = new JSONObject(v); String pw = f.optString("pw", "");
                    if (!f.optBoolean("on") || pw.isEmpty() || pw.length() > 200) return "false";
                    return sp.edit().putString("shared_fixedpw", new JSONObject().put("on", true).put("pw", encPw(pw)).toString()).commit() ? "true" : "false";
                } catch (Exception e) { return "false"; }
            }
            if ("caproute".equals(k)) {
                String c; try { Object o = v == null ? "" : new org.json.JSONTokener(v).nextValue(); c = capNormalize(o instanceof String ? (String) o : ""); } catch (Exception e) { c = null; }
                if (c == null) return jsonErr("备用代理格式不对：应为 http://主机:端口、socks5://主机:端口（可带 用户名:密码@），或填 local 用本机网络");
                String had = capSpec();
                if (!sp.edit().putString("shared_caproute", c.isEmpty() ? "null" : JSONObject.quote(c)).commit()) return jsonErr("保存失败");
                if (!had.equals(c)) {
                    if (routeSupport.anyLocked() || routeSupport.applying.get()) return jsonErr("已保存，但有账号正在认证或线路正在切换，暂不重建共享线路；完成或取消认证后会自动生效");
                    ui.post(() -> { if (multiActive) ensureMultiThen(null); });
                }
                return "true";
            }
            if (!"prefs".equals(k) && !"gacha".equals(k) && !"nodes".equals(k) && !"nodesubs".equals(k) && !"proxyips".equals(k) && !"pippool".equals(k) && !"archbl".equals(k) && !"strsamples".equals(k) && !"fmtcal".equals(k) && !"pelshots".equals(k) && !"pelican".equals(k) && !"habitLearnBank".equals(k) && !"habitCalibration".equals(k) && !(k != null && (k.matches("(gacha|draft|gtok|signup|mailtok|webreg)@[\\w-]{1,64}") || k.matches("(hist|models)@[\\w-]{1,64}")))) return "false";
            if (k.startsWith("signup@")) {
                try {
                    JSONObject a; synchronized (acctLock) { a = find(k.substring(7)); }
                    if (a == null) return "false";
                    String clean = "null";
                    if (v != null && !"null".equals(v)) {
                        JSONObject task = new JSONObject(v);
                        String email = task.optString("email", "").trim();
                        long at = task.optLong("at", 0), now = System.currentTimeMillis();
                        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches() || !email.equalsIgnoreCase(a.optString("email", "").trim()) || at <= 0 || at > now + 60000 || now - at > 30 * 60000) return "false";
                        clean = new JSONObject().put("email", email).put("at", at).toString();
                    }
                    // Registration intent contains metadata only; confirm durable write before opening its account.
                    return sp.edit().putString("shared_" + k, clean).commit() ? "true" : "false";
                } catch (Exception ignored) { return "false"; }
            }
            String prev = sp.getString("shared_" + k, "null");
            // 草稿 / 队列：同步写盘（commit），写完才返回——紧接着闪退 / 被杀也不丢
            if (k.startsWith("draft@") || k.startsWith("webreg@")) sp.edit().putString("shared_" + k, v == null ? "null" : v).commit();
            else sp.edit().putString("shared_" + k, v == null ? "null" : v).apply();
            // 旧设置兼容入口；gReapply 不再改变 Google 的账号出口
            if ("prefs".equals(k) && !String.valueOf(v).equals(prev)) {
                boolean a0 = true, a1 = true;
                try { a0 = new JSONObject(prev).optBoolean("gDirect", true); } catch (Exception ignored) {}
                try { a1 = new JSONObject(String.valueOf(v)).optBoolean("gDirect", true); } catch (Exception ignored) {}
                if (a0 != a1) ui.post(MainActivity.this::gReapply);
            }
            // 全局节点变了：没设代理（默认）的当前账号立即改走新节点
            if ("gnode".equals(k) && !String.valueOf(v).equals(prev)) {
                final JSONObject a = find(curId);
                if (multiActive) ui.post(() -> proxyChanged(null));
                else if (a != null && a.optString("proxy", "").trim().isEmpty()) ui.post(() -> proxyChanged(a));
            }
            return "true";
        }
        @JavascriptInterface public String exportAccounts() {
            JSONArray r = new JSONArray();
            try {
                for (int i = 0; i < accounts.length(); i++) {
                    JSONObject a = accounts.optJSONObject(i);
                    r.put(new JSONObject().put("id", a.optString("id")).put("name", a.optString("name")).put("remark", a.optString("remark", "")).put("email", a.optString("email", "")).put("password", decPw(a.optString("pw", ""))).put("proxy", a.optString("proxy", "")).put("proxyIp", a.optString("proxyIp", "")).put("region", a.optString("region", "")).put("nodeId", a.optString("nodeId", "")));
                }
            } catch (Exception ignored) {}
            return r.toString();
        }
        @JavascriptInterface public String setCookies(String id, String json) {
            try {
                JSONArray list = new JSONArray(json);
                final java.util.List<String> lines = new java.util.ArrayList<>();
                for (int i = 0; i < list.length(); i++) {
                    JSONObject c = list.optJSONObject(i); if (c == null) continue;
                    String n = c.optString("name", ""), v = c.optString("value", "");
                    if (!n.matches("^arena-auth-prod-v1(\\.\\d+)?$") || v.isEmpty()) continue;
                    lines.add(n + "=" + v + "; Domain=arena.ai; Path=/; Secure; SameSite=Lax; Max-Age=2592000");
                }
                ui.post(() -> { CookieManager cm = cookiesOf(id); for (String l : lines) cm.setCookie("https://arena.ai", l); cm.flush(); });
                return String.valueOf(lines.size());
            } catch (Exception e) { return "0"; }
        }
        @JavascriptInterface public String setTitle(String t) { return "true"; }
        @JavascriptInterface public String testIp(String json) {
            String px = "", xout = "";
            try { JSONObject o = new JSONObject(json); px = o.optString("proxy", ""); xout = o.optString("xout", ""); } catch (Exception ignored) {}
            if (px.trim().isEmpty()) { JSONObject g = gnode(); if (g != null) { px = g.optString("link"); xout = g.optString("xout"); } }
            if (!isVless(px)) return testIpNow(px);
            // 节点：临时开一个 xray 入口测出口 IP，测完关掉（不影响当前连接）
            Tun t = null;
            try {
                t = startTun(xout, "test-" + newId(), "info");
                String r = testIpNow("http://127.0.0.1:" + t.port);
                // 失败时：① 再经同一个节点访问一个不在 Cloudflare 上的网址，区分「节点不通」和「节点通、但到 Brana（Cloudflare）不通 = 缺 ProxyIP」
                // ② 附上 xray 自己日志里的失败原因（出站失败只在 info 级别输出）
                try {
                    JSONObject o = new JSONObject(r);
                    if (o.has("error")) {
                        int alt = reach("http://127.0.0.1:" + t.port, "https://www.gstatic.com/generate_204");
                        try { Thread.sleep(400); } catch (InterruptedException ignored) {}
                        String m = tail(t.log);
                        if (alt > 0) {
                            o.put("code", "needPip");
                            o.put("error", "节点本身能连通（已访问 Google），但到 Brana 的连接被节点关闭：Brana 在 Cloudflare 上，CF Workers / Pages 类节点必须配可用的 ProxyIP 才能访问" + (xoutPip(xout).isEmpty() ? "——当前没有可用的 ProxyIP，先在下面「ProxyIP 池」导入（可点快速添加）" : "——这个 ProxyIP 不可用，换一个"));
                        } else if (!m.isEmpty()) o.put("error", o.optString("error") + "（xray：" + m + "）");
                        r = o.toString();
                    }
                } catch (Exception ignored) {}                return r;
            }
            catch (Exception e) { try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"失败\"}"; } }
            finally { if (t != null) { try { t.proc.destroy(); } catch (Exception ignored) {} } }
        }
        // ProxyIP 批量检测：{outs:[xray 出站...], timeout} → 一个 xray 开 N 个入口，逐个测 trace + robots.txt
        // 异步：probeStart 立即返回任务 id，界面轮询 probeGet（检测要十几秒，不能卡住 WebView 的 JS 线程）
        // 节点发现使用字面量地址的加密 DoH，不调用系统 DNS；订阅/辅助请求共用所属账号的出站配置。
        // 本机代理自动检测：扫常用代理端口 → 能连上的逐个按 HTTP、SOCKS5 实测能否访问 Brana（异步，界面轮询 probeGet）
        @JavascriptInterface public String localScanStart(final String json) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, localScan(json))); t.setDaemon(true); t.start(); return id; }
        @JavascriptInterface public String fetchStart(final String url) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, fetchSync(url, null, null))); t.setDaemon(true); t.start(); return id; }
        @JavascriptInterface public String protoFetchStart(final String path, final String optionsJson) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, protoFetchSync(path, optionsJson))); t.setDaemon(true); t.start(); return id; }
        void rememberAndroidCostDpl(String dpl, boolean verified) {
            if (dpl == null) return;
            String d = dpl.trim();
            if (!d.matches("^dpl_[A-Za-z0-9]{16,48}$")) return;
            if (verified) {
                expiredCostDpls.remove(d);
                costSkewPool.remove(d);
                costSkewPool.add(0, d);
                learnedCostDpl = d;
                try { if (sp != null) sp.edit().putString("learned_cost_dpl", d).apply(); } catch (Exception ignored) {}
                return;
            }
            if (expiredCostDpls.contains(d)) return;
            if (!costSkewPool.contains(d)) costSkewPool.add(d);
        }
        void demoteAndroidCostDpl(String dpl) {
            if (dpl == null) return;
            String d = dpl.trim();
            if (!d.matches("^dpl_[A-Za-z0-9]{16,48}$")) return;
            if (!coreCostDpls.contains(d)) {
                expiredCostDpls.add(d);
                costSkewPool.remove(d);
            } else if (costSkewPool.size() > 1) {
                costSkewPool.remove(d);
                costSkewPool.add(d);
            }
            if (d.equals(learnedCostDpl)) {
                learnedCostDpl = "";
                for (String cand : costSkewPool) {
                    if (cand != null && !cand.equals(d) && !expiredCostDpls.contains(cand)) { learnedCostDpl = cand; break; }
                }
            }
        }
        java.util.List<String> discoverFreshCostDplsAndroid(java.net.Proxy jp) {
            java.util.List<String> found = new java.util.ArrayList<>();
            long nowMs = System.currentTimeMillis();
            if (nowMs - lastAndroidSkewDiscoverAt < 25000L) return found;
            lastAndroidSkewDiscoverAt = nowMs;
            String[] urls = new String[]{"https://arena.ai/leaderboard/agent", "https://arena.ai/?mode=agent", "https://arena.ai/"};
            java.util.regex.Pattern[] pats = new java.util.regex.Pattern[]{
                java.util.regex.Pattern.compile("[?&]dpl=(dpl_[A-Za-z0-9]{16,48})\\b"),
                java.util.regex.Pattern.compile("\\\\?\"deploymentId\\\\?\"\\s*:\\s*\\\\?\"(dpl_[A-Za-z0-9]{16,48})\\\\?\""),
                java.util.regex.Pattern.compile("\\\\?\"dpl\\\\?\"\\s*:\\s*\\\\?\"(dpl_[A-Za-z0-9]{16,48})\\\\?\"")
            };
            for (String u : urls) {
                HttpURLConnection dc = null;
                try {
                    dc = (HttpURLConnection) new URL(u).openConnection(jp != null ? jp : java.net.Proxy.NO_PROXY);
                    dc.setConnectTimeout(3200);
                    dc.setReadTimeout(3200);
                    dc.setInstanceFollowRedirects(true);
                    dc.setRequestMethod("GET");
                    dc.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
                    dc.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
                    int code = dc.getResponseCode();
                    if (code >= 200 && code < 400) {
                        BufferedReader br = new BufferedReader(new InputStreamReader(dc.getInputStream(), StandardCharsets.UTF_8));
                        StringBuilder sb = new StringBuilder();
                        char[] buf = new char[8192]; int n;
                        while ((n = br.read(buf)) > 0) { sb.append(buf, 0, n); if (sb.length() > 1500000) break; }
                        String html = sb.toString();
                        for (java.util.regex.Pattern pat : pats) {
                            java.util.regex.Matcher m = pat.matcher(html);
                            while (m.find()) {
                                String id = m.group(1);
                                if (id != null && !expiredCostDpls.contains(id) && !found.contains(id)) {
                                    found.add(id);
                                    rememberAndroidCostDpl(id, false);
                                }
                            }
                        }
                        if (found.size() >= 2) break;
                    }
                } catch (Exception ignored) {
                } finally {
                    if (dc != null) try { dc.disconnect(); } catch (Exception ignored) {}
                }
            }
            return found;
        }
        String protoFetchSync(String path, String optionsJson) {
            HttpURLConnection c = null; Tun nativeTun = null; String nativeTag = null;
            try {
                String p = path == null ? "" : path.trim();
                String url = (p.startsWith("https://") || p.startsWith("http://")) ? p : ("https://arena.ai" + (p.startsWith("/") ? p : ("/" + p)));
                if (!url.startsWith("https://arena.ai/") && !url.startsWith("https://whatsmyllm.com/")) {
                    return new JSONObject().put("ok", false).put("status", 0).put("error", "PROTO_URL_FORBIDDEN").toString();
                }
                JSONObject opts = (optionsJson != null && !optionsJson.trim().isEmpty()) ? new JSONObject(optionsJson) : new JSONObject();
                String method = opts.optString("method", "GET").toUpperCase();
                String body = opts.isNull("body") ? null : opts.optString("body", null);
                int timeoutMs = Math.max(3000, Math.min(60000, opts.optInt("timeoutMs", 20000)));
                JSONObject account; synchronized (acctLock) { account = find(acctId); if (account != null) account = new JSONObject(account.toString()); }
                if (account == null) throw new Exception("ACCOUNT_NOT_FOUND");
                boolean isPub = url.startsWith("https://whatsmyllm.com/");
                java.net.Proxy jp;
                if (isDirect(eff(account).optString("proxy"))) {
                    jp = java.net.Proxy.NO_PROXY;
                } else if (acctId != null && acctId.equals(curId) && curTun != null && alive(curTun.proc) && curTun.port > 0) {
                    jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", curTun.port));
                } else {
                    nativeTag = "pfetch-" + newId(); nativeTun = startTun(outboundOf(account).toString(), nativeTag);
                    jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", nativeTun.port));
                }
                final boolean isCostShown = opts.optBoolean("costShown", false);
                String baseCk = "";
                if (!isPub) {
                    try {
                        final String[] ckHolder = new String[1];
                        long nowCk = System.currentTimeMillis();
                        String cachedCk = acctId != null ? protoCookieCache.get(acctId) : null;
                        Long cachedAt = acctId != null ? protoCookieAt.get(acctId) : null;
                        if (cachedCk != null && !cachedCk.isEmpty() && cachedAt != null && (nowCk - cachedAt) < 4000L) {
                            ckHolder[0] = cachedCk;
                        } else if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) {
                            CookieManager cm = cookiesOf(acctId);
                            ckHolder[0] = cm != null ? cm.getCookie("https://arena.ai") : null;
                            if (acctId != null && ckHolder[0] != null) { protoCookieCache.put(acctId, ckHolder[0]); protoCookieAt.put(acctId, nowCk); }
                        } else {
                            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
                            runOnUiThread(() -> {
                                try {
                                    CookieManager cm = cookiesOf(acctId);
                                    ckHolder[0] = cm != null ? cm.getCookie("https://arena.ai") : null;
                                    if (acctId != null && ckHolder[0] != null) { protoCookieCache.put(acctId, ckHolder[0]); protoCookieAt.put(acctId, System.currentTimeMillis()); }
                                } catch (Exception ignored) {} finally {
                                    latch.countDown();
                                }
                            });
                            latch.await(2500, java.util.concurrent.TimeUnit.MILLISECONDS);
                        }
                        baseCk = ckHolder[0] != null ? ckHolder[0] : "";
                    } catch (Exception ignored) {}
                }
                if (learnedCostDpl == null || learnedCostDpl.isEmpty()) {
                    try { if (sp != null) { String sv = sp.getString("learned_cost_dpl", ""); if (sv != null && !sv.isEmpty() && !expiredCostDpls.contains(sv)) rememberAndroidCostDpl(sv, false); } } catch (Exception ignored) {}
                }
                java.util.List<String> dplCandidates = new java.util.ArrayList<>();
                if (isCostShown) {
                    String reqSkew = opts.optString("skewDpl", "").trim();
                    if (!reqSkew.isEmpty() && !expiredCostDpls.contains(reqSkew)) rememberAndroidCostDpl(reqSkew, false);
                    if (learnedCostDpl != null && !learnedCostDpl.isEmpty() && !expiredCostDpls.contains(learnedCostDpl)) dplCandidates.add(learnedCostDpl);
                    if (!reqSkew.isEmpty() && !expiredCostDpls.contains(reqSkew) && !dplCandidates.contains(reqSkew)) dplCandidates.add(reqSkew);
                    for (String d : costSkewPool) {
                        if (d != null && !d.isEmpty() && !expiredCostDpls.contains(d) && !dplCandidates.contains(d)) dplCandidates.add(d);
                    }
                    if (dplCandidates.isEmpty()) dplCandidates.add("dpl_HAxwrhqRf48UW1Hf4MDQquRXSs7x");
                    dplCandidates.add("");
                } else {
                    dplCandidates.add(null);
                }

                boolean discoveredOnce = false;
                String lastResultJson = null;
                for (int idx = 0; idx < dplCandidates.size(); idx++) {
                    String skewDpl = dplCandidates.get(idx);
                    String activeSkewDpl = skewDpl != null ? skewDpl : "";
                    String curUrl = (isCostShown && !activeSkewDpl.isEmpty() && idx > 0)
                        ? (url + (url.contains("?") ? "&" : "?") + "dpl=" + activeSkewDpl)
                        : url;
                    if (c != null) { try { c.disconnect(); } catch (Exception ignored) {} c = null; }
                    c = (HttpURLConnection) new URL(curUrl).openConnection(jp);
                    c.setConnectTimeout(Math.min(12000, timeoutMs));
                    c.setReadTimeout(timeoutMs);
                    c.setInstanceFollowRedirects(!isPub);
                    c.setRequestMethod(method);
                    c.setRequestProperty("User-Agent", isPub ? "Mozilla/5.0 BranaAiFingerprint" : "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
                    c.setRequestProperty("Accept", "application/json, text/plain, */*");
                    if (!isPub) {
                        c.setRequestProperty("Origin", "https://arena.ai");
                        c.setRequestProperty("Referer", "https://arena.ai/");
                        String ck = baseCk;
                        if (isCostShown) {
                            if (!ck.isEmpty()) {
                                ck = ck.replaceAll("(^|;\\s*)__vdpl=[^;]*", "");
                                ck = ck.replaceAll("(^|;\\s*)ph-toolbar-overrides=[^;]*", "");
                                ck = ck.replaceAll("^;\\s*", "").trim();
                            }
                            String costCk = "ph-toolbar-overrides=%7B%22credit-system-m1%22%3A%22cost-shown%22%7D";
                            ck = ck.isEmpty() ? costCk : (ck + "; " + costCk);
                            if (!activeSkewDpl.isEmpty()) {
                                String vdplCk = "__vdpl=" + activeSkewDpl;
                                ck = ck + "; " + vdplCk;
                                c.setRequestProperty("x-deployment-id", activeSkewDpl);
                            }
                        }
                        if (!ck.isEmpty()) c.setRequestProperty("Cookie", ck);
                    } else {
                        c.setRequestProperty("Cookie", "");
                    }
                    JSONObject hdrs = opts.optJSONObject("headers");
                    if (hdrs != null) {
                        java.util.Iterator<String> it = hdrs.keys();
                        while (it.hasNext()) {
                            String hk = it.next();
                            String hv = hdrs.optString(hk, "");
                            if (hk != null && !hk.isEmpty() && hv != null) c.setRequestProperty(hk, hv);
                        }
                    }
                    if (body != null && !("GET".equals(method) || "HEAD".equals(method))) {
                        byte[] bb = body.getBytes(StandardCharsets.UTF_8);
                        c.setDoOutput(true);
                        c.setFixedLengthStreamingMode(bb.length);
                        if (c.getRequestProperty("Content-Type") == null) c.setRequestProperty("Content-Type", "application/json");
                        try (java.io.OutputStream os = c.getOutputStream()) { os.write(bb); }
                    }
                    int code = c.getResponseCode();
                    String respDpl = "";
                    boolean cfChallenge = false;
                    if (!isPub) {
                        try {
                            java.util.Map<String, java.util.List<String>> rh = c.getHeaderFields();
                            if (rh != null) {
                                CookieManager cm = cookiesOf(acctId);
                                boolean setCk = false;
                                for (java.util.Map.Entry<String, java.util.List<String>> en : rh.entrySet()) {
                                    if (en.getKey() != null && "cf-mitigated".equalsIgnoreCase(en.getKey())) {
                                        cfChallenge = true;
                                    } else if (en.getKey() != null && "set-cookie".equalsIgnoreCase(en.getKey()) && en.getValue() != null) {
                                        for (String sc : en.getValue()) {
                                            if (sc == null || sc.isEmpty()) continue;
                                            if (sc.trim().startsWith("__vdpl=")) continue;
                                            cm.setCookie("https://arena.ai", sc);
                                            setCk = true;
                                        }
                                    } else if (en.getKey() != null && "x-arena-api-deployment".equalsIgnoreCase(en.getKey()) && en.getValue() != null && !en.getValue().isEmpty()) {
                                        String hd = String.valueOf(en.getValue().get(0)).trim();
                                        if (hd.startsWith("dpl_") && hd.length() >= 20 && !coreCostDpls.contains(hd)) expiredCostDpls.add(hd);
                                    }
                                }
                                if (setCk) {
                                    if (acctId != null) protoCookieAt.remove(acctId);
                                    cm.flush();
                                }
                            }
                        } catch (Exception ignored) {}
                    }
                    java.io.InputStream is = (code >= 200 && code < 400) ? c.getInputStream() : c.getErrorStream();
                    StringBuilder b = new StringBuilder();
                    if (is != null) {
                        BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                        char[] buf = new char[8192]; int n;
                        while ((n = r.read(buf)) > 0) { b.append(buf, 0, n); if (b.length() > 8000000) break; }
                    }
                    String text = b.toString();
                    String ct = c.getContentType() == null ? "" : c.getContentType();
                    if (code == 403 && (cfChallenge || ct.toLowerCase().contains("text/html") || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html"))) {
                        cfChallenge = true;
                    }
                    boolean ok = code >= 200 && code < 300;
                    if (isCostShown && ok && !activeSkewDpl.isEmpty()) {
                        rememberAndroidCostDpl(activeSkewDpl, true);
                        respDpl = activeSkewDpl;
                    }
                    lastResultJson = new JSONObject()
                        .put("ok", ok)
                        .put("status", code)
                        .put("text", text)
                        .put("contentType", ct)
                        .put("dpl", respDpl)
                        .put("skewDpl", activeSkewDpl)
                        .put("triedAllSkew", idx >= dplCandidates.size() - 1 && !cfChallenge)
                        .toString();
                    if (code != 403 || !isCostShown || cfChallenge) break;
                    if (!activeSkewDpl.isEmpty()) demoteAndroidCostDpl(activeSkewDpl);
                    if (idx == dplCandidates.size() - 1 && !discoveredOnce) {
                        discoveredOnce = true;
                        java.util.List<String> fresh = discoverFreshCostDplsAndroid(jp);
                        for (String fd : fresh) {
                            if (fd != null && !fd.isEmpty() && !dplCandidates.contains(fd)) dplCandidates.add(fd);
                        }
                    }
                }
                return lastResultJson != null ? lastResultJson : "{\"ok\":false,\"status\":0,\"error\":\"EMPTY\"}";
            } catch (Exception e) {
                try { return new JSONObject().put("ok", false).put("status", 0).put("error", String.valueOf(e.getMessage())).toString(); }
                catch (Exception x) { return "{\"ok\":false,\"status\":0,\"error\":\"PROTO_FETCH_ERROR\"}"; }
            } finally {
                if (c != null) c.disconnect();
                if (nativeTun != null) nativeTun.proc.destroy();
                if (nativeTag != null) new File(new File(getFilesDir(), "xray"), nativeTag + ".json").delete();
            }
        }
        // ---------- 客户端更新：下载新版 apk（带进度、sha256 校验）→ 调起系统安装 ----------
        @JavascriptInterface public String updStart(final String json) {
            synchronized (MainActivity.this) {
                String ph = upd.optString("phase");
                if ("down".equals(ph) || "verify".equals(ph)) return "{\"ok\":true,\"busy\":true}";
                try { upd = new JSONObject().put("phase", "down").put("got", 0).put("total", 0).put("error", ""); } catch (Exception ignored) {}
            }
            Thread t = new Thread(() -> updRun(json, acctId)); t.setDaemon(true); t.start();
            return "{\"ok\":true}";
        }
        @JavascriptInterface public String updStatus() { return upd.toString(); }
        // 设备 ID（第一次用时随机生成，保存在本机；给更新服务记录哪台设备用了口令）和设备名
        @JavascriptInterface public String deviceInfo() {
            try {
                SharedPreferences dp = getSharedPreferences("device", MODE_PRIVATE);
                String id = dp.getString("id", "");
                if (id == null || id.isEmpty()) { id = "and-" + java.util.UUID.randomUUID().toString(); dp.edit().putString("id", id).apply(); }
                String name = (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim() + " · Android " + android.os.Build.VERSION.RELEASE;
                return new JSONObject().put("id", id).put("name", name).toString();
            } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public String updInstall() { ui.post(MainActivity.this::installApk); return "{\"ok\":true}"; }
        // 已下载并校验好的新版安装包（跨进程保留：授权「安装未知应用」时系统可能会重启 App）→ {ver, size, perm}；没有 / 已装上 → {}
        @JavascriptInterface public String updReady() {
            try {
                SharedPreferences up = getSharedPreferences("upd", MODE_PRIVATE);
                String ver = up.getString("ver", ""); long size = up.getLong("size", 0); File f = ApkProvider.file(MainActivity.this);
                if (ver.isEmpty() || !f.exists() || (size > 0 && f.length() != size) || verCmp(ver, BuildConfigVersion()) <= 0) {
                    if (!ver.isEmpty() || f.exists()) { up.edit().clear().apply(); try { f.delete(); } catch (Exception ignored) {} }
                    return "{}";
                }
                boolean perm = android.os.Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls();
                return new JSONObject().put("ver", ver).put("size", f.length()).put("perm", perm).toString();
            } catch (Exception e) { return "{}"; }
        }
        // POST（IP 信誉批量查询用）
        @JavascriptInterface public String fetchPostStart(final String url, final String body, final String type) { final String id = newId(); probeJobs.put(id, ""); final boolean isDirectRep = url != null && (url.contains("ip-api.com/") || url.contains("proxycheck.io/")); Thread t = new Thread(() -> probeJobs.put(id, fetchSync(url, body == null ? "" : body, type, isDirectRep))); t.setDaemon(true); t.start(); return id; }
        @JavascriptInterface public String fetchPostDirectStart(final String url, final String body, final String type) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, fetchSync(url, body == null ? "" : body, type, true))); t.setDaemon(true); t.start(); return id; }
        @JavascriptInterface public String ippureDirectStart(final String ip) {
            final String id = newId(); probeJobs.put(id, "");
            Thread t = new Thread(() -> {
                try {
                    JSONObject holder = new JSONObject();
                    RouteSupport.purityDirect(ip, holder);
                    JSONObject pu = holder.optJSONObject("pure");
                    probeJobs.put(id, pu != null ? pu.toString() : "{}");
                } catch (Exception e) { probeJobs.put(id, "{}"); }
            });
            t.setDaemon(true); t.start(); return id;
        }
        // 订阅地址：直连（不经过账号节点）。手机没开代理 / 节点还没配好时，和走节点的请求并行，谁先成功用谁。
        @JavascriptInterface public String fetchDirectStart(final String url) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, fetchSync(url, null, null, true))); t.setDaemon(true); t.start(); return id; }
        String fetchSync(String url, String body, String type) { return fetchSync(url, body, type, false); }
        // 邮箱令牌取件：只给微软的令牌 / 邮件接口带 Bearer（走本账号线路）
        @JavascriptInterface public String fetchAuthStart(final String url, final String bearer) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, fetchSync(url, null, null, false, bearer))); t.setDaemon(true); t.start(); return id; }
        String fetchSync(String url, String body, String type, boolean direct) { return fetchSync(url, body, type, direct, null); }
        String fetchSync(String url, String body, String type, boolean direct, String bearer) {
            HttpURLConnection c = null; Tun nativeTun = null; String nativeTag = null;
            try {
                if (url == null || !url.matches("(?i)https?://.+")) return new JSONObject().put("error", "地址不正确").toString();
                boolean publicData = url.startsWith("https://whatsmyllm.com/");
                if (direct && publicData) throw new Exception("不允许直连");
                if (publicData && (body != null || !url.matches("https://whatsmyllm\\.com/(?:|data/bank/v[0-9]{4}\\.[0-9]{1,2}\\.[0-9]+\\.json)"))) throw new Exception("Fingerprint data URL not allowed");
                JSONObject account = null;
                synchronized (acctLock) {
                    account = find(acctId);
                    if (account == null && curId != null && !curId.isEmpty()) account = find(curId);
                    if (account == null) {
                        for (int k = 0; k < accounts.length(); k++) {
                            JSONObject cand = accounts.optJSONObject(k);
                            if (cand != null && !isDirect(eff(cand).optString("proxy"))) { account = cand; break; }
                        }
                    }
                    if (account == null && accounts.length() > 0) account = accounts.optJSONObject(0);
                    if (account != null) account = new JSONObject(account.toString());
                }
                String primaryUrl = url;
                java.util.regex.Matcher ghPrimary = java.util.regex.Pattern.compile("(?i)^https://raw\\.githubusercontent\\.com/([^/]+)/([^/]+)/(?:refs/heads/)?([^/]+)/(.+)$").matcher(url.trim());
                if (ghPrimary.matches() && body == null) {
                    primaryUrl = "https://testingcf.jsdelivr.net/gh/" + ghPrimary.group(1) + "/" + ghPrimary.group(2) + "@" + ghPrimary.group(3) + "/" + ghPrimary.group(4);
                }
                if (direct || !primaryUrl.equals(url) || (account != null && isDirect(eff(account).optString("proxy")))) {
                    c = (HttpURLConnection) new URL(primaryUrl).openConnection(java.net.Proxy.NO_PROXY);
                } else if (curTun != null && alive(curTun.proc) && curTun.port > 0 && (account == null || account.optString("id").equals(curId) || acctId == null || acctId.isEmpty())) {
                    c = (HttpURLConnection) new URL(url).openConnection(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", curTun.port)));
                } else {
                    JSONObject ob = account != null ? outboundOf(routeSupport != null ? routeSupport.outboundAccount(account) : account) : null;
                    if (ob == null || "blackhole".equals(ob.optString("protocol"))) {
                        JSONObject g = gnode();
                        if (g != null && !g.optString("xout").isEmpty()) ob = new JSONObject(g.optString("xout"));
                    }
                    if (ob == null || "blackhole".equals(ob.optString("protocol"))) {
                        if (publicData) throw new Exception("账号已关闭，未直连");
                        c = (HttpURLConnection) new URL(url).openConnection(java.net.Proxy.NO_PROXY);
                    } else {
                        int sPort = ensureSubTun(ob.toString());
                        c = (HttpURLConnection) new URL(url).openConnection(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", sPort)));
                    }
                }
                c.setConnectTimeout(6500); c.setReadTimeout(9500); c.setInstanceFollowRedirects(!publicData);
                if (publicData) c.setRequestProperty("Cookie", "");
                c.setRequestProperty("User-Agent", publicData ? "Mozilla/5.0 BranaAiFingerprint" : "v2rayN/6.23"); c.setRequestProperty("Accept", "*/*");
                if (url.contains("google.com/recaptcha/")) { c.setRequestProperty("Referer", "https://arena.ai/"); c.setRequestProperty("Origin", "https://www.google.com"); }
                if (bearer != null && !bearer.isEmpty() && url.matches("https://(login\\.microsoftonline\\.com|outlook\\.office\\.com|outlook\\.office365\\.com|graph\\.microsoft\\.com)/.*")) { c.setRequestProperty("Authorization", "Bearer " + bearer); c.setRequestProperty("Accept", "application/json"); }
                if (body != null) {
                    byte[] bb = body.getBytes(StandardCharsets.UTF_8);
                    c.setRequestMethod("POST"); c.setDoOutput(true); c.setFixedLengthStreamingMode(bb.length);
                    c.setRequestProperty("Content-Type", type == null || type.isEmpty() ? "application/json" : type);
                    try (java.io.OutputStream os = c.getOutputStream()) { os.write(bb); }
                }
                int code = c.getResponseCode();
                if (code != 200) {
                    if (!publicData && (bearer == null || bearer.isEmpty()) && (code >= 500 || code == 403 || code == 429 || code == 404)) {
                        throw new Exception("HTTP " + code);
                    }
                    String eb = "";
                    try { java.io.InputStream es = c.getErrorStream(); if (es != null) { BufferedReader er = new BufferedReader(new InputStreamReader(es, StandardCharsets.UTF_8)); StringBuilder sb = new StringBuilder(); char[] eb2 = new char[4096]; int k; while ((k = er.read(eb2)) > 0 && sb.length() < 4000) sb.append(eb2, 0, k); eb = sb.toString(); } } catch (Exception ignored) {}
                    return new JSONObject().put("error", "HTTP " + code).put("body", eb.length() > 4000 ? eb.substring(0, 4000) : eb).toString();
                }
                InputStream inStream = c.getInputStream();
                if ("gzip".equalsIgnoreCase(c.getContentEncoding())) inStream = new java.util.zip.GZIPInputStream(inStream);
                BufferedReader r = new BufferedReader(new InputStreamReader(inStream, StandardCharsets.UTF_8)); StringBuilder b = new StringBuilder(); char[] buf = new char[8192]; int n;
                while ((n = r.read(buf)) > 0) { b.append(buf, 0, n); if (b.length() > 40000000) break; }
                String txt = b.toString();
                if (!publicData && body == null && (url.contains("githubusercontent.com") || url.contains("jsdelivr.net") || url.contains("ghfast.top")) && txt.trim().matches("(?is)^(?:<!doctype\\s+html|<html[\\s>]).*")) {
                    throw new Exception("UNEXPECTED_HTML");
                }
                return new JSONObject().put("text", txt).put("contentType", c.getContentType()).toString();
            } catch (Exception e) {
                // Subscription / API fallback: try gnode (VLESS without ProxyIP) + direct + GitHub mirrors
                if (url != null && !url.startsWith("https://whatsmyllm.com/") && (bearer == null || bearer.isEmpty())) {
                    try {
                        if (c != null) { try { c.disconnect(); } catch (Exception ignored) {} }
                        if (nativeTun != null) { try { nativeTun.proc.destroy(); } catch (Exception ignored) {} }
                        java.util.List<String> candUrls = new java.util.ArrayList<>();
                        java.util.regex.Matcher ghm = java.util.regex.Pattern.compile("(?i)^https://raw\\.githubusercontent\\.com/([^/]+)/([^/]+)/(?:refs/heads/)?([^/]+)/(.+)$").matcher(url.trim());
                        if (ghm.matches()) {
                            String ow = ghm.group(1), rp = ghm.group(2), br = ghm.group(3), pt = ghm.group(4);
                            candUrls.add("https://testingcf.jsdelivr.net/gh/" + ow + "/" + rp + "@" + br + "/" + pt);
                            candUrls.add("https://fastly.jsdelivr.net/gh/" + ow + "/" + rp + "@" + br + "/" + pt);
                            candUrls.add("https://cdn.jsdelivr.net/gh/" + ow + "/" + rp + "@" + br + "/" + pt);
                            candUrls.add("https://gcore.jsdelivr.net/gh/" + ow + "/" + rp + "@" + br + "/" + pt);
                            candUrls.add("https://ghfast.top/" + url.trim());
                        }
                        candUrls.add(url);
                        java.util.List<java.net.Proxy> candProxies = new java.util.ArrayList<>();
                        if (!direct) {
                            try {
                                JSONObject acctF = find(acctId);
                                if (acctF == null && curId != null && !curId.isEmpty()) acctF = find(curId);
                                if (acctF != null) {
                                    JSONObject obF = outboundOf(routeSupport != null ? routeSupport.outboundAccount(acctF) : acctF);
                                    if (obF != null && !"blackhole".equals(obF.optString("protocol"))) {
                                        String cleanOb = stripProxyIpFromXout(obF.toString());
                                        if (!cleanOb.isEmpty()) {
                                            int cPort = ensureSubTun(cleanOb);
                                            candProxies.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", cPort)));
                                        }
                                    }
                                }
                            } catch (Exception ignored) {}
                            try {
                                JSONObject g = gnode();
                                if (g != null && !g.optString("xout").isEmpty()) {
                                    int gPort = ensureSubTun(stripProxyIpFromXout(g.optString("xout")));
                                    candProxies.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", gPort)));
                                }
                            } catch (Exception ignored) {}
                        }
                        candProxies.add(java.net.Proxy.NO_PROXY);
                        for (String cu : candUrls) {
                            for (java.net.Proxy px : candProxies) {
                                HttpURLConnection c2 = null;
                                try {
                                    c2 = (HttpURLConnection) new URL(cu).openConnection(px);
                                    c2.setConnectTimeout(5000); c2.setReadTimeout(8000); c2.setInstanceFollowRedirects(true);
                                    c2.setRequestProperty("User-Agent", "v2rayN/6.23");
                                    c2.setRequestProperty("Accept", "*/*");
                                    if (body != null) {
                                        byte[] bb = body.getBytes(StandardCharsets.UTF_8);
                                        c2.setRequestMethod("POST"); c2.setDoOutput(true); c2.setFixedLengthStreamingMode(bb.length);
                                        c2.setRequestProperty("Content-Type", type == null || type.isEmpty() ? "application/json" : type);
                                        try (java.io.OutputStream os = c2.getOutputStream()) { os.write(bb); }
                                    }
                                    int code2 = c2.getResponseCode();
                                    if (code2 == 200) {
                                        InputStream in2 = c2.getInputStream();
                                        if ("gzip".equalsIgnoreCase(c2.getContentEncoding())) in2 = new java.util.zip.GZIPInputStream(in2);
                                        BufferedReader r2 = new BufferedReader(new InputStreamReader(in2, StandardCharsets.UTF_8));
                                        StringBuilder b2 = new StringBuilder(); char[] buf2 = new char[8192]; int n2;
                                        while ((n2 = r2.read(buf2)) > 0) { b2.append(buf2, 0, n2); if (b2.length() > 8000000) break; }
                                        String txt2 = b2.toString();
                                        c2.disconnect();
                                        if (body == null && !cu.contains("scamalytics.com") && txt2.trim().matches("(?is)^(?:<!doctype\\s+html|<html[\\s>]).*")) continue;
                                        return new JSONObject().put("text", txt2).put("contentType", c2.getContentType()).toString();
                                    }
                                } catch (Exception ignored) {
                                } finally {
                                    if (c2 != null) { try { c2.disconnect(); } catch (Exception ignored) {} }
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
                try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"失败\"}"; }
            }
            finally { if (c != null) c.disconnect(); if (nativeTun != null) nativeTun.proc.destroy(); if (nativeTag != null) new File(new File(getFilesDir(), "xray"), nativeTag + ".json").delete(); }
        }
        boolean isCfOfficialIp(String raw) {
            if (raw == null) return false;
            String h = raw.trim().split(":")[0];
            String[] p = h.split("\\.");
            if (p.length != 4) return false;
            try {
                int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]), c = Integer.parseInt(p[2]);
                if (a == 104 && b >= 16 && b <= 31) return true;
                if (a == 172 && b >= 64 && b <= 71) return true;
                if (a == 162 && (b == 158 || b == 159)) return true;
                if (a == 108 && b == 162 && c >= 192) return true;
                if (a == 198 && b == 41 && c >= 128) return true;
                if (a == 103 && b == 21 && c >= 244 && c <= 247) return true;
                if (a == 103 && b == 22 && c >= 200 && c <= 203) return true;
                if (a == 103 && b == 31 && c >= 4 && c <= 7) return true;
                if (a == 141 && b == 101 && c >= 64 && c <= 127) return true;
                if (a == 188 && b == 114 && c >= 96 && c <= 111) return true;
                if (a == 190 && b == 93 && c >= 240) return true;
                if (a == 197 && b == 234 && c >= 240 && c <= 243) return true;
                if (a == 198 && (b == 18 || b == 19)) return true;
            } catch (Exception ignored) {}
            return false;
        }
        @JavascriptInterface public String resolveStart(final String host) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, resolveSync(host))); t.setDaemon(true); t.start(); return id; }
        String resolveSync(String host) {
            try {
                if (host == null) return "[]";
                String name = host.trim().replaceAll("^\\[|\\]$", "");
                if (!name.matches("[A-Za-z0-9.-]{1,253}")) return "[]";
                String[] dohUrls = new String[]{
                    "https://223.5.5.5/resolve?edns_client_subnet=8.8.8.8/24&type=A&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://223.6.6.6/resolve?edns_client_subnet=1.1.1.1/24&type=A&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://1.12.12.12/dns-query?edns_client_subnet=8.8.8.8/24&type=A&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://120.53.53.53/dns-query?edns_client_subnet=8.8.8.8/24&type=A&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://1.1.1.1/dns-query?type=A&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://223.5.5.5/resolve?type=16&name=" + URLEncoder.encode(name, "UTF-8"),
                    "https://1.1.1.1/dns-query?type=TXT&name=" + URLEncoder.encode(name, "UTF-8")
                };
                java.util.LinkedHashSet<String> merged = new java.util.LinkedHashSet<>();
                java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(dohUrls.length);
                java.util.List<java.util.concurrent.Future<java.util.List<String>>> fs = new java.util.ArrayList<>();
                final java.util.regex.Pattern txtIpPat = java.util.regex.Pattern.compile("\\b(\\d{1,3}(?:\\.\\d{1,3}){3})(?::(\\d{1,5}))?\\b");
                for (final String u : dohUrls) {
                    fs.add(pool.submit(() -> {
                        java.util.List<String> list = new java.util.ArrayList<>();
                        javax.net.ssl.HttpsURLConnection c = (javax.net.ssl.HttpsURLConnection) new URL(u).openConnection(java.net.Proxy.NO_PROXY);
                        c.setConnectTimeout(3000); c.setReadTimeout(3500); c.setInstanceFollowRedirects(false); c.setRequestProperty("Accept", "application/dns-json");
                        try {
                            if (c.getResponseCode() != 200) return list;
                            StringBuilder sb = new StringBuilder();
                            try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                                String line; while ((line = br.readLine()) != null) { sb.append(line); if (sb.length() > 65536) break; }
                            }
                            JSONArray answers = new JSONObject(sb.toString()).optJSONArray("Answer");
                            if (answers != null) {
                                for (int i = 0; i < answers.length(); i++) {
                                    JSONObject r = answers.optJSONObject(i); if (r == null) continue;
                                    int tp = r.optInt("type"); String dt = r.optString("data", "").trim();
                                    if (tp == 1 && dt.matches("\\d{1,3}(\\.\\d{1,3}){3}") && !isCfOfficialIp(dt)) list.add(dt);
                                    else if (tp == 16) {
                                        java.util.regex.Matcher m = txtIpPat.matcher(dt.replace("\\\"", "\""));
                                        while (m.find()) {
                                            String ip = m.group(1), pt = m.group(2);
                                            if (!isCfOfficialIp(ip)) list.add(pt != null && !pt.isEmpty() ? ip + ":" + pt : ip);
                                        }
                                    }
                                }
                            }
                        } finally { c.disconnect(); }
                        return list;
                    }));
                }
                for (java.util.concurrent.Future<java.util.List<String>> f : fs) {
                    try { java.util.List<String> v = f.get(4000, java.util.concurrent.TimeUnit.MILLISECONDS); if (v != null) merged.addAll(v); } catch (Exception ignored) {}
                }
                pool.shutdownNow();
                if (!merged.isEmpty()) {
                    JSONArray out = new JSONArray();
                    for (String s : merged) out.put(s);
                    return out.toString();
                }
                return bootstrapDns(host).toString();
            } catch (Exception e) { return "[]"; }
        }
        @JavascriptInterface public String solveCaptchaAudioStart(final String audioUrl) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, solveCaptchaAudioSync(audioUrl))); t.setDaemon(true); t.start(); return id; }
        String solveCaptchaAudioSync(String audioUrl) {
            try {
                String u = audioUrl == null ? "" : audioUrl.trim();
                if (!u.matches("(?i)^https://(?:[a-z0-9-]+\\.)*(?:google\\.com|recaptcha\\.net|gstatic\\.com)/.*")) {
                    return new JSONObject().put("ok", false).put("error", "无效的语音验证码地址").toString();
                }
                java.util.List<java.net.Proxy> pxs = new java.util.ArrayList<>();
                try {
                    JSONObject capOb = capOutbound();
                    if (capOb != null) {
                        if ("freedom".equals(capOb.optString("protocol"))) pxs.add(java.net.Proxy.NO_PROXY);
                        else {
                            int cp = ensureSubTun(capOb.toString());
                            pxs.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", cp)));
                        }
                    }
                } catch (Exception ignored) {}
                if (curTun != null && alive(curTun.proc) && curTun.port > 0) {
                    pxs.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", curTun.port)));
                }
                try {
                    JSONObject a = find(acctId);
                    if (a == null && curId != null && !curId.isEmpty()) a = find(curId);
                    if (a != null && !isDirect(eff(a).optString("proxy"))) {
                        JSONObject ob = outboundOf(routeSupport != null ? routeSupport.outboundAccount(a) : a);
                        if (ob != null && !"blackhole".equals(ob.optString("protocol"))) {
                            int p1 = ensureSubTun(ob.toString());
                            pxs.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", p1)));
                            String cleanOb = stripProxyIpFromXout(ob.toString());
                            if (!cleanOb.isEmpty() && !cleanOb.equals(ob.toString())) {
                                int p2 = ensureSubTun(cleanOb);
                                pxs.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", p2)));
                            }
                        }
                    }
                } catch (Exception ignored) {}
                try {
                    JSONObject g = gnode();
                    if (g != null && !g.optString("xout").isEmpty()) {
                        int gp = ensureSubTun(stripProxyIpFromXout(g.optString("xout")));
                        pxs.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", gp)));
                    }
                } catch (Exception ignored) {}
                pxs.add(java.net.Proxy.NO_PROXY);

                byte[] audioBytes = null;
                for (java.net.Proxy px : pxs) {
                    HttpURLConnection c = null;
                    try {
                        c = (HttpURLConnection) new URL(u).openConnection(px);
                        c.setConnectTimeout(5500);
                        c.setReadTimeout(7500);
                        c.setInstanceFollowRedirects(true);
                        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
                        c.setRequestProperty("Accept", "audio/mpeg,audio/*;q=0.9,*/*;q=0.8");
                        c.setRequestProperty("Referer", "https://www.google.com/");
                        if (c.getResponseCode() == 200) {
                            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                            try (InputStream in = c.getInputStream()) {
                                byte[] buf = new byte[8192]; int n;
                                while ((n = in.read(buf)) > 0) {
                                    bos.write(buf, 0, n);
                                    if (bos.size() > 2097152) break;
                                }
                            }
                            if (bos.size() >= 120) { audioBytes = bos.toByteArray(); break; }
                        }
                    } catch (Exception ignored) {
                    } finally {
                        if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
                    }
                }
                if (audioBytes == null || audioBytes.length == 0) {
                    return new JSONObject().put("ok", false).put("error", "语音文件下载失败").toString();
                }

                String finalTranscript = "";
                for (java.net.Proxy px : pxs) {
                    HttpURLConnection wc = null;
                    try {
                        wc = (HttpURLConnection) new URL("https://api.wit.ai/speech?v=20220622").openConnection(px);
                        wc.setConnectTimeout(6000);
                        wc.setReadTimeout(8500);
                        wc.setRequestMethod("POST");
                        wc.setDoOutput(true);
                        wc.setFixedLengthStreamingMode(audioBytes.length);
                        wc.setRequestProperty("Authorization", "Bearer JVHWCNWJLWLGN6MFALYLHAPKUFHMNTAC");
                        wc.setRequestProperty("Content-Type", "audio/mpeg3");
                        try (java.io.OutputStream os = wc.getOutputStream()) { os.write(audioBytes); }
                        if (wc.getResponseCode() == 200) {
                            StringBuilder sb = new StringBuilder();
                            try (BufferedReader br = new BufferedReader(new InputStreamReader(wc.getInputStream(), StandardCharsets.UTF_8))) {
                                char[] cbuf = new char[4096]; int n;
                                while ((n = br.read(cbuf)) > 0 && sb.length() < 65536) sb.append(cbuf, 0, n);
                            }
                            String witText = sb.toString();
                            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"_?text\"\\s*:\\s*\"([^\"]*)\"").matcher(witText);
                            while (m.find()) {
                                String cand = m.group(1).trim();
                                if (!cand.isEmpty()) finalTranscript = cand;
                            }
                            if (!finalTranscript.isEmpty()) break;
                        }
                    } catch (Exception ignored) {
                    } finally {
                        if (wc != null) try { wc.disconnect(); } catch (Exception ignored) {}
                    }
                }
                String cleanText = finalTranscript.replaceAll("[^a-zA-Z0-9\\s]", " ").replaceAll("\\s+", " ").trim().toLowerCase(java.util.Locale.ROOT);
                if (cleanText.isEmpty()) return new JSONObject().put("ok", false).put("error", "未能从语音中识别出文本").toString();
                return new JSONObject().put("ok", true).put("text", cleanText).toString();
            } catch (Exception e) {
                try { return new JSONObject().put("ok", false).put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"ok\":false}"; }
            }
        }
        @JavascriptInterface public String probeStart(final String json) { final String id = newId(); probeJobs.put(id, ""); Thread t = new Thread(() -> probeJobs.put(id, probeSync(json))); t.setDaemon(true); t.start(); return id; }
        @JavascriptInterface public String probeGet(String id) { String r = id == null ? null : probeJobs.get(id); if (r == null) return "{\"error\":\"检测任务不存在\"}"; if (r.isEmpty()) return ""; probeJobs.remove(id); return r; }
        final java.util.concurrent.Semaphore probeXrayGate = new java.util.concurrent.Semaphore(1);
        JSONObject checkProxyIpDirect(String pip, int tmo) {
            if (pip == null) return null;
            String p = pip.trim();
            if (p.isEmpty() || p.matches("(?i)^(?:socks5|https?|turn|sstp)://.*") || p.matches("(?i)^(?:\\[::1\\]|localhost|127\\.|0\\.|10\\.|192\\.0\\.2\\.|198\\.51\\.100\\.|203\\.0\\.113\\.).*")) return null;
            String target = p.matches(".*:\\d{1,5}$") ? p : (p.contains(":") && !p.startsWith("[") ? "[" + p + "]:443" : p + ":443");
            HttpURLConnection c = null;
            long t0 = System.currentTimeMillis();
            try {
                String u = "https://api.check.proxyip.cmliussss.net/check?proxyip=" + URLEncoder.encode(target, "UTF-8");
                c = (HttpURLConnection) new URL(u).openConnection(java.net.Proxy.NO_PROXY);
                c.setConnectTimeout(Math.min(5500, tmo));
                c.setReadTimeout(Math.min(6500, tmo));
                c.setUseCaches(false);
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("Accept", "application/json");
                c.setRequestProperty("User-Agent", "Mozilla/5.0");
                int code = c.getResponseCode();
                if (code != 200) return null;
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                    String line; while ((line = br.readLine()) != null && sb.length() < 24576) sb.append(line);
                }
                JSONObject j = new JSONObject(sb.toString());
                long elapsed = Math.max(1L, System.currentTimeMillis() - t0);
                JSONObject pr = j.optJSONObject("probe_results");
                JSONObject v4 = pr != null ? pr.optJSONObject("ipv4") : null;
                JSONObject v6 = pr != null ? pr.optJSONObject("ipv6") : null;
                JSONObject probe = (v4 != null && v4.optBoolean("ok") && v4.optJSONObject("exit") != null) ? v4
                    : (v6 != null && v6.optBoolean("ok") && v6.optJSONObject("exit") != null) ? v6 : null;
                JSONObject exit = probe != null ? probe.optJSONObject("exit") : null;
                if (exit == null && j.optJSONArray("info") != null && j.optJSONArray("info").length() > 0) exit = j.optJSONArray("info").optJSONObject(0);
                if (exit == null) exit = j.optJSONObject("info");
                String ip = (exit != null ? exit.optString("ip", "") : "").trim();
                if (ip.isEmpty()) ip = j.optString("ip", "").trim();
                String loc = (exit != null ? exit.optString("country", "") : "").trim().toUpperCase(java.util.Locale.ROOT);
                if (loc.isEmpty()) loc = j.optString("country", "").trim().toUpperCase(java.util.Locale.ROOT);
                if (j.optBoolean("success") && !ip.isEmpty()) {
                    long netMs = probe != null ? Math.max(1L, probe.optLong("http_ms", probe.optLong("connect_ms", elapsed))) : elapsed;
                    JSONObject bm = exit != null ? exit.optJSONObject("botManagement") : j.optJSONObject("botManagement");
                    int botScore = (bm != null && bm.has("score")) ? bm.optInt("score", 100) : 100;
                    boolean ok = botScore >= 10;
                    JSONObject out = new JSONObject()
                        .put("pip", pip)
                        .put("ip", ip)
                        .put("loc", loc)
                        .put("ms", netMs)
                        .put("cold", Math.max(netMs, elapsed))
                        .put("status", ok ? 200 : 403)
                        .put("brana", ok)
                        .put("via", "direct-check");
                    if (!ok) {
                        out.put("error", "Brana 返回验证页（botScore " + botScore + "）");
                    } else {
                        String orgStr = (exit != null ? exit.optString("asOrganization", exit.optString("org", "")) : j.optString("asOrganization", "")).replaceAll("(?i)^AS\\d+\\s+", "").trim();
                        if (orgStr.length() > 40) orgStr = orgStr.substring(0, 40);
                        int asnNum = exit != null ? exit.optInt("asn", 0) : j.optInt("asn", 0);
                        boolean corpProxy = bm != null && bm.optBoolean("corporateProxy", false);
                        boolean isHosting = corpProxy || orgStr.toLowerCase(java.util.Locale.US).matches(".*(akile|baxet|dromatics|cloudflare|oracle|amazon|aws|google|microsoft|azure|linode|akamai|vultr|digitalocean|hetzner|ovh|choopa|datacamp|contabo|zenlayer|cogent|hurricane|leaseweb|scaleway|netcup|gcore|kamatera|upcloud|racknerd|hosting|datacenter|data center|cloud|vps|server).*");
                        out.put("ipa", new JSONObject().put("ip", ip).put("h", isHosting).put("px", false).put("m", false).put("isp", orgStr).put("as", asnNum > 0 ? "AS" + asnNum : ""));
                        RouteSupport.purityDirect(ip, out);
                    }
                    return out;
                }
                String errMsg = (v4 != null && !v4.optString("error", "").isEmpty()) ? v4.optString("error")
                    : (v6 != null && !v6.optString("error", "").isEmpty()) ? v6.optString("error")
                    : j.optString("message", j.optString("error", "ProxyIP 不可用"));
                return new JSONObject()
                    .put("pip", pip)
                    .put("ms", 0)
                    .put("cold", elapsed)
                    .put("status", 502)
                    .put("brana", false)
                    .put("via", "direct-check")
                    .put("error", errMsg);
            } catch (Exception e) {
                return null;
            } finally {
                if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
            }
        }
        String probeSync(String json) {
            Process proc = null; File cf = null; boolean xrayLocked = false;
            try {
                JSONObject o = new JSONObject(json); JSONArray outs = o.optJSONArray("outs"); final JSONArray pips = o.optJSONArray("pips");
                final boolean delay = "delay".equals(o.optString("mode", ""));
                final int rawN = (!delay && pips != null && pips.length() > 0) ? pips.length() : (outs != null ? outs.length() : 0);
                final int n = Math.min(rawN, 32);
                final String durl = o.optString("url", "").matches("^https://[A-Za-z0-9.-]+(:\\d+)?/[\\w./?=&%-]*$") ? o.optString("url") : "https://www.gstatic.com/generate_204";
                final int tmo = Math.max(delay ? 2000 : 4000, Math.min(30000, o.optInt("timeout", delay ? 5000 : 12000)));
                if (n == 0) return "[]";
                final JSONObject[] finalRes = new JSONObject[n];
                final java.util.List<Integer> remIdx = new java.util.ArrayList<>();
                if (!delay && pips != null && pips.length() > 0 && o.optBoolean("direct", true)) {
                    java.util.concurrent.ExecutorService dex = java.util.concurrent.Executors.newFixedThreadPool(Math.min(n, 8));
                    java.util.List<java.util.concurrent.Future<JSONObject>> dfs = new java.util.ArrayList<>();
                    for (int i = 0; i < n; i++) {
                        final String pip = pips.optString(i, "");
                        final JSONObject ob = outs.optJSONObject(i);
                        final String wsPath = ob != null && ob.optJSONObject("streamSettings") != null && ob.optJSONObject("streamSettings").optJSONObject("wsSettings") != null
                            ? ob.optJSONObject("streamSettings").optJSONObject("wsSettings").optString("path", "") : "";
                        final boolean isVideoChain = wsPath.toLowerCase(java.util.Locale.ROOT).contains("/video/");
                        dfs.add(dex.submit(() -> isVideoChain ? null : checkProxyIpDirect(pip, tmo)));
                    }
                    for (int i = 0; i < n; i++) {
                        JSONObject dx = null;
                        try { dx = dfs.get(i).get(tmo + 3000L, java.util.concurrent.TimeUnit.MILLISECONDS); } catch (Exception ignored) {}
                        if (dx != null && (dx.has("ip") || dx.has("error"))) finalRes[i] = dx;
                        else remIdx.add(i);
                    }
                    dex.shutdownNow();
                    if (remIdx.isEmpty() || outs == null || outs.length() < n) {
                        JSONArray r = new JSONArray();
                        for (int i = 0; i < n; i++) {
                            if (finalRes[i] != null) r.put(finalRes[i]);
                            else r.put(new JSONObject().put("pip", pips.optString(i, "")).put("ms", 0).put("status", 0).put("brana", false).put("via", "direct-check").put("error", "直连检测超时"));
                        }
                        return r.toString();
                    }
                } else {
                    for (int i = 0; i < n; i++) remIdx.add(i);
                }
                if (!probeXrayGate.tryAcquire(45, java.util.concurrent.TimeUnit.SECONDS)) throw new Exception("检测内核繁忙，请稍后重试");
                xrayLocked = true;
                File exe = xrayExe(); if (exe == null) throw new Exception("没有找到内置 xray 内核");
                final int rn = remIdx.size();
                final int[] ports = new int[rn]; JSONArray ins = new JSONArray(), obs = new JSONArray(), rules = new JSONArray();
                for (int i = 0; i < rn; i++) {
                    int origIdx = remIdx.get(i);
                    int p; do { p = freePort(); } while (contains(ports, i, p)); ports[i] = p;
                    ins.put(new JSONObject().put("tag", "in" + i).put("listen", "127.0.0.1").put("port", p).put("protocol", "http").put("settings", new JSONObject()));
                    obs.put(new JSONObject(outs.getJSONObject(origIdx).toString()).put("tag", "p" + i));
                    rules.put(new JSONObject().put("type", "field").put("inboundTag", new JSONArray().put("in" + i)).put("outboundTag", "p" + i));
                }
                obs.put(new JSONObject().put("tag", "block").put("protocol", "blackhole"));
                JSONObject cfg = new JSONObject().put("log", new JSONObject().put("loglevel", "warning")).put("inbounds", ins).put("outbounds", obs).put("routing", new JSONObject().put("rules", rules));
                fixDns(cfg);
                File dir = new File(getFilesDir(), "xray"); dir.mkdirs(); cf = new File(dir, "probe-" + newId() + ".json");
                try (java.io.FileOutputStream fo = new java.io.FileOutputStream(cf)) { fo.write(cfg.toString().getBytes(StandardCharsets.UTF_8)); }
                ProcessBuilder pb = new ProcessBuilder(exe.getAbsolutePath(), "run", "-c", cf.getAbsolutePath()).directory(dir).redirectErrorStream(true);
                pb.environment().put("XRAY_LOCATION_ASSET", dir.getAbsolutePath());
                proc = pb.start();
                final InputStream pin = proc.getInputStream(); final StringBuilder plog = new StringBuilder();
                Thread rd = new Thread(() -> { try { BufferedReader br = new BufferedReader(new InputStreamReader(pin, StandardCharsets.UTF_8)); String l; while ((l = br.readLine()) != null) synchronized (plog) { plog.append(l).append('\n'); if (plog.length() > 4000) plog.delete(0, plog.length() - 3000); } } catch (Exception ignored) {} });
                rd.setDaemon(true); rd.start();
                if (!waitPort(ports[rn - 1], 8000, proc)) throw new Exception("xray 启动失败：" + tail(plog));
                java.util.concurrent.ExecutorService ex = java.util.concurrent.Executors.newFixedThreadPool(Math.min(rn, delay ? 32 : 8));
                java.util.List<java.util.concurrent.Future<JSONObject>> fs = new java.util.ArrayList<>();
                for (int i = 0; i < rn; i++) { final int k = i; fs.add(ex.submit(() -> delay ? delayOne(ports[k], durl, tmo) : probeOne(ports[k], tmo))); }
                for (int i = 0; i < rn; i++) {
                    int origIdx = remIdx.get(i);
                    JSONObject x; try { x = fs.get(i).get(tmo * 2L + 3000, java.util.concurrent.TimeUnit.MILLISECONDS); } catch (Exception e) { x = new JSONObject().put("error", "超时"); }
                    x.put("pip", pips != null ? pips.optString(origIdx, "") : ""); finalRes[origIdx] = x;
                }
                ex.shutdownNow();
                JSONArray r = new JSONArray();
                for (int i = 0; i < n; i++) r.put(finalRes[i] != null ? finalRes[i] : new JSONObject().put("pip", pips != null ? pips.optString(i, "") : "").put("error", "失败"));
                return r.toString();
            } catch (Exception e) { try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"失败\"}"; } }
            finally { if (proc != null) { try { proc.destroy(); } catch (Exception ignored) {} } if (cf != null) { try { cf.delete(); } catch (Exception ignored) {} } if (xrayLocked) probeXrayGate.release(); }
        }
        // 图片保存到相册（Android 10+ 走 MediaStore，不需要存储权限；更早的系统存到 App 自己的图片目录）
        @JavascriptInterface public String saveImage(String name, String mime, String b64) {
            try {
                byte[] data = android.util.Base64.decode(b64 == null ? "" : b64, android.util.Base64.DEFAULT);
                String nm = (name == null || name.trim().isEmpty() ? "image.png" : name.trim()).replaceAll("[\\\\/:*?\"<>|]+", "_");
                String mt = mime == null || !mime.startsWith("image/") ? "image/png" : mime;
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, nm);
                    cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mt);
                    cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/BranaAi");
                    Uri u = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                    if (u == null) return new JSONObject().put("error", "无法写入相册").toString();
                    try (java.io.OutputStream os = getContentResolver().openOutputStream(u)) { if (os == null) throw new Exception("无法写入相册"); os.write(data); }
                    return new JSONObject().put("ok", true).put("path", "Pictures/BranaAi/" + nm).toString();
                }
                File dir = new File(getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES), "BranaAi"); dir.mkdirs();
                File f = new File(dir, nm);
                try (java.io.FileOutputStream os = new java.io.FileOutputStream(f)) { os.write(data); }
                return new JSONObject().put("ok", true).put("path", f.getAbsolutePath()).toString();
            } catch (Exception e) {
                try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"保存失败\"}"; }
            }
        }
        // 抓日志：保存到「下载/BranaAi」（Android 10+ 走 MediaStore，不需要存储权限），同时在缓存里留一份用来分享
        @JavascriptInterface public String downloadStart(String name,String mime,String size) { return workspaceDownload.start(webs.get(acctId),name,mime,size); }
        @JavascriptInterface public String downloadChunk(String id,String body) { return workspaceDownload.chunk(webs.get(acctId),id,body); }
        @JavascriptInterface public String downloadFinish(String id) { return workspaceDownload.finish(webs.get(acctId),id); }
        @JavascriptInterface public String downloadCancel(String id) { workspaceDownload.cancel(webs.get(acctId),id); return "true"; }
        @JavascriptInterface public String openFile(String uri,String mime) {
            if (uri == null || !uri.startsWith("content://" + getPackageName() + ".apk/logs/")) return "false";
            ui.post(() -> { try { Intent it = new Intent(Intent.ACTION_VIEW); it.setDataAndType(Uri.parse(uri),mime); it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivity(Intent.createChooser(it,"打开工作区文件")); }
                catch(Exception ex) { android.widget.Toast.makeText(MainActivity.this,"没有可打开该格式的应用，请安装阅读器后再试",android.widget.Toast.LENGTH_LONG).show(); } }); return "true";
        }
        @JavascriptInterface public String previewOpen(String opt) { return workspacePreview.open(webs.get(acctId), opt); }
        @JavascriptInterface public String previewRespond(String response) { return String.valueOf(workspacePreview.respond(webs.get(acctId), response)); }
        @JavascriptInterface public String previewClose(String id) { workspacePreview.closeId(webs.get(acctId), id); return "true"; }
        @JavascriptInterface public String saveFile(String name, String mime, String text) {
            try {
                byte[] data = (text == null ? "" : text).getBytes(java.nio.charset.StandardCharsets.UTF_8);
                String nm = (name == null || name.trim().isEmpty() ? "brana-log.json" : name.trim()).replaceAll("[^\\w.\\-]+", "_");
                if (nm.length() > 120) nm = nm.substring(nm.length() - 120);
                String mt = mime == null || mime.isEmpty() ? "application/json" : mime;
                File ld = ApkProvider.logDir(MainActivity.this); ld.mkdirs();
                File[] old = ld.listFiles(); if (old != null) for (File o : old) if (System.currentTimeMillis() - o.lastModified() > 3L * 86400000L) o.delete();
                File cf = new File(ld, nm);
                try (java.io.FileOutputStream os = new java.io.FileOutputStream(cf)) { os.write(data); }
                String share = "content://" + getPackageName() + ".apk/logs/" + nm, shown = null;
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    try {
                        try {
                            getContentResolver().delete(
                                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                android.provider.MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                                new String[]{ nm }
                            );
                        } catch (Exception ignored) {}
                        android.content.ContentValues cv = new android.content.ContentValues();
                        cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, nm);
                        cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mt);
                        cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS + "/BranaAi");
                        cv.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
                        Uri u = getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (u != null) {
                            try (java.io.OutputStream os = getContentResolver().openOutputStream(u)) {
                                if (os != null) {
                                    os.write(data);
                                    os.flush();
                                    android.content.ContentValues done = new android.content.ContentValues();
                                    done.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
                                    getContentResolver().update(u, done, null, null);
                                    shown = "Download/BranaAi/" + nm;
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
                if (shown == null) {
                    try {
                        File ext = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
                        File dir = new File(ext != null ? ext : ld, "BranaAi");
                        dir.mkdirs();
                        File f = new File(dir, nm);
                        try (java.io.FileOutputStream os = new java.io.FileOutputStream(f)) { os.write(data); }
                        shown = f.getAbsolutePath();
                    } catch (Exception ignored) {
                        shown = cf.getAbsolutePath();
                    }
                }
                return new JSONObject().put("ok", true).put("path", shown).put("share", share).toString();
            } catch (Exception e) {
                try { return new JSONObject().put("error", String.valueOf(e.getMessage())).toString(); } catch (Exception x) { return "{\"error\":\"保存失败\"}"; }
            }
        }
        @JavascriptInterface public String shareFile(String uri, String mime) {
            if (uri == null || !uri.startsWith("content://" + getPackageName() + ".apk/logs/")) return "false";
            ui.post(() -> {
                try {
                    Intent it = new Intent(Intent.ACTION_SEND);
                    it.setType(mime == null || mime.isEmpty() ? "application/json" : mime);
                    it.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                    it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    Intent ch = Intent.createChooser(it, "发送日志文件");
                    ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(ch);
                } catch (Exception e) { Toast.makeText(MainActivity.this, "无法分享：" + e.getMessage(), Toast.LENGTH_LONG).show(); }
            });
            return "true";
        }
        @JavascriptInterface public String openExternal(String url) {
            if (url != null && url.matches("^https?://.*")) ui.post(() -> MainActivity.this.openExternal(url));
            return "true";
        }
    }

    String BuildConfigVersion() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }

    volatile JSONObject upd = new JSONObject();
    void updSet(String k, Object v) { try { upd.put(k, v); } catch (Exception ignored) {} }
    void updRun(String json, String accountId) {
        String err = "下载失败"; Tun nativeTun = null; String nativeTag = null;
        try {
            JSONObject o = new JSONObject(json);
            JSONArray us = o.optJSONArray("urls"); String sha = o.optString("sha256", "").toLowerCase(); long size = o.optLong("size", 0);
            File dir = new File(getCacheDir(), "update"); dir.mkdirs(); File f = ApkProvider.file(this); File part = new File(dir, "BranaAi.apk.part");
            getSharedPreferences("upd", MODE_PRIVATE).edit().clear().apply();
            JSONObject account;
            synchronized (acctLock) {
                account = find(accountId);
                if (account == null && curId != null && !curId.isEmpty()) account = find(curId);
                if (account == null) {
                    for (int k = 0; k < accounts.length(); k++) {
                        JSONObject cand = accounts.optJSONObject(k);
                        if (cand != null && !isDirect(eff(cand).optString("proxy"))) { account = cand; break; }
                    }
                }
                if (account == null && accounts.length() > 0) account = accounts.optJSONObject(0);
                if (account != null) account = new JSONObject(account.toString());
            }
            if (account == null) throw new Exception("账号已关闭，未直连下载");
            if (part.exists()) part.delete();
            updSet("phase", "down"); updSet("got", 0); updSet("speed", 0);
            if (size > 0) updSet("total", size);
            List<java.net.Proxy> routes = new ArrayList<>();
            java.util.Set<String> xoutCands = new java.util.LinkedHashSet<>();
            if (isDirect(eff(account).optString("proxy"))) routes.add(java.net.Proxy.NO_PROXY);
            else {
                if (curTun != null && alive(curTun.proc) && curTun.port > 0) {
                    routes.add(new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", curTun.port)));
                }
                try {
                    JSONObject ob1 = outboundOf(routeSupport != null ? routeSupport.outboundAccount(account) : account);
                    if (ob1 != null && !"blackhole".equals(ob1.optString("protocol"))) {
                        String raw1 = ob1.toString();
                        xoutCands.add(raw1);
                        String clean1 = stripProxyIpFromXout(raw1);
                        if (!clean1.isEmpty()) xoutCands.add(clean1);
                    }
                } catch (Exception ignored) {}
                try {
                    JSONObject g = gnode();
                    if (g != null && !g.optString("xout").isEmpty()) {
                        xoutCands.add(stripProxyIpFromXout(g.optString("xout")));
                    }
                } catch (Exception ignored) {}
                try {
                    JSONArray sharedNodes = new JSONArray(sp.getString("shared_nodes", "[]"));
                    for (int ni = 0; ni < Math.min(sharedNodes.length(), 6); ni++) {
                        JSONObject nx = nodeToXout(sharedNodes.optJSONObject(ni));
                        if (nx != null) xoutCands.add(nx.toString());
                    }
                } catch (Exception ignored) {}
                synchronized (acctLock) {
                    for (int ai = 0; ai < Math.min(accounts.length(), 6); ai++) {
                        try {
                            JSONObject cand = accounts.optJSONObject(ai);
                            if (cand == null || isDirect(eff(cand).optString("proxy"))) continue;
                            JSONObject obc = outboundOf(routeSupport != null ? routeSupport.outboundAccount(cand) : cand);
                            if (obc != null && !"blackhole".equals(obc.optString("protocol"))) {
                                String cleanC = stripProxyIpFromXout(obc.toString());
                                if (!cleanC.isEmpty()) xoutCands.add(cleanC);
                                xoutCands.add(obc.toString());
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
            java.util.List<String> baseUrls = new java.util.ArrayList<>();
            java.util.List<String> mirrorUrls = new java.util.ArrayList<>();
            for (int i = 0; us != null && i < us.length(); i++) {
                String u0 = us.optString(i, "").trim();
                if (!u0.startsWith("https://")) continue;
                if (!baseUrls.contains(u0)) baseUrls.add(u0);
                if (u0.startsWith("https://github.com/") && u0.contains("/releases/download/")) {
                    for (String pfx : new String[]{"https://ghfast.top/", "https://gh-proxy.com/", "https://ghp.ci/"}) {
                        String mu = pfx + u0;
                        if (!mirrorUrls.contains(mu)) mirrorUrls.add(mu);
                    }
                }
            }
            java.util.List<String> planSpecs = new java.util.ArrayList<>();
            for (int ri = 0; ri < routes.size(); ri++) planSpecs.add("ROUTE:" + ri);
            for (String xo : xoutCands) planSpecs.add("XOUT:" + xo);
            planSpecs.add("DIRECT");

            for (String spec : planSpecs) {
                java.net.Proxy jp = null;
                boolean isDirectRoute = "DIRECT".equals(spec);
                try {
                    if (isDirectRoute) {
                        jp = java.net.Proxy.NO_PROXY;
                    } else if (spec.startsWith("ROUTE:")) {
                        jp = routes.get(Integer.parseInt(spec.substring(6)));
                        if (jp == java.net.Proxy.NO_PROXY) isDirectRoute = true;
                    } else if (spec.startsWith("XOUT:")) {
                        int sPort = ensureSubTun(spec.substring(5));
                        jp = new java.net.Proxy(java.net.Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", sPort));
                    }
                } catch (Exception e) {
                    err = String.valueOf(e.getMessage());
                    continue;
                }
                if (jp == null) continue;
                java.util.List<String> tryUrls = new java.util.ArrayList<>();
                if (isDirectRoute) {
                    for (String u0 : baseUrls) if (!u0.startsWith("https://github.com/")) tryUrls.add(u0);
                    for (String mu : mirrorUrls) if (!tryUrls.contains(mu)) tryUrls.add(mu);
                    for (String u0 : baseUrls) if (!tryUrls.contains(u0)) tryUrls.add(u0);
                } else {
                    tryUrls.addAll(baseUrls);
                    for (String mu : mirrorUrls) if (!tryUrls.contains(mu)) tryUrls.add(mu);
                }
                for (String url : tryUrls) {
                    HttpURLConnection c = null;
                    try {
                        updSet("phase", "down"); updSet("speed", 0);
                        long resumeFrom = (part.exists() && part.length() > 0 && (size <= 0 || part.length() < size)) ? part.length() : 0L;
                        if (resumeFrom > 0) updSet("got", resumeFrom);
                        c = (HttpURLConnection) new URL(url).openConnection(jp);
                        c.setConnectTimeout(8000); c.setReadTimeout(12000); c.setInstanceFollowRedirects(true);
                        c.setRequestProperty("User-Agent", "BranaAi/" + BuildConfigVersion());
                        if (resumeFrom > 0) c.setRequestProperty("Range", "bytes=" + resumeFrom + "-");
                        int code = c.getResponseCode();
                        boolean appendMode = (resumeFrom > 0 && code == 206);
                        if (code != 200 && !appendMode) {
                            if (code == 416 && part.exists()) part.delete();
                            throw new Exception("HTTP " + code);
                        }
                        long len = c.getContentLengthLong();
                        long totalExpected = appendMode ? (len > 0 ? resumeFrom + len : size) : (len > 0 ? len : size);
                        if (totalExpected > 0) updSet("total", totalExpected);
                        long got = appendMode ? resumeFrom : 0L;
                        try (InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(part, appendMode)) {
                            byte[] buf = new byte[65536]; int n; long last = got; long spTime = System.currentTimeMillis(); long spBytes = got; long curSpd = 0;
                            while ((n = in.read(buf)) > 0) {
                                out.write(buf, 0, n); got += n;
                                long nowMs = System.currentTimeMillis(), dtMs = nowMs - spTime;
                                if (dtMs >= 350) {
                                    long inst = (got - spBytes) * 1000L / Math.max(1L, dtMs);
                                    curSpd = curSpd > 0 ? (curSpd * 6L + inst * 4L) / 10L : inst;
                                    updSet("speed", curSpd); spTime = nowMs; spBytes = got;
                                }
                                if (got - last > 65536) { last = got; updSet("got", got); }
                            }
                        }
                        updSet("got", got); updSet("phase", "verify");
                        if (size > 0 && got != size) {
                            if (got > size) part.delete();
                            throw new Exception("文件大小不对（" + got + " / " + size + "）");
                        }
                        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                        try (InputStream vin = new java.io.FileInputStream(part)) {
                            byte[] vbuf = new byte[65536]; int vn;
                            while ((vn = vin.read(vbuf)) > 0) md.update(vbuf, 0, vn);
                        }
                        StringBuilder hx = new StringBuilder(); for (byte b : md.digest()) hx.append(String.format("%02x", b));
                        if (!sha.isEmpty() && !sha.equals(hx.toString())) {
                            part.delete();
                            throw new Exception("sha256 校验失败");
                        }
                        if (f.exists()) f.delete();
                        if (!part.renameTo(f)) {
                            try (InputStream in2 = new java.io.FileInputStream(part); java.io.FileOutputStream out2 = new java.io.FileOutputStream(f)) {
                                byte[] buf2 = new byte[65536]; int n2; while ((n2 = in2.read(buf2)) > 0) out2.write(buf2, 0, n2);
                            }
                            part.delete();
                        }
                        getSharedPreferences("upd", MODE_PRIVATE).edit().putString("ver", o.optString("ver", "")).putLong("size", got).putString("sha", hx.toString()).apply();
                        updSet("phase", "ready");
                        ui.post(this::installApk);
                        return;
                    } catch (Exception e) { err = String.valueOf(e.getMessage()); }
                    finally { if (c != null) c.disconnect(); }
                }
            }
        } catch (Exception e) { err = String.valueOf(e.getMessage()); }
        finally { if (nativeTun != null) nativeTun.proc.destroy(); if (nativeTag != null) new File(new File(getFilesDir(), "xray"), nativeTag + ".json").delete(); }
        updSet("error", err); updSet("phase", "error");
    }
    long permAskAt = 0;
    static int verCmp(String a, String b) {
        String[] x = String.valueOf(a).replaceFirst("^[vV]", "").split("[.-]"), y = String.valueOf(b).replaceFirst("^[vV]", "").split("[.-]");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = 0, q = 0; try { p = i < x.length ? Integer.parseInt(x[i].replaceAll("\\D.*", "")) : 0; } catch (Exception ignored) {} try { q = i < y.length ? Integer.parseInt(y[i].replaceAll("\\D.*", "")) : 0; } catch (Exception ignored) {}
            if (p != q) return p > q ? 1 : -1;
        }
        return 0;
    }
    // 去系统设置允许「安装未知应用」后回到 App：已经允许了就直接打开安装界面，不用再点
    @Override protected void onResume() {
        super.onResume();
        if (web != null) { web.setVisibility(android.view.View.VISIBLE); try { web.onResume(); } catch (Exception ignored) {} syncBgWebState(web, null); }
        if (permAskAt > 0 && "perm".equals(upd.optString("phase")) && System.currentTimeMillis() - permAskAt < 15 * 60_000L
            && (android.os.Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) { permAskAt = 0; ui.postDelayed(this::installApk, 350); }
    }
    void installApk() {
        try {
            if (!ApkProvider.file(this).exists()) { updSet("error", "安装包还没下载好"); updSet("phase", "error"); return; }
            if (android.os.Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                updSet("phase", "perm"); permAskAt = System.currentTimeMillis();
                startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                return;
            }
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://" + getPackageName() + ".apk/" + ApkProvider.NAME), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i); updSet("phase", "install");
        } catch (Exception e) { updSet("error", "打开安装程序失败：" + e.getMessage()); updSet("phase", "error"); }
    }

    // 官方 Google 登录：Google 会拦「内嵌浏览器」。去掉 X-Requested-With（带包名），UA-CH 品牌里的 Android WebView 换成 Google Chrome（版本不变）
    static void googleReady(WebSettings s) {
        try { if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) WebSettingsCompat.setRequestedWithHeaderOriginAllowList(s, Collections.<String>emptySet()); } catch (Throwable ignore) {}
        try {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) return;
            UserAgentMetadata cur = WebSettingsCompat.getUserAgentMetadata(s);
            List<UserAgentMetadata.BrandVersion> out = new ArrayList<>(); boolean hit = false, chrome = false;
            for (UserAgentMetadata.BrandVersion b : cur.getBrandVersionList()) {
                if ("Google Chrome".equals(b.getBrand())) chrome = true;
                if ("Android WebView".equals(b.getBrand())) { hit = true; b = new UserAgentMetadata.BrandVersion.Builder(b).setBrand("Google Chrome").build(); }
                out.add(b);
            }
            if (hit && !chrome) WebSettingsCompat.setUserAgentMetadata(s, new UserAgentMetadata.Builder(cur).setBrandVersionList(out).build());
        } catch (Throwable ignore) {}
    }
    static boolean extAuth(String u) { return u != null && u.startsWith("https://") && !u.startsWith("https://arena.ai/") && !u.equals("https://arena.ai"); }
    // 外部登录页加载失败：0.7 / 1.5 / 3 秒后各重试一次（节点偶尔把 Google 的连接错送到 ProxyIP，重试基本就好）；还不行回客户端登录页并说明原因
    final java.util.Map<WebView, long[]> extTries = new java.util.WeakHashMap<>();
    void extFail(final WebView v, final String u, int code, String desc) {
        long t = System.currentTimeMillis();
        long[] r = extTries.get(v); if (r == null || t - r[1] > 60000) { r = new long[] { 0, t }; extTries.put(v, r); }
        r[0]++;
        if (r[0] == 1) gProbe();   // 顺便重测本机能否直连 Google（VPN 断了就改回走节点，反之亦然）
        if (r[0] <= 3) { long d = r[0] == 1 ? 700 : r[0] == 2 ? 1500 : 3000; ui.postDelayed(() -> { try { v.loadUrl(u); } catch (Throwable ignore) {} }, d); return; }
        extTries.remove(v);
        try { v.loadUrl(UI + "?gfail=" + Uri.encode(desc + "（" + code + "）")); } catch (Throwable ignore) {}
    }

    @Override public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        String u = web.getUrl();
        // Google 登录页（arena.ai 以外）：返回 = 取消登录，直接回客户端（不在 Google 的跳转链里一页页往回退）
        if (u != null && u.startsWith("https://") && !u.startsWith("https://arena.ai/")) { web.loadUrl(UI); return; }
        if (u != null && !u.startsWith(UI)) { if (web.canGoBack() && !u.startsWith(LOGIN)) web.goBack(); else web.loadUrl(UI); return; }
        // 界面内：先关闭侧栏/弹窗，否则退到后台（保持连接不中断）
        web.evaluateJavascript("(function(){try{if(window.__ancBack)return window.__ancBack()?1:0}catch(e){}var m=document.querySelector('.modal-back,.menu');if(m){m.remove();return 1}if(document.body.classList.contains('drawer')){document.body.classList.remove('drawer');return 1}return 0})()", v -> {
            if (!"1".equals(v)) moveTaskToBack(true);
        });
    }

    // 只有冷启动（进程被杀后重新打开）才先到选账号页；只是切到后台再回来 / 从桌面图标再点开：回到离开时的页面
    boolean ownAct = false, screenOff = false; long stoppedAt = 0;
    void showPick() { if (web != null) web.evaluateJavascript("try{window.__ancPick&&window.__ancPick()}catch(e){}", null); }
    @Override protected void onStart() { super.onStart(); inBg = false; if (KeepService.inst == null) KeepService.start(this); }
    @Override protected void onStop() {
        super.onStop(); stoppedAt = System.currentTimeMillis(); inBg = true;
        // 只是锁屏 / 熄屏：亮屏回来不算重新打开 App
        try { android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE); screenOff = pm != null && !pm.isInteractive(); } catch (Exception e) { screenOff = false; }
    }
    @Override protected void onRestart() {
        super.onRestart();
        ownAct = false; screenOff = false;
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); handleOpen(intent);
        if (intent != null && Intent.ACTION_MAIN.equals(intent.getAction())) ownAct = false;
    }
    // 不调用活跃流式页面的 web.onPause()/pauseTimers()：切到后台时保持流式接收，仅暂停无任务的空闲页面
    @Override protected void onPause() {
        super.onPause();
        try { saveAccountsNow(); } catch (Exception ignored) {}
        try { syncBgWebState(null, web); if (web != null) { String wid = ownerOf.get(web); if (wid == null || (!bgBusy(wid) && !workBusy(wid))) web.onPause(); } } catch (Exception ignored) {}
        CookieManager.getInstance().flush();
    }
    @Override protected void onDestroy() {
        workspacePreview.closeAll(); workspaceDownload.closeAll();
        // 真正退出（不是系统临时重建）：下次打开等于重新启动，要先选账号
        if (isFinishing()) { synchronized (MainActivity.class) { launchShown = false; } KeepService.stop(this); }
        ui.removeCallbacks(tick);
        for (WebView w : new ArrayList<>(webs.values())) { try { w.destroy(); } catch (Exception ignored) {} }
        webs.clear(); stopTun();
        synchronized (tunLock) { if (multiTun != null) { try { multiTun.proc.destroy(); } catch (Exception ignored) {} multiTun = null; } }
        super.onDestroy();
    }
}
