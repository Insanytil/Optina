from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import func, select, case, delete
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.models.budget import Budget, BudgetWallet, BudgetSeries, BudgetVersion
from app.models.category import Category
from app.models.user import User
from app.models.wallet import Wallet
from app.modules.budget.calculation import amounts, category_roots, pending_by_budget
from app.modules.budget.repository import BudgetRepository
from app.modules.budget.schemas import BudgetResponse, BudgetStatus, BudgetWrite, BudgetCollection
from app.modules.category.repository.category_repository import CategoryRepository
from app.modules.recurrence.service import business_today
from app.modules.transaction.schemas import TransactionResponse
from app.modules.budget.series import BudgetSeriesManager
from app.modules.budget.schedule import previous_start
from app.modules.budget.schemas import calendar_period


class BudgetService:
    def __init__(self, db):
        self.db = db
        self.repo = BudgetRepository(db)
        self.series_manager = BudgetSeriesManager(db, self.put)

    async def lock(self, user_id, *, read=False):
        await self.db.execute(select(User.id).where(User.id == user_id).with_for_update(read=read))

    async def required(self, user_id, budget_id):
        budget = await self.repo.get(user_id, budget_id)
        if budget is None:
            raise HTTPException(404, 'Objectif introuvable.')
        return budget

    async def validate(self, user_id, payload, budget_id=None):
        category = await self.db.scalar(select(Category).where(Category.user_id == user_id, Category.id == payload.category_id))
        if category is None:
            raise HTTPException(404, 'Catégorie introuvable.')
        if category.parent_id is not None:
            raise HTTPException(409, 'Choisissez une catégorie principale ; ses sous-catégories seront incluses.')
        owned = set((await self.db.scalars(select(Wallet.id).where(Wallet.user_id == user_id, Wallet.id.in_(payload.wallet_ids)))).all())
        if owned != set(payload.wallet_ids):
            raise HTTPException(404, 'Un portefeuille sélectionné est introuvable.')

    async def put(self, user_id, payload, budget=None, *, validate_refs=True):
        if validate_refs:
            await self.validate(user_id, payload, budget.id if budget else None)
        if budget is None:
            budget = Budget(user_id=user_id, wallet_links=[])
            self.db.add(budget)
        else:
            budget.wallet_links.clear()
            await self.db.flush()
        for key, value in payload.model_dump(exclude={'wallet_ids','repeats','repeat_until'}).items():
            setattr(budget,key,value)
        budget.wallet_links = [BudgetWallet(user_id=user_id,wallet_id=wallet_id) for wallet_id in payload.wallet_ids]
        await self.db.flush()
        return budget

    async def save(self, user_id, payload, budget_id=None, scope='period'):
        try:
            await self.lock(user_id)
            existing = await self.required(user_id, budget_id) if budget_id else None
            if existing and existing.series_id:
                if not payload.repeats or payload.period_type != existing.period_type or (payload.date_from,payload.date_to)!=(existing.date_from,existing.date_to):
                    raise HTTPException(409,'Le calendrier d’un budget répétitif ne peut pas être déplacé. Créez un nouveau budget pour changer de fréquence.')
                await self.validate(user_id,payload,existing.id)
                if scope=='following':
                    await self.series_manager.replace_following(user_id,existing,payload)
                else:
                    if payload.repeat_until != existing.repeat_until:
                        raise HTTPException(409,'Choisissez « Cette période et les suivantes » pour modifier la fin de répétition.')
                    await self.put(user_id,payload,existing)
                    existing.is_override=True
                budget=existing
            else:
                if existing and payload.repeats:
                    raise HTTPException(409,'Créez un nouveau budget répétitif pour conserver ce budget ponctuel.')
                budget = await self.put(user_id,payload,existing)
                if payload.repeats:
                    series=BudgetSeries(user_id=user_id,period_type=payload.period_type,start_date=payload.date_from,end_date=payload.repeat_until)
                    self.db.add(series)
                    await self.db.flush()
                    await self.series_manager.version(series,payload)
                    budget.series_id,budget.series=series.id,series
            await self.db.flush()
            result = BudgetResponse.model_validate(budget)
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, user_id, budget_id):
        try:
            await self.lock(user_id)
            budget=await self.required(user_id,budget_id)
            if budget.series_id:
                identifier=budget.series_id
                await self.db.execute(delete(Budget).where(Budget.user_id==user_id,Budget.series_id==identifier))
                await self.db.execute(delete(BudgetVersion).where(BudgetVersion.user_id==user_id,BudgetVersion.series_id==identifier))
                await self.db.execute(delete(BudgetSeries).where(BudgetSeries.user_id==user_id,BudgetSeries.id==identifier))
            else:
                await self.db.delete(budget)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def statuses(self, user_id, budgets, today):
        activity = await self.repo.activity(user_id,[budget.id for budget in budgets]) if budgets else {}
        pending = {}
        if budgets:
            categories = await CategoryRepository(self.db).list_tree(user_id=user_id)
            wallets = {identifier for budget in budgets for identifier in budget.wallet_ids}
            rules = await self.repo.rules(user_id,wallets)
            receipts = await self.repo.receipts(user_id,min(b.date_from for b in budgets),max(b.date_to for b in budgets))
            pending = pending_by_budget(budgets,rules,receipts,category_roots({item.id:item for item in categories}),today)
        zero=Decimal('0.00')
        items=[]
        for budget in budgets:
            days=activity.get(budget.id,[])
            occurrences=pending.get(budget.id,[])
            items.append(BudgetStatus(**BudgetResponse.model_validate(budget).model_dump(),activity=days,occurrences=occurrences,
                **amounts(budget.amount,sum((row['amount'] for row in days),zero),sum((row['amount'] for row in occurrences),zero))))
        return BudgetCollection(as_of=today,items=items)

    async def list(self, user_id, date_from, date_to):
        try:
            await self.lock(user_id)
            await self.series_manager.materialize(user_id,date_from,date_to)
            today=await business_today(self.db)
            result=await self.statuses(user_id,await self.repo.list(user_id,date_from,date_to),today)
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def history(self,user_id,budget_id,count=12):
        try:
            await self.lock(user_id)
            budget=await self.required(user_id,budget_id)
            today=await business_today(self.db)
            if budget.series_id:
                end=budget.date_to
                start=previous_start(budget.period_type,budget.date_from,count-1)
                await self.series_manager.materialize(user_id,start,end,budget.series_id)
                rows=(await self.db.scalars(select(Budget).where(Budget.user_id==user_id,Budget.series_id==budget.series_id,
                    Budget.date_from>=start,Budget.date_from<=budget.date_from).order_by(Budget.date_from))).all()
            else:
                rows=[budget]
            result=await self.statuses(user_id,rows,today)
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def definitions(self, user_id, pagination):
        """Management listing: owned definitions without spending or forecast calculations."""
        try:
            await self.lock(user_id)
            today=await business_today(self.db)
            await self.series_manager.current(user_id,today)
            ranked=select(Budget.id,func.row_number().over(
                partition_by=(Budget.series_id,case((Budget.series_id.is_(None),Budget.id))),
                order_by=(case((Budget.date_from<=today,0),else_=1),
                    case((Budget.date_from<=today,Budget.date_from)).desc(),Budget.date_from.asc(),Budget.id)).label('position'))                .where(Budget.user_id==user_id).subquery()
            statement = select(Budget).join(ranked,Budget.id==ranked.c.id).where(Budget.user_id == user_id,ranked.c.position==1)
            total = await self.db.scalar(select(func.count()).select_from(statement.subquery())) or 0
            rows = (await self.db.scalars(statement.order_by(Budget.date_from.desc(), Budget.id.desc())
                .limit(pagination.page_size).offset(pagination.offset))).all()
            result = PagePaginatedResponse[BudgetResponse](
                items=[BudgetResponse.model_validate(row) for row in rows],
                pagination=PagePaginationMeta(page=pagination.page, page_size=pagination.page_size,
                    total=total, total_pages=(total+pagination.page_size-1)//pagination.page_size))
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def transactions(self, user_id, budget_id, pagination):
        try:
            await self.lock(user_id, read=True)
            budget = await self.required(user_id, budget_id)
            statement = self.repo.transaction_query(user_id, budget)
            total = await self.db.scalar(select(func.count()).select_from(statement.subquery())) or 0
            from app.models.wallet_transaction import WalletTransaction
            rows = (await self.db.scalars(statement.order_by(WalletTransaction.date.desc(), WalletTransaction.id.desc())
                .limit(pagination.page_size).offset(pagination.offset))).all()
            result = PagePaginatedResponse[TransactionResponse](items=[TransactionResponse.model_validate(row) for row in rows],
                pagination=PagePaginationMeta(page=pagination.page, page_size=pagination.page_size, total=total,
                    total_pages=(total+pagination.page_size-1)//pagination.page_size))
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise
