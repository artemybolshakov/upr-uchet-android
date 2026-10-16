package com.artemiy.uprucheet;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;

/** Мост JS ↔ Android. В JS доступен как window.Native. */
public final class Bridge {
    private final MainActivity a;

    Bridge(MainActivity activity) { this.a = activity; }

    // ---------- Данные и бэкапы ----------

    @JavascriptInterface
    public String load() { return Store.read(Store.dataFile(a)); }

    @JavascriptInterface
    public boolean save(String json) {
        boolean ok = Store.write(Store.dataFile(a), json);
        if (ok) {
            Store.autoBackup(a, false);
            WebServer.REV.incrementAndGet();
            new Thread(() -> FolderBackup.run(a, false)).start();
        }
        return ok;
    }

    // ---------- Автокопия в выбранную папку ----------

    @JavascriptInterface
    public String folderBackupStatus() { return FolderBackup.statusJson(a); }

    @JavascriptInterface
    public void folderBackupPick() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        a.runOnUiThread(() -> {
            try { a.startActivityForResult(i, MainActivity.REQ_BACKUP_FOLDER); }
            catch (Exception e) { a.emit("folderBackup", "fail"); }
        });
    }

    @JavascriptInterface
    public boolean folderBackupNow() { return FolderBackup.run(a, true); }

    @JavascriptInterface
    public void folderBackupClear() { FolderBackup.clear(a); }

    @JavascriptInterface
    public void folderBackupKeep(int keep) { FolderBackup.setKeep(a, keep); }

    // ---------- Доступ с компьютера по Wi-Fi ----------

    @JavascriptInterface
    public String webStatus() { WebAccessService.ctx = a.getApplicationContext(); return WebAccessService.statusJson(); }

    @JavascriptInterface
    public void webStart() {
        a.runOnUiThread(() -> {
            try {
                a.startService(new Intent(a, WebAccessService.class).setAction(WebAccessService.ACTION_START));
            } catch (Exception e) {
                a.emit("webStatus", "error");
            }
        });
    }

    @JavascriptInterface
    public void webStop() {
        a.runOnUiThread(() -> {
            try {
                a.startService(new Intent(a, WebAccessService.class).setAction(WebAccessService.ACTION_STOP));
            } catch (Exception ignored) {
            }
        });
    }

    @JavascriptInterface
    public double dataRev() { return WebServer.REV.get(); }

    @JavascriptInterface
    public boolean backupNow() { return Store.autoBackup(a, true); }

    @JavascriptInterface
    public String listBackups() { return Store.listJson(Store.backupsDir(a)); }

    @JavascriptInterface
    public String readBackup(String name) {
        return Store.read(new File(Store.backupsDir(a), Store.safeName(name)));
    }

    @JavascriptInterface
    public void exportFile(String content, String fileName, String mime) {
        a.pendingExport = content;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime == null || mime.isEmpty() ? "application/json" : mime);
        i.putExtra(Intent.EXTRA_TITLE, fileName);
        a.runOnUiThread(() -> {
            try { a.startActivityForResult(i, MainActivity.REQ_EXPORT); }
            catch (Exception e) { a.emit("exported", "fail"); }
        });
    }

    /** Выбор файла для импорта (CSV/XLS/XLSX/ICS): содержимое отдаётся в JS как base64, чтобы корректно читать любые кодировки. */
    @JavascriptInterface
    public void importRaw(String kind) {
        a.pendingImportKind = kind == null ? "" : kind;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        a.runOnUiThread(() -> {
            try { a.startActivityForResult(i, MainActivity.REQ_IMPORT_RAW); }
            catch (Exception e) { a.emit("importedRaw", ""); }
        });
    }

    @JavascriptInterface
    public void importFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        a.runOnUiThread(() -> {
            try { a.startActivityForResult(i, MainActivity.REQ_IMPORT); }
            catch (Exception e) { a.emit("imported", ""); }
        });
    }

    // ---------- Текст: копировать / поделиться ----------

    @JavascriptInterface
    public void copyText(String text) {
        a.runOnUiThread(() -> {
            ClipboardManager cm = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("Сводка", text));
            if (Build.VERSION.SDK_INT < 33) Toast.makeText(a, "Скопировано", Toast.LENGTH_SHORT).show();
        });
    }

    @JavascriptInterface
    public void shareText(String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        a.runOnUiThread(() -> a.startActivity(Intent.createChooser(i, "Отправить сводку")));
    }

    @JavascriptInterface
    public void toast(String text) {
        a.runOnUiThread(() -> Toast.makeText(a, text, Toast.LENGTH_SHORT).show());
    }

    // ---------- Напоминания ----------

    @JavascriptInterface
    public int setAlarms(String json) { return Alarms.replaceAll(a, json); }

    @JavascriptInterface
    public void testAlarm(boolean aggressive) {
        Alarms.schedule(a, "test-" + System.currentTimeMillis(), System.currentTimeMillis() + 5000,
                "Проверка сигнала", aggressive ? "Так будет звучать напоминание о важном событии" : "Обычное напоминание",
                aggressive, "");
    }

    // ---------- Разрешения ----------

    @JavascriptInterface
    public String permissions() {
        try {
            NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
            PowerManager pm = (PowerManager) a.getSystemService(Context.POWER_SERVICE);
            boolean notif = Build.VERSION.SDK_INT < 33
                    ? nm.areNotificationsEnabled()
                    : a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            boolean full = Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent();
            return new JSONObject()
                    .put("notifications", notif)
                    .put("exactAlarm", Alarms.canExact(a))
                    .put("fullScreen", full)
                    .put("calendar", CalendarSync.canRead(a) && CalendarSync.canWrite(a))
                    .put("battery", pm.isIgnoringBatteryOptimizations(a.getPackageName()))
                    .put("sdk", Build.VERSION.SDK_INT)
                    .put("device", Build.MANUFACTURER + " " + Build.MODEL)
                    .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void requestPermission(String which) {
        a.runOnUiThread(() -> {
            try {
                String pkg = a.getPackageName();
                switch (which) {
                    case "notifications":
                        if (Build.VERSION.SDK_INT >= 33) {
                            a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, MainActivity.REQ_PERMS);
                        } else {
                            a.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                                    .putExtra(Settings.EXTRA_APP_PACKAGE, pkg));
                        }
                        break;
                    case "calendar":
                        a.requestPermissions(new String[]{Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR}, MainActivity.REQ_PERMS);
                        break;
                    case "exactAlarm":
                        if (Build.VERSION.SDK_INT >= 31) {
                            a.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg)));
                        }
                        break;
                    case "fullScreen":
                        if (Build.VERSION.SDK_INT >= 34) {
                            a.startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg)));
                        }
                        break;
                    case "battery":
                        a.startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg)));
                        break;
                    default:
                        a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
                }
            } catch (Exception e) {
                try {
                    a.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + a.getPackageName())));
                } catch (Exception ignored) {
                }
            }
        });
    }

    // ---------- Системный календарь ----------

    @JavascriptInterface
    public String deviceCalendars() { return CalendarSync.calendars(a); }

    @JavascriptInterface
    public String deviceEvents(double from, double to, String calendarIdsCsv) {
        return CalendarSync.events(a, (long) from, (long) to, calendarIdsCsv).toString();
    }

    @JavascriptInterface
    public double upsertDeviceEvent(String json) { return CalendarSync.upsert(a, json); }

    @JavascriptInterface
    public boolean deleteDeviceEvent(double id) { return CalendarSync.delete(a, (long) id); }

    @JavascriptInterface
    public double saveDeviceEvent(String json) { return CalendarSync.saveDeviceEvent(a, json); }

    @JavascriptInterface
    public boolean deleteDeviceEventEx(double id, String mode, double originalBegin) {
        return CalendarSync.deleteDeviceEvent(a, (long) id, mode, (long) originalBegin);
    }

    @JavascriptInterface
    public boolean snapshotNow() { return CalendarSync.snapshot(a); }

    @JavascriptInterface
    public String listSnapshots() { return Store.listJson(Store.snapshotsDir(a)); }

    @JavascriptInterface
    public String readSnapshot(String name) {
        return Store.read(new File(Store.snapshotsDir(a), Store.safeName(name)));
    }

    @JavascriptInterface
    public String appInfo() {
        try {
            String v = a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName;
            return new JSONObject().put("version", v).put("sdk", Build.VERSION.SDK_INT)
                    .put("device", Build.MANUFACTURER + " " + Build.MODEL).toString();
        } catch (Exception e) {
            return "{}";
        }
    }
}
