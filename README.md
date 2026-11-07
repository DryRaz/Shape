# Shape

PWA de suivi d'habitudes quotidiennes et de bien-être : sommeil, sport, nutrition, lecture / temps spirituel.

Stack : React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth, Storage, Edge Functions), Claude (vision) pour l'analyse des repas par photo, API wger pour le catalogue d'exercices, catalogue calorique Yazio pour ancrer les estimations de repas sur des valeurs réelles.

## Fonctionnalités

- **Auth** par e-mail (lien magique Supabase).
- **Tableau de bord** : totaux caloriques, habitudes complétées, vues jour/semaine/mois, streak.
- **Sommeil** : coucher/lever, durée, qualité (1-5).
- **Nutrition** : capture photo → analyse Claude vision → JSON structuré (aliments, calories, macros) → chaque aliment détecté est recherché dans le catalogue calorique Yazio (`foods`) pour remplacer l'estimation du modèle par une valeur réelle quand un match fiable est trouvé → correction manuelle possible (`user_adjusted`).
- **Sport** : catalogue d'exercices importé depuis wger, création de routines, génération automatique d'un programme (3 semaines × 4 séances) par Claude selon l'objectif de l'utilisateur, mode "séance en cours" (visuel, séries/reps ou timer, repos, barre de progression).
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
supabase functions deploy generate-training-program
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

Réexécutez cette commande périodiquement pour mettre à jour le catalogue (upsert par `wger_id`). C'est un
script manuel, pas un job automatique : si la table `exercises` est vide (et donc que "Générer mon programme"
échoue faute d'exercices), c'est signe qu'il n'a jamais été lancé sur ce projet Supabase. Le script s'arrête
et logue une erreur explicite au moindre souci (réseau, forme de réponse wger inattendue, écriture Supabase
refusée) plutôt que de terminer silencieusement sans rien avoir importé.

### 5. Import du catalogue calorique (Yazio)

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm run yazio:import
```

Peuple la table `foods` à partir de `scripts/data/yazio-foods.json`, un instantané statique extrait de
[yazio.com/fr/aliments](https://yazio.com/fr/aliments) (~1700 aliments avec leur valeur calorique par portion et
pour 100g). Contrairement à l'import wger, ce n'est pas un appel à une API en direct — pas de réseau externe
nécessaire, juste une lecture du fichier JSON. Si la table `foods` est vide (script jamais lancé), l'analyse de
repas par photo continue de fonctionner normalement : elle retombe entièrement sur l'estimation du modèle de
vision pour chaque aliment (`source: 'estimated'` au lieu de `'catalog'`).

### 6. Notifications push (Web Push / VAPID)

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

### 7. Lancer l'app

```bash
npm run dev
```

### 8. Déploiement sur GitHub Pages

Le repo inclut un workflow (`.github/workflows/deploy.yml`) qui build et déploie automatiquement sur GitHub Pages à chaque push sur `main`.

1. Dans **Settings → Pages**, réglez *Build and deployment → Source* sur **GitHub Actions**.
2. Dans **Settings → Secrets and variables → Actions**, ajoutez les secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` et (optionnel) `VITE_VAPID_PUBLIC_KEY` — ce sont les mêmes valeurs que dans `.env.local`, nécessaires au build puisque Vite les inline à la compilation.
3. Poussez sur `main` (ou lancez le workflow manuellement) : l'app sera servie sur `https://<utilisateur>.github.io/Shape/`.

`vite.config.ts` définit `base: '/Shape/'` pour que les assets se chargent correctement sous ce sous-chemin, et le routage utilise `HashRouter` (au lieu de `BrowserRouter`) car GitHub Pages ne supporte pas la réécriture d'URL côté serveur nécessaire au routage "history" pour un site de type project page.

## Scripts

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Typecheck + build de production (PWA incluse) |
| `npm run lint` | ESLint |
| `npm run wger:import` | Importe/rafraîchit le catalogue d'exercices wger |
| `npm run yazio:import` | Importe/rafraîchit le catalogue calorique Yazio (`scripts/data/yazio-foods.json`) |

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
  functions/    # Edge Functions (analyze-meal-photo, generate-training-program, send-reminder-notifications)
scripts/
  import-wger-exercises.ts
  import-yazio-foods.ts
  data/
    yazio-foods.json
```

## Notes de sécurité

- La clé Claude (`ANTHROPIC_API_KEY`) et les clés VAPID privées ne sont jamais envoyées au client — elles vivent uniquement en secrets d'Edge Functions.
- Toutes les tables utilisateur sont protégées par Row Level Security (`auth.uid() = user_id`).
- Les catalogues `exercises` et `foods` sont en lecture publique ; seuls leurs scripts d'import (clé service role) peuvent y écrire.
