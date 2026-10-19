package com.artemiy.uprucheet;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.database.Cursor;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    static final int REQ_EXPORT = 501;
    static final int REQ_IMPORT = 502;
    static final int REQ_PERMS = 503;
    static final int REQ_IMPORT_RAW = 504;
    static final int REQ_BACKUP_FOLDER = 505;

    WebView webView;
    String pendingExport;
    String pendingImportKind = "";
    private String pendingOpen;
    private String pendingUpdate;
    private boolean pageReady;

    private static java.lang.ref.WeakReference<MainActivity> currentRef = new java.lang.ref.WeakReference<>(null);

    static MainActivity current() { return currentRef.get(); }

    @Override
    protected void onDestroy() {
        if (currentRef.get() == this) currentRef = new java.lang.ref.WeakReference<>(null);
        super.onDestroy();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        currentRef = new java.lang.ref.WeakReference<>(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 246, 250));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                if ("tel".equals(scheme) || "mailto".equals(scheme) || "http".equals(scheme) || "https".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingOpen != null) {
                    emit("open", pendingOpen);
                    pendingOpen = null;
                }
                if (pendingUpdate != null) {
                    emit("update", pendingUpdate);
                    pendingUpdate = null;
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new Bridge(this), "Native");
        webView.loadUrl("file:///android_asset/index.html");

        handleIntent(getIntent());
        Alarms.scheduleDaily(this);
        new Thread(() -> {
            Store.autoBackup(this, false);
            FolderBackup.run(this, false);
            CalendarSync.snapshot(this);
            Uploads.cleanup(this); // остатки прерванных загрузок с компьютера
        }).start();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        // нажатие на уведомление «Новая версия получена — установить»
        String upd = intent.getStringExtra("update");
        if (upd != null && !upd.isEmpty()) {
            intent.removeExtra("update");
            if (pageReady) emit("update", upd); else pendingUpdate = upd;
        }
        String open = intent.getStringExtra("open");
        if (open == null || open.isEmpty()) return;
        if (pageReady) emit("open", open);
        else pendingOpen = open;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pageReady) emit("resume", "");
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Смена режима экрана Mate XT (сложен / двойной / тройной) не пересоздаёт Activity — данные и ввод сохраняются.
        emit("screen", newConfig.screenWidthDp + "x" + newConfig.screenHeightDp);
    }

    /** Отправляет событие в JS: window.__native(type, payload). */
    void emit(String type, String payload) {
        if (webView == null) return;
        String js = "window.__native&&window.__native(" + JSONObject.quote(type) + "," + JSONObject.quote(payload == null ? "" : payload) + ")";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = data == null ? null : data.getData();
        if (requestCode == REQ_BACKUP_FOLDER) {
            if (resultCode == RESULT_OK && uri != null && FolderBackup.setFolder(this, uri)) {
                new Thread(() -> emit("folderBackup", FolderBackup.run(this, true) ? "ok" : "fail")).start();
            } else {
                emit("folderBackup", "cancel");
            }
            return;
        }
        if (requestCode == REQ_EXPORT) {
            boolean ok = false;
            if (resultCode == RESULT_OK && uri != null && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    out.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    ok = true;
                } catch (Exception ignored) {
                }
            }
            pendingExport = null;
            emit("exported", ok ? "ok" : "fail");
        } else if (requestCode == REQ_IMPORT_RAW) {
            if (resultCode == RESULT_OK && uri != null) {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] chunk = new byte[16384];
                    int n;
                    while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                    JSONObject o = new JSONObject()
                            .put("kind", pendingImportKind)
                            .put("name", displayName(uri))
                            .put("b64", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
                    emit("importedRaw", o.toString());
                    return;
                } catch (Exception ignored) {
                }
            }
            emit("importedRaw", "");
        } else if (requestCode == REQ_IMPORT) {
            if (resultCode == RESULT_OK && uri != null) {
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    emit("imported", Store.readAll(in));
                    return;
                } catch (Exception ignored) {
                }
            }
            emit("imported", "");
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        String p = uri.getLastPathSegment();
        return p == null ? "" : p;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        emit("permissions", "");
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("window.__back?window.__back():false", value -> {
                if (!"true".equals(value)) MainActivity.super.onBackPressed();
            });
        } else {
            super.onBackPressed();
        }
    }
}
