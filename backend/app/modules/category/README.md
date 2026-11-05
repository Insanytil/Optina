# Catégories et portefeuilles

Les catégories restent propres à l'utilisateur et partagées entre ses portefeuilles.
`wallet_ids` dans POST/PATCH /categories et dans les réponses représente une restriction :

- `null` : tous les portefeuilles autorisés par les ancêtres, y compris les futurs portefeuilles si la branche est libre ;
- `[uuid, …]` : intersection de cette sélection avec les portefeuilles autorisés par les ancêtres ;
- `[]` : aucun portefeuille autorisé.

Le schéma utilise `categories.restrict_wallets` et une table d'association
`category_wallets` avec clés étrangères composites assurant que catégorie et
portefeuille appartiennent au même utilisateur. Aucun traitement de données
legacy n'est nécessaire.

Les transactions nouvelles et les changements d'affectation à un portefeuille ou
une catégorie doivent respecter la disponibilité. Les transactions existantes
restent dans les analyses et peuvent être corrigées sans changer leur affectation.
Les récurrences sont vérifiées à l'enregistrement et à la reprise.

Un changement de disponibilité ou un déplacement de catégorie est refusé s'il
rend une récurrence active avec des échéances restantes incompatible. Une
récurrence suspendue devra être adaptée avant sa reprise si nécessaire.
Les écritures concernées verrouillent d'abord l'utilisateur pour sérialiser les
changements de hiérarchie/disponibilité, de transactions et de récurrences.

# Vue globale

`GET /wallets/overview?wallet_ids=<uuid>&wallet_ids=<uuid>&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`

La sélection contient de 1 à 500 identifiants. Les doublons sont dédupliqués et
une sélection incluant un portefeuille inaccessible est rejetée en entier.
Les montants utilisent Decimal. Le solde est le solde actuel tous mouvements
confondus ; les rentrées, dépenses et résultats concernent la période demandée,
hors mouvements d'ouverture. Les catégories sont regroupées par racine en
incluant leurs descendants, indépendamment de leur disponibilité actuelle.
