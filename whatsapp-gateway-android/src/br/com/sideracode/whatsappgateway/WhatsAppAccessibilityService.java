package br.com.sideracode.whatsappgateway;

import android.accessibilityservice.AccessibilityService;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

public class WhatsAppAccessibilityService extends AccessibilityService {
    private static final String TAG = "RS_WA_Accessibility";
    private static WhatsAppAccessibilityService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isClickPending = false;

    public static boolean isServiceRunning() {
        return instance != null;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.i(TAG, "WhatsAppAccessibilityService conectado com sucesso!");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence packageName = event.getPackageName();
        if (packageName == null) return;

        String pkg = packageName.toString();
        if (!pkg.equals("com.whatsapp.w4b") && !pkg.equals("com.whatsapp")) return;

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode == null) return;

        try {
            // Find send button by id or description
            AccessibilityNodeInfo sendButton = findSendButton(rootNode);
            if (sendButton != null && sendButton.isEnabled()) {
                Log.i(TAG, "Botão de envio localizado no WhatsApp! Acionando clique...");
                sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);

                // Small delay to return home cleanly
                handler.postDelayed(() -> {
                    performGlobalAction(GLOBAL_ACTION_HOME);
                }, 1800);
            }
        } finally {
            rootNode.recycle();
        }
    }

    private AccessibilityNodeInfo findSendButton(AccessibilityNodeInfo root) {
        if (root == null) return null;

        // 1. Check by resource id (standard WhatsApp send button id)
        List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/send");
        if (nodes != null && !nodes.isEmpty()) return nodes.get(0);

        List<AccessibilityNodeInfo> standardNodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send");
        if (standardNodes != null && !standardNodes.isEmpty()) return standardNodes.get(0);

        // 2. Check by content description (Portuguese / English)
        List<AccessibilityNodeInfo> descNodes = root.findAccessibilityNodeInfosByText("Enviar");
        if (descNodes != null && !descNodes.isEmpty()) {
            for (AccessibilityNodeInfo node : descNodes) {
                if (node.isClickable()) return node;
            }
        }

        List<AccessibilityNodeInfo> sendDescNodes = root.findAccessibilityNodeInfosByText("Send");
        if (sendDescNodes != null && !sendDescNodes.isEmpty()) {
            for (AccessibilityNodeInfo node : sendDescNodes) {
                if (node.isClickable()) return node;
            }
        }

        return null;
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Accessibility interrupted");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
    }
}
