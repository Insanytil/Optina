import uuid
from typing import TYPE_CHECKING

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.base_entity import TimestampMixin

# SQLAlchemyBaseUserTableUUID already contains :
# users
# ─────────────────────────────
# id                UUID
# email             VARCHAR
# hashed_password   VARCHAR
# is_active         BOOLEAN
# is_superuser      BOOLEAN
# is_verified       BOOLEAN

if TYPE_CHECKING:
    from app.models.auth_session import AuthSession
    from app.models.wallet import Wallet
    from app.models.category import Category

class User(
    TimestampMixin,
    SQLAlchemyBaseUserTableUUID,
    Base,
):
    __tablename__ = "users"

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user",
        passive_deletes=True,
        lazy="raise",
    )
    wallets: Mapped[list["Wallet"]] = relationship(
        back_populates="user",
        lazy="raise",
    )
    categories: Mapped[list["Category"]] = relationship(
        back_populates="user",
        foreign_keys="Category.user_id",
        lazy="raise",
    )


Index(
    "uq_users_email_lower",
    func.lower(User.email),
    unique=True,
)