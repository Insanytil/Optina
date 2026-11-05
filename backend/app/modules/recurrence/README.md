# Récurrences

Les règles appartiennent à un utilisateur et référencent son portefeuille et sa
catégorie. Le montant reste un Decimal positif ; le type income/expense détermine
son effet sur le solde. Le calendrier utilise une unité et un intervalle :
semaine × 1, semaine × 4, mois × 1/3/6, année × 1. Quatre semaines font 28 jours :
il peut y avoir deux débits dans un mois et parfois 14 dates dans une année civile.

Le calcul conserve la date d'origine : 31 janvier → dernier jour de février →
31 mars. Une fin est inclusive. La première date peut remonter jusqu'à dix ans.

## Traitement automatique

Le lifespan FastAPI lance le traitement chaque jour à **06:00 Europe/Brussels**,
changements d'heure compris. Il dort jusqu'à la prochaine exécution et ne sonde
pas la base chaque minute. Au démarrage, il rattrape les traitements manqués ;
avant 6 h, seules les échéances jusqu'à la veille sont dues. Le backend doit être
lancé pour exécuter le traitement. Après une indisponibilité, les mouvements
retrouvent leur date d'échéance initiale.

Une règle enregistrée après son échéance est rattrapée à l'enregistrement, dans
la limite de 500 occurrences ; le traitement termine les éventuels lots suivants.
Une modification traite d'abord les échéances déjà dues avec les anciennes valeurs.
Les transactions existantes ne sont jamais réécrites. Un changement de calendrier
exige une première échéance future. Le portefeuille d'une règle est fixe.

La suspension ignore les échéances durant la pause ; la reprise repart de la
première échéance encore à venir (celle du jour seulement si la reprise précède 6 h). L'arrêt archive définitivement
la règle, en conservant les mouvements et les preuves de génération.

Chaque lot verrouille sa règle puis son portefeuille. Mouvement, mise à jour
atomique du solde, reçu d'occurrence et curseur sont validés dans la même
transaction PostgreSQL. Une contrainte unique (règle, date) et les verrous
protègent les exécutions concurrentes. Supprimer un mouvement conserve son reçu,
ce qui empêche sa recréation. Les règles archivées continuent de référencer leur
portefeuille et leur catégorie pour préserver l'historique.

Configuration dans `.env` :

```dotenv
RECURRENCE_WORKER_ENABLED=true
RECURRENCE_TIMEZONE=Europe/Brussels
```

Pour un planificateur externe, désactiver le worker intégré et lancer chaque jour
à 6 h (dans le même fuseau) :

```sh
uv run python -m app.cli.process_recurrences
```

Ce programme respecte aussi la limite quotidienne de 6 h. Les erreurs sont
journalisées ; le worker intégré retente après cinq minutes en cas d'échec.
Les comptes désactivés ou non vérifiés ne sont pas traités.

## Prévisions

`GET /recurrences/forecast?wallet_id=…&months=3` utilise le solde actuel et les
occurrences encore à générer, du jour courant à la fin du dernier mois demandé.
Les échéances en retard sont comptées aujourd'hui, avec leur date d'origine
exposée séparément. Le minimum est calculé en fin de journée, avec compensation
des flux du même jour. Les dépenses variables et imprévues ne sont pas prédits.
Aucune transaction future n'est écrite pendant une consultation.

## Validation

```sh
uv run python -m unittest discover -s tests -q
# Schémas PostgreSQL de test isolés, supprimés à la fin :
RUN_POSTGRES_TESTS=1 uv run python -m unittest discover -s tests -p 'test_recurrence_postgres.py' -q
```

Le POST accepte aussi `is_active=false` pour créer une règle directement en pause,
sans générer d'échéances historiques. Le GET accepte `include_archived=true`,
toujours limité à l'utilisateur connecté, notamment pour identifier les règles
arrêtées lors d'une relance du générateur de démonstration.
