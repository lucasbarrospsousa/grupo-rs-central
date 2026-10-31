package br.com.sideracode.whatsappgateway;

import android.accessibilityservice.AccessibilityService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
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
    private static volatile String activeExpectedMessage = null;
    private static volatile int matchingMessagesBeforeClick = 0;
    private static volatile boolean clickAttempted = false;
    private static volatile long armTimestamp = 0;
    private static volatile boolean isClicking = false;

    public static boolean isServiceRunning() {
        return instance != null;
    }

    /** True when Android lists this service as enabled, even while it is reconnecting. */
    public static boolean isEnabledInSettings(Context context) {
        String enabledServices = Settings.Secure.getString(
                context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabledServices)) return false;

        ComponentName expected = new ComponentName(context, WhatsAppAccessibilityService.class);
        TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
        splitter.setString(enabledServices);
        for (String flattened : splitter) {
            ComponentName enabled = ComponentName.unflattenFromString(flattened);
            if (expected.equals(enabled)) return true;
        }
        return false;
    }

    public static synchronized void armSend(String phone, String message, SendConfirmationListener listener) {
        activeExpectedPhone = phone;
        activeExpectedMessage = message == null ? "" : message.trim();
        activeListener = listener;
        armTimestamp = System.currentTimeMillis();
        isClicking = false;
        clickAttempted = false;
        matchingMessagesBeforeClick = 0;
        Log.i(TAG, "Armando deteccao de envio para: " + phone);
    }

    public static synchronized void disarmSend() {
        activeListener = null;
        activeExpectedPhone = null;
        activeExpectedMessage = null;
        isClicking = false;
        clickAttempted = false;
    }

    public static void returnHome() {
        WhatsAppAccessibilityService service = instance;
        if (service != null) service.handler.post(() -> service.performGlobalAction(GLOBAL_ACTION_HOME));
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
                    matchingMessagesBeforeClick = countVisibleMessageBubbles(rootNode, activeExpectedMessage);
                    isClicking = true;
                    Log.i(TAG, "Botao de envio localizado no WhatsApp! Acionando clique...");
                    boolean clicked = sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK);

                    if (clicked) {
                        clickAttempted = true;
                        Log.i(TAG, "Clique executado com sucesso! Aguardando confirmacao de despacho...");
                    } else {
                        isClicking = false;
                    }
                }
            } else if (clickAttempted && countVisibleMessageBubbles(rootNode, activeExpectedMessage) > matchingMessagesBeforeClick) {
                String phone = activeExpectedPhone;
                SendConfirmationListener listener = activeListener;
                disarmSend();
                if (listener != null) listener.onSentConfirmed(phone);
                handler.postDelayed(() -> performGlobalAction(GLOBAL_ACTION_HOME), 1200);
            }
        } finally {
            rootNode.recycle();
        }
    }

    private int countVisibleMessageBubbles(AccessibilityNodeInfo node, String expected) {
        if (node == null || expected == null || expected.isEmpty()) return 0;
        int count = 0;
        CharSequence text = node.getText();
        CharSequence className = node.getClassName();
        if (node.isVisibleToUser() && text != null && expected.contentEquals(text.toString().trim()) &&
                (className == null || !className.toString().contains("EditText"))) count++;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) {
                count += countVisibleMessageBubbles(child, expected);
                child.recycle();
            }
        }
        return count;
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
