"""Create a local account: python -m app.cli.create_user --email ... [--superuser]."""

import argparse
import asyncio
from getpass import getpass
import sys

from fastapi_users import exceptions
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.schemas import BaseUserCreate
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.auth.services.user_manager import UserManager


class AccountCreationError(Exception):
    """An expected refusal to create an account."""


async def create_user(session: AsyncSession, payload: BaseUserCreate) -> User:
    """Create an active, verified user in a single transaction."""
    manager = UserManager(SQLAlchemyUserDatabase(session, User))
    await manager.validate_password(payload.password, payload)
    hashed_password = manager.password_helper.hash(payload.password)

    async with session.begin():
        # Serialize checks and inserts, including two concurrent CLI invocations.
        # Held until commit/rollback; no intermediate adapter commit is allowed.
        await session.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
        if payload.is_superuser:
            existing_superuser = await session.scalar(
                select(User.id).where(User.is_superuser.is_(True)).limit(1)
            )
            if existing_superuser is not None:
                raise AccountCreationError(
                    "Création refusée : un superutilisateur existe déjà."
                )

        existing_user = await session.scalar(
            select(User.id).where(func.lower(User.email) == str(payload.email).lower()).limit(1)
        )
        if existing_user is not None:
            raise AccountCreationError("Un compte utilise déjà cette adresse email.")

        user = User(
            email=str(payload.email).lower(),
            hashed_password=hashed_password,
            is_active=True,
            is_verified=True,
            is_superuser=bool(payload.is_superuser),
        )
        session.add(user)
        await session.flush()
    return user


async def run(payload: BaseUserCreate) -> None:
    from app.db.session import async_session_factory, engine

    try:
        async with async_session_factory() as session:
            user = await create_user(session, payload)
            role = "Superutilisateur" if user.is_superuser else "Utilisateur"
            print(f"{role} créé : {user.email}")
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Créer un compte utilisateur actif et vérifié.")
    parser.add_argument("--email", required=True, help="Adresse email du compte")
    parser.add_argument("--superuser", action="store_true", help="Créer l'unique superutilisateur")
    args = parser.parse_args()
    try:
        password = getpass("Mot de passe (15 caractères minimum) : ")
        if password != getpass("Confirmer le mot de passe : "):
            raise AccountCreationError("Les mots de passe ne correspondent pas.")
        payload = BaseUserCreate(
            email=args.email.strip(), password=password, is_superuser=args.superuser
        )
        asyncio.run(run(payload))
    except ValidationError:
        print("Erreur : adresse email invalide.", file=sys.stderr)
        return 1
    except exceptions.InvalidPasswordException as error:
        print(f"Erreur : {error.reason}", file=sys.stderr)
        return 1
    except AccountCreationError as error:
        print(f"Erreur : {error}", file=sys.stderr)
        return 1
    except IntegrityError:
        print("Création refusée : un compte existe déjà ou les données sont invalides.", file=sys.stderr)
        return 1
    except (SQLAlchemyError, OSError):
        print("Impossible d'accéder à PostgreSQL. Vérifiez sa disponibilité et appliquez les migrations.", file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nCréation annulée.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
