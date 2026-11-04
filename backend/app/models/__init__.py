"""Register the application's SQLAlchemy models."""

from app.models.auth_session import AuthSession
from app.models.user import User
from app.models.wallet import Wallet

__all__ = ["AuthSession", "User", "Wallet"]
