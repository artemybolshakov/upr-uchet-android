package com.artemiy.uprucheet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.List;
import java.util.Locale;

/** Фоновый сервис «Доступ с компьютера»: держит веб-сервер, пока доступ включён. */
public class WebAccessService extends Service {
    public static final String ACTION_START = "com.artemiy.uprucheet.WEB_START";
    public static final String ACTION_STOP = "com.artemiy.uprucheet.WEB_STOP";
    private static final String CHANNEL = "web_access";
    private static final int NOTIFICATION_ID = 5151;
    /** Автоматическое выключение после простоя (мс). */
    private static final long IDLE_LIMIT = 30 * 60 * 1000L;

    static volatile WebServer server;
    static volatile String pin = "";
    static volatile String lastError = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private final Runnable idleCheck = new Runnable() {
        @Override
        public void run() {
            WebServer s = server;
            if (s != null && System.currentTimeMillis() - s.lastActivity > IDLE_LIMIT) {
                stopAll();
                return;
            }
            handler.postDelayed(this, 60_000);
        }
    };

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_STOP : intent.getAction();
        if (!ACTION_START.equals(action)) {
            stopAll();
            return START_NOT_STICKY;
        }
        if (server == null) {
            pin = String.format(Locale.US, "%06d", new SecureRandom().nextInt(1_000_000));
            WebServer s = new WebServer(this, pin, new WebServer.Listener() {
                @Override
                public void onDataChangedRemotely(long rev) {
                    MainActivity a = MainActivity.current();
                    if (a != null) a.emit("remoteChanged", String.valueOf(rev));
                }

                @Override
                public void onPinLocked() {
                    MainActivity a = MainActivity.current();
                    if (a != null) a.emit("webStatus", "locked");
                }
            });
            try {
                s.start();
                server = s;
                lastError = "";
            } catch (Exception e) {
                lastError = String.valueOf(e.getMessage());
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uprucheet:web");
            wakeLock.acquire(IDLE_LIMIT + 5 * 60_000L);
        }
        handler.removeCallbacks(idleCheck);
        handler.postDelayed(idleCheck, 60_000);
        notifyActivity();
        return START_NOT_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Доступ с компьютера", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        PendingIntent open = PendingIntent.getActivity(this, 11, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 12,
                new Intent(this, WebAccessService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String url = urls().isEmpty() ? "нет подключения к Wi-Fi" : urls().get(0);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("Доступ с компьютера включён")
                .setContentText(url + "  ·  PIN " + pin)
                .setOngoing(true)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "Выключить", stop).build())
                .build();
    }

    static List<String> urls() {
        List<String> ips = WebServer.localAddresses();
        WebServer s = server;
        int port = s == null ? 8080 : s.port;
        for (int i = 0; i < ips.size(); i++) ips.set(i, "http://" + ips.get(i) + ":" + port);
        return ips;
    }

    static String statusJson() {
        try {
            JSONArray arr = new JSONArray();
            for (String u : urls()) arr.put(u);
            return new JSONObject()
                    .put("running", server != null)
                    .put("pin", server != null ? pin : "")
                    .put("urls", arr)
                    .put("error", lastError)
                    .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private void notifyActivity() {
        MainActivity a = MainActivity.current();
        if (a != null) a.emit("webStatus", "");
    }

    private void stopAll() {
        handler.removeCallbacks(idleCheck);
        WebServer s = server;
        server = null;
        pin = "";
        if (s != null) s.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
        notifyActivity();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(idleCheck);
        WebServer s = server;
        server = null;
        if (s != null) s.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
