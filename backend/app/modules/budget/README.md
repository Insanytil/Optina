# Budgets ponctuels et répétitifs

Un budget est un repère informatif de dépenses pour une catégorie principale,
ses descendants et une sélection explicite de portefeuilles. Il ne bloque jamais
une transaction, ne change aucun solde et ne reporte pas les montants inutilisés.
Les remboursements ne sont pas déduits des dépenses.

## Périodes et répétition

- **Ponctuel** : une seule période, calendaire ou personnalisée.
- **Répétitif** : semaines du lundi au dimanche, mois, trimestres ou années
  calendaires. Le début est celui de la première période complète. Une fin
  facultative correspond au dernier jour de la dernière période souhaitée.
- Chaque période est un `Budget` indépendant, avec nom, catégorie, montant et
  portefeuilles propres. Les budgets répétitifs partagent un `BudgetSeries`.
- Les `BudgetVersion` portent les modèles datés de la série, avec leurs propres
  liens de portefeuilles. Les montants sont en `NUMERIC(19,2)`.

Les périodes manquantes sont créées automatiquement à la consultation, uniquement
sur l'intervalle demandé. Aucun cron n'est nécessaire : cette création de références
budgétaires est distincte de la génération quotidienne des transactions récurrentes.
Le verrou exclusif utilisateur et l'unicité `(series_id, date_from)` rendent les
consultations concurrentes idempotentes. Les dates de démarrage anciennes ne
provoquent pas la génération de toutes les périodes intermédiaires.

La modification d'une période répétitive demande une portée explicite :

- `period` : exception sur cette période uniquement ; le modèle reste inchangé.
- `following` : cette période et toutes les suivantes, avec nouvelle version datée.
  Les versions ultérieures et exceptions déjà prévues à partir de cette période
  sont remplacées. Les périodes précédentes restent inchangées.

La fréquence et les dates d'une période répétitive ne sont pas déplacées. Pour
changer de calendrier, terminer l'ancienne série et créer un nouveau budget.
La fin de répétition se modifie avec la portée `following` ; les périodes de budget
générées après la nouvelle fin sont supprimées, sans toucher aux transactions.
Supprimer un budget répétitif supprime toute sa série et ses références de suivi,
y compris son historique budgétaire, après confirmation explicite dans l'interface.
Les transactions et leurs récurrences sont toujours conservées.

## Calculs et comparaison

- **Réalisé** : dépenses `expense` / `standard` de la période entière et du périmètre.
- **Encore prévu** : échéances de dépenses récurrentes actives encore non générées,
  y compris les retards compris dans une période en cours.
- **Total prévisionnel** = réalisé + encore prévu.
- **Marge prévue** = montant de référence − total prévisionnel.

Les périodes terminées affichent uniquement le réalisé. Les reçus durables de
récurrence empêchent le double comptage d'une échéance, même si sa transaction a été
supprimée. Les dépenses futures ponctuelles ne sont pas estimées. Des budgets qui
se recoupent restent indépendants : aucun total global ne les additionne.

L'historique compare les douze dernières périodes jusqu'à celle sélectionnée,
avec montant fixé, dépenses réelles, écart et pourcentage utilisé. Les périodes
en cours et futures sont signalées comme incomplètes. Le graphique compare le
réalisé, sans intégrer les prévisions à un résultat passé.

Les regroupements suivent l'arborescence actuelle des catégories. Les catégories
principales référencées par une période ou une version ne peuvent devenir des
sous-catégories. Les clés étrangères composites garantissent l'appartenance de
tous les liens. Les références empêchent la suppression d'un portefeuille utilisé.

## Écrans et API

- `/budgets` : budgets en cours, à venir, historique et comparaison par budget.
  Les filtres explicites remplacent « Mon quotidien / Mes projets / Mon bilan ».
  Les vues personnelles enregistrent les filtres et widgets, avec une vue par défaut.
- `/settings/budgets` : gestion, une ligne par budget ponctuel ou série répétitive.
  La période proposée à la modification est la période courante, ou la dernière
  période passée si la série est terminée, ou la première si elle n'a pas commencé.
- `GET /budgets?date_from=...&date_to=...` : périodes recoupant la fenêtre et calculs.
- `GET /budgets/definitions?page=1&page_size=20` : gestion paginée sans prévisions.
- `GET /budgets/{id}` : définition de cette période.
- `POST /budgets` : `name`, `category_id`, `wallet_ids`, `amount`, `period_type`,
  `date_from`, `date_to`, `repeats` et `repeat_until` (facultatif).
- `PATCH /budgets/{id}?scope=period|following` : même corps.
- `DELETE /budgets/{id}` : budget ponctuel ou série répétitive entière.
- `GET /budgets/{id}/history?count=12` : jusqu'à 60 périodes d'une même série.
- `GET /budgets/{id}/transactions?page=1&page_size=20` : dépenses de cette période.
- `/budgets/views` et `/budgets/views/{id}` : vues enregistrées personnelles.

Toutes les requêtes utilisent la session. Les mutations requièrent le jeton CSRF.
La création automatique des périodes ne crée ni transaction ni mouvement d'argent.

Migration depuis `backend` : `uv run alembic upgrade head`.
Les anciens budgets ponctuels restent ponctuels : aucune répétition n'est inférée.

```sh
uv run python -m unittest discover -s tests -p 'test_budget*' -q
# Intégration PostgreSQL dans des schémas temporaires :
RUN_POSTGRES_TESTS=1 uv run python -m unittest discover -s tests -p 'test_budget_postgres.py' -q
```
