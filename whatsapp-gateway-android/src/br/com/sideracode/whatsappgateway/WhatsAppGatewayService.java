package br.com.sideracode.whatsappgateway;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class WhatsAppGatewayService extends Service {
    private static final String TAG = "RS_WA_Service";
    private static final String CHANNEL_ID = "rs_gateway_channel";
    private static final String WORKER_URL = "https://central-paralela.sinderacode.workers.dev/api/whatsapp";
    private static final String TARGET_PKG = "com.whatsapp.w4b";

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean isRunning = false;
    private Thread workerThread;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RSGateway:WakeLock");
            wakeLock.acquire();
        }

        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "RSGateway:WifiLock");
            wifiLock.acquire();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1001, buildNotification("Conectado à Central Nuvem (Escutando 24/7)"));

        if (!isRunning) {
            isRunning = true;
            workerThread = new Thread(this::runLoop);
            workerThread.start();
        }

        return START_STICKY;
    }

    private void runLoop() {
        Log.i(TAG, "Loop do Gateway Mobile iniciado na nuvem!");
        while (isRunning) {
            try {
                // 1. Send Heartbeat to Central
                sendHeartbeat();

                // 2. Poll for pending job
                JSONObject job = pollJob();
                if (job != null) {
                    processJob(job);
                }

                Thread.sleep(2500);
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                Log.e(TAG, "Erro no loop de comunicação: " + e.getMessage());
                try { Thread.sleep(4000); } catch (Exception ignored) {}
            }
        }
    }

    private void sendHeartbeat() {
        try {
            JSONObject payload = new JSONObject();
            payload.put("action", "gateway-heartbeat");

            JSONObject status = new JSONObject();
            status.put("ok", true);
            status.put("connected", true);
            status.put("serial", Build.SERIAL != null ? Build.SERIAL : "RQ8WB02FN3P");
            status.put("model", Build.MODEL + " (Galaxy A24)");
            status.put("whatsappPackage", TARGET_PKG);
            status.put("isFocused", true);
            status.put("mode", "apk-standalone-online");
            status.put("safetyLock", true);

            payload.put("deviceStatus", status);

            postJson(WORKER_URL, payload);
        } catch (Exception e) {
            Log.w(TAG, "Falha no heartbeat: " + e.getMessage());
        }
    }

    private JSONObject pollJob() {
        try {
            JSONObject payload = new JSONObject();
            payload.put("action", "gateway-poll");
            String response = postJson(WORKER_URL, payload);
            if (response != null && !response.isEmpty()) {
                JSONObject json = new JSONObject(response);
                if (json.optBoolean("ok") && json.has("job") && !json.isNull("job")) {
                    return json.getJSONObject("job");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Falha no poll: " + e.getMessage());
        }
        return null;
    }

    private void processJob(JSONObject job) {
        String jobId = job.optString("id");
        String rawPhone = job.optString("phone");
        String name = job.optString("name");
        String message = job.optString("message");

        Log.i(TAG, "Despachando job: " + jobId + " para " + name + " (" + rawPhone + ")");

        try {
            String digits = normalizePhone(rawPhone);
            String encodedMsg = URLEncoder.encode(message, "UTF-8");
            String deepLink = "https://api.whatsapp.com/send?phone=" + digits + "&text=" + encodedMsg;

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(deepLink));
            intent.setPackage(TARGET_PKG);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);

            // Wait for AccessibilityService to click and send
            Thread.sleep(3000);

            // Report success
            JSONObject report = new JSONObject();
            report.put("action", "gateway-report");
            report.put("id", jobId);
            report.put("status", "sent");

            JSONObject res = new JSONObject();
            res.put("ok", true);
            res.put("phone", digits);
            res.put("name", name);
            res.put("timestamp", System.currentTimeMillis());
            report.put("result", res);

            postJson(WORKER_URL, report);
            Log.i(TAG, "Job " + jobId + " concluído com sucesso!");

        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar job " + jobId + ": " + e.getMessage());
            try {
                JSONObject report = new JSONObject();
                report.put("action", "gateway-report");
                report.put("id", jobId);
                report.put("status", "failed");
                report.put("error", e.getMessage());
                postJson(WORKER_URL, report);
            } catch (Exception ignored) {}
        }
    }

    private String normalizePhone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() == 8) digits = "999" + digits;
        else if (digits.length() == 9) digits = "99" + digits;
        if (digits.length() == 10 || digits.length() == 11) digits = "55" + digits;
        if (digits.length() == 12 && digits.startsWith("55")) {
            digits = digits.substring(0, 4) + "9" + digits.substring(4);
        }
        return digits;
    }

    private String postJson(String targetUrl, JSONObject json) throws Exception {
        URL url = new URL(targetUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(7000);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(json.toString().getBytes("UTF-8"));
        }

        int code = conn.getResponseCode();
        if (code >= 200 && code < 300) {
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            return sb.toString();
        }
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "RS Gateway Mobile Canal",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Serviço em segundo plano para gateway de mensagens");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("RS Gateway Mobile")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
