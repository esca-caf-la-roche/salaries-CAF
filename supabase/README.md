# Backend Supabase

Projet cible : `ucopmjqryaktcafgczpp` (`eu-north-1`). Aucun déploiement n'est effectué automatiquement.

## Secrets

Le fichier OAuth Google local reste ignoré par Git. Configurez uniquement les valeurs serveur :

```sh
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REDIRECT_URI=https://ucopmjqryaktcafgczpp.supabase.co/functions/v1/google-oauth-callback FRONTEND_ORIGIN=https://esca-caf-la-roche.github.io
```

Ajoutez exactement `GOOGLE_REDIRECT_URI` aux URI autorisées du client OAuth Google. Les jetons utilisateur sont stockés dans `private.google_credentials`; `anon` et `authenticated` n'ont aucun droit dessus.

## Contrat Edge Functions

- `google-oauth-start`, `POST { "redirectTo": "..." }`, JWT admin requis, retourne `authorizationUrl`.
- `google-oauth-callback`, cible OAuth Google publique protégée par un state aléatoire, expirant et à usage unique.
- `google-calendar-sync`, JWT admin requis : `POST { "action": "discover" }` ou `POST { "action": "sync", "calendarIds": ["uuid interne"] }`.

La découverte joint les règles sur l'identifiant Google exact. Une sync initiale paginée produit un `nextSyncToken`; les suivantes utilisent exclusivement ce token. Une réponse Google `410` invalide le token et déclenche un full resync sans effacer les anciennes données avant la réussite complète.

## Initialisation

1. Relire puis appliquer les migrations et `seed.sql` sur un nouveau projet.
2. Dans **Authentication > Users**, créer chaque compte autorisé et confirmer son adresse e-mail.
3. Dans `public.profiles`, attribuer `role = admin` aux administrateurs. L'adresse `escalade@caflarochebonnevile.fr` reçoit ce rôle automatiquement ; les autres profils commencent en `employee`.
4. Dans **Authentication > Email Templates > Magic Link**, copier le contenu de `templates/magic_link.html`. La présence de `{{ .Token }}` active l'OTP à 6 chiffres.
5. Déployer les trois fonctions, puis configurer les secrets.

Les événements journée entière sont conservés mais exclus de `monthly_hours`. Les événements traversant un changement de mois sont ventilés à l'intersection exacte de chaque mois.
