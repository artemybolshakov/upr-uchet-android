package com.artemiy.uprucheet;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/** Планирование напоминаний. Список напоминаний хранится в alarms.json, чтобы восстановить их после перезагрузки. */
public final class Alarms {
    private Alarms() {}

    public static final String EXTRA_KEY = "key";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_AGGRESSIVE = "aggressive";
    public static final String EXTRA_REF = "ref";

    private static int requestCode(String key) {
        return key.hashCode() & 0x7fffffff;
    }

    private static PendingIntent pending(Context c, String key, String title, String text, boolean aggressive, String ref, boolean create) {
        Intent i = new Intent(c, AlarmReceiver.class);
        i.setAction("com.artemiy.uprucheet.v2.ALARM." + key);
        i.putExtra(EXTRA_KEY, key);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_TEXT, text);
        i.putExtra(EXTRA_AGGRESSIVE, aggressive);
        i.putExtra(EXTRA_REF, ref);
        int flags = PendingIntent.FLAG_IMMUTABLE | (create ? PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_NO_CREATE);
        return PendingIntent.getBroadcast(c, requestCode(key), i, flags);
    }

    public static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
    }

    public static void schedule(Context c, String key, long at, String title, String text, boolean aggressive, String ref) {
        if (at <= System.currentTimeMillis()) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(c, key, title, text, aggressive, ref, true);
        try {
            if (aggressive || canExact(c)) {
                Intent show = new Intent(c, MainActivity.class);
                show.putExtra("open", ref);
                PendingIntent showPi = PendingIntent.getActivity(c, requestCode(key) ^ 0x5a5a, show,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                if (aggressive) {
                    // setAlarmClock — самый надёжный тип будильника: обходит режим Doze и энергосбережение.
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi), pi);
                } else {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                }
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    public static void cancel(Context c, String key) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(c, key, "", "", false, "", false);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    /** Заменяет весь набор напоминаний новым списком [{key, at, title, text, aggressive, ref}]. */
    public static synchronized int replaceAll(Context c, String json) {
        try {
            JSONArray old = parse(Store.read(Store.alarmsFile(c)));
            for (int i = 0; i < old.length(); i++) {
                JSONObject o = old.optJSONObject(i);
                if (o != null) cancel(c, o.optString("key"));
            }
            JSONArray next = parse(json);
            JSONArray kept = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < next.length(); i++) {
                JSONObject o = next.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at");
                if (at <= now) continue;
                schedule(c, o.optString("key"), at, o.optString("title"), o.optString("text"),
                        o.optBoolean("aggressive"), o.optString("ref"));
                kept.put(o);
            }
            Store.write(Store.alarmsFile(c), kept.toString());
            return kept.length();
        } catch (Exception e) {
            return -1;
        }
    }

    public static synchronized void rescheduleAll(Context c) {
        replaceAll(c, Store.read(Store.alarmsFile(c)));
    }

    private static JSONArray parse(String s) {
        try {
            return s == null || s.isEmpty() ? new JSONArray() : new JSONArray(s);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Ежедневная фоновая задача: автобэкап + снимок системного календаря (около 03:00). */
    public static void scheduleDaily(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(c, DailyReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 777001, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, 3);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_MONTH, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }
}
