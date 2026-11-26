import json
import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
from app.core.config import settings
from app.core.security import hash_secret
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.budget.router import get_budget_service
from app.modules.budget.schemas import BudgetResponse, BudgetStatusList
from main import app


class BudgetRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = AsyncMock()
        self.user, self.category, self.wallet = uuid4(), uuid4(), uuid4()
        self.payload = dict(name='Courses', category_id=str(self.category), wallet_ids=[str(self.wallet)], frequency='month',
                            start_date='2026-11-12', amounts=[dict(effective_from='2026-11-12', amount='400.00')])
        app.dependency_overrides[get_budget_service] = lambda: self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(
            user=SimpleNamespace(id=self.user), session=SimpleNamespace(csrf_token_hash=hash_secret('csrf')))

    async def request(self, method, path='/budgets', payload=None, query=b'', csrf=False):
        messages = []
        body = json.dumps(payload).encode() if payload is not None else b''
        headers = [(b'content-type', b'application/json')]
        if csrf:
            headers.append((settings.auth_csrf_header_name.lower().encode(), b'csrf'))
        async def receive(): return {'type': 'http.request', 'body': body, 'more_body': False}
        async def send(message): messages.append(message)
        await app({'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1', 'method': method, 'scheme': 'http',
                   'path': path, 'raw_path': path.encode(), 'query_string': query, 'root_path': '', 'headers': headers,
                   'client': ('127.0.0.1', 1), 'server': ('localhost', 8000)}, receive, send)
        status = next(m['status'] for m in messages if m['type'] == 'http.response.start')
        content = b''.join(m.get('body', b'') for m in messages if m['type'] == 'http.response.body')
        return status, json.loads(content) if content else None

    async def test_requires_authentication(self):
        status, _ = await self.request('GET')
        self.assertEqual(status, 401)

    async def test_create_normalizes_and_uses_session_owner(self):
        self.authenticate()
        self.service.save.return_value = BudgetResponse(id=uuid4(), name='Courses', category_id=self.category, wallet_ids=[self.wallet],
            frequency='month', start_date=date(2026, 11, 1), end_date=None,
            amounts=[dict(effective_from=date(2026, 11, 1), amount='400.00')], carry_over=False, alert_threshold=80)
        status, body = await self.request('POST', payload=self.payload, csrf=True)
        self.assertEqual(status, 201, body)
        user_id, sent = self.service.save.await_args.args
        self.assertEqual(user_id, self.user)
        self.assertEqual(sent.start_date, date(2026, 11, 1))

    async def test_mutations_require_csrf(self):
        self.authenticate()
        status, _ = await self.request('POST', payload=self.payload)
        self.assertEqual(status, 403)
        self.service.save.assert_not_awaited()

    async def test_status_passes_month(self):
        self.authenticate()
        self.service.status.return_value = BudgetStatusList(as_of=date(2026, 11, 26), month=date(2026, 11, 1), items=[])
        status, body = await self.request('GET', '/budgets/status', query=b'month=2026-11-01')
        self.assertEqual(status, 200, body)
        self.assertEqual(self.service.status.await_args.args[1], date(2026, 11, 1))
