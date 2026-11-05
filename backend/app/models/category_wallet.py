import uuid
from sqlalchemy import ForeignKeyConstraint, PrimaryKeyConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class CategoryWallet(Base):
    __tablename__ = "category_wallets"
    __table_args__ = (
        PrimaryKeyConstraint("category_id", "wallet_id"),
        Index("ix_category_wallets_wallet", "wallet_id"),
        ForeignKeyConstraint(["category_id", "user_id"], ["categories.id", "categories.user_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["wallet_id", "user_id"], ["wallets.id", "wallets.user_id"], ondelete="CASCADE"),
    )
    category_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    wallet_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
