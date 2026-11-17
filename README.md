# Optina

Optina est une application de suivi et de prévision budgétaire.

Elle permet de centraliser les entrées et sorties d’argent de plusieurs portefeuilles pour mieux comprendre ses coûts, ses rentrées et ses dépenses récurrentes, et anticiper l’évolution de ses soldes.

## Ce que permet l’application

- **Gérer plusieurs portefeuilles** et consulter leurs soldes, individuellement ou dans une vue d’ensemble.
- **Suivre les revenus et les dépenses**, avec un classement par catégories et sous-catégories.
- **Visualiser ses finances** grâce à des tableaux de bord et des graphiques par période et par catégorie.
- **Définir des budgets** et suivre leur progression dans le temps.
- **Planifier les mouvements récurrents** : salaires, loyers, abonnements, factures, etc., avec génération automatique des transactions à échéance.
- **Prévoir les soldes à venir** à partir du solde actuel et des revenus et dépenses récurrents enregistrés. Les dépenses variables ou imprévues ne sont pas estimées.

## Base technique

- **Interface** : React et TypeScript, avec Vite, TanStack Router pour la navigation et TanStack Query pour les échanges avec l’API. L’interface utilise Tailwind CSS, shadcn/ui et Recharts pour les graphiques.
- **API** : Python et FastAPI, avec Pydantic pour la validation et FastAPI Users pour l’authentification. Le backend est organisé en modules métier : portefeuilles, transactions, catégories, budgets et récurrences.
- **Données** : PostgreSQL, avec SQLAlchemy en mode asynchrone et Alembic pour les migrations de la base.
- **Environnement local** : Docker Compose pour PostgreSQL, uv pour les dépendances Python et npm pour le frontend.

## Organisation du dépôt

- `frontend/` : application web et visualisation des données.
- `backend/` : API, règles métier, calcul des prévisions et traitement des récurrences.
- `infra/` : configuration Docker Compose de la base de données.

Les prévisions reposent sur les mouvements récurrents configurés par l’utilisateur. Le traitement automatique de leurs échéances nécessite que le backend soit en cours d’exécution.
