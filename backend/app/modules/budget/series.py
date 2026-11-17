from sqlalchemy import select, delete
from app.models.budget import Budget, BudgetSeries, BudgetVersion, BudgetVersionWallet
from app.modules.budget.schemas import BudgetWrite
from app.modules.budget.schedule import periods, template_at


class BudgetSeriesManager:
    """Caller holds the owner's exclusive lock; periods are generated idempotently on demand."""
    def __init__(self, db, put):
        self.db, self.put = db, put

    async def version(self, series, payload):
        version = BudgetVersion(series_id=series.id,user_id=series.user_id,
            effective_from=payload.date_from,name=payload.name,category_id=payload.category_id,amount=payload.amount,
            wallet_links=[BudgetVersionWallet(user_id=series.user_id,wallet_id=identifier) for identifier in payload.wallet_ids])
        self.db.add(version)
        await self.db.flush()
        return version

    async def materialize(self, user_id, start, end, series_id=None):
        query = select(BudgetSeries).where(BudgetSeries.user_id==user_id,BudgetSeries.start_date<=end,
            (BudgetSeries.end_date.is_(None)) | (BudgetSeries.end_date>=start))
        if series_id is not None: query=query.where(BudgetSeries.id==series_id)
        series = (await self.db.scalars(query)).all()
        if not series: return
        requests=[(row,begin,finish) for row in series
            for begin,finish in periods(row.period_type,row.start_date,row.end_date,start,end)]
        await self.create_missing(user_id,requests)

    async def current(self,user_id,today):
        series=(await self.db.scalars(select(BudgetSeries).where(BudgetSeries.user_id==user_id))).all()
        requests=[]
        for row in series:
            anchor=max(row.start_date,min(today,row.end_date or today))
            requests.extend((row,begin,finish) for begin,finish in periods(row.period_type,row.start_date,row.end_date,anchor,anchor))
        await self.create_missing(user_id,requests)

    async def create_missing(self,user_id,requests):
        if not requests: return
        identifiers={row.id for row,_,_ in requests}
        starts={begin for _,begin,_ in requests}
        existing=set((await self.db.execute(select(Budget.series_id,Budget.date_from).where(
            Budget.user_id==user_id,Budget.series_id.in_(identifiers),Budget.date_from.in_(starts)))).all())
        missing=[(row,begin,finish) for row,begin,finish in requests if (row.id,begin) not in existing]
        if not missing: return
        versions=(await self.db.scalars(select(BudgetVersion).where(BudgetVersion.user_id==user_id,BudgetVersion.series_id.in_(identifiers)))).all()
        for row,begin,finish in missing:
            template=template_at([version for version in versions if version.series_id==row.id],begin)
            if template is None: raise RuntimeError('Budget series has no template for this period')
            payload=BudgetWrite(name=template.name,category_id=template.category_id,amount=template.amount,
                wallet_ids=template.wallet_ids,date_from=begin,date_to=finish,period_type=row.period_type)
            budget=await self.put(user_id,payload,validate_refs=False)
            budget.series_id,budget.series,budget.is_override=row.id,row,False
        await self.db.flush()

    async def replace_following(self, user_id, budget, payload):
        series=budget.series
        await self.db.execute(delete(BudgetVersion).where(BudgetVersion.user_id==user_id,
            BudgetVersion.series_id==series.id,BudgetVersion.effective_from>=budget.date_from))
        await self.version(series,payload)
        rows=(await self.db.scalars(select(Budget).where(Budget.user_id==user_id,Budget.series_id==series.id,
            Budget.date_from>=budget.date_from))).all()
        for row in rows:
            if payload.repeat_until is not None and row.date_to>payload.repeat_until:
                await self.db.delete(row)
            else:
                dated=payload.model_copy(update={'date_from':row.date_from,'date_to':row.date_to})
                await self.put(user_id,dated,row,validate_refs=False)
                row.is_override=False
        series.end_date=payload.repeat_until
        await self.db.flush()
