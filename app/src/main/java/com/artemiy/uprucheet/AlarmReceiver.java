package com.artemiy.uprucheet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_REMINDERS = "reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        String key = intent.getStringExtra(Alarms.EXTRA_KEY);
        String title = intent.getStringExtra(Alarms.EXTRA_TITLE);
        String text = intent.getStringExtra(Alarms.EXTRA_TEXT);
        String ref = intent.getStringExtra(Alarms.EXTRA_REF);
        boolean aggressive = intent.getBooleanExtra(Alarms.EXTRA_AGGRESSIVE, false);

        if (aggressive) {
            Intent svc = new Intent(context, AlarmService.class);
            svc.setAction(AlarmService.ACTION_RING);
            svc.putExtras(intent);
            try {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(svc);
                else context.startService(svc);
                return;
            } catch (Exception ignored) {
                // если система не дала запустить сервис — показываем хотя бы обычное уведомление
            }
        }
        showNotification(context, key, title, text, ref);
    }

    static void showNotification(Context context, String key, String title, String text, String ref) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL_REMINDERS, "Напоминания", NotificationManager.IMPORTANCE_HIGH);
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra("open", ref);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(context, key == null ? 0 : key.hashCode(), open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(context, CHANNEL_REMINDERS)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title == null || title.isEmpty() ? "Напоминание" : title)
                .setContentText(text == null ? "" : text)
                .setStyle(new Notification.BigTextStyle().bigText(text == null ? "" : text))
                .setCategory(Notification.CATEGORY_REMINDER)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        nm.notify(key == null ? 1 : key.hashCode(), n);
    }
}
