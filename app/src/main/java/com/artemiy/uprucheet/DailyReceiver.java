package com.artemiy.uprucheet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Раз в сутки: автокопия данных и офлайн-снимок системного календаря. */
public class DailyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                Store.autoBackup(context, false);
                CalendarSync.snapshot(context);
                Alarms.rescheduleAll(context);
            } finally {
                result.finish();
            }
        }).start();
    }
}
