Depuis `backend/`, après avoir configuré `.env` et appliqué les migrations :

```bash
# Compte standard
uv run python -m app.cli.create_user --email user@example.com

# Premier et unique superutilisateur
uv run python -m app.cli.create_user --email admin@example.com --superuser
```

Le mot de passe est demandé sans affichage puis confirmé (15 caractères minimum).
Les comptes créés sont actifs et vérifiés, donc utilisables immédiatement sur `/login`.
Un email existant est refusé, sans modification de son compte.
La création d'un superutilisateur est refusée s'il en existe déjà un, même inactif.
La vérification et l'insertion sont protégées par un verrou PostgreSQL transactionnel,
y compris lors de lancements simultanés. Aucun compte existant n'est promu.

Tests : `uv run python -m unittest discover -s tests -v`.

## Jeu de démonstration : client multiportefeuille

Depuis `backend/`, après `uv run alembic upgrade head` et avec le backend démarré :

```powershell
# Aperçu sans connexion ni écriture :
uv run python -m app.cli.seed_household --end-month 2026-10

# Création sur le compte existant :
uv run python -m app.cli.seed_household --email user@optina.com --end-month 2026-10 --apply --report demo-data/household-2025-2026.json
```

Le mot de passe est demandé sans affichage et n'est jamais enregistré. Sans
`--apply`, aucun appel réseau n'est effectué. `--base-url` change l'adresse du
backend. Par défaut, le script couvre les douze derniers mois complets et le
mois courant jusqu'à aujourd'hui. `--no-current-month` exclut les transactions
ponctuelles du mois courant et clôt les anciennes règles à la fin de l'année
simulée ; les exemples d'abonnement futur et suspendu restent disponibles.

Le ménage fictif comprend deux parents de 49 et 52 ans et trois enfants de
18, 22 et 26 ans. Quatre portefeuilles sont créés :

- **Compte du foyer**, ouverture 6 500 : salaire de Sophie, contributions des
  enfants, logement, assurances et abonnements ;
- **Dépenses du quotidien**, ouverture 2 800 : salaire de Thomas, courses,
  transports, santé et vêtements ;
- **Espèces**, ouverture 3 200 : marché, boulangerie et quelques repas, avec des
  cadeaux reçus de proches comme rentrées ;
- **Projets et études**, ouverture 4 500 : primes, vacances, impôts et inscriptions.

Les salaires ne sont pas dupliqués entre comptes et aucun transfert ou retrait
n'est déguisé en revenu. Les ouvertures représentent des avoirs déjà détenus.
Les montants sont illustratifs et ne représentent pas des aides ou tarifs officiels.

Les catégories ont un espace de noms dédié au scénario et certaines sont libres,
d'autres limitées à un ou plusieurs portefeuilles. Les restrictions s'appliquent
aux sous-catégories. Des catégories communes (repas, pharmacie…) ont des mouvements
dans plusieurs comptes pour tester les regroupements de la vue globale.

Les salaires, charges fixes et abonnements sont de **vraies récurrences** : leur
création via l'API génère les transactions historiques et actualise les soldes.
Le scénario couvre les fréquences hebdomadaire, toutes les quatre semaines,
mensuelle, trimestrielle, semestrielle et annuelle, avec des règles terminées,
actives, suspendues et une prestation démarrant après l'année simulée.
Le sport d'Alex est facturé tous les 28 jours, distinctement du mois civil.
Les courses variables, remboursements, voyages et réparations restent ponctuels.

Les échéances déjà générées ne sont pas aussi importées comme transactions
ponctuelles. Les règles et mouvements portent des références déterministes.
Une relance reprend un import interrompu ; elle refuse les doublons et les
objets de démonstration modifiés manuellement, y compris les règles archivées.
Les objets personnels ne sont pas modifiés. Une transaction récurrente supprimée
n'est pas recréée : la vérification signale qu'elle manque.

Chaque solde est reconstruit depuis les transactions, puis comparé au solde API.
Le script vérifie aussi les cumuls annuels de la vue globale et consulte les
prévisions à douze mois de chaque portefeuille. Avant 6 h, les occurrences du
jour encore en attente sont signalées séparément. Les références des objets et
les soldes vérifiés sont disponibles dans le rapport JSON, sans identifiants de connexion.

Tests sans réseau :

```powershell
uv run python -m unittest discover -s tests -p test_seed_household.py -v
```
