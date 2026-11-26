"""Inherited category availability. Null means no additional restriction."""
from sqlalchemy import select
from app.models.category import Category
from app.models.category_wallet import CategoryWallet
from app.models.recurrence import Recurrence
from app.models.wallet import Wallet
from app.modules.category.exceptions import CategoryHierarchyError


def available(categories, category_id, wallet_id):
    seen = set()
    while category_id is not None:
        if category_id in seen or category_id not in categories:
            return False
        seen.add(category_id)
        category = categories[category_id]
        if category.wallet_ids is not None and wallet_id not in category.wallet_ids:
            return False
        category_id = category.parent_id
    return True


async def graph(db, user_id):
    rows = (await db.scalars(select(Category).where(Category.user_id == user_id)
        .execution_options(populate_existing=True))).all()
    return {row.id: row for row in rows}


async def set_availability(db, user_id, category_id, wallet_ids):
    category = await db.scalar(select(Category).where(Category.id == category_id, Category.user_id == user_id))
    if wallet_ids is not None:
        expected = set(wallet_ids)
        owned = set((await db.scalars(select(Wallet.id).where(Wallet.user_id == user_id, Wallet.id.in_(expected)))).all())
        if expected != owned:
            raise CategoryHierarchyError("Un portefeuille sélectionné n’est pas accessible.")
    category.restrict_wallets = wallet_ids is not None
    existing = {link.wallet_id: link for link in category.wallet_links}
    category.wallet_links = [existing.get(value) or CategoryWallet(user_id=user_id, wallet_id=value) for value in set(wallet_ids or [])]
    await db.flush()


async def validate_active_recurrences(db, user_id):
    categories = await graph(db, user_id)
    rules = (await db.scalars(select(Recurrence).where(Recurrence.user_id == user_id,
        Recurrence.is_active.is_(True), Recurrence.archived.is_(False), Recurrence.next_date.is_not(None)))).all()
    for rule in rules:
        if not available(categories, rule.category_id, rule.wallet_id):
            raise CategoryHierarchyError(f'La récurrence « {rule.label} » utilise cette catégorie dans un portefeuille exclu. Modifiez-la ou arrêtez-la avant de continuer.')

