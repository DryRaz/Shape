// Supabase Edge Function: checks every active reminder against "now" in each
// user's timezone and sends a Web Push notification when it matches.
//
// Intended to be invoked once a minute by pg_cron (see README setup section).
//
// Secrets required:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically to edge functions)

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

function currentHhMmAndDow(timezone: string): { hhmm: string; dow: number } {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = formatter.formatToParts(now)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { hhmm: `${hour}:${minute}`, dow: dowMap[weekday] ?? 0 }
}

Deno.serve(async () => {
  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, user_id, label, time, days_of_week, channel, users(timezone)')
    .eq('active', true)
    .eq('channel', 'push')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0

  for (const reminder of reminders ?? []) {
    const timezone = (reminder as unknown as { users: { timezone: string } | null }).users?.timezone ?? 'Africa/Nairobi'
    const { hhmm, dow } = currentHhMmAndDow(timezone)
    const reminderHhMm = String(reminder.time).slice(0, 5)
    if (reminderHhMm !== hhmm) continue
    if (!reminder.days_of_week?.includes(dow)) continue

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', reminder.user_id)

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: 'Shape', body: reminder.label }),
        )
        sent++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push send error', err)
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
