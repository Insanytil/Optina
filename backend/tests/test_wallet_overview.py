import json
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.modules.wallet.overview import overview, WalletOverviewParams
from app.modules.wallet.schemas import WalletPeriod
from app.modules.auth.dependencies import get_authenticated_session
from app.db.session import get_async_session
from main import app


def result(rows):
    value = Mock()
    value.mappings.return_value.all.return_value = rows
    return value


class OverviewTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = AsyncMock(spec=AsyncSession)
        self.user,self.a,self.b,self.category = [uuid4() for _ in range(4)]
        self.rows = [dict(id=self.a,name='Compte',balance=Decimal('100.01'),income=Decimal('50.01'),expenses=Decimal('30.00')),
            dict(id=self.b,name='Espèces',balance=Decimal('-10.02'),income=Decimal('5.00'),expenses=Decimal('20.02'))]
        self.period = WalletPeriod(date_from=date(2026,1,1),date_to=date(2026,12,31))

    async def test_exact_totals_and_category_grouping_without_duplicate_wallets(self):
        self.db.execute.side_effect = [result(self.rows),result([dict(id=self.category,name='Alimentation',income=Decimal('0'),expenses=Decimal('50.02'))])]
        data = await overview(self.db,self.user,[self.a,self.b,self.a],self.period)
        self.assertEqual(data.balance,Decimal('89.99'))
        self.assertEqual(data.income,Decimal('55.01'))
        self.assertEqual(data.expenses,Decimal('50.02'))
        self.assertEqual(data.net,Decimal('4.99'))
        self.assertEqual(len(data.wallets),2)
        self.assertEqual(data.categories[0].net,Decimal('-50.02'))

    async def test_foreign_or_missing_wallet_rejects_entire_selection(self):
        self.db.execute.return_value = result(self.rows[:1])
        with self.assertRaises(HTTPException) as error:
            await overview(self.db,self.user,[self.a,self.b],self.period)
        self.assertEqual(error.exception.status_code,404)
        self.assertEqual(self.db.execute.await_count,1)

    async def test_query_parameter_model_flattens_wallets_and_dates(self):
        self.db.execute.side_effect = [result(self.rows),result([])]
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(user=SimpleNamespace(id=self.user))
        app.dependency_overrides[get_async_session] = lambda: self.db
        messages=[]
        async def receive(): return {'type':'http.request','body':b'','more_body':False}
        async def send(message): messages.append(message)
        query=f'wallet_ids={self.a}&wallet_ids={self.b}&date_from=2026-01-01&date_to=2026-12-31'.encode()
        try:
            await app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':'GET','scheme':'http','path':'/wallets/overview','raw_path':b'/wallets/overview','query_string':query,'root_path':'','headers':[],'client':('127.0.0.1',1),'server':('localhost',8000)},receive,send)
        finally:
            app.dependency_overrides.clear()
        self.assertEqual(next(m['status'] for m in messages if m['type']=='http.response.start'),200)
        body=json.loads(b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body'))
        self.assertEqual(body['date_from'],'2026-01-01')
        self.assertEqual(body['date_to'],'2026-12-31')
        self.assertEqual(body['balance'],'89.99')
