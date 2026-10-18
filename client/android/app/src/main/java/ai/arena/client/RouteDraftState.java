package ai.arena.client;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Pure target-bound draft registry. The host calls it while holding its account lock. */
final class RouteDraftState {
    interface Find { JSONObject get(String id); }
    static final class Draft {
        String id, actor, proofOwner, revision, savedHash;
        long until; boolean busy;
        JSONObject target, saved;
    }
    final LinkedHashMap<String,Draft> entries = new LinkedHashMap<>();
    final Find find;
    RouteDraftState(Find find) { this.find=find; }
    static String policy(JSONObject a) throws Exception { return AuthRouteState.canonical(new JSONArray().put(AuthRouteState.mode(a)).put(a.optBoolean("routeAuto",true)).put(a.optBoolean("nodeFailover",false))); }
    static String revision(JSONObject a) throws Exception {
        if(a==null)return "new";
        return AuthRouteState.canonical(new JSONArray().put(AuthRouteState.signature(a)).put(policy(a)).put(a.optString("name")).put(a.optString("remark")).put(a.optString("email")).put(a.optString("pw")).put(a.optBoolean("noAuto")));
    }
    static String digest(JSONObject value) throws Exception {
        byte[] bytes=MessageDigest.getInstance("SHA-256").digest(AuthRouteState.canonical(value).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();
    }
    Draft open(String actor,String target,long now) throws Exception {
        if(actor==null||actor.isEmpty())throw new Exception("连接编辑器身份无效");
        JSONObject a=target.isEmpty()?null:find.get(target);if(!target.isEmpty()&&a==null)throw new Exception("目标账号已删除");
        java.util.Iterator<Draft> it=entries.values().iterator();while(it.hasNext()){Draft d=it.next();if(!d.busy&&d.until<=now)it.remove();}
        if(entries.size()>=64)throw new Exception("连接编辑器过多，请关闭旧编辑器后重试");
        Draft d=new Draft();d.id=UUID.randomUUID().toString();d.actor=actor;d.target=a;d.revision=revision(a);d.until=now+10*60000;d.proofOwner="draft:"+actor+":"+d.id;entries.put(d.id,d);return d;
    }
    Draft get(String actor,String id,long now,boolean allowSaved) throws Exception {
        Draft d=entries.get(id);if(d==null||!d.actor.equals(actor)||d.until<=now)throw new Exception("连接草稿已过期或窗口已改变，请重新打开编辑器");
        if(d.saved!=null){if(!allowSaved)throw new Exception("此草稿已经保存，请重新编辑");if(find.get(d.saved.optString("id"))!=d.saved)throw new Exception("保存后的账号已删除");}
        else if(d.target!=null&&(find.get(d.target.optString("id"))!=d.target||!revision(d.target).equals(d.revision)))throw new Exception("目标账号已被其他操作修改，请刷新后重新检测");
        return d;
    }
    void close(String actor,String id,long now) throws Exception {Draft d=get(actor,id,now,true);if(d.busy)throw new Exception("保存正在进行，请等待结果");entries.remove(id);}
}
