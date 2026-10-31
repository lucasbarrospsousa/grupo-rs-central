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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public class WhatsAppGatewayService extends Service {
    private static final String TAG = "RS_WA_Service";
    private static final String CHANNEL_ID = "rs_gateway_channel";
    private PlatformSession platformSession;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean isRunning = false;
    public static volatile boolean serviceRunning = false;
    private Thread workerThread;

    @Override
    public void onCreate() {
        super.onCreate();
        platformSession = new PlatformSession(this);
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
        if (!platformSession.getConnected()) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        startForeground(1001, buildNotification("Conectando à Central..."));

        if (!isRunning) {
            isRunning = true;
            serviceRunning = true;
            workerThread = new Thread(this::runLoop);
            workerThread.start();
        }

        return START_STICKY;
    }

    private void runLoop() {
        Log.i(TAG, "Loop do Gateway Mobile iniciado na nuvem!");
        long retryDelayMs = 3000;
        while (isRunning) {
            try {
                // 1. Send Heartbeat to Central
                // Heartbeat travels with the poll: one request, same cadence.

                // 2. Poll for pending job
                flushPendingReports();
                JSONObject job = pollJob();
                retryDelayMs = 3000;
                updateConnectionNotification("Central conectada; aguardando disparos");
                if (job != null) {
                    processJob(job);
                }

                Thread.sleep(15000);
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                Log.e(TAG, "Erro no loop de comunicacao: " + e.getMessage());
                updateConnectionNotification("Sem conexão: " + e.getMessage());
                try { Thread.sleep(retryDelayMs); } catch (InterruptedException interrupted) { break; }
                retryDelayMs = Math.min(60000, retryDelayMs * 2);
            }
        }
    }

    private JSONObject heartbeatPayload() throws Exception {
            JSONObject payload = new JSONObject();
            payload.put("action", "gateway-heartbeat");

            JSONObject status = new JSONObject();
            status.put("ok", true);
            status.put("connected", true);
            status.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            status.put("whatsappPackage", whatsappPackage());
            status.put("isFocused", true);
            status.put("mode", "apk-standalone-online");
            status.put("accessibilityActive", WhatsAppAccessibilityService.isServiceRunning());
            status.put("safetyLock", true);

            payload.put("deviceStatus", status);

            return payload;
    }

    private JSONObject pollJob() throws Exception {
            JSONObject payload = heartbeatPayload();
            payload.put("action", "gateway-poll");
            JSONObject json = platformSession.request("/api/whatsapp", payload);
            if (json != null) {
                if (json.optBoolean("ok") && json.has("job") && !json.isNull("job")) {
                    return json.getJSONObject("job");
                }
            }
        return null;
    }

    private void processJob(JSONObject job) {
        final String jobId = job.optString("id");
        final String rawPhone = job.optString("phone");
        final String name = job.optString("name");
        final String message = job.optString("message");
        final String digits = normalizePhone(rawPhone);

        Log.i(TAG, "Processando pedido WhatsApp " + jobId + " no aparelho.");

        // Wake screen up for dispatch
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock screenLock = null;
        if (pm != null) {
            screenLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                "RSGateway:DispatchScreenWake"
            );
            screenLock.acquire(20000);
        }

        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicBoolean sendConfirmed = new AtomicBoolean(false);
        final AtomicReference<String> errorReason = new AtomicReference<>(null);

        WhatsAppAccessibilityService.armSend(digits, message, new WhatsAppAccessibilityService.SendConfirmationListener() {
            @Override
            public void onSentConfirmed(String targetPhone) {
                Log.i(TAG, "Mensagem visível no chat após o envio pelo WhatsApp: " + targetPhone);
                sendConfirmed.set(true);
                latch.countDown();
            }

            @Override
            public void onSendFailed(String reason) {
                Log.w(TAG, "FALHA: Acessibilidade detectou erro no WhatsApp: " + reason);
                errorReason.set(reason);
                latch.countDown();
            }
        });

        try {
            String encodedMsg = URLEncoder.encode(message, "UTF-8");
            String deepLink = "https://api.whatsapp.com/send?phone=" + digits + "&text=" + encodedMsg;

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(deepLink));
            intent.setPackage(whatsappPackage());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);

            // Confirma somente quando a nova bolha com o texto exato aparece no chat.
            boolean completedInTime = latch.await(18, TimeUnit.SECONDS);
            WhatsAppAccessibilityService.disarmSend();

            JSONObject report = new JSONObject();
            report.put("action", "gateway-report");
            report.put("id", jobId);

            if (completedInTime && sendConfirmed.get()) {
                report.put("status", "sent");
                report.put("confirmed", true);

                JSONObject res = new JSONObject();
                res.put("whatsappPackage", whatsappPackage());
                res.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                report.put("result", res);
                Log.i(TAG, "Bolha da mensagem confirmada no chat (Job " + jobId + ")");
                recordOutcome("wa_sent");
            } else {
                report.put("status", "failed");
                report.put("confirmed", false);
                String err = errorReason.get();
                if (err == null) {
                    err = "Tempo limite excedido: o WhatsApp nao abriu ou o botao de envio nao foi clicado a tempo.";
                }
                report.put("error", err);
                Log.w(TAG, "Enviando feedback de FALHA para a Central: " + err);
                recordOutcome("wa_failed");
            }

            submitReport(report);

        } catch (Exception e) {
            Log.e(TAG, "Excecao no processamento do job " + jobId + ": " + e.getMessage());
            try {
                JSONObject report = new JSONObject();
                report.put("action", "gateway-report");
                report.put("id", jobId);
                report.put("status", "failed");
                report.put("confirmed", false);
                report.put("error", e.getMessage());
                submitReport(report);
                recordOutcome("wa_failed");
            } catch (Exception ignored) {}
        } finally {
            WhatsAppAccessibilityService.returnHome();
            if (screenLock != null && screenLock.isHeld()) {
                screenLock.release();
            }
        }
    }

    private void submitReport(JSONObject report) {
        String id = report.optString("id");
        String key = "pending_" + id;
        android.content.SharedPreferences pending = getSharedPreferences("wa_reports", MODE_PRIVATE);
        try {
            JSONObject response = platformSession.request("/api/whatsapp", report);
            if (response.optBoolean("ok")) pending.edit().remove(key).apply();
            else pending.edit().putString(key, report.toString()).apply();
        } catch (Exception reportError) {
            pending.edit().putString(key, report.toString()).apply();
            Log.w(TAG, "Resultado WhatsApp guardado localmente para nova tentativa", reportError);
        }
    }

    private void flushPendingReports() {
        android.content.SharedPreferences pending = getSharedPreferences("wa_reports", MODE_PRIVATE);
        for (String key : pending.getAll().keySet()) {
            if (!key.startsWith("pending_")) continue;
            String raw = pending.getString(key, null);
            if (raw == null) continue;
            try {
                JSONObject response = platformSession.request("/api/whatsapp", new JSONObject(raw));
                if (response.optBoolean("ok")) pending.edit().remove(key).apply();
            } catch (Exception error) {
                Log.w(TAG, "Resultado WhatsApp continua pendente de sincronização", error);
            }
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

    private void recordOutcome(String key) {
        android.content.SharedPreferences prefs = getSharedPreferences("wa_reports", MODE_PRIVATE);
        prefs.edit().putInt(key, prefs.getInt(key, 0) + 1).apply();
    }

    private String whatsappPackage() {
        if (getPackageManager().getLaunchIntentForPackage("com.whatsapp.w4b") != null) return "com.whatsapp.w4b";
        if (getPackageManager().getLaunchIntentForPackage("com.whatsapp") != null) return "com.whatsapp";
        throw new IllegalStateException("Instale o WhatsApp Messenger ou Business neste aparelho.");
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "RS Gateway Mobile Canal",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Servico em segundo plano para gateway de mensagens");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void updateConnectionNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(1001, buildNotification(text));
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, DashboardActivity.class);
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
        serviceRunning = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
