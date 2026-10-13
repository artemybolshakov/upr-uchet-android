package com.artemiy.uprucheet;

import android.Manifest;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;

/** Работа с системным календарём (HarmonyOS/Android): чтение, запись, ежедневный офлайн-снимок. */
public final class CalendarSync {
    private CalendarSync() {}

    public static boolean canRead(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean canWrite(Context c) {
        return c.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    public static String calendars(Context c) {
        JSONArray arr = new JSONArray();
        if (!canRead(c)) return arr.toString();
        String[] proj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.CALENDAR_COLOR,
        };
        try (Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null, null)) {
            while (cur != null && cur.moveToNext()) {
                int access = cur.getInt(3);
                arr.put(new JSONObject()
                        .put("id", cur.getLong(0))
                        .put("name", nz(cur.getString(1)))
                        .put("account", nz(cur.getString(2)))
                        .put("writable", access >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                        .put("color", String.format("#%06X", 0xFFFFFF & cur.getInt(4))));
            }
        } catch (Exception ignored) {
        }
        return arr.toString();
    }

    public static JSONArray events(Context c, long from, long to, String calendarIdsCsv) {
        JSONArray arr = new JSONArray();
        if (!canRead(c)) return arr;
        Set<String> filter = new HashSet<>();
        if (calendarIdsCsv != null && !calendarIdsCsv.trim().isEmpty()) {
            for (String s : calendarIdsCsv.split(",")) filter.add(s.trim());
        }
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from);
        ContentUris.appendId(b, to);
        String[] proj = {
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.DESCRIPTION,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.CALENDAR_ID,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
        };
        try (Cursor cur = c.getContentResolver().query(b.build(), proj, null, null,
                CalendarContract.Instances.BEGIN + " ASC")) {
            while (cur != null && cur.moveToNext()) {
                String calId = String.valueOf(cur.getLong(6));
                if (!filter.isEmpty() && !filter.contains(calId)) continue;
                arr.put(new JSONObject()
                        .put("eventId", cur.getLong(0))
                        .put("title", nz(cur.getString(1)))
                        .put("description", nz(cur.getString(2)))
                        .put("begin", cur.getLong(3))
                        .put("end", cur.getLong(4))
                        .put("allDay", cur.getInt(5) == 1)
                        .put("calendarId", cur.getLong(6))
                        .put("location", nz(cur.getString(7)))
                        .put("calendar", nz(cur.getString(8))));
            }
        } catch (Exception ignored) {
        }
        return arr;
    }

    /** Создаёт или обновляет событие в системном календаре. Возвращает id события или -1. */
    public static long upsert(Context c, String json) {
        if (!canWrite(c)) return -1;
        try {
            JSONObject o = new JSONObject(json);
            ContentValues v = new ContentValues();
            boolean allDay = o.optBoolean("allDay");
            long start = o.getLong("start");
            long end = o.optLong("end", start + 3600_000L);
            if (end <= start) end = start + 3600_000L;
            v.put(CalendarContract.Events.TITLE, o.optString("title"));
            v.put(CalendarContract.Events.DESCRIPTION, o.optString("description"));
            v.put(CalendarContract.Events.EVENT_LOCATION, o.optString("location"));
            v.put(CalendarContract.Events.DTSTART, start);
            v.put(CalendarContract.Events.DTEND, end);
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : TimeZone.getDefault().getID());
            long deviceId = o.optLong("deviceId", -1);
            if (deviceId > 0) {
                int n = c.getContentResolver().update(
                        ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, deviceId), v, null, null);
                if (n > 0) return deviceId;
            }
            v.put(CalendarContract.Events.CALENDAR_ID, o.getLong("calendarId"));
            Uri uri = c.getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
            return uri == null ? -1 : ContentUris.parseId(uri);
        } catch (Exception e) {
            return -1;
        }
    }

    public static boolean delete(Context c, long id) {
        if (!canWrite(c) || id <= 0) return false;
        try {
            return c.getContentResolver().delete(
                    ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null) > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** Ежедневный офлайн-снимок системного календаря: −60 … +365 дней. */
    public static boolean snapshot(Context c) {
        if (!canRead(c)) return false;
        long now = System.currentTimeMillis();
        long day = 24L * 3600_000L;
        JSONArray ev = events(c, now - 60 * day, now + 365 * day, null);
        try {
            JSONObject snap = new JSONObject()
                    .put("created", now)
                    .put("calendars", new JSONArray(calendars(c)))
                    .put("events", ev);
            File f = new File(Store.snapshotsDir(c), "cal-" + Store.today() + ".json");
            boolean ok = Store.write(f, snap.toString());
            Store.prune(Store.snapshotsDir(c), "cal-", Store.KEEP_SNAPSHOTS);
            return ok;
        } catch (Exception e) {
            return false;
        }
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
