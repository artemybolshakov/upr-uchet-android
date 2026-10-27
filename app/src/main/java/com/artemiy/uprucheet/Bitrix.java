package com.artemiy.uprucheet;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Битрикс24 REST через входящий вебхук.
 * Адрес вебхука — это пароль: хранится только здесь, в настройках приложения на телефоне
 * (не в файле данных — значит, не попадает в резервные копии, автокопии в папку и /api/data веб-версии).
 * В JS он не возвращается: наружу отдаётся только адрес портала.
 */
final class Bitrix {
    private Bitrix() { }

    private static final String PREFS = "bitrix";
    private static final String KEY = "webhook";
    /** https://<портал>/rest/<id пользователя>/<ключ>/ */
    static final Pattern HOOK = Pattern.compile("^https://([A-Za-z0-9.-]+(?::\\d+)?)/rest/(\\d+)/([A-Za-z0-9_]+)/?$");
    /** Вызовы по одному: Битрикс24 ограничивает частоту запросов. */
    private static final ExecutorService Q = Executors.newSingleThreadExecutor();

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String webhook(Context c) { return prefs(c).getString(KEY, ""); }

    /** Нормализует адрес; null — адрес не похож на вебхук. */
    static String normalize(String url) {
        if (url == null) return null;
        String u = url.trim();
        // часто копируют вместе с именем метода: …/ключ/user.current.json
        u = u.replaceAll("/[a-z_]+(\\.[a-z_]+)+(\\.json)?/?$", "/");
        Matcher m = HOOK.matcher(u);
        if (!m.matches()) return null;
        return "https://" + m.group(1) + "/rest/" + m.group(2) + "/" + m.group(3) + "/";
    }

    /** "ok" | "cleared" | "invalid" */
    static String setWebhook(Context c, String url) {
        if (url == null || url.trim().isEmpty()) {
            prefs(c).edit().remove(KEY).apply();
            return "cleared";
        }
        String n = normalize(url);
        if (n == null) return "invalid";
        prefs(c).edit().putString(KEY, n).apply();
        return "ok";
    }

    /** {configured, host, userId} — без ключа. */
    static String info(Context c) {
        try {
            String w = webhook(c);
            Matcher m = HOOK.matcher(w);
            JSONObject o = new JSONObject().put("configured", m.matches());
            if (m.matches()) o.put("host", m.group(1)).put("userId", m.group(2));
            return o.toString();
        } catch (Exception e) {
            return "{\"configured\":false}";
        }
    }

    /** Асинхронный вызов метода REST; ответ — событие "bitrix": {id, ok, status, body} или {id, ok:false, error}. */
    static void call(MainActivity a, String reqId, String method, String paramsJson) {
        Q.execute(() -> a.emit("bitrix", callSync(webhook(a), reqId, method, paramsJson)));
    }

    static String callSync(String hook, String reqId, String method, String paramsJson) {
        JSONObject res = new JSONObject();
        try {
            res.put("id", reqId);
            if (normalize(hook) == null) return res.put("ok", false).put("error", "nohook").toString();
            if (method == null || !method.matches("[a-z_]+(\\.[a-z_]+)*")) return res.put("ok", false).put("error", "method").toString();
            String body = paramsJson == null || paramsJson.isEmpty() ? "{}" : paramsJson;
            for (int attempt = 0; ; attempt++) {
                int[] status = new int[1];
                String text = post(hook + method + ".json", body, status);
                // превышение частоты запросов — подождать и повторить
                if ((status[0] == 503 || text.contains("QUERY_LIMIT_EXCEEDED")) && attempt < 4) {
                    Thread.sleep(1000L * (attempt + 1));
                    continue;
                }
                return res.put("ok", status[0] >= 200 && status[0] < 300).put("status", status[0]).put("body", text).toString();
            }
        } catch (java.net.UnknownHostException | java.net.ConnectException | java.net.SocketTimeoutException | java.net.NoRouteToHostException e) {
            return put(res, "offline");
        } catch (javax.net.ssl.SSLException e) {
            return put(res, "ssl");
        } catch (Exception e) {
            return put(res, "error: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : " " + e.getMessage()));
        }
    }

    private static String put(JSONObject res, String err) {
        try { return res.put("ok", false).put("error", err).toString(); } catch (Exception e) { return "{\"ok\":false}"; }
    }

    private static String post(String url, String json, int[] status) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(60000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("Accept", "application/json");
            byte[] data = json.getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream out = c.getOutputStream()) { out.write(data); }
            status[0] = c.getResponseCode();
            InputStream in = status[0] >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in == null) return "";
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            try (InputStream s = in) { while ((n = s.read(b)) > 0) buf.write(b, 0, n); }
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            c.disconnect();
        }
    }
}
