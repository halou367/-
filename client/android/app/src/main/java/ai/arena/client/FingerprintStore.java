package ai.arena.client;

import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

// App-wide, data-only store. Called on the bridge's background executor, never the UI thread.
final class FingerprintStore {
    static final String SCHEMA = "arena-client-fingerprint-store-v1";
    static final int LIMIT = 32 * 1024 * 1024;
    private static final Object LOCK = new Object();
    static final java.util.concurrent.ExecutorService IO=java.util.concurrent.Executors.newSingleThreadExecutor();
    static final java.util.concurrent.atomic.AtomicInteger PENDING=new java.util.concurrent.atomic.AtomicInteger();
    private static JSONObject cached;
    private static String cachedPath;
    private static final String[] TIERS = {"none","minimal","low","medium","high","xhigh","max"};
    private static boolean hex(Object x) { return x instanceof String && ((String)x).matches("[a-f0-9]{64}"); }
    private static void need(boolean value,String text) throws Exception { if(!value)throw new Exception(text); }
    private static boolean number(Object n) { return n instanceof Number && !Double.isInfinite(((Number)n).doubleValue()) && !Double.isNaN(((Number)n).doubleValue()); }
    private static boolean integer(Object n) { return number(n) && ((Number)n).doubleValue()==Math.rint(((Number)n).doubleValue()); }
    private static void keys(JSONObject obj,String... allowed) throws Exception {
        need(obj!=null,"共享库字段无效");Set<String> ok=new HashSet<>(Arrays.asList(allowed));
        for(Iterator<String> it=obj.keys();it.hasNext();)need(ok.contains(it.next()),"共享库含不支持的字段");
    }
    static void validate(JSONObject data) throws Exception {
        keys(data,"rows","receipts","aliases");JSONArray rows=data.optJSONArray("rows");need(rows!=null&&rows.length()<=2000,"共享库最多 2000 批样本");
        Set<String> ids=new HashSet<>(),models=new HashSet<>();int[] sizes={297,315,331};
        for(int i=0;i<rows.length();i++){
            JSONObject r=rows.optJSONObject(i);keys(r,"protocol","model","group","context","tier","outputs","measures","at","id","enabled","source","conflict","alternatives");
            String model=r.optString("model","");need(r.opt("model") instanceof String&&"modeltrace-plain-v1".equals(r.optString("protocol"))&&model.matches("[a-zA-Z0-9][a-zA-Z0-9._:-]{1,159}")&&model.matches(".*[0-9].*")&&!model.toLowerCase(Locale.ROOT).matches(".*(unknown|auto|compatible).*"),"共享型号标签无效");
            need(hex(r.opt("id"))&&ids.add(r.getString("id"))&&hex(r.opt("group")),"共享样本标识无效或重复");models.add(model);
            need(Arrays.asList("history","fresh").contains(r.optString("context"))&&r.has("tier")&&(r.isNull("tier")||Arrays.asList(TIERS).contains(r.optString("tier"))),"共享上下文或档位无效");
            need(r.opt("enabled") instanceof Boolean&&r.opt("conflict") instanceof Boolean&&!(r.getBoolean("conflict")&&r.getBoolean("enabled")),"共享样本状态无效");
            need(number(r.opt("at"))&&r.getDouble("at")>=0,"共享样本时间无效");String source=r.optString("source","");need(source.equals("local-api")||source.matches("import:(?:[a-f0-9]{12}|[a-f0-9]{64})"),"共享样本来源无效");
            JSONArray outputs=r.optJSONArray("outputs");need(outputs!=null&&outputs.length()==3,"共享样本缺探针");
            for(int j=0;j<3;j++){JSONArray a=outputs.optJSONArray(j);need(a!=null&&a.length()>=Math.ceil(sizes[j]*.95)&&a.length()<=Math.floor(sizes[j]*1.05),"共享探针数量无效");for(int k=0;k<a.length();k++)need(integer(a.opt(k))&&a.getInt(k)>=1&&a.getInt(k)<=355,"共享数字无效");}
            JSONArray measures=r.optJSONArray("measures");need(measures!=null&&measures.length()==3,"共享分数无效");
            for(int j=0;j<3;j++){JSONObject m=measures.optJSONObject(j);keys(m,"score","source");need(m.has("score")&&(m.isNull("score")||number(m.opt("score"))&&m.getDouble("score")>0&&m.getDouble("score")<10000000)&&Arrays.asList("measured","estimated","unavailable").contains(m.optString("source")),"共享分数无效");}
            if(r.has("alternatives")){JSONArray a=r.optJSONArray("alternatives");need(a!=null&&a.length()<=20,"冲突标签无效");for(int j=0;j<a.length();j++){Object text=a.opt(j);need(text instanceof String&&((String)text).length()<=180&&((String)text).matches("[a-zA-Z0-9._:\\- /]+"),"冲突标签无效");}}
        }
        need(models.size()<=500,"共享库最多 500 个型号");
        JSONObject receipts=data.optJSONObject("receipts"),aliases=data.optJSONObject("aliases");need(receipts!=null&&receipts.length()<=200000&&aliases!=null&&aliases.length()<=10000,"共享迁移索引超限");
        for(Iterator<String> it=receipts.keys();it.hasNext();){String key=it.next();need(hex(key)&&Boolean.TRUE.equals(receipts.opt(key)),"迁移收据无效");}
        for(Iterator<String> it=aliases.keys();it.hasNext();){String key=it.next();need(hex(key)&&hex(aliases.opt(key)),"样本组别名无效");String x=key;Set<String> seen=new HashSet<>();while(aliases.has(x)){need(seen.size()<20&&seen.add(x),"样本组别名循环");x=aliases.getString(x);}}
    }
    private static JSONObject body(JSONObject state) throws Exception {return new JSONObject().put("rows",state.getJSONArray("rows")).put("receipts",state.getJSONObject("receipts")).put("aliases",state.getJSONObject("aliases"));}
    private static void validState(JSONObject s) throws Exception {
        keys(s,"schema","revision","salt","rows","receipts","aliases");need(SCHEMA.equals(s.optString("schema"))&&integer(s.opt("revision"))&&s.getDouble("revision")>=0&&s.getDouble("revision")<=9007199254740991d&&hex(s.opt("salt")),"共享库版本无效");validate(body(s));
    }
    private static void persist(AtomicFile file,JSONObject data) throws Exception {
        byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);need(bytes.length<=LIMIT,"共享库超过 32 MB");FileOutputStream out=null;
        try{out=file.startWrite();out.write(bytes);out.getFD().sync();file.finishWrite(out);out=null;need(Arrays.equals(bytes,file.readFully()),"共享库写入校验失败");}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
    }
    static String request(File directory,String op,String expected,String payload) {
        synchronized(LOCK){try{
            need(Arrays.asList("read","meta","cas").contains(op),"共享库操作无效");File path=new File(directory,"fingerprint-library-v1.json");AtomicFile file=new AtomicFile(path);
            if(cached==null||!path.getAbsolutePath().equals(cachedPath)){
                JSONObject state;
                if(path.exists()||new File(path.getPath()+".bak").exists()){
                    need(path.length()<=LIMIT&&new File(path.getPath()+".bak").length()<=LIMIT,"共享库文件超限");state=new JSONObject(new String(file.readFully(),StandardCharsets.UTF_8));validState(state);
                }else{
                    byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder salt=new StringBuilder();for(byte x:bytes)salt.append(String.format(Locale.ROOT,"%02x",x&255));
                    state=new JSONObject().put("schema",SCHEMA).put("revision",0).put("salt",salt.toString()).put("rows",new JSONArray()).put("receipts",new JSONObject()).put("aliases",new JSONObject());persist(file,state);
                }
                cached=state;cachedPath=path.getAbsolutePath();
            }
            long revision=cached.getLong("revision");
            if(op.equals("meta"))return new JSONObject().put("ok",true).put("revision",revision).put("count",cached.getJSONArray("rows").length()).toString();
            if(op.equals("read"))return new JSONObject().put("ok",true).put("state",cached).toString();
            long want=Long.parseLong(expected);need(want>=0&&want<=9007199254740991L,"共享库修订号无效");
            if(want!=revision)return new JSONObject().put("ok",false).put("conflict",true).put("revision",revision).toString();
            need(payload!=null&&payload.length()<=LIMIT&&payload.getBytes(StandardCharsets.UTF_8).length<=LIMIT,"共享库写入超限");JSONObject data=new JSONObject(payload);validate(data);
            JSONObject next=body(data).put("schema",SCHEMA).put("revision",revision+1).put("salt",cached.getString("salt"));validState(next);persist(file,next);cached=next;
            return new JSONObject().put("ok",true).put("revision",revision+1).put("count",next.getJSONArray("rows").length()).toString();
        }catch(Exception e){try{return new JSONObject().put("error","共享库操作失败，原数据保留："+e.getMessage()).toString();}catch(Exception ignored){return "{\"error\":\"共享库操作失败\"}";}}}
    }
}
