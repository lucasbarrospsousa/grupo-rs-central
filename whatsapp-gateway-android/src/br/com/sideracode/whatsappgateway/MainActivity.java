package br.com.sideracode.whatsappgateway;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private TextView tvStatus;
    private TextView tvDetails;
    private TextView tvLogs;
    private Button btnToggle;
    private Button btnAccessibility;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        tvStatus = findViewById(R.id.tv_status);
        tvDetails = findViewById(R.id.tv_details);
        tvLogs = findViewById(R.id.tv_logs);
        btnToggle = findViewById(R.id.btn_toggle_service);
        btnAccessibility = findViewById(R.id.btn_accessibility);

        android.view.ViewGroup content = findViewById(android.R.id.content);
        android.view.ViewGroup panel = (android.view.ViewGroup) content.getChildAt(0);
        Button sms = new Button(this);
        sms.setText("SMS · configurar bases e chip");
        sms.setOnClickListener(v -> startActivity(new Intent(this, br.com.sideracode.smsgateway.MainActivity.class)));
        panel.addView(sms, 0);
        updateStatus();

        btnToggle.setOnClickListener(v -> {
            Intent intent = new Intent(this, WhatsAppGatewayService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
            Toast.makeText(this, "Serviço do Gateway reiniciado!", Toast.LENGTH_SHORT).show();
            appendLog("Serviço em segundo plano reiniciado.");
            updateStatus();
        });

        btnAccessibility.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            startActivity(intent);
            Toast.makeText(this, "Ative 'RS Gateway Mobile' na lista de acessibilidade.", Toast.LENGTH_LONG).show();
        });

        // Auto start service on launch
        Intent serviceIntent = new Intent(this, WhatsAppGatewayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        appendLog("Gateway conectado à Central de Operações.");
    }

    private void updateStatus() {
        boolean accRunning = WhatsAppAccessibilityService.isServiceRunning();
        if (accRunning) {
            tvStatus.setText("● ONLINE - Auto-Envio Ativo");
            tvStatus.setTextColor(0xFF4ADE80);
            tvDetails.setText("O celular responderá aos comandos da Central Nuvem a qualquer momento via Wi-Fi ou 4G.");
        } else {
            tvStatus.setText("● PENDENTE - Aguardando Acessibilidade");
            tvStatus.setTextColor(0xFFF5A53C);
            tvDetails.setText("Clique abaixo para conceder permissão de Acessibilidade para o envio automático sem intervenção humana.");
        }
    }

    private void appendLog(String msg) {
        if (tvLogs != null) {
            String current = tvLogs.getText().toString();
            tvLogs.setText(current + "[" + new java.text.SimpleDateFormat("HH:mm:ss").format(new java.util.Date()) + "] " + msg + "\n");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatus();
    }
}
