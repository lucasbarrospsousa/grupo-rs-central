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

    public interface SendConfirmationListener {
        void onSentConfirmed(String targetPhone);
        void onSendFailed(String reason);
    }

    private static volatile SendConfirmationListener activeListener = null;
    private static volatile String activeExpectedPhone = null;
    private static volatile long armTimestamp = 0;
    private static volatile boolean isClicking = false;

    public static boolean isServiceRunning() {
        return instance != null;
    }

    public static synchronized void armSend(String phone, SendConfirmationListener listener) {
        activeExpectedPhone = phone;
        activeListener = listener;
        armTimestamp = System.currentTimeMillis();
        isClicking = false;
        Log.i(TAG, "Armando deteccao de envio para: " + phone);
    }

    public static synchronized void disarmSend() {
        activeListener = null;
        activeExpectedPhone = null;
        isClicking = false;
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

        // If we are not expecting a send, ignore
        if (activeListener == null) return;

        // Guard against stale dispatches (> 30s)
        if (System.currentTimeMillis() - armTimestamp > 30000) {
            disarmSend();
            return;
        }

        AccessibilityNodeInfo rootNode = getRootInActiveWindow();
        if (rootNode == null) return;

        try {
            // 1. Check for error dialogs (e.g. number invalid)
            String error = checkForErrorMessage(rootNode);
            if (error != null) {
                Log.w(TAG, "Erro detectado na tela do WhatsApp: " + error);
                SendConfirmationListener listener = activeListener;
                disarmSend();
                if (listener != null) listener.onSendFailed(error);
                handler.postDelayed(() -> performGlobalAction(GLOBAL_ACTION_HOME), 1000);
                return;
            }

            // 2. Find and click Send Button
            if (!isClicking) {
                AccessibilityNodeInfo sendButton = findSendButton(rootNode);
                if (sendButton != null && sendButton.isEnabled()) {
                    isClicking = true;
                    Log.i(TAG, "Botao de envio localizado no WhatsApp! Acionando clique...");
                    boolean clicked = sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);

                    if (clicked) {
                        Log.i(TAG, "Clique executado com sucesso! Aguardando confirmacao de despacho...");
                        final String phone = activeExpectedPhone;
                        final SendConfirmationListener listener = activeListener;

                        // Give WhatsApp 1000ms to register the message in chat
                        handler.postDelayed(() -> {
                            Log.i(TAG, "Confirmando envio de fato para Central: " + phone);
                            disarmSend();
                            if (listener != null) {
                                listener.onSentConfirmed(phone);
                            }
                            // Return home cleanly
                            handler.postDelayed(() -> performGlobalAction(GLOBAL_ACTION_HOME), 1200);
                        }, 1000);
                    } else {
                        isClicking = false;
                    }
                }
            }
        } finally {
            rootNode.recycle();
        }
    }

    private AccessibilityNodeInfo findSendButton(AccessibilityNodeInfo root) {
        if (root == null) return null;

        // 1. Resource ID
        for (String id : new String[]{"com.whatsapp.w4b:id/send", "com.whatsapp:id/send"}) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null && !nodes.isEmpty()) {
                AccessibilityNodeInfo n = nodes.get(0);
                if (n.isEnabled()) return n;
            }
        }

        // 2. Text / Description
        for (String label : new String[]{"Enviar", "Send"}) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(label);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n.isClickable() && n.isEnabled()) return n;
                    AccessibilityNodeInfo p = n.getParent();
                    if (p != null && p.isClickable() && p.isEnabled()) return p;
                }
            }
        }

        // 3. Deep recursive scan
        return recursiveFindSend(root);
    }

    private AccessibilityNodeInfo recursiveFindSend(AccessibilityNodeInfo node) {
        if (node == null) return null;
        CharSequence desc = node.getContentDescription();
        if (desc != null) {
            String d = desc.toString().trim().toLowerCase();
            if (d.equals("enviar") || d.equals("send")) {
                if (node.isClickable() && node.isEnabled()) return node;
                AccessibilityNodeInfo p = node.getParent();
                if (p != null && p.isClickable() && p.isEnabled()) return p;
            }
        }
        CharSequence id = node.getViewIdResourceName();
        if (id != null && (id.toString().endsWith(":id/send"))) {
            if (node.isEnabled()) return node;
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo found = recursiveFindSend(child);
            if (found != null) return found;
        }
        return null;
    }

    private String checkForErrorMessage(AccessibilityNodeInfo root) {
        if (root == null) return null;
        for (String pattern : new String[]{"invalido", "inválido", "invalid", "não é uma conta"}) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(pattern);
            if (nodes != null && !nodes.isEmpty()) {
                clickOkButton(root);
                return "Telefone não encontrado ou inválido no WhatsApp (" + pattern + ")";
            }
        }
        return null;
    }

    private void clickOkButton(AccessibilityNodeInfo root) {
        for (String ok : new String[]{"OK", "Ok", "ok", "Concluir"}) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(ok);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n.isClickable()) {
                        n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        return;
                    }
                }
            }
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "Accessibility interrupted");
        disarmSend();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
        disarmSend();
    }
}
