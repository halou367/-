package ai.arena.client;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

// 把下载好的新版安装包（缓存目录 update/update.apk）只读地交给系统安装程序；不依赖 androidx.core 的 FileProvider
public class ApkProvider extends ContentProvider {
    static final String NAME = "update.apk";
    static File file(android.content.Context c) { return new File(new File(c.getCacheDir(), "update"), NAME); }
    @Override public boolean onCreate() { return true; }
    // 抓日志文件（缓存目录 logs/<名字>）：分享给微信 / QQ 等用
    static File logDir(android.content.Context c) { return new File(c.getCacheDir(), "logs"); }
    static File logOf(android.content.Context c, Uri uri) {
        java.util.List<String> s = uri.getPathSegments();
        if (c == null || s.size() != 2 || !"logs".equals(s.get(0)) || !s.get(1).matches("[\\w.\\-]{1,120}")) return null;
        return new File(logDir(c), s.get(1));
    }
    @Override public String getType(Uri uri) {
        File lf = logOf(getContext(), uri); if (lf == null) return "application/vnd.android.package-archive";
        String n = lf.getName(), ext = n.contains(".") ? n.substring(n.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT) : "";
        String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime != null ? mime : "application/octet-stream";
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File lf = logOf(getContext(), uri);
        if (lf != null) { if (!lf.exists()) throw new FileNotFoundException(); return ParcelFileDescriptor.open(lf, ParcelFileDescriptor.MODE_READ_ONLY); }
        if (!NAME.equals(uri.getLastPathSegment()) || getContext() == null) throw new FileNotFoundException();
        File f = file(getContext()); if (!f.exists()) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        if (getContext() == null) return null;
        File lf = logOf(getContext(), uri);
        if (lf != null) { MatrixCursor lc = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }); lc.addRow(new Object[] { lf.getName(), lf.length() }); return lc; }
        File f = file(getContext());
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[] { "BranaAi.apk", f.length() });
        return c;
    }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
