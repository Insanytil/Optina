Transactions
============

Les transactions ordinaires portent un montant positif, un type `expense` ou
`income`, un portefeuille et une catégorie du même utilisateur. Leur date
représente un mouvement effectué (pas de date future). Le classement par catégorie
inclut ses descendants par défaut ; `include_subcategories=false` désactive cela.

`kind=opening_balance` désigne le solde initial. Ces mouvements n'ont pas de
catégorie et doivent être exclus des statistiques de dépenses/rentrées en filtrant
`kind=standard`. Ils sont générés à la création d'un portefeuille non nul et peuvent
être corrigés ou supprimés dans la page Transactions. Ils ne changent pas de
portefeuille. Aucun transfert entre portefeuilles n'est exposé.

La migration enregistre les soldes existants comme mouvements d'ouverture sans
les ajouter une seconde fois aux soldes. Une ouverture nulle n'ajoute pas de ligne.
Les mouvements d'ouverture utilisent la date de création pour les anciens
portefeuilles et la date saisie pour les nouveaux.

Le service verrouille le mouvement avant de le modifier/supprimer. Les
portefeuilles sont verrouillés dans l'ordre de leurs identifiants. L'écriture du
mouvement et l'ajustement SQL du solde sont validés dans le même commit.
Les références composites garantissent aussi en base que portefeuille et catégorie
appartiennent au propriétaire du mouvement. Les suppressions de portefeuilles et
catégories référencés sont refusées, sans cascade sur l'historique.

API : GET/POST `/transactions`, GET/PATCH/DELETE `/transactions/{id}`.
Les écritures exigent la session et le header CSRF existants.
Filtres : wallet_id, category_id, include_subcategories, type, kind, date_from,
date_to, page et page_size.

Depuis backend/ :

    uv run alembic upgrade head
    uv run python -m unittest discover -s tests -q

Tests PostgreSQL optionnels (base configurée dans .env) :

    RUN_POSTGRES_TESTS=1 uv run python -m unittest discover -s tests -p test_transaction_postgres.py -v

Ils créent des schémas de test distincts puis les suppriment ; ils ne touchent pas
aux tables de l'application. Sous PowerShell, définir d'abord
`$env:RUN_POSTGRES_TESTS="1"` puis lancer la commande sans le préfixe.
