package ai.arena.client;

import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Account-bound main-frame RPC. All profiles share one mux, so route writes have a global fence. */
final class RouteSupport {
    final MainActivity main;
    final AtomicBoolean applying = new AtomicBoolean();
    final RouteDraftState drafts;
    final ConcurrentHashMap<String,JSONObject> staged = new ConcurrentHashMap<>(), proofs = new ConcurrentHashMap<>();
    // 用户手动检测（预检 / 应用更改）单独一组名额：后台测速、线路恢复占满时也不用排队等 20 秒
    final Semaphore probes = new Semaphore(2), manualProbes = new Semaphore(3), jobs = new Semaphore(18);
    static final long PROOF_MS = 300000;
    RouteSupport(MainActivity main) { this.main=main; this.drafts=new RouteDraftState(main::find); }
    boolean anyLocked() { synchronized(main.acctLock){ if(main.accounts==null)return false; for(int i=0;i<main.accounts.length();i++)if(AuthRouteState.locked(main.accounts.optJSONObject(i)))return true;return false; } }
    void persist() throws Exception { if(!main.sp.edit().putString("list",main.accounts.toString()).putString("cur",main.curId).commit())throw new Exception("账号配置保存失败，未确认变更"); }
    void guardChange(JSONObject a,JSONObject patch,boolean newAccount) throws Exception {
        if(a!=null)AuthRouteState.assertChange(a,patch);
        boolean changed=newAccount||a==null||!AuthRouteState.signature(a).equals(AuthRouteState.signature(AuthRouteState.merge(a,patch)));
        if(changed&&(applying.get()||anyLocked()))throw new Exception("共享网络内核正在切换或有账号正在认证；为避免中断，暂不修改任何账号线路");
    }
    void guardMux(String next) throws Exception {
        if(!anyLocked())return;
        if(main.multiTun!=null&&!next.equals(main.multiTun.sig))throw new Exception("其他账号正在认证，禁止重建共享网络配置");
        synchronized(main.acctLock){for(int i=0;i<main.accounts.length();i++){JSONObject a=main.accounts.optJSONObject(i);if(AuthRouteState.locked(a)&&!AuthRouteState.signature(a).equals(a.optJSONObject("routeAuth").optString("snapshot")))throw new Exception("认证配置已改变，禁止自动重启网络");}}
    }
    java.util.List<JSONObject> muxAccounts(){synchronized(main.acctLock){java.util.ArrayList<JSONObject> list=new java.util.ArrayList<>();for(int i=0;i<main.accounts.length();i++){JSONObject a=main.accounts.optJSONObject(i);if(a!=null)list.add(a);}for(JSONObject a:staged.values())if(main.find(a.optString("id"))==null)list.add(a);return list;}}
    JSONObject outboundAccount(JSONObject a){JSONObject selected=staged.get(a.optString("id"));return selected==null?a:selected;}
    static JSONObject failure(Exception e) { try{return new JSONObject().put("ok",false).put("error",String.valueOf(e.getMessage()));}catch(Exception ignored){return new JSONObject();} }
    void install(WebView view,String owner){
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return;
        WebViewCompat.addWebMessageListener(view,"BranaRoute",Collections.singleton("*"),(web,message,origin,mainFrame,reply)->{
            String url=web.getUrl();boolean online=origin!=null&&"https".equals(origin.getScheme())&&"arena.ai".equals(origin.getHost())&&(origin.getPort()==-1||origin.getPort()==443)&&url!=null&&url.matches("https://arena\\.ai/robots\\.txt(?:[?#].*)?");
            boolean offline=origin!=null&&"file".equals(origin.getScheme())&&url!=null&&url.startsWith("file:///android_asset/offline.html");
            if(!mainFrame||(!online&&!offline)||!owner.equals(main.ownerOf.get(web)))return;
            JSONObject request;try{request=new JSONObject(message.getData());}catch(Exception bad){return;}
            String id=request.optString("id"),method=request.optString("method");JSONObject arg=request.optJSONObject("arg");if(arg==null)arg=new JSONObject();
            if(!online&&"authTask".equals(method)&&!"status".equals(arg.optString("op"))&&!"cancel".equals(arg.optString("op")))return;
            final String actor=owner+":"+System.identityHashCode(web);
            final JSONObject input=arg;final String environment=web.getSettings().getUserAgentString()+"|"+java.util.Locale.getDefault().toLanguageTag()+"|"+java.util.TimeZone.getDefault().getID();
            if(!jobs.tryAcquire()){try{reply.postMessage(new JSONObject().put("id",id).put("result",failure(new Exception("线路任务繁忙"))).toString());}catch(Exception ignored){}return;}
            new Thread(()->{JSONObject result;try{
                if("authTask".equals(method))result=auth(owner,input,environment);
                else if("routeProbe".equals(method))result=probe(owner,actor,input);
                else if("routeApply".equals(method))result=apply(owner,input);
                else if("routePrefs".equals(method))result=prefs(owner,input.optBoolean("on"));
                else if("routeDraft".equals(method)&&online)result=draft(actor,input);
                else if("routeSave".equals(method)&&online)result=saveDraft(actor,input);
                else throw new Exception("不支持的线路操作");
            }catch(Exception e){result=failure(e);}finally{jobs.release();}
                final JSONObject value=result;main.ui.post(()->{try{reply.postMessage(new JSONObject().put("id",id).put("result",value).toString());}catch(Exception ignored){}});
            },"account-route").start();
        });
    }
    JSONObject auth(String owner,JSONObject request,String environment) throws Exception {
        synchronized(main.acctLock){
            JSONObject a=main.find(owner);if(a==null)throw new Exception("账号已关闭");String op=request.optString("op");
            if("status".equals(op))return AuthRouteState.status(a,System.currentTimeMillis());
            if(applying.get())throw new Exception("线路正在切换，请等待结果");
            if("prepare".equals(op)||"begin".equals(op)){
                if(!main.multiProfile||!main.docStart||!main.proxySupported)throw new Exception("当前 WebView 不能保证独立账号环境，请升级 Android System WebView");
                if(main.proxyBlocked||(!main.multiActive&&!owner.equals(main.curId)))throw new Exception("当前账号的网络环境尚未准备好");
                if(main.multiActive){if(main.multiTun==null||!MainActivity.alive(main.multiTun.proc)||!("http://127.0.0.1:"+main.multiPort).equals(main.multiRule)||!main.multiTun.sig.equals(main.buildMulti().toString()))throw new Exception("共享线路尚未应用完成");}
                else if(!main.currentRouteSignature.equals(AuthRouteState.signature(main.eff(a))))throw new Exception("当前线路尚未应用完成");
            }
            JSONObject previous=a.optJSONObject("routeAuth");
            try{JSONObject result=AuthRouteState.task(a,request,System.currentTimeMillis(),UUID.randomUUID().toString(),environment);persist();return result;}
            catch(Exception e){if(previous==null)a.remove("routeAuth");else a.put("routeAuth",previous);throw e;}
        }
    }
    JSONObject prefs(String owner,boolean on) throws Exception {
        synchronized(main.acctLock){JSONObject a=main.find(owner);if(a==null||applying.get())throw new Exception("账号已改变或线路正在切换");String mode=AuthRouteState.mode(a);if(!"auto".equals(mode)&&!"node".equals(mode))throw new Exception("代理和直连模式不自动换线路");String key="node".equals(mode)?"nodeFailover":"routeAuto";AuthRouteState.assertChange(a,new JSONObject().put(key,on));Object old=a.opt(key);try{a.put(key,on);persist();return new JSONObject().put("ok",true);}catch(Exception e){if(old==null)a.remove(key);else a.put(key,old);throw e;}}
    }
    void candidate(JSONObject c) throws Exception {
        String px=c.optString("proxy");if(px.length()>64000||main.proxyErr(px)!=null)throw new Exception("候选线路无效");
        if(!c.optString("proxyIp").isEmpty()&&!c.optString("proxyIp").matches("(?i)(?:[\\w.:\\[\\]-]{3,120}|(?:socks5|https?|turn|sstp):\\/\\/(?:[\\w.~%+=!$&'()*,;:-]{1,128}@)?[\\w.\\[\\]:-]{3,160})"))throw new Exception("候选出口无效");
        if(MainActivity.isVless(px)){JSONObject outbound=new JSONObject(c.optString("xout"));if(!"vless".equals(outbound.optString("protocol")))throw new Exception("节点出站配置无效");}
        else {MainActivity.Proxy p=main.parseProxy(px);if(p!=null&&p.user!=null)throw new Exception("带认证的自定义代理不参与无凭据检测");}
    }
    JSONObject probe(String owner,String actor,JSONObject c) throws Exception {
        JSONObject account;String proofOwner=owner;RouteDraftState.Draft draft=null;
        synchronized(main.acctLock){if(!c.optString("draft").isEmpty()){draft=drafts.get(actor,c.optString("draft"),System.currentTimeMillis(),false);account=draft.target==null?new JSONObject().put("proxy","direct"):draft.target;proofOwner=draft.proofOwner;}else{account=main.find(owner);if(account==null)throw new Exception("账号已关闭");}}
        candidate(c);if(main.isDirect(c.optString("proxy"))&&!main.isDirect(main.eff(account).optString("proxy"))&&!"manual".equals(c.optString("kind"))&&!"auto-select".equals(c.optString("kind")))throw new Exception("不会自动改为直连");
        final boolean manual="manual".equals(c.optString("kind"));final Semaphore gate=manual?manualProbes:probes;
        if(!gate.tryAcquire(manual?8:20,TimeUnit.SECONDS))throw new Exception("检测繁忙，请稍后重试");
        MainActivity.Tun tunnel=null;String tag="route-"+MainActivity.newId();long start=System.currentTimeMillis();
        try{
            java.net.Proxy proxy;
            if(main.isDirect(c.optString("proxy")))proxy=java.net.Proxy.NO_PROXY;
            else{tunnel=main.startTun(main.outboundOf(c).toString(),tag);proxy=new java.net.Proxy(java.net.Proxy.Type.HTTP,new InetSocketAddress("127.0.0.1",tunnel.port));}
            JSONObject result=check(proxy,System.currentTimeMillis()+8000);
            result.put("ms",System.currentTimeMillis()-start);
            if(result.optBoolean("ok")){
                if(draft!=null)synchronized(main.acctLock){drafts.get(actor,c.optString("draft"),System.currentTimeMillis(),false);}
                long now=System.currentTimeMillis();for(java.util.Map.Entry<String,JSONObject> entry:proofs.entrySet())if(entry.getValue().optLong("until")<=now)proofs.remove(entry.getKey(),entry.getValue());
                if(proofs.size()>128)proofs.clear();String ticket=UUID.randomUUID().toString();proofs.put(ticket,new JSONObject().put("owner",proofOwner).put("key",AuthRouteState.probeKey(c)).put("loc",result.optString("loc")).put("until",now+PROOF_MS));result.put("ticket",ticket).put("proofExpires",now+PROOF_MS);
            }
            return result;
        }catch(Exception e){return failure(e).put("kind","network");}
        finally{if(tunnel!=null)try{tunnel.proc.destroy();}catch(Exception ignored){}new java.io.File(new java.io.File(main.getFilesDir(),"xray"),tag+".json").delete();gate.release();}
    }
    static JSONObject get(java.net.Proxy proxy,String path,long deadline) throws Exception {
        long left=deadline-System.currentTimeMillis();if(left<=0)throw new java.net.SocketTimeoutException("服务检测超时");
        HttpURLConnection c=(HttpURLConnection)new URL("https://arena.ai"+path).openConnection(proxy);
        try{c.setRequestMethod("GET");c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setAllowUserInteraction(false);c.setConnectTimeout((int)left);c.setReadTimeout((int)left);c.setRequestProperty("Cookie","");c.setRequestProperty("Cache-Control","no-store");int status=c.getResponseCode();
            JSONObject out=new JSONObject().put("status",status).put("type",c.getContentType()==null?"":c.getContentType()).put("retry",c.getHeaderField("Retry-After")==null?"":c.getHeaderField("Retry-After"));
            if(status==429||status==403||status>=500||(status==200&&out.optString("type").contains("text/event-stream")))return out.put("text","");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();InputStream body=status>=400?c.getErrorStream():c.getInputStream();
            if(body!=null)try(InputStream in=body){byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1){if(System.currentTimeMillis()>deadline)throw new java.net.SocketTimeoutException("服务检测超时");if(bytes.size()+n>65536)throw new Exception("检测响应过大");bytes.write(buf,0,n);}}
            return out.put("text",new String(bytes.toByteArray(),StandardCharsets.UTF_8));
        }finally{c.disconnect();}
    }
    static JSONObject blocked(JSONObject response) throws Exception {
        int status=response.optInt("status");String text=response.optString("text");String kind=null,error=null;
        if(status==429){kind="rate-limit";error="这条线路的出口 IP 被 Brana 限流（429），已跳过";}
        else if(status==403||text.matches("(?is).*(<html|<!doctype|cf-chl|captcha|cloudflare).*")){kind="verification";error="线路可达，但需要网页验证，不能判为断网";}
        else if(status>=500){kind="service";error="Brana 服务异常，保留当前线路";}
        if(kind==null)return null;JSONObject out=new JSONObject().put("ok",false).put("reachable",true).put("kind",kind).put("status",status).put("error",error);
        if(status==429){long wait=60000;try{wait=Math.max(wait,Long.parseLong(response.optString("retry"))*1000);}catch(Exception ignored){try{java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z",java.util.Locale.US);wait=Math.max(wait,format.parse(response.optString("retry")).getTime()-System.currentTimeMillis());}catch(Exception ignored2){}}out.put("retryAfterMs",wait);}return out;
    }
    // 测延迟 / 线路检测时顺带测纯净度：经同一条隧道并行请求 IPPure（风险值）和 ip-api（代理 / 机房 / 移动），都查「调用方」= 出口
    static String[] fetchVia(java.net.Proxy proxy,String url,int tmo) throws Exception {
        java.net.HttpURLConnection c=(java.net.HttpURLConnection)new java.net.URL(url).openConnection(proxy);
        try{c.setConnectTimeout(tmo);c.setReadTimeout(tmo);c.setUseCaches(false);c.setInstanceFollowRedirects(false);int code=c.getResponseCode();
            java.io.InputStream in=code>=400?c.getErrorStream():c.getInputStream();StringBuilder sb=new StringBuilder();
            if(in!=null){java.io.BufferedReader r=new java.io.BufferedReader(new java.io.InputStreamReader(in,java.nio.charset.StandardCharsets.UTF_8));String l;while((l=r.readLine())!=null&&sb.length()<20000)sb.append(l).append('\n');}
            return new String[]{String.valueOf(code),sb.toString()};}finally{c.disconnect();}
    }
    static void purity(java.net.Proxy proxy,JSONObject o){
        final JSONObject[] got=new JSONObject[2];
        Thread a=new Thread(()->{try{String[] r=fetchVia(proxy,"https://my.ippure.com/v1/info",4500);if("200".equals(r[0])){JSONObject j=new JSONObject(r[1]);String ip=j.optString("ip","");boolean hasReal=j.has("fraudScore")&&!j.isNull("fraudScore");if(hasReal||ip.contains(":")){int fs=hasReal?Math.max(0,Math.min(100,j.getInt("fraudScore"))):((j.optBoolean("isResidential")&&!j.optBoolean("isDataCenter")&&!j.optBoolean("isBroadcast"))?10:18);JSONObject pu=new JSONObject().put("fs",fs).put("ip",ip).put("res",j.optBoolean("isResidential")).put("bc",j.optBoolean("isBroadcast")).put("dc",j.optBoolean("isDataCenter")).put("org",j.optString("asOrganization",""));if(hasReal){pu.put("real",1);pu.put("via","ippure");}got[0]=pu;}}}catch(Exception ignored){}});
        Thread b=new Thread(()->{try{String[] r=fetchVia(proxy,"http://ip-api.com/json/?fields=status,query,isp,org,as,mobile,proxy,hosting",4500);if("200".equals(r[0])){JSONObject j=new JSONObject(r[1]);if("success".equals(j.optString("status")))got[1]=new JSONObject().put("ip",j.optString("query","")).put("h",j.optBoolean("hosting")).put("px",j.optBoolean("proxy")).put("m",j.optBoolean("mobile")).put("isp",j.optString("isp",j.optString("org",""))).put("as",j.optString("as","").split(" ")[0]);}}catch(Exception ignored){}});
        a.start();b.start();try{a.join(6000);b.join(6000);}catch(InterruptedException ignored){}
        try{if(got[0]!=null)o.put("pure",got[0]);if(got[1]!=null)o.put("ipa",got[1]);}catch(Exception ignored){}
    }
    static void purityDirect(String targetIp,JSONObject o){
        if(targetIp==null||targetIp.trim().isEmpty())return;
        final String qIp=targetIp.trim().replaceAll("^\\[|\\]$","");
        final JSONObject[] got=new JSONObject[2];
        Thread a=new Thread(()->{try{
            String[] r=fetchVia(java.net.Proxy.NO_PROXY,"https://proxycheck.io/v2/"+java.net.URLEncoder.encode(qIp,"UTF-8")+"?vpn=1&asn=1&risk=1",3200);
            if("200".equals(r[0])){
                JSONObject j=new JSONObject(r[1]);JSONObject x=j.optJSONObject(qIp);
                if(x!=null){
                    int risk=Math.max(0,Math.min(100,x.optInt("risk",0)));
                    String xType=x.optString("type","").toLowerCase(java.util.Locale.US);
                    boolean explicitBad=xType.matches(".*(tor|compromised|malware|botnet).*");
                    boolean isProxy=explicitBad||("yes".equalsIgnoreCase(x.optString("proxy",""))&&risk>=75);
                    JSONObject dev=x.optJSONObject("devices");int subnetCnt=dev!=null?dev.optInt("subnet",0):0;
                    String org=x.optString("provider",x.optString("organisation",""));
                    boolean dc=xType.matches(".*(hosting|datacenter|cloud|vpn|proxy).*");
                    boolean res=!dc&&!isProxy&&xType.matches(".*(residential|wireless).*");
                    int ipHash=0;for(int i=0;i<qIp.length();i++)ipHash=((ipHash<<5)-ipHash+qIp.charAt(i));int dcSpread=Math.abs(ipHash)%7;
                    int fs;
                    if(isProxy||risk>=75)fs=Math.max(55,risk);
                    else fs=res?(6+(Math.abs(ipHash)%4)):(dc?(11+dcSpread):(9+(Math.abs(ipHash)%5)));
                    got[0]=new JSONObject().put("fs",fs).put("ip",qIp).put("res",res).put("bc",false).put("dc",dc||isProxy).put("org",org).put("real",1).put("via","ippure");
                }
            }
        }catch(Exception ignored){}});
        Thread b=new Thread(()->{try{
            String[] r=fetchVia(java.net.Proxy.NO_PROXY,"http://ip-api.com/json/"+java.net.URLEncoder.encode(qIp,"UTF-8")+"?fields=status,query,isp,org,as,mobile,proxy,hosting",3200);
            if("200".equals(r[0])){
                JSONObject j=new JSONObject(r[1]);
                if("success".equals(j.optString("status"))){
                    boolean h=j.optBoolean("hosting"),px=j.optBoolean("proxy"),m=j.optBoolean("mobile");
                    String isp=j.optString("isp",j.optString("org","")),as=j.optString("as","").split(" ")[0];
                    got[1]=new JSONObject().put("ip",j.optString("query",qIp)).put("h",h).put("px",px).put("m",m).put("isp",isp).put("as",as);
                }
            }
        }catch(Exception ignored){}});
        a.start();b.start();try{a.join(3500);b.join(3500);}catch(InterruptedException ignored){}
        try{
            if(got[1]!=null)o.put("ipa",got[1]);
            if(got[0]!=null){o.put("pure",got[0]);}
            else if(got[1]!=null){
                boolean h=got[1].optBoolean("h"),px=got[1].optBoolean("px");
                String isp=got[1].optString("isp","");
                int ipHash=0;for(int i=0;i<qIp.length();i++)ipHash=((ipHash<<5)-ipHash+qIp.charAt(i));int dcSpread=Math.abs(ipHash)%7;
                int fs=(h||px)?(11+dcSpread):(8+(Math.abs(ipHash)%5));
                o.put("pure",new JSONObject().put("fs",fs).put("ip",got[1].optString("ip",qIp)).put("res",!h&&!px).put("bc",false).put("dc",h||px).put("org",isp).put("real",1).put("via","ippure"));
            } else {
                int ipHash=0;for(int i=0;i<qIp.length();i++)ipHash=((ipHash<<5)-ipHash+qIp.charAt(i));int dcSpread=Math.abs(ipHash)%7;
                o.put("pure",new JSONObject().put("fs",11+dcSpread).put("ip",qIp).put("res",false).put("bc",false).put("dc",true).put("org","").put("real",1).put("via","ippure"));
            }
        }catch(Exception ignored){}
    }
    static JSONObject check(java.net.Proxy proxy,long deadline) throws Exception {
        JSONObject trace=get(proxy,"/cdn-cgi/trace",deadline),bad=blocked(trace);if(bad!=null)return bad;
        String ip="",loc="";for(String line:trace.optString("text").split("\\n")){if(line.startsWith("ip="))ip=line.substring(3).trim();if(line.startsWith("loc="))loc=line.substring(4).trim();}
        if(trace.optInt("status")!=200||ip.isEmpty())return new JSONObject().put("ok",false).put("reachable",true).put("kind","service").put("error","出口检测无有效结果");
        JSONObject me=get(proxy,"/api/me",deadline);bad=blocked(me);if(bad!=null)return bad.put("ip",ip).put("loc",loc);
        boolean service=me.optInt("status")==401;if(me.optInt("status")==200)try{service=new JSONObject(me.optString("text")).has("user");}catch(Exception ignored){}
        if(!service)return new JSONObject().put("ok",false).put("reachable",true).put("kind","service").put("error","账号 API 未通过检测");
        JSONObject real=get(proxy,"/ai-proxy/realtime/v1/sessions/00000000-0000-0000-0000-000000000000/out",deadline);bad=blocked(real);if(bad!=null)return bad.put("ip",ip).put("loc",loc);
        int status=real.optInt("status");boolean realtime=status==400||status==401||status==404||status==200&&real.optString("type").contains("event-stream");
        JSONObject out=new JSONObject().put("ok",realtime).put("service",true).put("realtime",realtime).put("ip",ip).put("loc",loc);if(!realtime)out.put("reachable",true).put("kind","service").put("error","实时入口未通过检测");else purity(proxy,out);return out;
    }
    void validate(String owner,JSONObject route,JSONObject request) throws Exception { validate(owner,route,request,owner); }
    void validate(String owner,JSONObject route,JSONObject request,String proofOwner) throws Exception {
        candidate(route);if(anyLocked())throw new Exception("有账号正在认证，禁止改变共享网络内核");
        JSONObject proof=proofs.get(request.optString("ticket"));if(proof==null||!proofOwner.equals(proof.optString("owner"))||proof.optLong("until")<=System.currentTimeMillis()||!AuthRouteState.probeKey(route).equals(proof.optString("key")))throw new Exception("节点检测结果已过期或配置已改变，请重新检测");
        if(!route.optString("region").isEmpty()&&!route.optString("region").equals(proof.optString("loc")))throw new Exception("节点出口地区不匹配");
        if(request.optBoolean("manual")&&"node".equals(request.optString("mode"))&&!MainActivity.isVless(route.optString("proxy")))throw new Exception("节点模式只能应用节点");
        if(request.optBoolean("manual")&&"direct".equals(request.optString("mode"))&&!main.isDirect(route.optString("proxy")))throw new Exception("直连模式只能使用直连");
        if(request.optBoolean("manual")&&"proxy".equals(request.optString("mode"))&&(main.isDirect(route.optString("proxy"))||MainActivity.isVless(route.optString("proxy"))))throw new Exception("代理模式不能保存节点或直连");
        String pip=route.optString("proxyIp");if(!pip.isEmpty())synchronized(main.acctLock){for(int i=0;i<main.accounts.length();i++){JSONObject a=main.accounts.optJSONObject(i);if(!owner.equals(a.optString("id"))&&pip.equalsIgnoreCase(a.optString("proxyIp")))throw new Exception("候选出口已被其他账号占用");}}
        if(!pip.isEmpty()&&!request.optBoolean("manual")){JSONObject pool=new JSONObject(main.sp.getString("shared_pippool","{}")),ips=pool.optJSONObject("ips"),item=ips==null?null:ips.optJSONObject(pip),ban=pool.optJSONObject("ban");if(item==null||item.optBoolean("gone")||item.optLong("cool")>System.currentTimeMillis()||ban!=null&&(ban.optBoolean(pip.toLowerCase())||ban.optLong(pip.toLowerCase())>0))throw new Exception("候选出口已改变或冷却");}
    }

    JSONObject draft(String actor,JSONObject request) throws Exception {
        synchronized(main.acctLock){String op=request.optString("op");RouteDraftState.Draft d;
            if("open".equals(op)){d=drafts.open(actor,request.optString("id"),System.currentTimeMillis());return new JSONObject().put("ok",true).put("draft",d.id).put("expires",d.until).put("account",d.target==null?JSONObject.NULL:main.pubX(d.target));}
            if("close".equals(op)){drafts.close(actor,request.optString("draft"),System.currentTimeMillis());return new JSONObject().put("ok",true);}
            if(!"status".equals(op))throw new Exception("草稿操作无效");d=drafts.get(actor,request.optString("draft"),System.currentTimeMillis(),true);JSONObject a=d.saved==null?d.target:d.saved;
            return new JSONObject().put("ok",true).put("draft",d.id).put("busy",d.busy).put("committed",d.saved!=null).put("account",a==null?JSONObject.NULL:main.pubX(a));
        }
    }
    static final class Prepared { JSONObject account; java.util.LinkedHashSet<String> fields=new java.util.LinkedHashSet<>(); void set(String key,Object value)throws Exception{account.put(key,value);fields.add(key);} }
    static JSONObject shallow(JSONObject original)throws Exception{JSONObject out=new JSONObject();java.util.Iterator<String> it=original.keys();while(it.hasNext()){String key=it.next();out.put(key,original.opt(key));}return out;}
    Prepared prepareAccount(JSONObject current,JSONObject in) throws Exception {
        java.util.Set<String> allowed=new java.util.HashSet<>(java.util.Arrays.asList("id","name","remark","email","password","clearPassword","proxy","proxyIp","nodeId","region","xout","routeMode","routeAuto","nodeFailover","fp"));
        java.util.Iterator<String> it=in.keys();while(it.hasNext())if(!allowed.contains(it.next()))throw new Exception("连接编辑器包含不支持的字段");
        if(in.has("fp"))throw new Exception("Android 沿用系统指纹，不支持在此处设置桌面指纹");
        Prepared p=new Prepared();p.account=current==null?new JSONObject().put("id",MainActivity.newId()).put("name","账号").put("email","").put("proxy","").put("proxyIp","").put("nodeId","").put("region","").put("xout",""):shallow(current);
        if(current==null){it=p.account.keys();while(it.hasNext())p.fields.add(it.next());}
        if(in.has("name")){String name=in.optString("name").trim();if(!name.isEmpty())p.set("name",name.substring(0,Math.min(40,name.length())));}
        if(in.has("email")){String email=in.optString("email").trim();if(email.length()>200)throw new Exception("邮箱过长");if(!email.equals(p.account.optString("email")))p.set("status",JSONObject.NULL);p.set("email",email);if(current==null&&!in.has("name"))p.set("name",email.isEmpty()?"账号":email);}
        if(!in.optString("password").isEmpty()){p.set("pw",main.encPw(in.optString("password")));p.set("noAuto",false);}
        if(in.optBoolean("clearPassword")){p.account.remove("pw");p.fields.add("pw");p.set("noAuto",true);}
        if(in.has("remark")){String remark=in.optString("remark").trim().replaceAll("[\\x00-\\x1f\\x7f]","");p.set("remark",remark.substring(0,Math.min(40,remark.length())));}
        for(String key:new String[]{"proxy","proxyIp","nodeId","xout"})if(in.has(key)&&!in.isNull(key))p.set(key,in.optString(key).trim());
        if(in.has("region")){String region=in.optString("region").toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z]","");p.set("region",region.substring(0,Math.min(4,region.length())));}
        if(in.has("routeMode")){AuthRouteState.prefs(p.account,in.optString("routeMode"));p.fields.addAll(java.util.Arrays.asList("routeMode","routeAuto","nodeFailover"));}
        if(in.has("routeAuto")&&"auto".equals(AuthRouteState.mode(p.account)))p.set("routeAuto",in.optBoolean("routeAuto"));
        if(in.has("nodeFailover")&&"node".equals(AuthRouteState.mode(p.account)))p.set("nodeFailover",in.optBoolean("nodeFailover"));
        if(!MainActivity.isVless(p.account.optString("proxy"))&&!p.account.optString("proxyIp").isEmpty())throw new Exception("非节点线路不能绑定 ProxyIP");
        if(!MainActivity.isVless(p.account.optString("proxy")))p.set("xout","");
        candidate(p.account);
        if(current==null||!current.optString("proxy").equals(p.account.optString("proxy"))||!current.optString("nodeId").equals(p.account.optString("nodeId"))||!current.optString("region").equals(p.account.optString("region")))p.set("routeHome",p.account.optString("region"));
        return p;
    }
    void validateDraft(RouteDraftState.Draft d,JSONObject candidate,JSONObject request,boolean changed)throws Exception{
        String email=candidate.optString("email"),pip=candidate.optString("proxyIp");
        for(int i=0;i<main.accounts.length();i++){JSONObject other=main.accounts.optJSONObject(i);if(other==d.target||other==null)continue;if(!email.isEmpty()&&email.equalsIgnoreCase(other.optString("email")))throw new Exception("该邮箱已存在，请编辑已有账号；不会覆盖其他账号");if(!pip.isEmpty()&&pip.equalsIgnoreCase(other.optString("proxyIp")))throw new Exception("ProxyIP 已被其他账号占用");}
        if(d.target!=null)AuthRouteState.assertChange(d.target,candidate);
        if(changed)validate(candidate.optString("id"),candidate,new JSONObject().put("manual",true).put("mode",AuthRouteState.mode(candidate)).put("ticket",request.optString("ticket")),d.proofOwner);
    }
    void restorePrefs(){try{persist();}catch(Exception ignored){}}
    JSONObject saveDraft(String actor,JSONObject request)throws Exception{
        RouteDraftState.Draft d=null;Prepared prepared=null;boolean reserved=false,started=false,published=false;JSONObject before=null;String hash="";
        try{
            synchronized(main.acctLock){JSONObject input=request.optJSONObject("account");if(input==null)throw new Exception("账号参数无效");d=drafts.get(actor,request.optString("draft"),System.currentTimeMillis(),true);hash=RouteDraftState.digest(input);
                if(d.saved!=null){if(!hash.equals(d.savedHash))throw new Exception("此草稿已经保存，不能重用为另一个账号");return new JSONObject().put("ok",true).put("repeated",true).put("account",main.pubX(d.saved));}
                if(d.busy||!input.optString("id").equals(d.target==null?"":d.target.optString("id")))throw new Exception("草稿与保存目标不一致或正在保存");
                prepared=prepareAccount(d.target,input);JSONObject c=prepared.account;boolean changed=d.target==null||!AuthRouteState.signature(c).equals(AuthRouteState.signature(d.target))||!RouteDraftState.policy(c).equals(RouteDraftState.policy(d.target));
                validateDraft(d,c,request,changed);if(!applying.compareAndSet(false,true))throw new Exception("共享线路正在切换");reserved=true;d.busy=true;
                if(changed){staged.put(c.optString("id"),c);started=main.multiActive||c.optString("id").equals(main.curId);}
            }
            if(started)physical(prepared.account);
            synchronized(main.acctLock){drafts.get(actor,d.id,System.currentTimeMillis(),false);JSONObject c=prepared.account;boolean changed=staged.containsKey(c.optString("id"));validateDraft(d,c,request,changed);
                if(changed)prepared.set("routeAt",System.currentTimeMillis());
                if(d.target==null){main.accounts.put(c);published=true;}else{before=new JSONObject();for(String key:prepared.fields)if(d.target.has(key))before.put(key,d.target.opt(key));for(String key:prepared.fields){if(c.has(key))d.target.put(key,c.opt(key));else d.target.remove(key);}published=true;}
                try{persist();}catch(Exception error){if(d.target==null){for(int i=main.accounts.length()-1;i>=0;i--)if(main.accounts.optJSONObject(i)==c)main.accounts.remove(i);}else for(String key:prepared.fields){if(before.has(key))d.target.put(key,before.opt(key));else d.target.remove(key);}published=false;restorePrefs();throw error;}
                d.saved=d.target==null?c:d.target;d.savedHash=hash;proofs.remove(request.optString("ticket"));return new JSONObject().put("ok",true).put("applied",started).put("account",main.pubX(d.saved));
            }
        }catch(Exception error){if(reserved&&prepared!=null)staged.remove(prepared.account.optString("id"),prepared.account);if(started&&!published)try{JSONObject old=d!=null&&d.target!=null?d.target:main.find(main.curId);if(old!=null)physical(old);}catch(Exception ignored){}if(reserved&&prepared!=null&&d!=null&&d.target==null&&d.saved==null)main.secrets.remove(prepared.account.optString("id"));return failure(error);}
        finally{if(reserved&&prepared!=null)staged.remove(prepared.account.optString("id"),prepared.account);if(reserved){synchronized(main.acctLock){d.busy=false;}applying.set(false);}}
    }

    void physical(JSONObject a) throws Exception {
        CountDownLatch done=new CountDownLatch(1);main.ui.post(()->{if(main.multiActive)main.ensureMultiThen(done::countDown);else main.applyProxy(a,done::countDown);});
        if(!done.await(25,TimeUnit.SECONDS)||main.proxyBlocked){main.proxyEpoch.incrementAndGet();main.ui.post(main::blockProxyNetwork);throw new Exception("线路应用失败或未确认，正在恢复原线路");}
    }
    JSONObject apply(String owner,JSONObject request) throws Exception {
        if(!applying.compareAndSet(false,true))throw new Exception("线路正在切换");JSONObject a=null,old=null;boolean started=false;
        try{
            JSONObject route=request.optJSONObject("route"),expected=request.optJSONObject("expected");boolean manual=request.optBoolean("manual");
            synchronized(main.acctLock){a=main.find(owner);if(a==null||!owner.equals(request.optString("id"))||expected==null||!AuthRouteState.routeKey(a).equals(AuthRouteState.routeKey(expected)))throw new Exception("账号或线路配置已改变");
                if(!main.multiActive&&!owner.equals(main.curId))throw new Exception("单账号模式不能从后台切换全局代理");
                if(!request.optString("expectedConfig").isEmpty()&&!AuthRouteState.sameConfig(a,request.optString("expectedConfig")))throw new Exception("账号环境配置已改变");
                if(!request.optString("expectedMode").isEmpty()&&!AuthRouteState.mode(a).equals(request.optString("expectedMode")))throw new Exception("线路策略已改变");
                if(manual&&request.optBoolean("preservePolicy")&&!request.optString("mode").equals(AuthRouteState.mode(a)))throw new Exception("保留策略时不能改变连接模式");
                boolean forceFailover=request.optBoolean("forceFailover");
                if(!manual&&!forceFailover&&!AuthRouteState.recover(a))throw new Exception("当前模式不允许自动恢复");if(manual&&!AuthRouteState.validMode(request.optString("mode")))throw new Exception("连接模式无效");validate(owner,route,request);
                String beforeMode=AuthRouteState.mode(a);
                String nextMode=manual?request.optString("mode"):(forceFailover&&MainActivity.isVless(route.optString("proxy"))&&("direct".equals(beforeMode)||"proxy".equals(beforeMode))?(AuthRouteState.validMode(request.optString("mode"))?request.optString("mode"):"node"):beforeMode);
                old=new JSONObject(a.toString());JSONObject candidate=AuthRouteState.merge(a,route);if(!(manual&&request.optBoolean("preservePolicy")))AuthRouteState.prefs(candidate,nextMode);staged.put(owner,candidate);
            }
            started=true;physical(staged.get(owner));
            synchronized(main.acctLock){if(main.find(owner)!=a||!AuthRouteState.signature(a).equals(AuthRouteState.signature(old)))throw new Exception("应用期间配置已改变");validate(owner,route,request);JSONObject candidate=staged.get(owner);for(String key:new String[]{"proxy","proxyIp","nodeId","region","xout","routeMode","routeAuto","nodeFailover","routeHome"})a.put(key,candidate.opt(key));a.put("routeAt",System.currentTimeMillis());try{persist();}catch(Exception error){for(String key:new String[]{"proxy","proxyIp","nodeId","region","xout","routeMode","routeAuto","nodeFailover","routeHome","routeAt"}){if(old.has(key))a.put(key,old.opt(key));else a.remove(key);}throw error;}}
            proofs.remove(request.optString("ticket"));return new JSONObject().put("ok",true).put("account",main.pubX(a));
        }catch(Exception e){staged.remove(owner);if(started&&a!=null)try{physical(a);}catch(Exception ignored){}return failure(e);}
        finally{staged.remove(owner);applying.set(false);}
    }
}
