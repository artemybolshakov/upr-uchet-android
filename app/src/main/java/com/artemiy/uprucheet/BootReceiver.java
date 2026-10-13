package com.artemiy.uprucheet;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** После перезагрузки/обновления восстанавливает будильники и ежедневную задачу. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Context c = context;
        if (Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(intent.getAction())) {
            // До разблокировки файлы приложения недоступны — ждём BOOT_COMPLETED.
            return;
        }
        Alarms.rescheduleAll(c);
        Alarms.scheduleDaily(c);
    }
}
