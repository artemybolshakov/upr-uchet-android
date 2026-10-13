package com.artemiy.uprucheet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Настойчивый сигнал: звонит как будильник в цикле и вибрирует,
 * пока пользователь вручную не нажмёт «Отключить» или «Отложить».
 */
public class AlarmService extends Service {
    public static final String ACTION_RING = "com.artemiy.uprucheet.RING";
    public static final String ACTION_STOP = "com.artemiy.uprucheet.STOP";
    public static final String ACTION_SNOOZE = "com.artemiy.uprucheet.SNOOZE";
    public static final String CHANNEL_ALARMS = "alarms_v1";
    private static final int NOTIFICATION_ID = 4242;

    static volatile boolean ringing = false;
    static volatile String currentTitle = "";
    static volatile String currentText = "";
    static volatile String currentRef = "";
    static volatile String currentKey = "";

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private int savedVolume = -1;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_STOP : intent.getAction();
        if (ACTION_SNOOZE.equals(action)) {
            int minutes = intent.getIntExtra("minutes", 10);
            Alarms.schedule(this, currentKey + "-snz" + System.currentTimeMillis(),
                    System.currentTimeMillis() + minutes * 60_000L,
                    currentTitle, currentText, true, currentRef);
            stopRinging();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action) || intent == null) {
            stopRinging();
            return START_NOT_STICKY;
        }

        currentKey = nz(intent.getStringExtra(Alarms.EXTRA_KEY));
        currentTitle = nz(intent.getStringExtra(Alarms.EXTRA_TITLE));
        currentText = nz(intent.getStringExtra(Alarms.EXTRA_TEXT));
        currentRef = nz(intent.getStringExtra(Alarms.EXTRA_REF));

        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
        startRinging();

        // Пытаемся сразу показать полноэкранный экран будильника.
        try {
            Intent a = new Intent(this, AlarmActivity.class);
            a.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
            startActivity(a);
        } catch (Exception ignored) {
        }
        return START_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL_ALARMS, "Важные события (будильник)", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null); // звук воспроизводим сами в цикле
        ch.enableVibration(false);
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);

        Intent full = new Intent(this, AlarmActivity.class);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent fullPi = PendingIntent.getActivity(this, 1, full, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        PendingIntent stopPi = PendingIntent.getService(this, 2,
                new Intent(this, AlarmService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent snoozePi = PendingIntent.getService(this, 3,
                new Intent(this, AlarmService.class).setAction(ACTION_SNOOZE).putExtra("minutes", 10),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new Notification.Builder(this, CHANNEL_ALARMS)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(currentTitle.isEmpty() ? "Важное событие" : currentTitle)
                .setContentText(currentText)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullPi, true)
                .setContentIntent(fullPi)
                .setDeleteIntent(fullPi)
                .addAction(new Notification.Action.Builder(null, "Отключить", stopPi).build())
                .addAction(new Notification.Action.Builder(null, "Отложить 10 мин", snoozePi).build())
                .build();
    }

    private void startRinging() {
        if (ringing) return;
        ringing = true;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "uprucheet:alarm");
        wakeLock.acquire(60 * 60 * 1000L);

        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
        int cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
        if (cur < max * 0.7) {
            savedVolume = cur;
            try {
                am.setStreamVolume(AudioManager.STREAM_ALARM, (int) Math.ceil(max * 0.85), 0);
            } catch (Exception ignored) {
                savedVolume = -1;
            }
        }

        Uri uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            player = null;
        }

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 800, 600, 800, 600, 1200, 1000};
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0),
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        }
    }

    private void stopRinging() {
        ringing = false;
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
            player.release();
            player = null;
        }
        if (vibrator != null) vibrator.cancel();
        if (savedVolume >= 0) {
            try {
                ((AudioManager) getSystemService(Context.AUDIO_SERVICE))
                        .setStreamVolume(AudioManager.STREAM_ALARM, savedVolume, 0);
            } catch (Exception ignored) {}
            savedVolume = -1;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        AlarmActivity.finishIfShown();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (ringing) {
            ringing = false;
            if (player != null) { try { player.stop(); } catch (Exception ignored) {} player.release(); player = null; }
            if (vibrator != null) vibrator.cancel();
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        }
        super.onDestroy();
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
