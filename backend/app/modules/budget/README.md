# Budgets

Un budget est un repère informatif de dépenses sur **une catégorie (à n'importe
quel niveau) et ses sous-catégories**, pour une sélection de portefeuilles. Il ne
bloque aucune transaction et ne change aucun solde. Des budgets qui se recoupent
restent indépendants : aucun total ne les additionne.

## Définition

- `frequency` : `week` (lundi-dimanche), `month`, `quarter`, `year` ou `once`.
- Répétitif : `start_date` est ramené au début de sa période, `end_date`
  (facultative) à la fin de la sienne.
- `once` : une période libre `start_date`..`end_date` (dix ans au plus), un seul
  montant, jamais de report.
- `amounts` : montants datés. Chacun s'applique à partir du début de sa période,
  jusqu'au suivant ; le premier commence au début du budget. Changer un montant
  « à partir de janvier » ne touche pas l'historique.
- `carry_over` : le reste (ou le dépassement) d'une période s'ajoute à la suivante.
- `alert_threshold` : pourcentage (1-200, 80 par défaut) à partir duquel le
  budget est « à surveiller », réalisé + prévu compris.

Les périodes ne sont pas stockées : elles sont calculées depuis le calendrier
(`calculation.py`, fonctions pures et testées).

## Calculs

- **Réalisé** : dépenses moins rentrées (remboursements) `standard` du périmètre
  sur la période, jamais sous zéro.
- **Encore prévu** : échéances de dépenses récurrentes actives du périmètre pas
  encore générées (périodes en cours ou futures).
- **Disponible** = montant de la période + report éventuel.
- **Marge** = disponible − (réalisé + encore prévu).

Le report est calculé depuis la première période du budget.

## Catégories

Une catégorie avec un budget peut être déplacée librement (le budget la suit),
mais pas supprimée tant qu'un budget l'utilise.

## API

- `GET /budgets` : définitions, triées par nom.
- `GET /budgets/status?month=AAAA-MM-JJ` : pour chaque budget, la période du mois
  demandé (celle qui contient aujourd'hui pour le mois en cours, le dernier jour
  pour un mois passé, le premier pour un mois futur ; un budget ponctuel apparaît
  dans tout mois qu'il recoupe) avec réalisé, prévu, marge et échéances.
- `POST /budgets`, `PATCH /budgets/{id}`, `DELETE /budgets/{id}`.
- `GET /budgets/{id}/history?month=…&count=12` : les périodes jusqu'à celle du mois.
- `GET /budgets/{id}/transactions?month=…` : dépenses et remboursements de la période.

Les mutations requièrent le jeton CSRF.

```sh
.venv/Scripts/python -m unittest discover -s tests -p "test_budget*" -q
```
