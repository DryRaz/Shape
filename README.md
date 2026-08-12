# Shape

PWA de suivi d'habitudes quotidiennes et de bien-être : sommeil, sport, nutrition, lecture / temps spirituel.

Stack : React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, Storage, Edge Functions), Claude (vision) pour l'analyse des repas par photo, API wger pour le catalogue d'exercices.

## Fonctionnalités

- **Auth** par e-mail (lien magique Supabase).
- **Tableau de bord** : totaux caloriques, habitudes complétées, vues jour/semaine/mois, streak.
- **Sommeil** : coucher/lever, durée, qualité (1-5).
- **Nutrition** : capture photo → analyse Claude vision → JSON structuré (aliments, calories, macros) → correction manuelle possible (`user_adjusted`).
- **Sport** : catalogue d'exercices importé depuis wger, création de routines, mode "séance en cours" (visuel, séries/reps ou timer, repos, barre de progression).
- **Lecture / temps spirituel** : habitudes personnalisées (booléen ou quantité).
- **Rappels** : notifications push (Web Push) aux heures de repas (7h30, 13h, 19h Africa/Nairobi par défaut) et aux horaires définis pour les autres habitudes.
- **Poids & profil** : historique de poids, taille/âge/sexe/objectif.

## Mise en route

### 1. Dépendances

```bash
npm install
```

### 2. Projet Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Appliquez les migrations SQL (`supabase/migrations/*.sql`) via le SQL editor du dashboard, ou avec la CLI Supabase :
   ```bash
   supabase link --project-ref <votre-ref>
   supabase db push
   ```
   Cela crée les tables, les policies RLS, le trigger de provisioning utilisateur (qui seed aussi les 3 rappels repas) et le bucket de stockage `meal-photos`.
3. Dans **Authentication → Providers**, l'auth par e-mail (OTP / lien magique) est activée par défaut.
4. Copiez `.env.example` vers `.env.local` et renseignez `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (Project Settings → API).

### 3. Edge Functions

```bash
supabase functions deploy analyze-meal-photo
supabase functions deploy send-reminder-notifications

# Clé Claude (jamais exposée au client)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Web Push (voir étape 5)
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:vous@exemple.com
```

### 4. Import du catalogue d'exercices (wger)

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm run wger:import
```

Réexécutez cette commande périodiquement pour mettre à jour le catalogue (upsert par `wger_id`).

### 5. Notifications push (Web Push / VAPID)

```bash
npx web-push generate-vapid-keys
```

- Mettez la clé publique dans `.env.local` → `VITE_VAPID_PUBLIC_KEY`.
- Mettez les deux clés en secrets sur la fonction `send-reminder-notifications` (voir étape 3).
- Planifiez l'appel de la fonction chaque minute avec `pg_cron` + `pg_net` (extensions Supabase) :

  ```sql
  create extension if not exists pg_cron with schema extensions;
  create extension if not exists pg_net with schema extensions;

  select cron.schedule(
    'send-reminder-notifications-every-minute',
    '* * * * *',
    $$
    select net.http_post(
      url := 'https://<votre-ref>.supabase.co/functions/v1/send-reminder-notifications',
      headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
    );
    $$
  );
  ```

  (À exécuter dans le SQL editor du dashboard une fois les secrets/fonctions déployés.)

### 6. Lancer l'app

```bash
npm run dev
```

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Typecheck + build de production (PWA incluse) |
| `npm run lint` | ESLint |
| `npm run wger:import` | Importe/rafraîchit le catalogue d'exercices wger |

## Structure

```
src/
  components/   # Layout, RangeSwitcher, ...
  lib/          # client Supabase, auth, dates, push
  pages/        # une page par écran/route
  sw.ts         # service worker (precache + push notifications)
  types/        # types miroir du schéma Supabase
supabase/
  migrations/   # schéma SQL + RLS
  functions/    # Edge Functions (analyze-meal-photo, send-reminder-notifications)
scripts/
  import-wger-exercises.ts
```

## Notes de sécurité

- La clé Claude (`ANTHROPIC_API_KEY`) et les clés VAPID privées ne sont jamais envoyées au client — elles vivent uniquement en secrets d'Edge Functions.
- Toutes les tables utilisateur sont protégées par Row Level Security (`auth.uid() = user_id`).
- Le catalogue `exercises` est en lecture publique ; seul le script d'import (clé service role) peut y écrire.
