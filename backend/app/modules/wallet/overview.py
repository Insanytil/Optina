import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_async_session
from app.models.category import Category
from app.models.wallet import Wallet
from app.models.wallet_transaction import WalletTransaction as Movement
from app.modules.auth.dependencies import CurrentUser
from app.modules.wallet.schemas import WalletPeriod


class ComparisonWallet(BaseModel):
    id: uuid.UUID
    name: str
    balance: Decimal
    income: Decimal
    expenses: Decimal
    net: Decimal


class ComparisonCategory(BaseModel):
    id: uuid.UUID
    name: str
    income: Decimal
    expenses: Decimal
    net: Decimal


class WalletOverviewResponse(BaseModel):
    balance: Decimal
    income: Decimal
    expenses: Decimal
    net: Decimal
    wallets: list[ComparisonWallet]
    categories: list[ComparisonCategory]
    date_from: date
    date_to: date


async def overview(db, user_id, wallet_ids, period):
    ids = set(wallet_ids)
    if not ids:
        raise HTTPException(422, "Sélectionnez au moins un portefeuille.")
    received = func.coalesce(func.sum(case((Movement.type == 'income', Movement.amount), else_=0)), 0)
    spent = func.coalesce(func.sum(case((Movement.type == 'expense', Movement.amount), else_=0)), 0)
    rows = (await db.execute(select(Wallet.id, Wallet.name, Wallet.balance, received.label('income'), spent.label('expenses'))
        .outerjoin(Movement, and_(Movement.wallet_id == Wallet.id, Movement.user_id == user_id,
            Movement.kind == 'standard', Movement.date >= period.date_from, Movement.date <= period.date_to))
        .where(Wallet.user_id == user_id, Wallet.id.in_(ids)).group_by(Wallet.id).order_by(Wallet.name, Wallet.id))).mappings().all()
    if {row['id'] for row in rows} != ids:
        raise HTTPException(404, "Un portefeuille sélectionné n’est pas accessible.")
    wallets = [ComparisonWallet(**row, net=row['income']-row['expenses']) for row in rows]
    roots = select(Category.id.label('id'), Category.id.label('root_id'), Category.name.label('name')).where(
        Category.user_id == user_id, Category.parent_id.is_(None)).cte('overview_roots', recursive=True)
    roots = roots.union_all(select(Category.id, roots.c.root_id, roots.c.name)
        .join(roots, Category.parent_id == roots.c.id).where(Category.user_id == user_id))
    rows = (await db.execute(select(roots.c.root_id.label('id'), roots.c.name, received.label('income'), spent.label('expenses'))
        .join(Movement, Movement.category_id == roots.c.id).where(Movement.user_id == user_id,
            Movement.wallet_id.in_(ids), Movement.kind == 'standard', Movement.date >= period.date_from, Movement.date <= period.date_to)
        .group_by(roots.c.root_id, roots.c.name).order_by(roots.c.name, roots.c.root_id))).mappings().all()
    zero = Decimal('0.00')
    income, expenses = sum((w.income for w in wallets), zero), sum((w.expenses for w in wallets), zero)
    return WalletOverviewResponse(balance=sum((w.balance for w in wallets), zero), income=income, expenses=expenses,
        net=income-expenses, wallets=wallets, categories=[ComparisonCategory(**row, net=row['income']-row['expenses']) for row in rows],
        date_from=period.date_from, date_to=period.date_to)


class WalletOverviewParams(WalletPeriod):
    wallet_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


router = APIRouter(prefix='/wallets', tags=['wallets'])


@router.get('/overview', response_model=WalletOverviewResponse)
async def wallet_overview(user: CurrentUser, db: Annotated[AsyncSession, Depends(get_async_session)],
    params: Annotated[WalletOverviewParams, Query()]):
    return await overview(db, user.id, params.wallet_ids, params)
