# La Cordée — suivi des heures CAF

Application statique React pour suivre les heures issues de Google Calendar, avant et après application d'un coefficient par ressource. L'interface est déployable sur GitHub Pages ; Supabase gère l'authentification, les données et la synchronisation Google côté serveur.

L'authentification utilise exclusivement un OTP e-mail à 6 chiffres. Les administrateurs sont créés manuellement dans **Supabase Auth > Users**, puis reçoivent explicitement le rôle `admin` dans `public.profiles`. Pour les salariés, la page **Configuration** affiche uniquement les calendriers ressources Google : le type de contrat est détecté depuis le préfixe `(CDI)-`, `(CDII)-` ou `(CDD)-` du nom de la ressource ; l'administrateur renseigne ensuite le volume annuel et l'e-mail de connexion, puis le compte Auth correspondant est provisionné côté serveur.

La ressource Google nommée exactement **`(CDII)-A DETERMINER`** représente les cours sans moniteur attribué. Elle est toujours suivie, ne crée aucun compte salarié et n'exige ni e-mail ni informations contractuelles. Ses données restent visibles par les administrateurs uniquement.

La page **Configuration** affiche aussi les calendriers d'origine effectivement rencontrés dans les événements synchronisés. L'administrateur choisit pour chacun le coefficient 1 (sans préparation) ou 1,25 (avec préparation), puis son type d'heures parmi les sept colonnes du fichier de référence : travail, absence ou remplacement avec/sans préparation, et férié avec préparation. Les calendriers connus du CSV sont préconfigurés par migration. Un type ou un coefficient inconnu reste **À définir**, est signalé sur le tableau de bord administrateur et reste exclu des totaux afin d'éviter un calcul silencieusement faux.

Les synthèses annuelles suivent la saison scolaire : du **1er septembre** d'une année au **31 août** de l'année suivante. Les mois sont affichés dans cet ordre et chaque type d'heures est totalisé séparément. Le volume annuel du contrat reste une propriété du salarié et ne constitue pas un type d'heures.

Supabase range techniquement les e-mails OTP dans l'emplacement de configuration nommé `magic_link`, mais le modèle hébergé doit contenir uniquement `{{ .Token }}` et aucune variable `{{ .ConfirmationURL }}`. Le fichier local `supabase/templates/otp.html` sert de source à copier dans **Authentication > Email Templates > Magic Link / OTP** du projet hébergé.

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
