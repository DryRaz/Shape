import { supabase } from './supabase'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

export async function subscribeToPush(userId: string): Promise<{ error: string | null }> {
  if (!isPushSupported()) return { error: 'Les notifications push ne sont pas supportées sur cet appareil.' }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return { error: 'Clé VAPID manquante (VITE_VAPID_PUBLIC_KEY).' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { error: 'Permission refusée.' }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  })

  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' }
  )

  return { error: error?.message ?? null }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  }
}
