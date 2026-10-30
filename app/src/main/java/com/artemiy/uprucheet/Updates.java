package com.artemiy.uprucheet;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Новые версии приложения, переданные с компьютера: хранение (последние 3 APK в getExternalFilesDir("updates")),
 * проверка версии и подписи, уведомление «Новая версия получена — установить» и запуск установки.
 */
public final class Updates {
    private Updates() {}

    static final String CHANNEL = "updates";
    static final int KEEP_APKS = 3;
    static final String APK_MIME = "application/vnd.android.package-archive";

    static File dir(Context c) {
        File d = c.getExternalFilesDir("updates");
        if (d == null) d = new File(c.getFilesDir(), "updates"); // внешнее хранилище недоступно
        if (!d.exists()) d.mkdirs();
        return d;
    }

    /** Файл обновления по имени (только из папки обновлений, без путей). */
    static File file(Context c, String name) {
        String n = Uploads.sanitize(name);
        if (n.isEmpty() || !n.toLowerCase().endsWith(".apk")) return null;
        File f = new File(dir(c), n);
        return f.isFile() ? f : null;
    }

    /** Оставляет только последние KEEP_APKS файлов .apk. */
    static void prune(Context c) {
        File[] files = dir(c).listFiles((d, n) -> n.toLowerCase().endsWith(".apk"));
        if (files == null || files.length <= KEEP_APKS) return;
        Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        for (int i = KEEP_APKS; i < files.length; i++) files[i].delete();
    }

    // ---------- Версия и подпись ----------

    @SuppressWarnings("deprecation")
    static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
    }

    static String buildNumber(Bundle meta) {
        if (meta == null) return "";
        Object v = meta.get("build_number");
        return v == null || "0".equals(v.toString()) ? "" : v.toString();
    }

    /** Отпечатки SHA-256 сертификатов подписи. Пустое множество — прочитать не удалось. */
    @SuppressWarnings("deprecation")
    static Set<String> signers(PackageInfo pi) {
        Set<String> out = new HashSet<>();
        if (pi == null) return out;
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) {
            sigs = pi.signingInfo.hasMultipleSigners() ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
        }
        if ((sigs == null || sigs.length == 0) && pi.signatures != null) sigs = pi.signatures;
        if (sigs == null) return out;
        for (Signature s : sigs) {
            try {
                byte[] h = MessageDigest.getInstance("SHA-256").digest(s.toByteArray());
                StringBuilder sb = new StringBuilder();
                for (byte b : h) sb.append(String.format("%02x", b));
                out.add(sb.toString());
            } catch (Exception ignored) {
            }
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    static int signFlags() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    @SuppressWarnings("deprecation")
    static PackageInfo archiveInfo(Context c, File f) {
        PackageManager pm = c.getPackageManager();
        PackageInfo pi = pm.getPackageArchiveInfo(f.getAbsolutePath(), signFlags() | PackageManager.GET_META_DATA);
        if (pi == null) pi = pm.getPackageArchiveInfo(f.getAbsolutePath(), PackageManager.GET_META_DATA);
        if (pi != null && pi.applicationInfo != null) {
            pi.applicationInfo.sourceDir = f.getAbsolutePath();
            pi.applicationInfo.publicSourceDir = f.getAbsolutePath();
        }
        return pi;
    }

    @SuppressWarnings("deprecation")
    static PackageInfo installedInfo(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), signFlags());
        } catch (Exception e) {
            return null;
        }
    }

    /** Текущая версия приложения: { versionName, versionCode, build }. */
    static JSONObject current(Context c) {
        JSONObject o = new JSONObject();
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            ApplicationInfo ai = c.getPackageManager().getApplicationInfo(c.getPackageName(), PackageManager.GET_META_DATA);
            o.put("versionName", pi.versionName == null ? "" : pi.versionName)
                    .put("versionCode", versionCode(pi))
                    .put("build", buildNumber(ai.metaData));
        } catch (Exception ignored) {
        }
        return o;
    }

    /**
     * Сведения об APK: версия, сборка, тот же ли пакет, совпадает ли подпись с установленным приложением (true/false/null — не удалось
     * проверить), новее ли версия, можно ли устанавливать из этого приложения (разрешение «Неизвестные источники»).
     */
    static JSONObject info(Context c, File f) {
        JSONObject o = new JSONObject();
        try {
            o.put("name", f.getName()).put("size", f.length()).put("modified", f.lastModified()).put("exists", f.isFile());
            JSONObject cur = current(c);
            o.put("current", cur);
            PackageInfo pi = f.isFile() ? archiveInfo(c, f) : null;
            if (pi == null) {
                o.put("valid", false);
                return o;
            }
            long vc = versionCode(pi);
            boolean samePackage = c.getPackageName().equals(pi.packageName);
            Set<String> mine = signers(installedInfo(c));
            Set<String> theirs = signers(pi);
            Object sigMatch = JSONObject.NULL;
            if (!mine.isEmpty() && !theirs.isEmpty()) {
                Set<String> common = new HashSet<>(mine);
                common.retainAll(theirs);
                sigMatch = !common.isEmpty();
            }
            o.put("valid", true)
                    .put("packageName", pi.packageName == null ? "" : pi.packageName)
                    .put("samePackage", samePackage)
                    .put("versionName", pi.versionName == null ? "" : pi.versionName)
                    .put("versionCode", vc)
                    .put("build", pi.applicationInfo == null ? "" : buildNumber(pi.applicationInfo.metaData))
                    .put("sigMatch", sigMatch)
                    .put("newer", vc > cur.optLong("versionCode", 0))
                    .put("installed", samePackage && Boolean.TRUE.equals(sigMatch) && vc <= cur.optLong("versionCode", 0))
                    .put("canInstall", canInstall(c));
        } catch (Exception e) {
            try { o.put("valid", false).put("error", e.toString()); } catch (Exception ignored) { }
        }
        return o;
    }

    static boolean canInstall(Context c) {
        return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls();
    }

    static String label(JSONObject info) {
        String v = info.optString("versionName");
        String b = info.optString("build");
        return (v.isEmpty() ? "" : v) + (b.isEmpty() ? " (код " + info.optLong("versionCode") + ")" : " (сборка " + b + ")");
    }

    // ---------- Уведомление ----------

    static void notifyReceived(Context c, File f, JSONObject info) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Обновления приложения", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Новая версия, переданная с компьютера");
                nm.createNotificationChannel(ch);
            }
            Intent open = new Intent(c, MainActivity.class)
                    .setAction("com.artemiy.uprucheet.v2.INSTALL_UPDATE")
                    .putExtra("update", f.getName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(c, 7001, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String title, text;
            if (!info.optBoolean("valid")) {
                title = "Получен файл " + f.getName();
                text = "Это не похоже на установочный файл приложения";
            } else {
                title = "Новая версия " + label(info) + " получена — установить";
                Object sig = info.opt("sigMatch");
                if (!info.optBoolean("samePackage")) text = "Это APK другого приложения (" + info.optString("packageName") + ")";
                else if (Boolean.FALSE.equals(sig)) text = "Подпись отличается — установка поверх невозможна, придётся удалять приложение";
                else if (!info.optBoolean("newer")) text = "Версия не новее установленной (" + label(info.optJSONObject("current")) + ")";
                else text = "Нажмите, чтобы установить. Перед установкой будет сделана резервная копия данных.";
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
            b.setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setContentIntent(pi)
                    .setAutoCancel(true);
            nm.notify(7001, b.build());
        } catch (Exception ignored) {
        }
    }

    static void cancelNotification(Context c) {
        try { ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(7001); } catch (Exception ignored) { }
    }

    // ---------- Установка ----------

    /**
     * Запускает установку. Возвращает: "started" — открыт системный установщик (подтверждение — на телефоне);
     * "permission" — нужно разрешить установку из этого приложения (вызовите openUnknownSources);
     * "missing" — файла нет; "error:…" — не удалось запустить.
     */
    static String install(Context c, String name) {
        File f = file(c, name);
        if (f == null) return "missing";
        if (!canInstall(c)) return "permission";
        // Страховка перед установкой — как перед восстановлением из файла
        Store.autoBackup(c, true);
        try { FolderBackup.run(c, true); } catch (Exception ignored) { }
        try {
            Uri uri = ApkProvider.uriFor(f);
            Intent i = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, APK_MIME)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            cancelNotification(c);
            return "started";
        } catch (Exception e) {
            return "error:" + e.getMessage();
        }
    }

    /** Экран «Установка неизвестных приложений» для этого приложения. */
    static void openUnknownSources(Context c) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + c.getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            try {
                c.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) {
            }
        }
    }
}
