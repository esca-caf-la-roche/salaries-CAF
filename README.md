# La Cordée — suivi des heures CAF

Application statique React pour suivre les heures issues de Google Calendar, avant et après application d'un coefficient par ressource. L'interface est déployable sur GitHub Pages ; Supabase gère l'authentification, les données et la synchronisation Google côté serveur.

L'authentification utilise exclusivement un OTP e-mail à 6 chiffres. Les administrateurs sont créés manuellement dans **Supabase Auth > Users**, puis reçoivent explicitement le rôle `admin` dans `public.profiles`. Pour les salariés, la page **Configuration** affiche uniquement les calendriers ressources Google : le type de contrat est détecté depuis le préfixe `(CDI)-`, `(CDII)-` ou `(CDD)-` du nom de la ressource ; l'administrateur renseigne ensuite le volume annuel et l'e-mail de connexion, puis le compte Auth correspondant est provisionné côté serveur.

La ressource Google nommée exactement **`(CDII)-A DETERMINER`** (`c_1885o4bj2rlv4gijgd278pfg9rub0@resource.calendar.google.com`) représente les cours sans moniteur attribué. Elle est toujours suivie, sa première lecture déclenche automatiquement sa synchronisation, ne crée aucun compte salarié et n'exige ni e-mail ni informations contractuelles. Ses données restent visibles par les administrateurs uniquement.

La page admin **À déterminer** rassemble tous les événements de cette ressource sous forme de cards classées par mois et regroupées par journée. Les calendriers d'origine rencontrés alimentent automatiquement un filtre à sélection multiple. Le résultat filtré peut être imprimé en A4 portrait dans une mise en page condensée, sans navigation, en conservant les couleurs des calendriers et sans couper les cards entre deux pages lorsqu'elles tiennent sur une feuille. Sur la vue d'ensemble, un bandeau rouge signale les événements à attribuer dont le début est prévu dans moins de sept jours.

La page **Configuration** affiche aussi les calendriers d'origine effectivement rencontrés dans les événements synchronisés. Un Kanban les fait passer de **À définir** vers **Avec prépa** (coefficient 1,25) ou **Sans prépa** (coefficient 1), puis vers l'une des quatre catégories de comptage : Heures du contrat, Heures d'absences, Heures de remplacements ou Heures fériées. Les cartes se déplacent par glisser-déposer ou par sélection puis clic, et conservent la couleur du calendrier Google comme repère visuel. Une règle intermédiaire ne peut pas être enregistrée et reste exclue des totaux afin d'éviter un calcul silencieusement faux.

Les synthèses annuelles suivent la saison scolaire : du **1er septembre** d'une année au **31 août** de l'année suivante. Les mois sont affichés dans cet ordre et chacune des quatre catégories d'heures est totalisée séparément. Le volume annuel contractuel de la ressource reste une propriété distincte de ces heures comptabilisées.

La page **Suivi des heures** propose désormais deux lectures complémentaires :

- le détail mensuel événement par événement, avec durée brute, coefficient de préparation, durée retenue et rubrique ;
- la synthèse annuelle septembre–août, avec les totaux mensuels du contrat, des absences, des remplacements et des fériés, sans séparation par préparation, ainsi qu’un solde mensuel `contrat - absences + remplacements + fériés`, les semaines CDII et la saisie des heures des bulletins.

Les saisies contractuelles et de bulletin sont conservées par salarié et par saison, en minutes entières. Le calcul garantit au minimum le volume annuel du contrat et ajoute toujours les remplacements. Pour un CDI, il ajoute 10 % de la base garantie au titre des congés et calcule les fériés ouvrés à partir du ratio exact `heures du contrat / référence temps plein × 7 h`. Pour un CDII, les fériés configurés dans Google Calendar sont inclus dans les heures réalisées et aucun congé supplémentaire n'est ajouté. La formule active est rappelée directement sous la synthèse pour rester contrôlable.

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

La CI GitHub Pages exécute le lint, les tests et le build avant toute publication. Les migrations Supabase restent déployées séparément avec `supabase db push`, puis leur présence est contrôlée avec `supabase migration list`.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` publie le dossier `dist` pour le dépôt `salaries-CAF`. Ajouter les valeurs suivantes dans les réglages GitHub du dépôt :

- variable `VITE_SUPABASE_URL` ;
- secret `VITE_SUPABASE_PUBLISHABLE_KEY`.

Le client OAuth Google et le CSV de coefficients sont explicitement ignorés par Git et ne sont jamais chargés par le frontend.
