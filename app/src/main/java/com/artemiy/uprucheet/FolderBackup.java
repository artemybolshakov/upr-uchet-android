package com.artemiy.uprucheet;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Ежедневная резервная копия в папку, которую пользователь выбрал сам (Storage Access Framework).
 * Файл — в том же формате, что и «Сохранить в файл», поэтому восстанавливается кнопкой «Восстановить из файла».
 */
public final class FolderBackup {
    static final String PREFS = "folder_backup";
    static final String PREFIX = "管理会计-автокопия-";
    static final int DEFAULT_KEEP = 30;

    private FolderBackup() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static Uri treeUri(Context c) {
        String s = prefs(c).getString("uri", null);
        return s == null ? null : Uri.parse(s);
    }

    /** Сохраняет выбранную папку и постоянное разрешение на запись в неё. */
    static boolean setFolder(Context c, Uri tree) {
        try {
            c.getContentResolver().takePersistableUriPermission(tree,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            return false;
        }
        Uri old = treeUri(c);
        if (old != null && !old.equals(tree)) release(c, old);
        prefs(c).edit().putString("uri", tree.toString()).remove("lastDay").remove("lastError").apply();
        return true;
    }

    static void clear(Context c) {
        Uri old = treeUri(c);
        if (old != null) release(c, old);
        prefs(c).edit().clear().apply();
    }

    private static void release(Context c, Uri u) {
        try {
            c.getContentResolver().releasePersistableUriPermission(u,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) {
        }
    }

    static void setKeep(Context c, int keep) {
        prefs(c).edit().putInt("keep", Math.max(1, Math.min(365, keep))).apply();
    }

    private static boolean hasPermission(Context c, Uri tree) {
        for (UriPermission p : c.getContentResolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isWritePermission()) return true;
        }
        return false;
    }

    /** Копия в папку: не чаще раза в день (force — всегда). Возвращает true при успехе или если сегодня уже сделано. */
    static synchronized boolean run(Context c, boolean force) {
        Uri tree = treeUri(c);
        if (tree == null) return false;
        String day = Store.today();
        SharedPreferences p = prefs(c);
        if (!force && day.equals(p.getString("lastDay", ""))) return true;
        String data = Store.read(Store.dataFile(c));
        if (data.isEmpty()) return false;
        if (!hasPermission(c, tree)) {
            p.edit().putString("lastError", "Нет доступа к папке — выберите её заново").apply();
            return false;
        }
        ContentResolver cr = c.getContentResolver();
        try {
            int schema = 1;
            String appVersion = "";
            try {
                JSONObject d = new JSONObject(data);
                schema = d.optInt("schema", 1);
                JSONObject meta = d.optJSONObject("meta");
                if (meta != null) appVersion = meta.optString("appVersion", "");
            } catch (Exception ignored) {
            }
            String exported = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
            String content = "{\"format\":\"upr-uchet-backup\",\"schema\":" + schema
                    + ",\"appVersion\":" + JSONObject.quote(appVersion)
                    + ",\"exportedAt\":" + JSONObject.quote(exported)
                    + ",\"source\":\"auto-folder\",\"data\":" + data + "}";

            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            String name = PREFIX + day + ".json";
            Uri target = findChild(cr, tree, name);
            if (target == null) target = DocumentsContract.createDocument(cr, parent, "application/json", name);
            if (target == null) throw new Exception("не удалось создать файл");
            try (OutputStream out = cr.openOutputStream(target, "wt")) {
                if (out == null) throw new Exception("не удалось открыть файл");
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            prune(cr, tree, p.getInt("keep", DEFAULT_KEEP));
            p.edit().putString("lastDay", day).putLong("lastAt", System.currentTimeMillis())
                    .putString("lastFile", name).remove("lastError").apply();
            return true;
        } catch (Exception e) {
            p.edit().putString("lastError", e.getMessage() == null ? "ошибка записи" : e.getMessage()).apply();
            return false;
        }
    }

    private static Uri findChild(ContentResolver cr, Uri tree, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        try (Cursor q = cr.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            while (q != null && q.moveToNext()) {
                if (name.equals(q.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, q.getString(0));
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    /** Удаляет самые старые автокопии сверх лимита. Чужие файлы в папке не трогает. */
    private static void prune(ContentResolver cr, Uri tree, int keep) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        List<String[]> mine = new ArrayList<>();
        try (Cursor q = cr.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
            while (q != null && q.moveToNext()) {
                String n = q.getString(1);
                if (n != null && n.startsWith(PREFIX) && n.endsWith(".json")) mine.add(new String[]{n, q.getString(0)});
            }
        } catch (Exception ignored) {
            return;
        }
        if (mine.size() <= keep) return;
        Collections.sort(mine, (a, b) -> a[0].compareTo(b[0]));
        for (int i = 0; i < mine.size() - keep; i++) {
            try {
                DocumentsContract.deleteDocument(cr, DocumentsContract.buildDocumentUriUsingTree(tree, mine.get(i)[1]));
            } catch (Exception ignored) {
            }
        }
    }

    static String folderName(Context c, Uri tree) {
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor q = c.getContentResolver().query(doc, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (q != null && q.moveToFirst()) return q.getString(0);
            }
        } catch (Exception ignored) {
        }
        String id = DocumentsContract.getTreeDocumentId(tree);
        return id == null ? "" : id.replace("primary:", "Внутренняя память/");
    }

    static String statusJson(Context c) {
        try {
            Uri tree = treeUri(c);
            SharedPreferences p = prefs(c);
            JSONObject o = new JSONObject().put("enabled", tree != null).put("keep", p.getInt("keep", DEFAULT_KEEP));
            if (tree != null) {
                o.put("folder", folderName(c, tree))
                        .put("path", DocumentsContract.getTreeDocumentId(tree))
                        .put("access", hasPermission(c, tree))
                        .put("lastAt", p.getLong("lastAt", 0))
                        .put("lastFile", p.getString("lastFile", ""))
                        .put("lastError", p.getString("lastError", ""));
            }
            return o.toString();
        } catch (Exception e) {
            return "{\"enabled\":false}";
        }
    }
}
