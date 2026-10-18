package com.artemiy.uprucheet;

import android.content.Context;
import android.os.Build;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Встроенный веб-сервер для доступа к приложению с компьютера в той же Wi-Fi-сети.
 * Отдаёт интерфейс приложения из assets и простое API для чтения/записи данных.
 * Доступ — только после ввода PIN-кода, который показывается на телефоне.
 */
public final class WebServer {
    /** Ревизия данных: увеличивается при каждом сохранении (с телефона или с компьютера). */
    public static final AtomicLong REV = new AtomicLong(System.currentTimeMillis());

    private static final int MAX_BODY = 32 * 1024 * 1024;
    private static final int MAX_FAILS = 5;

    private final Context ctx;
    private final String pin;
    private final Set<String> sessions = Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final SecureRandom random = new SecureRandom();
    private final ExecutorService pool = Executors.newFixedThreadPool(6);
    private ServerSocket server;
    private Thread acceptThread;
    private volatile boolean running;
    private volatile int fails;
    volatile long lastActivity = System.currentTimeMillis();
    int port;

    public interface Listener {
        void onDataChangedRemotely(long rev);
        void onPinLocked();
    }

    private final Listener listener;

    WebServer(Context ctx, String pin, Listener listener) {
        this.ctx = ctx.getApplicationContext();
        this.pin = pin;
        this.listener = listener;
    }

    public synchronized void start() throws Exception {
        Exception last = null;
        for (int p = 8080; p < 8090; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                server = s;
                port = p;
                break;
            } catch (Exception e) {
                last = e;
            }
        }
        if (server == null) throw last == null ? new IllegalStateException("port") : last;
        running = true;
        acceptThread = new Thread(() -> {
            while (running) {
                try {
                    Socket c = server.accept();
                    c.setSoTimeout(30000);
                    pool.execute(() -> handle(c));
                } catch (Exception e) {
                    if (!running) break;
                }
            }
        }, "upr-web");
        acceptThread.start();
    }

    public synchronized void stop() {
        running = false;
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        pool.shutdownNow();
        sessions.clear();
    }

    /** Адреса телефона в локальной сети (IPv4). */
    public static List<String> localAddresses() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    String h = a.getHostAddress();
                    if (h == null || h.contains(":")) continue;
                    if (a.isSiteLocalAddress()) {
                        String name = ni.getName() == null ? "" : ni.getName().toLowerCase(Locale.US);
                        if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("swlan")) out.add(0, h);
                        else out.add(h);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    // ------------------------------------------------------------------

    private static final class Req {
        String method = "GET";
        String path = "/";
        Map<String, String> query = new HashMap<>();
        Map<String, String> headers = new HashMap<>();
        byte[] body = new byte[0];
    }

    private void handle(Socket c) {
        try (Socket s = c) {
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            Req r = read(in);
            if (r == null) return;
            lastActivity = System.currentTimeMillis();
            route(r, out);
            out.flush();
        } catch (Exception ignored) {
        }
    }

    private Req read(InputStream in) throws Exception {
        String line = readLine(in);
        if (line == null || line.isEmpty()) return null;
        String[] parts = line.split(" ");
        if (parts.length < 2) return null;
        Req r = new Req();
        r.method = parts[0].toUpperCase(Locale.US);
        String p = parts[1];
        int q = p.indexOf('?');
        r.path = q >= 0 ? p.substring(0, q) : p;
        if (q >= 0) {
            for (String kv : p.substring(q + 1).split("&")) {
                if (kv.isEmpty()) continue;
                int e = kv.indexOf('=');
                try {
                    String k = URLDecoder.decode(e >= 0 ? kv.substring(0, e) : kv, "UTF-8");
                    String v = e >= 0 ? URLDecoder.decode(kv.substring(e + 1), "UTF-8") : "";
                    r.query.put(k, v);
                } catch (Exception ignored) {
                }
            }
        }
        String h;
        while ((h = readLine(in)) != null && !h.isEmpty()) {
            int i = h.indexOf(':');
            if (i > 0) r.headers.put(h.substring(0, i).trim().toLowerCase(Locale.US), h.substring(i + 1).trim());
        }
        int len = 0;
        try { len = Integer.parseInt(r.headers.getOrDefault("content-length", "0")); } catch (Exception ignored) {}
        if (len < 0 || len > MAX_BODY) return null;
        if (len > 0) {
            byte[] b = new byte[len];
            int off = 0;
            while (off < len) {
                int n = in.read(b, off, len - off);
                if (n < 0) break;
                off += n;
            }
            r.body = b;
        }
        return r;
    }

    private static String readLine(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 16384) return null;
        }
        if (c < 0 && b.size() == 0) return null;
        return new String(b.toByteArray(), StandardCharsets.UTF_8);
    }

    private boolean authorized(Req r) {
        String cookie = r.headers.get("cookie");
        if (cookie == null) return false;
        for (String part : cookie.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2 && kv[0].equals("upr_session") && sessions.contains(kv[1])) return true;
        }
        return false;
    }

    private void route(Req r, OutputStream out) throws Exception {
        String path = r.path;

        if (path.equals("/api/login") && r.method.equals("POST")) {
            String body = new String(r.body, StandardCharsets.UTF_8);
            String given = "";
            try { given = new JSONObject(body).optString("pin"); } catch (Exception ignored) {}
            if (fails >= MAX_FAILS) {
                json(out, 429, "{\"error\":\"locked\"}", null);
                return;
            }
            if (pin.equals(given.trim())) {
                byte[] t = new byte[24];
                random.nextBytes(t);
                StringBuilder sb = new StringBuilder();
                for (byte x : t) sb.append(String.format(Locale.US, "%02x", x));
                String token = sb.toString();
                sessions.add(token);
                fails = 0;
                json(out, 200, "{\"ok\":true}", "upr_session=" + token + "; Path=/; HttpOnly; SameSite=Strict");
            } else {
                fails++;
                if (fails >= MAX_FAILS && listener != null) listener.onPinLocked();
                json(out, 403, "{\"error\":\"pin\",\"left\":" + Math.max(0, MAX_FAILS - fails) + "}", null);
            }
            return;
        }

        if (path.equals("/") || path.equals("/index.html")) {
            if (!authorized(r)) {
                send(out, 200, "text/html; charset=utf-8", loginPage().getBytes(StandardCharsets.UTF_8), null);
                return;
            }
            String html = asset("index.html");
            html = html.replace("<script src=\"app.js\"></script>", "<script src=\"remote.js\"></script>\n  <script src=\"app.js\"></script>");
            send(out, 200, "text/html; charset=utf-8", html.getBytes(StandardCharsets.UTF_8), null);
            return;
        }

        if (path.startsWith("/api/")) {
            if (!authorized(r)) {
                json(out, 401, "{\"error\":\"auth\"}", null);
                return;
            }
            switch (path) {
                case "/api/rev":
                    json(out, 200, "{\"rev\":" + REV.get() + "}", null);
                    return;
                case "/api/data":
                    if (r.method.equals("POST")) {
                        String body = new String(r.body, StandardCharsets.UTF_8);
                        try {
                            new JSONObject(body); // проверка, что это корректный JSON
                        } catch (Exception e) {
                            json(out, 400, "{\"error\":\"json\"}", null);
                            return;
                        }
                        Store.autoBackup(ctx, false);
                        if (!Store.write(Store.dataFile(ctx), body)) {
                            json(out, 500, "{\"error\":\"write\"}", null);
                            return;
                        }
                        long rev = REV.incrementAndGet();
                        FolderBackup.run(ctx, false);
                        if (listener != null) listener.onDataChangedRemotely(rev);
                        json(out, 200, "{\"ok\":true,\"rev\":" + rev + "}", null);
                    } else {
                        String data = Store.read(Store.dataFile(ctx));
                        String payload = "{\"rev\":" + REV.get() + ",\"data\":" + (data.isEmpty() ? "null" : data) + "}";
                        json(out, 200, payload, null);
                    }
                    return;
                case "/api/permissions":
                case "/api/device-calendars":
                case "/api/device-events":
                case "/api/device-event":
                case "/api/device-event-delete":
                case "/api/device-event-upsert":
                case "/api/device-event-remove":
                case "/api/snapshots":
                case "/api/snapshot":
                case "/api/snapshot-now":
                case "/api/calendar-diagnostics":
                case "/api/device-find":
                    deviceCalendar(r, out);
                    return;
                case "/api/logout":
                    json(out, 200, "{\"ok\":true}", "upr_session=; Path=/; Max-Age=0");
                    return;
                default:
                    json(out, 404, "{\"error\":\"not found\"}", null);
                    return;
            }
        }

        // Статические файлы интерфейса
        String name = path.substring(1);
        if (!name.matches("[A-Za-z0-9._-]+")) {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8), null);
            return;
        }
        if (!authorized(r)) {
            send(out, 401, "text/plain; charset=utf-8", "Unauthorized".getBytes(StandardCharsets.UTF_8), null);
            return;
        }
        byte[] b = assetBytes(name);
        if (b == null) {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8), null);
            return;
        }
        String type = name.endsWith(".js") ? "application/javascript; charset=utf-8"
                : name.endsWith(".css") ? "text/css; charset=utf-8"
                : name.endsWith(".html") ? "text/html; charset=utf-8"
                : name.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
        send(out, 200, type, b, null);
    }

    /**
     * Календарь телефона для веб-версии: те же методы CalendarSync, что вызывает Bridge в приложении.
     * Запись — только POST с заголовком X-Upr (защита от отправки формы с чужой страницы).
     */
    private void deviceCalendar(Req r, OutputStream out) throws Exception {
        boolean post = r.method.equals("POST");
        boolean write = !r.path.equals("/api/permissions") && !r.path.equals("/api/device-calendars")
                && !r.path.equals("/api/device-events") && !r.path.equals("/api/snapshots") && !r.path.equals("/api/snapshot")
                && !r.path.equals("/api/calendar-diagnostics") && !r.path.equals("/api/device-find");
        if (write && (!post || !"1".equals(r.headers.get("x-upr")))) {
            json(out, 400, "{\"error\":\"method\"}", null);
            return;
        }
        JSONObject body = new JSONObject();
        if (post && r.body.length > 0) {
            try {
                body = new JSONObject(new String(r.body, StandardCharsets.UTF_8));
            } catch (Exception e) {
                json(out, 400, "{\"error\":\"json\"}", null);
                return;
            }
        }
        switch (r.path) {
            case "/api/permissions":
                json(out, 200, new JSONObject()
                        .put("calendar", CalendarSync.canRead(ctx) && CalendarSync.canWrite(ctx))
                        .put("calendarRead", CalendarSync.canRead(ctx))
                        .put("device", Build.MANUFACTURER + " " + Build.MODEL)
                        .toString(), null);
                return;
            case "/api/device-calendars":
                json(out, 200, CalendarSync.calendars(ctx), null);
                return;
            case "/api/device-events": {
                long from = parseLong(r.query.get("from"), System.currentTimeMillis() - 7L * 86_400_000L);
                long to = parseLong(r.query.get("to"), from + 45L * 86_400_000L);
                if (to - from > 400L * 86_400_000L) to = from + 400L * 86_400_000L; // не больше ~года за раз
                String ids = r.query.get("ids");
                json(out, 200, CalendarSync.events(ctx, from, to, ids == null ? "" : ids).toString(), null);
                return;
            }
            case "/api/device-event":
                json(out, 200, "{\"id\":" + CalendarSync.saveDeviceEvent(ctx, body.toString()) + "}", null);
                return;
            case "/api/device-event-delete":
                json(out, 200, "{\"ok\":" + CalendarSync.deleteDeviceEvent(ctx, body.optLong("id", -1),
                        body.optString("mode", "event"), body.optLong("originalBegin", 0)) + "}", null);
                return;
            case "/api/device-event-upsert":
                json(out, 200, "{\"id\":" + CalendarSync.upsert(ctx, body.toString()) + "}", null);
                return;
            case "/api/device-event-remove":
                json(out, 200, "{\"ok\":" + CalendarSync.delete(ctx, body.optLong("id", -1)) + "}", null);
                return;
            case "/api/snapshots":
                json(out, 200, Store.listJson(Store.snapshotsDir(ctx)), null);
                return;
            case "/api/snapshot": {
                String data = Store.read(new File(Store.snapshotsDir(ctx), Store.safeName(r.query.getOrDefault("name", ""))));
                json(out, 200, data.isEmpty() ? "null" : data, null);
                return;
            }
            case "/api/snapshot-now":
                json(out, 200, "{\"ok\":" + CalendarSync.snapshot(ctx) + "}", null);
                return;
            case "/api/calendar-diagnostics":
                json(out, 200, CalendarSync.diagnostics(ctx, r.query.getOrDefault("ids", "")), null);
                return;
            case "/api/device-find": {
                long from = parseLong(r.query.get("from"), System.currentTimeMillis() - 30L * 86_400_000L);
                long to = parseLong(r.query.get("to"), from + 90L * 86_400_000L);
                json(out, 200, CalendarSync.findEvents(ctx, r.query.getOrDefault("q", ""), from, to), null);
                return;
            }
            default:
                json(out, 404, "{\"error\":\"not found\"}", null);
        }
    }

    private static long parseLong(String s, long def) {
        try {
            return s == null || s.isEmpty() ? def : (long) Double.parseDouble(s);
        } catch (Exception e) {
            return def;
        }
    }

    private String asset(String name) {
        byte[] b = assetBytes(name);
        return b == null ? "" : new String(b, StandardCharsets.UTF_8);
    }

    private byte[] assetBytes(String name) {
        try (InputStream in = ctx.getAssets().open(name)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        } catch (Exception e) {
            return null;
        }
    }

    private void json(OutputStream out, int code, String body, String cookie) throws Exception {
        send(out, code, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8), cookie);
    }

    private void send(OutputStream out, int code, String type, byte[] body, String cookie) throws Exception {
        String status = code == 200 ? "OK" : code == 401 ? "Unauthorized" : code == 403 ? "Forbidden"
                : code == 404 ? "Not Found" : code == 429 ? "Too Many Requests" : code == 400 ? "Bad Request" : "Error";
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(code).append(' ').append(status).append("\r\n");
        h.append("Content-Type: ").append(type).append("\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        h.append("X-Content-Type-Options: nosniff\r\n");
        h.append("X-Frame-Options: DENY\r\n");
        if (cookie != null) h.append("Set-Cookie: ").append(cookie).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
    }

    private static String loginPage() {
        return "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<title>管理会计 — вход</title><style>"
                + "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6fa;font:16px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#171a24}"
                + ".box{background:#fff;padding:32px 28px;border-radius:18px;box-shadow:0 4px 24px rgba(20,24,40,.08);width:min(360px,90vw);text-align:center}"
                + "h1{font-size:22px;margin:0 0 6px}p{color:#6b7184;margin:0 0 20px;font-size:14px}"
                + "input{width:100%;box-sizing:border-box;font-size:28px;letter-spacing:.4em;text-align:center;padding:12px;border:1px solid #e3e6ee;border-radius:12px}"
                + "button{margin-top:14px;width:100%;padding:12px;font-size:16px;border:0;border-radius:12px;background:#2f5bea;color:#fff;font-weight:600;cursor:pointer}"
                + ".err{color:#e5484d;font-size:14px;min-height:20px;margin-top:10px}"
                + "@media(prefers-color-scheme:dark){body{background:#12141b;color:#eef0f6}.box{background:#1b1e28}input{background:#232735;color:#eef0f6;border-color:#2d3242}}"
                + "</style></head><body><form class=\"box\" id=\"f\"><h1>管理会计</h1>"
                + "<p>Введите PIN-код, который показан на телефоне в разделе «Доступ с компьютера»</p>"
                + "<input id=\"pin\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"6\" autofocus>"
                + "<button type=\"submit\">Войти</button><div class=\"err\" id=\"e\"></div></form>"
                + "<script>document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();"
                + "var e=document.getElementById('e');e.textContent='';"
                + "var r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value})});"
                + "if(r.ok){location.reload();return;}var j={};try{j=await r.json()}catch(x){}"
                + "e.textContent=r.status===429?'Слишком много попыток. Включите доступ на телефоне заново.':'Неверный PIN'+(j.left!=null?' (осталось попыток: '+j.left+')':'');};</script>"
                + "</body></html>";
    }
}
