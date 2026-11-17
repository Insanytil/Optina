from fastapi import HTTPException
from sqlalchemy import select, update
from app.models.budget import Budget, BudgetView, BudgetSeries
from app.models.category import Category
from app.models.wallet import Wallet
from app.modules.budget.schemas import BudgetViewResponse
from app.modules.budget.service import BudgetService


class BudgetViewService(BudgetService):
    async def views(self,user_id):
        rows=(await self.db.scalars(select(BudgetView).where(BudgetView.user_id==user_id).order_by(BudgetView.name,BudgetView.id))).all()
        return [BudgetViewResponse.model_validate(row) for row in rows]

    async def required_view(self,user_id,identifier):
        row=await self.db.scalar(select(BudgetView).where(BudgetView.user_id==user_id,BudgetView.id==identifier))
        if row is None: raise HTTPException(404,'Vue introuvable.')
        return row

    async def save_view(self,user_id,payload,identifier=None):
        try:
            await self.lock(user_id)
            row=await self.required_view(user_id,identifier) if identifier else None
            for model, ids in [(Wallet,payload.config.wallet_ids),(Category,payload.config.category_ids),(Budget,payload.config.budget_ids)]:
                if ids:
                    owned=set((await self.db.scalars(select(model.id).where(model.user_id==user_id,model.id.in_(ids)))).all())
                    if model is Budget:
                        owned.update((await self.db.scalars(select(BudgetSeries.id).where(BudgetSeries.user_id==user_id,BudgetSeries.id.in_(ids)))).all())
                    if owned!=set(ids): raise HTTPException(404,'Un élément sélectionné dans cette vue n’est plus accessible.')
            if payload.is_default:
                await self.db.execute(update(BudgetView).where(BudgetView.user_id==user_id).values(is_default=False))
            if row is None:
                row=BudgetView(user_id=user_id)
                self.db.add(row)
            row.name,row.preset,row.config,row.is_default=payload.name,payload.preset,payload.config.model_dump(mode='json'),payload.is_default
            await self.db.flush()
            response=BudgetViewResponse.model_validate(row)
            await self.db.commit()
            return response
        except Exception:
            await self.db.rollback()
            raise

    async def delete_view(self,user_id,identifier):
        try:
            await self.lock(user_id)
            await self.db.delete(await self.required_view(user_id,identifier))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
