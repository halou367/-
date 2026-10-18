package ai.arena.client;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.*;
import java.util.*;

/** Bounded chunks avoid passing a whole ZIP/video through the Javascript bridge. */
final class WorkspaceDownload {
    static final long MAX_SIZE = 160L * 1024 * 1024;
    final Activity activity;
    final Map<String, Job> jobs = new HashMap<>();
    static class Job { String id,name,mime; File file; OutputStream out; WebView owner; long size,written,at; }
    WorkspaceDownload(Activity a) { activity = a; }
    String result(boolean ok, String key, Object value) { try { return new JSONObject().put("ok",ok).put(key,value).toString(); } catch(Exception ex) { return "{}"; } }
    synchronized String start(WebView owner,String name,String mime,String length) {
        try {
            if (owner == null) throw new IOException("账号已关闭");
            for (Job j : new ArrayList<>(jobs.values())) if (System.currentTimeMillis()-j.at > 300000) cancel(j.owner,j.id);
            long size = Long.parseLong(length); if (size < 0 || size > MAX_SIZE || jobs.size() >= 4) throw new IOException("文件过大或保存任务过多");
            Job j = new Job(); j.id = UUID.randomUUID().toString(); j.owner = owner; j.size = size; j.at = System.currentTimeMillis();
            j.name = (name == null ? "workspace.bin" : name).replaceAll("[\\x00-\\x1F\\\\/:*?\"<>|]","_");
            if (j.name.isEmpty() || j.name.equals(".") || j.name.equals("..")) j.name = "workspace.bin";
            if (j.name.length() > 160) j.name = j.name.substring(j.name.length()-160);
            j.mime = mime != null && mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+") ? mime : "application/octet-stream";
            File dir = ApkProvider.logDir(activity); dir.mkdirs();
            for (File f : Optional.ofNullable(dir.listFiles()).orElse(new File[0])) if (System.currentTimeMillis()-f.lastModified() > 3L*86400000L) f.delete();
            j.file = new File(dir,j.id+".part"); j.out = new FileOutputStream(j.file); jobs.put(j.id,j);
            return result(true,"id",j.id);
        } catch(Exception ex) { return result(false,"error",ex.getMessage()); }
    }
    synchronized String chunk(WebView owner,String id,String base64) {
        Job j = jobs.get(id);
        try {
            if (j == null || j.owner != owner) throw new IOException("保存任务不存在");
            if (base64 == null || base64.length() > 1400000) throw new IOException("文件分块过大");
            byte[] data = Base64.decode(base64,Base64.DEFAULT);
            if (data.length > 1024*1024 || j.written+data.length > j.size) throw new IOException("文件大小不符");
            j.out.write(data); j.written += data.length; j.at = System.currentTimeMillis(); return result(true,"written",j.written);
        } catch(Exception ex) { if (j != null && j.owner == owner) cancel(owner,id); return result(false,"error",ex.getMessage()); }
    }
    static void copy(File file,OutputStream to) throws IOException { if (to == null) throw new IOException("无法写入下载目录"); try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[65536]; for (int n;(n=in.read(b))>=0;) to.write(b,0,n); } }
    synchronized String finish(WebView owner,String id) {
        Job j = jobs.get(id); Uri uri = null; File cached = null;
        try {
            if (j == null || j.owner != owner) throw new IOException("保存任务不存在");
            if (j.written != j.size) throw new IOException("文件尚未完整写入");
            j.out.close(); String shown;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues(); v.put(MediaStore.MediaColumns.DISPLAY_NAME,j.name); v.put(MediaStore.MediaColumns.MIME_TYPE,j.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/BranaAi"); v.put(MediaStore.MediaColumns.IS_PENDING,1);
                uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v); if (uri == null) throw new IOException("无法创建下载文件");
                try(OutputStream out = activity.getContentResolver().openOutputStream(uri)) { copy(j.file,out); }
                v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING,0); activity.getContentResolver().update(uri,v,null,null); shown = "Download/BranaAi/"+j.name;
            } else {
                File dir = new File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),"BranaAi"); dir.mkdirs(); File file = new File(dir,j.name);
                if (file.exists()) file = new File(dir,j.id.substring(0,8)+"-"+j.name);
                try(OutputStream out = new FileOutputStream(file)) { copy(j.file,out); } shown = file.getAbsolutePath();
            }
            String ext = j.name.contains(".") ? j.name.substring(j.name.lastIndexOf('.')).replaceAll("[^a-zA-Z0-9.]","") : ".bin";
            if (ext.length() > 20) ext = ".bin";
            cached = new File(j.file.getParentFile(),j.id+ext); if (!j.file.renameTo(cached)) throw new IOException("无法准备系统打开文件");
            jobs.remove(id);
            return new JSONObject().put("ok",true).put("path",shown).put("share","content://"+activity.getPackageName()+".apk/logs/"+cached.getName()).toString();
        } catch(Exception ex) {
            if (j != null && j.owner == owner) { if (uri != null) try { activity.getContentResolver().delete(uri,null,null); } catch(Exception ignored) {} cancel(owner,id); if (cached != null) cached.delete(); }
            return result(false,"error",ex.getMessage());
        }
    }
    synchronized void cancel(WebView owner,String id) { Job j = jobs.get(id); if (j == null || j.owner != owner) return; jobs.remove(id); try { j.out.close(); } catch(Exception ignored) {} j.file.delete(); }
    synchronized void closeOwner(WebView owner) { for (Job j : new ArrayList<>(jobs.values())) if (j.owner == owner) cancel(owner,j.id); }
    synchronized void closeAll() { for (Job j : new ArrayList<>(jobs.values())) cancel(j.owner,j.id); }
}
