"""Register the application's SQLAlchemy models."""

from app.models.auth_session import AuthSession
from app.models.category import Category
from app.models.category_wallet import CategoryWallet
from app.models.user import User
from app.models.wallet import Wallet
from app.models.wallet_transaction import WalletTransaction

from app.models.recurrence import Recurrence, RecurrenceOccurrence

__all__ = ["AuthSession", "Category", "User", "Wallet", "WalletTransaction", "Recurrence", "RecurrenceOccurrence", "CategoryWallet"]
