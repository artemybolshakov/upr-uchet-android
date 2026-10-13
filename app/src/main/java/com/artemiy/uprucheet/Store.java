package com.artemiy.uprucheet;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/** Файловое хранилище: основные данные, автобэкапы, снимки календаря, список будильников. */
public final class Store {
    public static final int KEEP_BACKUPS = 30;
    public static final int KEEP_SNAPSHOTS = 30;

    private Store() {}

    public static File dataFile(Context c) { return new File(c.getFilesDir(), "data.json"); }
    public static File alarmsFile(Context c) { return new File(c.getFilesDir(), "alarms.json"); }

    public static File backupsDir(Context c) {
        File d = new File(c.getFilesDir(), "backups");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    public static File snapshotsDir(Context c) {
        File d = new File(c.getFilesDir(), "calendar_snapshots");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    public static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    public static synchronized String read(File f) {
        if (!f.exists()) return "";
        try (InputStream in = new FileInputStream(f)) {
            return readAll(in);
        } catch (Exception e) {
            return "";
        }
    }

    public static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    /** Атомарная запись: сначала во временный файл, затем переименование. */
    public static synchronized boolean write(File f, String content) {
        File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (Exception e) {
            return false;
        }
        if (f.exists() && !f.delete()) return false;
        return tmp.renameTo(f);
    }

    /** Ежедневная автокопия основных данных (не чаще раза в день, если не force). */
    public static boolean autoBackup(Context c, boolean force) {
        String data = read(dataFile(c));
        if (data.isEmpty()) return false;
        File target = new File(backupsDir(c), "auto-" + today() + ".json");
        if (target.exists() && !force) return true;
        boolean ok = write(target, data);
        prune(backupsDir(c), "auto-", KEEP_BACKUPS);
        return ok;
    }

    public static void prune(File dir, String prefix, int keep) {
        File[] files = dir.listFiles((d, name) -> name.startsWith(prefix) && name.endsWith(".json"));
        if (files == null || files.length <= keep) return;
        Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        for (int i = 0; i < files.length - keep; i++) files[i].delete();
    }

    public static String listJson(File dir) {
        JSONArray arr = new JSONArray();
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files != null) {
            Arrays.sort(files, (a, b) -> b.getName().compareTo(a.getName()));
            for (File f : files) {
                try {
                    arr.put(new JSONObject()
                            .put("name", f.getName())
                            .put("size", f.length())
                            .put("modified", f.lastModified()));
                } catch (Exception ignored) {
                }
            }
        }
        return arr.toString();
    }

    public static String safeName(String name) {
        if (name == null) return "";
        return name.replaceAll("[^A-Za-z0-9._-]", "");
    }
}
