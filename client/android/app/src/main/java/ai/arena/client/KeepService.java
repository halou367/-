package ai.arena.client;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

// 前台服务：App 在后台 / 熄屏时不被系统冻结、不断网（抽卡、队列发送、接收回复继续跑）。
// 有正在进行的事时再持有 CPU 唤醒锁 + Wi-Fi 锁（闲着不持有，不费电）。通知渠道为最低重要度：不响、不弹、不占状态栏图标。
public class KeepService extends Service {
    static final String CH = "bg";
    static volatile KeepService inst;
    static volatile String text = "后台待命";
    static volatile boolean busy = false;
    PowerManager.WakeLock wl; WifiManager.WifiLock wf;

    static void start(Context c) {
        try {
            Intent it = new Intent(c, KeepService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(it); else c.startService(it);
        } catch (Throwable ignored) {}   // 后台不允许启动前台服务（Android 12+）：等下次回到前台再启动
    }
    static void stop(Context c) { try { c.stopService(new Intent(c, KeepService.class)); } catch (Throwable ignored) {} }
    static void update(String t, boolean b) {
        boolean ch = !t.equals(text); text = t; busy = b;
        KeepService s = inst; if (s == null) return;
        s.lock(b); if (ch) s.post();
    }

    @Override public IBinder onBind(Intent i) { return null; }
    @Override public void onCreate() {
        super.onCreate(); inst = this;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BranaAi:bg"); wl.setReferenceCounted(false);
        } catch (Throwable ignored) {}
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            @SuppressWarnings("deprecation") WifiManager.WifiLock l = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "BranaAi:bg");
            wf = l; wf.setReferenceCounted(false);
        } catch (Throwable ignored) {}
    }
    @Override public int onStartCommand(Intent intent, int flags, int id) { post(); lock(busy); return START_NOT_STICKY; }
    void post() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel(CH) == null) {
                    NotificationChannel c = new NotificationChannel(CH, "后台运行", NotificationManager.IMPORTANCE_MIN);
                    c.setDescription("熄屏 / 切到后台时继续抽卡、发送队列消息、接收回复"); c.setShowBadge(false); c.setSound(null, null); c.enableVibration(false);
                    nm.createNotificationChannel(c);
                }
                b = new Notification.Builder(this, CH);
            } else { b = new Notification.Builder(this); b.setPriority(Notification.PRIORITY_MIN); }
            Intent open = new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
            b.setSmallIcon(getApplicationInfo().icon).setContentTitle("Brana AI").setContentText(text).setOngoing(true).setShowWhen(false).setContentIntent(pi).setOnlyAlertOnce(true);
            if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_DEFERRED);
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(1, n);
        } catch (Throwable ignored) {}
    }
    void lock(boolean on) {
        try {
            if (on) { if (wl != null) wl.acquire(15 * 60 * 1000L); if (wf != null && !wf.isHeld()) wf.acquire(); }   // 带超时：万一没收到「闲下来」也会自己放掉
            else { if (wl != null && wl.isHeld()) wl.release(); if (wf != null && wf.isHeld()) wf.release(); }
        } catch (Throwable ignored) {}
    }
    @Override public void onDestroy() { lock(false); inst = null; super.onDestroy(); }
}
