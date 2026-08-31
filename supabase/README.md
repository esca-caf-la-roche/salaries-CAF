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
- `google-calendar-sync`, JWT admin requis : `POST { "action": "discover" }`, `POST { "action": "resources" }`, `POST { "action": "saveResources", "resources": [...] }` ou `POST { "action": "sync", "calendarIds": ["uuid interne"] }`.

La découverte conserve uniquement les calendriers ressources Google Workspace présents dans la liste du compte connecté. L'administrateur associe chaque ressource suivie à un e-mail de connexion ; la fonction crée si nécessaire le compte Auth salarié et le lie par `user_id`. Une sync initiale paginée produit un `nextSyncToken`; les suivantes utilisent exclusivement ce token. Chaque événement est pondé avec la règle correspondant à son `organizer.email`. Une réponse Google `410` invalide le token et déclenche un full resync sans effacer les anciennes données avant la réussite complète.

## Initialisation

1. Relire puis appliquer les migrations et `seed.sql` sur un nouveau projet.
2. Dans **Authentication > Users**, créer les comptes administrateurs et confirmer leur adresse e-mail.
3. Dans `public.profiles`, attribuer explicitement `role = admin` aux administrateurs. Tous les profils commencent en `employee` ; aucune adresse ne reçoit automatiquement les droits administrateur. Les comptes salariés sont ensuite provisionnés depuis Configuration.
4. Dans **Authentication > Email Templates > Magic Link / OTP**, copier le contenu de `templates/otp.html`. Supabase partage cet emplacement entre les deux modes : `{{ .Token }}` active l'OTP à 6 chiffres, tandis que `{{ .ConfirmationURL }}` générerait un lien et ne doit pas être présent.
5. Dans **Authentication > URL Configuration**, définir le Site URL à `https://esca-caf-la-roche.github.io/salaries-CAF/` et ajouter `https://esca-caf-la-roche.github.io/salaries-CAF/**` à la liste autorisée. Ces URL ne servent pas au parcours OTP, mais empêchent tout retour accidentel vers localhost pour les autres e-mails Auth.
5. Déployer les trois fonctions, puis configurer les secrets.

Les événements journée entière sont conservés mais exclus de `monthly_hours`. Les événements traversant un changement de mois sont ventilés à l'intersection exacte de chaque mois.
