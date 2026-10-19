package com.artemiy.uprucheet;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.EOFException;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Приём файлов с компьютера («Доступ с компьютера» → «Файлы на телефон»).
 * Тело запроса пишется потоком (буфер 64 КБ) сразу в файл, с подсчётом SHA-256.
 *  - APK → getExternalFilesDir("updates"): сначала «имя.apk.part», после успешной записи — переименование; хранятся 3 последних.
 *  - остальные файлы → «Загрузки/Упр. учёт» через MediaStore.Downloads (Android 10+): запись в «ожидающий» элемент (IS_PENDING=1),
 *    который не виден в «Файлах», пока не дописан; при ошибке элемент удаляется. На Android 8–9 — в папку приложения (.part → имя).
 * Обрыв связи посреди загрузки не оставляет файлов: .part и ожидающие элементы удаляются (и при следующем запуске — тоже).
 */
public final class Uploads {
    private Uploads() {}

    static final long MAX_UPLOAD = 500L * 1024 * 1024;
    static final int BUF = 64 * 1024;
    static final String FOLDER = "Упр. учёт";
    static final int KEEP_HISTORY = 30;

    /** Сообщает, что загрузка ещё идёт (чтобы «Доступ с компьютера» не выключился по бездействию). */
    interface Progress { void tick(long done); }

    static final class Result {
        String name, location, sha256, kind;
        long size;
        JSONObject apk;
    }

    // ---------- Имя файла ----------

    /** Только имя: без путей, «..», управляющих и спецсимволов; не длиннее 120 символов. */
    static String sanitize(String raw) {
        if (raw == null) return "";
        String s = raw.replace('\\', '/');
        int i = s.lastIndexOf('/');
        if (i >= 0) s = s.substring(i + 1);
        s = s.replaceAll("[\\p{Cntrl}<>:\"|?*]", "").replace("..", ".").trim();
        while (s.startsWith(".")) s = s.substring(1);
        while (s.endsWith(".") || s.endsWith(" ")) s = s.substring(0, s.length() - 1);
        if (s.length() > 120) {
            int dot = s.lastIndexOf('.');
            String ext = dot > 0 && s.length() - dot <= 10 ? s.substring(dot) : "";
            s = s.substring(0, 120 - ext.length()) + ext;
        }
        return s;
    }

    static String withSuffix(String name, int n) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) + " (" + n + ")" + name.substring(dot) : name + " (" + n + ")";
    }

    static boolean isApk(String name) { return name.toLowerCase(Locale.ROOT).endsWith(".apk"); }

    static String mime(String name) {
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        String m = ext.isEmpty() ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "application/octet-stream" : m;
    }

    // ---------- Приём ----------

    static Result receive(Context c, String rawName, InputStream in, long length, Progress progress) throws Exception {
        String name = sanitize(rawName);
        if (name.isEmpty()) name = "file";
        cleanup(c);
        Result r = new Result();
        r.size = length;
        if (isApk(name)) receiveApk(c, name, in, length, progress, r);
        else if (Build.VERSION.SDK_INT >= 29) receiveToDownloads(c, name, in, length, progress, r);
        else receiveToAppFolder(c, name, in, length, progress, r);
        remember(c, r);
        return r;
    }

    /** Копирует ровно length байт, считая SHA-256. Обрыв раньше времени — EOFException. */
    static String copy(InputStream in, OutputStream out, long length, Progress progress) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[BUF];
        long done = 0, lastTick = 0;
        while (done < length) {
            int n = in.read(buf, 0, (int) Math.min(buf.length, length - done));
            if (n < 0) throw new EOFException("связь прервалась: получено " + done + " из " + length + " байт");
            out.write(buf, 0, n);
            md.update(buf, 0, n);
            done += n;
            if (progress != null && done - lastTick >= 4L * 1024 * 1024) { progress.tick(done); lastTick = done; }
        }
        out.flush();
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    static File unique(File dir, String name) {
        File f = new File(dir, name);
        for (int i = 1; f.exists() || new File(dir, f.getName() + ".part").exists(); i++) f = new File(dir, withSuffix(name, i));
        return f;
    }

    private static void receiveViaPart(File target, InputStream in, long length, Progress progress, Result r) throws Exception {
        File part = new File(target.getParentFile(), target.getName() + ".part");
        boolean ok = false;
        try (OutputStream out = new FileOutputStream(part)) {
            r.sha256 = copy(in, out, length, progress);
            ok = true;
        } finally {
            if (!ok) part.delete();
        }
        if (!part.renameTo(target)) { part.delete(); throw new IOException("не удалось сохранить файл"); }
        r.name = target.getName();
    }

    private static void receiveApk(Context c, String name, InputStream in, long length, Progress progress, Result r) throws Exception {
        File dir = Updates.dir(c);
        if (dir.getUsableSpace() < length + 20L * 1024 * 1024) throw new IOException("на телефоне мало свободного места");
        receiveViaPart(unique(dir, name), in, length, progress, r);
        r.kind = "apk";
        r.location = "Обновления приложения";
        File f = new File(dir, r.name);
        Updates.prune(c);
        r.apk = Updates.info(c, f);
        Updates.notifyReceived(c, f, r.apk);
    }

    private static void receiveToAppFolder(Context c, String name, InputStream in, long length, Progress progress, Result r) throws Exception {
        File dir = c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = new File(c.getFilesDir(), "Download");
        if (!dir.exists()) dir.mkdirs();
        if (dir.getUsableSpace() < length + 20L * 1024 * 1024) throw new IOException("на телефоне мало свободного места");
        receiveViaPart(unique(dir, name), in, length, progress, r);
        r.kind = "file";
        r.location = "Android/data/" + c.getPackageName() + "/files/Download";
    }

    private static File pendingMarker(Context c) { return new File(c.getFilesDir(), "upload-pending.txt"); }

    private static void receiveToDownloads(Context c, String name, InputStream in, long length, Progress progress, Result r) throws Exception {
        if (Environment.getExternalStorageDirectory().getUsableSpace() < length + 20L * 1024 * 1024) throw new IOException("на телефоне мало свободного места");
        ContentResolver cr = c.getContentResolver();
        String rel = Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER + "/";
        String finalName = name;
        for (int i = 1; existsInDownloads(cr, rel, finalName); i++) finalName = withSuffix(name, i);
        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, finalName);
        v.put(MediaStore.MediaColumns.MIME_TYPE, mime(finalName));
        v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new IOException("не удалось создать файл в «Загрузках»");
        Store.write(pendingMarker(c), uri.toString());
        boolean ok = false;
        try {
            try (OutputStream out = cr.openOutputStream(uri, "w")) {
                if (out == null) throw new IOException("нет доступа к файлу в «Загрузках»");
                r.sha256 = copy(in, out, length, progress);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            ok = true;
        } finally {
            if (!ok) { try { cr.delete(uri, null, null); } catch (Exception ignored) { } }
            pendingMarker(c).delete();
        }
        r.name = finalName;
        r.kind = "file";
        r.location = "Загрузки/" + FOLDER;
    }

    private static boolean existsInDownloads(ContentResolver cr, String rel, String name) {
        try (Cursor cur = cr.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?", new String[]{rel, name}, null)) {
            return cur != null && cur.moveToFirst();
        } catch (Exception e) {
            return false;
        }
    }

    /** Удаляет остатки прерванных загрузок: .part-файлы и незавершённый элемент «Загрузок». */
    static synchronized void cleanup(Context c) {
        File[] dirs = {Updates.dir(c), c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)};
        for (File d : dirs) {
            if (d == null) continue;
            File[] parts = d.listFiles((x, n) -> n.endsWith(".part"));
            // не трогаем .part, которые пишутся прямо сейчас (изменялись меньше минуты назад)
            if (parts != null) for (File p : parts) if (System.currentTimeMillis() - p.lastModified() > 60_000) p.delete();
        }
        File marker = pendingMarker(c);
        if (marker.exists() && System.currentTimeMillis() - marker.lastModified() > 60_000) {
            String u = Store.read(marker).trim();
            if (!u.isEmpty() && Build.VERSION.SDK_INT >= 29) {
                try { c.getContentResolver().delete(Uri.parse(u), null, null); } catch (Exception ignored) { }
            }
            marker.delete();
        }
    }

    // ---------- История загрузок ----------

    private static File historyFile(Context c) { return new File(c.getFilesDir(), "uploads.json"); }

    private static synchronized void remember(Context c, Result r) {
        try {
            JSONArray old;
            try { old = new JSONArray(Store.read(historyFile(c))); } catch (Exception e) { old = new JSONArray(); }
            JSONArray arr = new JSONArray();
            arr.put(new JSONObject().put("name", r.name).put("size", r.size).put("time", System.currentTimeMillis())
                    .put("sha256", r.sha256).put("kind", r.kind).put("location", r.location));
            for (int i = 0; i < old.length() && arr.length() < KEEP_HISTORY; i++) arr.put(old.get(i));
            Store.write(historyFile(c), arr.toString());
        } catch (Exception ignored) {
        }
    }

    /** Последние загрузки; для APK — актуальная версия и статус (ожидает установки / установлена / подпись отличается…). */
    static synchronized String history(Context c) {
        JSONArray out = new JSONArray();
        try {
            JSONArray arr = new JSONArray(Store.read(historyFile(c)));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if ("apk".equals(o.optString("kind"))) {
                    File f = new File(Updates.dir(c), o.optString("name"));
                    JSONObject info = Updates.info(c, f);
                    o.put("apk", info).put("status", apkStatus(info));
                }
                out.put(o);
            }
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    static String apkStatus(JSONObject info) {
        if (!info.optBoolean("exists")) return "Файл удалён (хранятся 3 последних APK)";
        if (!info.optBoolean("valid")) return "Не удалось прочитать APK";
        if (!info.optBoolean("samePackage")) return "APK другого приложения";
        Object sig = info.opt("sigMatch");
        if (Boolean.FALSE.equals(sig)) return "Подпись отличается — поверх не установится";
        if (info.optBoolean("newer")) return "Ожидает установки на телефоне";
        long cur = info.optJSONObject("current") == null ? 0 : info.optJSONObject("current").optLong("versionCode");
        if (info.optLong("versionCode") == cur) return "Установлена";
        return "Старше установленной версии";
    }
}
