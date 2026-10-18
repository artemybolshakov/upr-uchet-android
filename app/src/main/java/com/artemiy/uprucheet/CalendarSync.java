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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/** Работа с системным календарём (HarmonyOS/Android): чтение, запись, ежедневный офлайн-снимок. */
public final class CalendarSync {
    private CalendarSync() {}

    /**
     * Последние ошибки чтения календаря. calendars() и events() возвращают массивы (их разбирает интерфейс),
     * поэтому текст ошибки не теряется, а сохраняется здесь и показывается в «Диагностике календарей».
     * Пустая строка — последний запрос прошёл без ошибок.
     */
    static volatile String lastCalendarsError = "";
    static volatile String lastEventsError = "";

    private static String err(Exception e) {
        String m = e.getMessage();
        return e.getClass().getSimpleName() + (m == null ? "" : ": " + m);
    }

    public static boolean canRead(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    public static boolean canWrite(Context c) {
        return c.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    public static String calendars(Context c) {
        JSONArray arr = new JSONArray();
        if (!canRead(c)) { lastCalendarsError = "нет разрешения READ_CALENDAR"; return arr.toString(); }
        String[] proj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.CALENDAR_COLOR,
        };
        try (Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null, null)) {
            if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Calendars)");
            while (cur.moveToNext()) {
                int access = cur.getInt(3);
                arr.put(new JSONObject()
                        .put("id", cur.getLong(0))
                        .put("name", nz(cur.getString(1)))
                        .put("account", nz(cur.getString(2)))
                        .put("writable", access >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                        .put("color", String.format("#%06X", 0xFFFFFF & cur.getInt(4))));
            }
            lastCalendarsError = "";
        } catch (Exception e) {
            lastCalendarsError = err(e);
            android.util.Log.w("UprCalendar", "calendars()", e);
        }
        return arr.toString();
    }

    public static JSONArray events(Context c, long from, long to, String calendarIdsCsv) {
        JSONArray arr = new JSONArray();
        if (!canRead(c)) { lastEventsError = "нет разрешения READ_CALENDAR"; return arr; }
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
                CalendarContract.Instances.RRULE,
                CalendarContract.Instances.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Instances.DISPLAY_COLOR,
                CalendarContract.Instances.ORIGINAL_ID,
        };
        try (Cursor cur = c.getContentResolver().query(b.build(), proj, null, null,
                CalendarContract.Instances.BEGIN + " ASC")) {
            if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Instances)");
            while (cur.moveToNext()) {
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
                        .put("calendar", nz(cur.getString(8)))
                        .put("recurring", !nz(cur.getString(9)).isEmpty() || !cur.isNull(12))
                        .put("writable", cur.getInt(10) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                        .put("color", String.format("#%06X", 0xFFFFFF & cur.getInt(11))));
            }
            lastEventsError = "";
        } catch (Exception e) {
            lastEventsError = err(e);
            android.util.Log.w("UprCalendar", "events()", e);
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

    private static ContentValues values(JSONObject o, boolean withTimes) throws Exception {
        ContentValues v = new ContentValues();
        v.put(CalendarContract.Events.TITLE, o.optString("title"));
        v.put(CalendarContract.Events.DESCRIPTION, o.optString("description"));
        v.put(CalendarContract.Events.EVENT_LOCATION, o.optString("location"));
        if (withTimes) {
            boolean allDay = o.optBoolean("allDay");
            long start = o.getLong("start");
            long end = o.optLong("end", start + 3600_000L);
            if (end <= start) end = start + (allDay ? 86_400_000L : 3600_000L);
            v.put(CalendarContract.Events.DTSTART, start);
            v.put(CalendarContract.Events.DTEND, end);
            v.put(CalendarContract.Events.ALL_DAY, allDay ? 1 : 0);
            v.put(CalendarContract.Events.EVENT_TIMEZONE, allDay ? "UTC" : TimeZone.getDefault().getID());
        }
        return v;
    }

    /**
     * Изменение события календаря телефона.
     * mode: "new" — создать в calendarId; "event" — обычное событие целиком;
     * "single" — только одно повторение (исключение в серии, originalBegin = время этого повторения);
     * "series" — вся серия (название, место, описание; время повторений не трогаем).
     * Возвращает id события или -1.
     */
    public static long saveDeviceEvent(Context c, String json) {
        if (!canWrite(c)) return -1;
        try {
            JSONObject o = new JSONObject(json);
            String mode = o.optString("mode", "event");
            long id = o.optLong("eventId", -1);
            if ("new".equals(mode)) {
                ContentValues v = values(o, true);
                v.put(CalendarContract.Events.CALENDAR_ID, o.getLong("calendarId"));
                Uri uri = c.getContentResolver().insert(CalendarContract.Events.CONTENT_URI, v);
                return uri == null ? -1 : ContentUris.parseId(uri);
            }
            if (id <= 0) return -1;
            if ("single".equals(mode)) {
                ContentValues v = values(o, true);
                v.put(CalendarContract.Events.ORIGINAL_INSTANCE_TIME, o.getLong("originalBegin"));
                Uri uri = c.getContentResolver().insert(
                        ContentUris.withAppendedId(CalendarContract.Events.CONTENT_EXCEPTION_URI, id), v);
                return uri == null ? -1 : ContentUris.parseId(uri);
            }
            ContentValues v = values(o, !"series".equals(mode));
            int n = c.getContentResolver().update(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), v, null, null);
            return n > 0 ? id : -1;
        } catch (Exception e) {
            return -1;
        }
    }

    /** Удаление: mode "single" — только одно повторение серии, иначе событие (или вся серия) целиком. */
    public static boolean deleteDeviceEvent(Context c, long id, String mode, long originalBegin) {
        if (!canWrite(c) || id <= 0) return false;
        try {
            if ("single".equals(mode)) {
                ContentValues v = new ContentValues();
                v.put(CalendarContract.Events.ORIGINAL_INSTANCE_TIME, originalBegin);
                v.put(CalendarContract.Events.STATUS, CalendarContract.Events.STATUS_CANCELED);
                return c.getContentResolver().insert(
                        ContentUris.withAppendedId(CalendarContract.Events.CONTENT_EXCEPTION_URI, id), v) != null;
            }
            return c.getContentResolver().delete(
                    ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id), null, null) > 0;
        } catch (Exception e) {
            return false;
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

    // ---------- Диагностика ----------

    private static final long DAY = 24L * 3600_000L;

    private static Set<String> csv(String s) {
        Set<String> out = new HashSet<>();
        if (s != null) for (String x : s.split(",")) if (!x.trim().isEmpty()) out.add(x.trim());
        return out;
    }

    /** Все календари со служебными полями: {id → JSON}. Ошибку пишет в errors. */
    private static Map<Long, JSONObject> calendarInfo(Context c, JSONObject errors) {
        Map<Long, JSONObject> out = new HashMap<>();
        String[] proj = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.ACCOUNT_TYPE,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.VISIBLE,
                CalendarContract.Calendars.SYNC_EVENTS,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.OWNER_ACCOUNT,
        };
        try (Cursor cur = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, proj, null, null, null)) {
            if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Calendars)");
            while (cur.moveToNext()) {
                int access = cur.getInt(7);
                out.put(cur.getLong(0), new JSONObject()
                        .put("id", cur.getLong(0))
                        .put("name", nz(cur.getString(1)))
                        .put("account", nz(cur.getString(2)))
                        .put("accountType", nz(cur.getString(3)))
                        .put("color", String.format("#%06X", 0xFFFFFF & cur.getInt(4)))
                        .put("visible", cur.getInt(5) == 1)
                        .put("syncEvents", cur.getInt(6) == 1)
                        .put("access", access)
                        .put("writable", access >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR)
                        .put("owner", nz(cur.getString(8))));
            }
        } catch (Exception e) {
            try { errors.put("calendars", err(e)); } catch (Exception ignored) { }
            android.util.Log.w("UprCalendar", "diagnostics: calendars", e);
        }
        return out;
    }

    /**
     * Диагностика: все календари (тип аккаунта, VISIBLE, SYNC_EVENTS, доступ), число событий за −30…+60 дней
     * (повторения из Instances — то, что видит приложение, и строки таблицы Events) и попадание в фильтр.
     */
    public static String diagnostics(Context c, String filterCsv) {
        JSONObject res = new JSONObject();
        JSONObject errors = new JSONObject();
        try {
            long now = System.currentTimeMillis(), from = now - 30 * DAY, to = now + 60 * DAY;
            Set<String> filter = csv(filterCsv);
            res.put("canRead", canRead(c)).put("canWrite", canWrite(c)).put("from", from).put("to", to);
            if (!canRead(c)) {
                errors.put("permission", "нет разрешения READ_CALENDAR");
            } else {
                Map<Long, JSONObject> cals = calendarInfo(c, errors);
                Map<Long, Integer> inst = new HashMap<>(), rows = new HashMap<>();
                Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
                ContentUris.appendId(b, from);
                ContentUris.appendId(b, to);
                try (Cursor cur = c.getContentResolver().query(b.build(),
                        new String[]{CalendarContract.Instances.CALENDAR_ID}, null, null, null)) {
                    if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Instances)");
                    while (cur.moveToNext()) { long id = cur.getLong(0); Integer n = inst.get(id); inst.put(id, n == null ? 1 : n + 1); }
                } catch (Exception e) {
                    errors.put("instances", err(e));
                    android.util.Log.w("UprCalendar", "diagnostics: instances", e);
                }
                // Строки таблицы событий: обычные события в диапазоне и все повторяющиеся (их правило может попадать в диапазон)
                try (Cursor cur = c.getContentResolver().query(CalendarContract.Events.CONTENT_URI,
                        new String[]{CalendarContract.Events.CALENDAR_ID},
                        CalendarContract.Events.DELETED + "=0 AND ((" + CalendarContract.Events.DTSTART + "<? AND "
                                + CalendarContract.Events.DTSTART + ">=?) OR " + CalendarContract.Events.RRULE + " IS NOT NULL)",
                        new String[]{String.valueOf(to), String.valueOf(from - DAY)}, null)) {
                    if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Events)");
                    while (cur.moveToNext()) { long id = cur.getLong(0); Integer n = rows.get(id); rows.put(id, n == null ? 1 : n + 1); }
                } catch (Exception e) {
                    errors.put("events", err(e));
                    android.util.Log.w("UprCalendar", "diagnostics: events", e);
                }
                JSONArray arr = new JSONArray();
                for (JSONObject o : cals.values()) {
                    long id = o.getLong("id");
                    Integer ni = inst.get(id), nr = rows.get(id);
                    o.put("instances", ni == null ? 0 : ni)
                            .put("rows", nr == null ? 0 : nr)
                            .put("inFilter", filter.isEmpty() || filter.contains(String.valueOf(id)));
                    arr.put(o);
                }
                res.put("calendars", arr);
                JSONArray stale = new JSONArray();
                for (String f : filter) {
                    try { if (!cals.containsKey(Long.parseLong(f))) stale.put(f); } catch (Exception e) { stale.put(f); }
                }
                res.put("staleFilter", stale);
            }
            res.put("lastCalendarsError", lastCalendarsError).put("lastEventsError", lastEventsError);
        } catch (Exception e) {
            try { errors.put("diagnostics", err(e)); } catch (Exception ignored) { }
        }
        try { res.put("errors", errors); } catch (Exception ignored) { }
        return res.toString();
    }

    /**
     * Поиск события по названию во всём календаре телефона, без фильтров приложения.
     * Для каждого найденного — календарь и повторения: сколько их в диапазоне [from, to] (текущий вид
     * календаря в приложении), всего за ±2 года и ближайшее к сегодняшнему дню.
     */
    public static String findEvents(Context c, String query, long from, long to) {
        JSONObject res = new JSONObject();
        JSONObject errors = new JSONObject();
        try {
            String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
            res.put("query", query == null ? "" : query.trim());
            if (!canRead(c)) {
                errors.put("permission", "нет разрешения READ_CALENDAR");
            } else if (!q.isEmpty()) {
                Map<Long, JSONObject> cals = calendarInfo(c, errors);
                List<JSONObject> found = new ArrayList<>();
                // LIKE в SQLite не различает регистр только для латиницы — сравниваем сами
                try (Cursor cur = c.getContentResolver().query(CalendarContract.Events.CONTENT_URI, new String[]{
                        CalendarContract.Events._ID, CalendarContract.Events.TITLE, CalendarContract.Events.CALENDAR_ID,
                        CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND, CalendarContract.Events.RRULE,
                        CalendarContract.Events.ALL_DAY, CalendarContract.Events.DELETED, CalendarContract.Events.ORIGINAL_ID,
                }, CalendarContract.Events.TITLE + " IS NOT NULL", null, CalendarContract.Events.DTSTART + " DESC")) {
                    if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Events)");
                    while (cur.moveToNext() && found.size() < 30) {
                        String title = nz(cur.getString(1));
                        if (!title.toLowerCase(Locale.ROOT).contains(q)) continue;
                        long calId = cur.getLong(2);
                        JSONObject cal = cals.get(calId);
                        found.add(new JSONObject()
                                .put("eventId", cur.getLong(0))
                                .put("title", title)
                                .put("calendarId", calId)
                                .put("calendar", cal == null ? "" : cal.optString("name"))
                                .put("account", cal == null ? "" : cal.optString("account"))
                                .put("accountType", cal == null ? "" : cal.optString("accountType"))
                                .put("calVisible", cal == null || cal.optBoolean("visible"))
                                .put("calSync", cal == null || cal.optBoolean("syncEvents"))
                                .put("dtstart", cur.getLong(3))
                                .put("dtend", cur.isNull(4) ? 0 : cur.getLong(4))
                                .put("recurring", !nz(cur.getString(5)).isEmpty())
                                .put("allDay", cur.getInt(6) == 1)
                                .put("deleted", cur.getInt(7) == 1)
                                .put("exceptionOf", cur.isNull(8) ? 0 : cur.getLong(8))
                                .put("inRange", 0).put("total", 0).put("nearest", 0));
                    }
                } catch (Exception e) {
                    errors.put("events", err(e));
                    android.util.Log.w("UprCalendar", "findEvents: events", e);
                }
                if (!found.isEmpty()) {
                    Map<Long, JSONObject> byId = new HashMap<>();
                    StringBuilder ids = new StringBuilder();
                    for (JSONObject o : found) {
                        byId.put(o.getLong("eventId"), o);
                        if (ids.length() > 0) ids.append(',');
                        ids.append(o.getLong("eventId"));
                    }
                    long now = System.currentTimeMillis();
                    Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
                    ContentUris.appendId(b, Math.min(from, now - 730 * DAY));
                    ContentUris.appendId(b, Math.max(to, now + 730 * DAY));
                    try (Cursor cur = c.getContentResolver().query(b.build(), new String[]{
                            CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                    }, CalendarContract.Instances.EVENT_ID + " IN (" + ids + ")", null, null)) {
                        if (cur == null) throw new IllegalStateException("провайдер календаря вернул null (Instances)");
                        while (cur.moveToNext()) {
                            JSONObject o = byId.get(cur.getLong(0));
                            if (o == null) continue;
                            long bg = cur.getLong(1), en = cur.getLong(2);
                            o.put("total", o.getInt("total") + 1);
                            if (en > from && bg < to) o.put("inRange", o.getInt("inRange") + 1);
                            long near = o.getLong("nearest");
                            if (near == 0 || Math.abs(bg - now) < Math.abs(near - now)) o.put("nearest", bg);
                        }
                    } catch (Exception e) {
                        errors.put("instances", err(e));
                        android.util.Log.w("UprCalendar", "findEvents: instances", e);
                    }
                }
                JSONArray arr = new JSONArray();
                for (JSONObject o : found) arr.put(o);
                res.put("events", arr);
            }
        } catch (Exception e) {
            try { errors.put("find", err(e)); } catch (Exception ignored) { }
        }
        try { res.put("errors", errors); } catch (Exception ignored) { }
        return res.toString();
    }

    private static String nz(String s) { return s == null ? "" : s; }
}
