import { supabase } from "@/integrations/supabase/client";

const PUSH_ASKED_KEY = "lyneflix_push_asked";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestPushPermission(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission === "granted") {
    await subscribeToPush();
    return true;
  }

  const result = await Notification.requestPermission();
  if (result === "granted") {
    await subscribeToPush();
    return true;
  }
  return false;
}

async function subscribeToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from edge function
    const res = await supabase.functions.invoke("push-notify", {
      body: null,
      method: "GET",
    });

    // Use fetch directly since supabase.functions.invoke doesn't support query params well
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const vapidRes = await fetch(
      `https://${projectId}.supabase.co/functions/v1/push-notify?action=vapid-public-key`,
      { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
    );
    const { publicKey } = await vapidRes.json();
    if (!publicKey) return;

    const subscription = await (registration as any).pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const subJson = subscription.toJSON();

    // Save to backend
    await fetch(
      `https://${projectId}.supabase.co/functions/v1/push-notify?action=subscribe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        }),
      }
    );
  } catch (err) {
    console.warn("[Push] Subscription failed:", err);
  }
}

export function shouldAskPush(): boolean {
  if (!("PushManager" in window)) return false;
  if (Notification.permission !== "default") return false;
  const asked = localStorage.getItem(PUSH_ASKED_KEY);
  if (asked) {
    const elapsed = Date.now() - parseInt(asked, 10);
    if (elapsed < 7 * 24 * 3600000) return false; // Ask again after 7 days
  }
  return true;
}

export function markPushAsked() {
  localStorage.setItem(PUSH_ASKED_KEY, Date.now().toString());
}

// Auto-subscribe if already granted
export function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission === "granted") {
    subscribeToPush();
  }
}
