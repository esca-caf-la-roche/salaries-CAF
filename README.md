# La Cordée — suivi des heures CAF

Application statique React pour suivre les heures issues de Google Calendar, avant et après application d'un coefficient par ressource. L'interface est déployable sur GitHub Pages ; Supabase gère l'authentification, les données et la synchronisation Google côté serveur.

## Démarrage

1. Copier `.env.example` vers `.env`.
2. Renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Installer avec `pnpm install`, puis lancer `pnpm dev`.

Sans configuration Supabase, l'application s'ouvre volontairement en mode démonstration avec des données fictives clairement signalées.

## Commandes

- `pnpm build` : vérification TypeScript et build de production.
- `pnpm lint` : contrôle ESLint.
- `pnpm test` : tests unitaires.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le dossier `dist` pour le dépôt `salaries-CAF`. Ajouter les valeurs suivantes dans les réglages GitHub du dépôt :

- variable `VITE_SUPABASE_URL` ;
- secret `VITE_SUPABASE_PUBLISHABLE_KEY`.

Le client OAuth Google et le CSV de coefficients sont explicitement ignorés par Git et ne sont jamais chargés par le frontend.
