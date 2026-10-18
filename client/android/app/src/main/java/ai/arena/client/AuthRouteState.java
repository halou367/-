package ai.arena.client;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;

/** Pure authentication lease policy. No service cookies, passwords or bearer tokens. */
final class AuthRouteState {
    static final String[] CRITICAL = {"proxy", "proxyIp", "nodeId", "region", "xout", "fp"};
    static boolean locked(JSONObject a) { return a != null && a.optJSONObject("routeAuth") != null && !a.optJSONObject("routeAuth").optString("ticket").isEmpty(); }
    static String mode(JSONObject a) {
        String value = a.optString("routeMode");
        if (validMode(value)) return value;
        String p = a.optString("proxy");
        return p.toLowerCase().startsWith("vless://") ? (a.optBoolean("routeAuto", true) ? "auto" : "node") : p.matches("(?i)(direct|none|off|直连)") ? "direct" : "proxy";
    }
    static boolean validMode(String mode) { return "auto".equals(mode) || "node".equals(mode) || "proxy".equals(mode) || "direct".equals(mode); }
    static boolean recover(JSONObject a) { return !locked(a) && ("auto".equals(mode(a)) && a.optBoolean("routeAuto", true) || "node".equals(mode(a)) && a.optString("proxy").toLowerCase().startsWith("vless://") && a.optBoolean("nodeFailover", false)); }
    static void prefs(JSONObject a, String mode) throws Exception {
        if (!validMode(mode)) throw new Exception("连接模式无效");
        a.put("routeMode", mode).put("routeAuto", "auto".equals(mode)).put("nodeFailover", "node".equals(mode));
    }
    static String canonical(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return "\"\"";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; ArrayList<String> keys = new ArrayList<>(); java.util.Iterator<String> it = object.keys(); while (it.hasNext()) keys.add(it.next()); Collections.sort(keys);
            StringBuilder out = new StringBuilder("{"); for (String key : keys) { if (out.length() > 1) out.append(','); out.append(JSONObject.quote(key)).append(':').append(canonical(object.opt(key))); } return out.append('}').toString();
        }
        if (value instanceof JSONArray) { JSONArray array = (JSONArray) value; StringBuilder out = new StringBuilder("["); for (int i=0;i<array.length();i++) { if(i>0)out.append(',');out.append(canonical(array.opt(i))); }return out.append(']').toString(); }
        return value instanceof String ? JSONObject.quote((String)value) : value.toString();
    }
    static String signature(JSONObject a) throws Exception { JSONArray out=new JSONArray();for(String key:CRITICAL)out.put(a==null||a.isNull(key)?"":a.opt(key));return canonical(out); }
    // 和渲染进程 RouteState.signature 完全一致的写法（JSON.stringify：不转义 "/"，控制字符同 JS）。
    // 渲染进程发来的 expectedConfig 是 JS 算的；org.json 会把 "/" 写成 "\/"，直接比对 vless:// 永远不相等，手机上切换出口一律被拒。
    static String jsSignature(JSONObject a) { StringBuilder out=new StringBuilder("[");for(int i=0;i<CRITICAL.length;i++){if(i>0)out.append(',');Object v=a==null||a.isNull(CRITICAL[i])?null:a.opt(CRITICAL[i]);if(v==null||Boolean.FALSE.equals(v)||"".equals(v)||(v instanceof Number&&((Number)v).doubleValue()==0))v="";out.append(jsCanon(v));}return out.append(']').toString(); }
    static String jsCanon(Object value) {
        if (value == null || value == JSONObject.NULL) return "\"\"";
        if (value instanceof JSONObject) { JSONObject object=(JSONObject)value;ArrayList<String> keys=new ArrayList<>();java.util.Iterator<String> it=object.keys();while(it.hasNext())keys.add(it.next());Collections.sort(keys);StringBuilder out=new StringBuilder("{");for(String key:keys){if(out.length()>1)out.append(',');out.append(jsQuote(key)).append(':').append(jsCanon(object.opt(key)));}return out.append('}').toString(); }
        if (value instanceof JSONArray) { JSONArray array=(JSONArray)value;StringBuilder out=new StringBuilder("[");for(int i=0;i<array.length();i++){if(i>0)out.append(',');out.append(jsCanon(array.opt(i)));}return out.append(']').toString(); }
        return value instanceof String ? jsQuote((String)value) : String.valueOf(value);
    }
    static String jsQuote(String s) {
        StringBuilder out=new StringBuilder(s.length()+2).append('"');
        for(int i=0;i<s.length();i++){char c=s.charAt(i);switch(c){case '"':out.append("\\\"");break;case '\\':out.append("\\\\");break;case '\b':out.append("\\b");break;case '\f':out.append("\\f");break;case '\n':out.append("\\n");break;case '\r':out.append("\\r");break;case '\t':out.append("\\t");break;
            default: if(c<0x20)out.append(String.format("\\u%04x",(int)c));else if(Character.isSurrogate(c)&&!(Character.isHighSurrogate(c)&&i+1<s.length()&&Character.isLowSurrogate(s.charAt(i+1)))&&!(Character.isLowSurrogate(c)&&i>0&&Character.isHighSurrogate(s.charAt(i-1))))out.append(String.format("\\u%04x",(int)c));else out.append(c);}}
        return out.append('"').toString();
    }
    // 渲染进程给的配置签名：JS 写法或 Java 写法任一相等即视为没变
    static boolean sameConfig(JSONObject a, String expected) throws Exception { return expected.equals(jsSignature(a)) || expected.equals(signature(a)); }
    static String routeKey(JSONObject a) throws Exception { JSONArray out=new JSONArray();for(String key:new String[]{"proxy","proxyIp","nodeId","region"})out.put(a.optString(key,""));return canonical(out); }
    static String probeKey(JSONObject a) throws Exception { JSONArray out=new JSONArray();for(String key:new String[]{"proxy","proxyIp","nodeId","xout"})out.put(a.optString(key,""));return canonical(out); }
    static JSONObject merge(JSONObject a, JSONObject patch) throws Exception { JSONObject out=new JSONObject(a.toString());java.util.Iterator<String> it=patch.keys();while(it.hasNext()){String key=it.next();out.put(key,patch.opt(key));}return out; }
    static void assertChange(JSONObject a, JSONObject patch) throws Exception {
        if (!locked(a)) return;
        if (!signature(a).equals(signature(merge(a,patch)))) throw new Exception("账号正在认证，节点、出口、地区和指纹已锁定");
        if (patch.has("routeMode")&&!mode(a).equals(patch.optString("routeMode")) || patch.has("routeAuto")&&a.optBoolean("routeAuto",true)!=patch.optBoolean("routeAuto") || patch.has("nodeFailover")&&a.optBoolean("nodeFailover",false)!=patch.optBoolean("nodeFailover")) throw new Exception("认证期间不能更改线路策略");
        JSONObject task=a.optJSONObject("routeAuth");if(patch.has("email")&&!task.optString("email").isEmpty()&&!task.optString("email").equalsIgnoreCase(patch.optString("email").trim()))throw new Exception("认证目标邮箱已锁定，请先取消旧认证任务");
    }
    static JSONObject status(JSONObject a,long now) throws Exception {
        if(!locked(a))return new JSONObject().put("ok",true).put("locked",false);
        JSONObject task=a.optJSONObject("routeAuth");return new JSONObject().put("ok",true).put("locked",true).put("ticket",task.optString("ticket")).put("email",task.optString("email")).put("kind",task.optString("kind")).put("stage",task.optString("stage")).put("preparing",task.optBoolean("preparing")).put("expires",task.optLong("expires")).put("expired",task.optLong("expires")<=now);
    }
    static JSONObject task(JSONObject a,JSONObject request,long now,String nonce,String environment) throws Exception {
        String op=request.optString("op");JSONObject previous=a.optJSONObject("routeAuth");
        if("status".equals(op))return status(a,now);
        if("cancel".equals(op)){if(locked(a)&&!previous.optString("ticket").equals(request.optString("ticket")))throw new Exception("认证任务已改变，未取消");a.remove("routeAuth");return status(a,now);}
        if("stage".equals(op)){if(!locked(a)||!previous.optString("ticket").equals(request.optString("ticket"))||previous.optLong("expires")<=now||!"waiting-mail".equals(request.optString("stage"))||!request.optString("kind").matches("signup|forgot"))throw new Exception("认证步骤未确认");a.put("routeAuth",new JSONObject(previous.toString()).put("stage","waiting-mail").put("kind",request.optString("kind")));return status(a,now);}
        boolean preparing="prepare".equals(op);
        String email=request.optString("email").trim(),ip=request.optString("ip");
        if(!preparing&&!ip.matches("[0-9A-Fa-f:.]{3,64}"))throw new Exception("缺少当前账号的实际出口证明，已停止认证");
        if(preparing||"begin".equals(op)){
            if(!request.optString("kind").matches("login|signup|forgot|reset|google|verify"))throw new Exception("认证任务参数无效");
            if(!"google".equals(request.optString("kind"))&&!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))throw new Exception("认证邮箱无效");
            JSONObject expected=request.optJSONObject("expected");if(expected==null||!a.optString("id").equals(expected.optString("id"))||!signature(a).equals(signature(expected)))throw new Exception("出口检测期间配置已改变，请重新检测");
            if(!locked(a)){a.put("routeAuth",new JSONObject().put("ticket",nonce).put("email",email).put("kind",request.optString("kind")).put("preparing",preparing).put("ip",preparing?"":ip).put("environment",environment).put("snapshot",signature(a)).put("at",now).put("expires",now+30*60000L));return status(a,now);}
        }else if(!"finish".equals(op))throw new Exception("认证任务操作无效");
        if(!locked(a))throw new Exception("认证任务不存在，未确认完成");
        if(previous.optLong("expires")<=now)throw new Exception("认证任务已超时，线路仍锁定；请明确取消旧任务");
        if(!signature(a).equals(previous.optString("snapshot"))||!environment.equals(previous.optString("environment")))throw new Exception("认证线路或浏览器环境已改变，已停止认证");
        if(!preparing&&!previous.optString("ip").isEmpty()&&!ip.equals(previous.optString("ip")))throw new Exception("实际出口 IP 已改变，已停止认证；请取消旧任务后重新核对");
        if(!("finish".equals(op)&&"login".equals(previous.optString("kind")))&&!previous.optString("email").isEmpty()&&!previous.optString("email").equalsIgnoreCase(email))throw new Exception("认证邮箱与当前任务不一致");
        if("begin".equals(op))a.put("routeAuth",new JSONObject(previous.toString()).put("ip",ip).put("preparing",false));
        if("finish".equals(op)){if(previous.optBoolean("preparing"))throw new Exception("实际出口尚未确认，认证任务仍锁定");if(email.isEmpty()||!previous.optString("ticket").equals(request.optString("ticket")))throw new Exception("身份或认证任务未确认，未解锁");a.remove("routeAuth");}
        return status(a,now);
    }
}
