import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_entity import BaseEntity

if TYPE_CHECKING:
    from app.models.category_wallet import CategoryWallet
    from app.models.user import User
    from app.models.wallet_transaction import WalletTransaction


class Category(BaseEntity):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("id", "user_id", name="uq_categories_id_user_id"),
        ForeignKeyConstraint(
            ["parent_id", "user_id"],
            ["categories.id", "categories.user_id"],
            name="fk_categories_parent_owner",
            ondelete="RESTRICT",
        ),
        CheckConstraint("parent_id IS NULL OR parent_id <> id", name="parent_not_self"),
        CheckConstraint("position >= 0", name="position_non_negative"),
        Index("ix_categories_owner_parent_position", "user_id", "parent_id", "position", "id"),
    )

    restrict_wallets: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    wallet_links: Mapped[list["CategoryWallet"]] = relationship(
        "CategoryWallet", foreign_keys="CategoryWallet.category_id", lazy="selectin", cascade="all, delete-orphan",
    )

    @property
    def wallet_ids(self) -> list[uuid.UUID] | None:
        return [link.wallet_id for link in self.wallet_links] if self.restrict_wallets else None

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)

    user: Mapped["User"] = relationship(back_populates="categories", foreign_keys=[user_id], lazy="raise")
    parent: Mapped["Category | None"] = relationship(
        back_populates="children", remote_side="Category.id", foreign_keys=[parent_id], lazy="raise"
    )
    children: Mapped[list["Category"]] = relationship(
        back_populates="parent", foreign_keys=[parent_id], passive_deletes="all", lazy="raise"
    )

    transactions: Mapped[list["WalletTransaction"]] = relationship(
        back_populates="category", foreign_keys="WalletTransaction.category_id", passive_deletes="all", lazy="raise",
    )
