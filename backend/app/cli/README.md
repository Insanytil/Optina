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
