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
- `google-calendar-sync`, JWT requis : les actions de configuration et les synchronisations globales sont réservées aux administrateurs ; l'action `sync` autorise aussi un salarié à synchroniser sa propre ressource selon les règles de son contrat. La fonction gère la détection et la sauvegarde des ressources, contrats et volumes annuels avec `discover`, `resources` et `saveResources`; la lecture et la sauvegarde du coefficient et de la rubrique des calendriers d'origine avec `coefficientCalendars` et `saveCoefficients`; la synchronisation avec `sync`.

La découverte conserve uniquement les calendriers ressources Google Workspace présents dans la liste du compte connecté. La lecture des calendriers de coefficient actualise aussi leur vraie couleur `backgroundColor` Google lors de `discover` et de `coefficientCalendars`; une couleur inconnue reste `null`. Le contrat est détecté depuis le préfixe `(CDI)-`, `(CDII)-`, `(CDD)-` ou le marqueur `(Indep)` du nom de la ressource. L'administrateur renseigne le volume annuel et l'e-mail de connexion ; la fonction crée si nécessaire le compte Auth salarié et le lie par `user_id`. `(CDII)-A DETERMINER` est activée automatiquement sans compte ni contrat. Une sync initiale paginée produit un `nextSyncToken`; les suivantes utilisent ce token tant qu'il reste valide. Une réponse Google `410` ou l'action administrative interne `resyncAll` invalide le jeton et force un full resync, sans effacer les anciennes données avant la réussite complète. Chaque événement est pondé et classé avec la règle correspondant à son `organizer.email`.

Pour `action = sync`, le mode `automatic` ignore côté serveur chaque ressource synchronisée depuis moins d'une heure. Il est utilisé à l'ouverture de la vue d'ensemble admin et du suivi salarié. Le mode `manual` force l'appel Google ; il reste accessible aux administrateurs pour toutes les ressources et aux seuls salariés CDI pour leur propre ressource. La découverte des nouvelles ressources reste une action admin manuelle et aucun cron n'est configuré. Après `processReplacements`, la fonction resynchronise les calendriers ressources de l'absent et des remplaçants ; un éventuel échec de cette seconde étape est renvoyé séparément, car les écritures Google peuvent déjà avoir réussi.

## Initialisation

1. Relire puis appliquer les migrations et `seed.sql` sur un nouveau projet.
2. Dans **Authentication > Users**, créer les comptes administrateurs et confirmer leur adresse e-mail.
3. Dans `public.profiles`, attribuer explicitement `role = admin` aux administrateurs. Tous les profils commencent en `employee` ; aucune adresse ne reçoit automatiquement les droits administrateur. Les comptes salariés sont ensuite provisionnés depuis Configuration.
4. Dans **Authentication > Email Templates > Magic Link / OTP**, copier le contenu de `templates/otp.html`. Supabase partage cet emplacement entre les deux modes : `{{ .Token }}` active l'OTP à 6 chiffres, tandis que `{{ .ConfirmationURL }}` générerait un lien et ne doit pas être présent.
5. Dans **Authentication > URL Configuration**, définir le Site URL à `https://esca-caf-la-roche.github.io/salaries-CAF/` et ajouter `https://esca-caf-la-roche.github.io/salaries-CAF/**` à la liste autorisée. Ces URL ne servent pas au parcours OTP, mais empêchent tout retour accidentel vers localhost pour les autres e-mails Auth.
5. Déployer les trois fonctions, puis configurer les secrets.

Les événements journée entière sont conservés mais exclus de `monthly_hours`. Les événements traversant un changement de mois sont ventilés à l'intersection exacte de chaque mois. `monthly_hours.school_year` rattache septembre à décembre à l'année de début, et janvier à août à cette même saison.

### Ressources indépendantes

Le marqueur `(Indep)` (insensible à la casse, partout dans le nom) détecte le type `INDEP`. Le volume annuel est facultatif. Tous les événements horaires non annulés de la ressource active comptent leur durée réelle, y compris les calendriers sans règle active. Ils alimentent les heures réalisées (`contract_hours`) avec un coefficient de 1 et sans préparation ; les catégories absence, remplacement et férié du calendrier ne modifient pas ce calcul. Les événements sur une journée entière restent exclus. Les vues de synthèse, de détail et de semaines respectent toujours les RLS existantes.

Appliquer les deux migrations Indépendant dans l’ordre : ajout de la valeur enum, puis règles et vues. Le test `supabase/tests/database/independent.sql` crée des fixtures, vérifie aussi la non-régression CDI, puis effectue un rollback.
