import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
from app.core.config import settings
from app.core.security import hash_secret
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.recurrence.router import get_recurrence_service
from app.modules.recurrence.schemas import RecurrenceResponse
from main import app


class RecurrenceRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.user_id = uuid4()
        self.rule_id = uuid4()
        self.service = AsyncMock()
        self.values = dict(wallet_id=str(uuid4()),category_id=str(uuid4()),label='Salaire',type='income',amount='2500.01',frequency_unit='week',interval=4,start_date='2026-11-04')
        app.dependency_overrides[get_recurrence_service] = lambda: self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(user=SimpleNamespace(id=self.user_id),session=SimpleNamespace(csrf_token_hash=hash_secret('test-csrf')))

    async def request(self, method, path, payload=None, csrf=False, query=b""):
        messages = []
        body = json.dumps(payload).encode() if payload is not None else b""
        headers = [(b"content-type", b"application/json")]
        if csrf:
            headers.append((settings.auth_csrf_header_name.lower().encode(), b"test-csrf"))
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method, "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": query, "root_path": "", "headers": headers, "client": ("127.0.0.1", 1234), "server": ("localhost", 8000)}
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        async def send(message):
            messages.append(message)
        await app(scope, receive, send)
        status = next(message["status"] for message in messages if message["type"] == "http.response.start")
        data = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
        return status, json.loads(data) if data else None


    async def test_reads_require_session(self):
        status,_ = await self.request('GET','/recurrences')
        self.assertEqual(status,401)

    async def test_all_mutations_require_csrf(self):
        self.authenticate()
        for method,path,payload in [('POST','/recurrences',self.values),('PATCH',f'/recurrences/{self.rule_id}',self.values),('PATCH',f'/recurrences/{self.rule_id}/status',{'is_active':False}),('DELETE',f'/recurrences/{self.rule_id}',None)]:
            status,_ = await self.request(method,path,payload)
            self.assertEqual(status,403)
        self.service.save.assert_not_awaited()
        self.service.status.assert_not_awaited()

    async def test_four_week_rule_uses_session_owner_and_exact_amount(self):
        self.authenticate()
        self.service.save.return_value = RecurrenceResponse(**self.values,id=self.rule_id,next_date='2026-12-02',is_active=True,archived=False)
        status,data = await self.request('POST','/recurrences',self.values,csrf=True)
        self.assertEqual(status,201)
        self.assertEqual(data['amount'],'2500.01')
        owner,payload = self.service.save.await_args.args
        self.assertEqual(owner,self.user_id)
        self.assertEqual(payload.interval,4)
        self.assertEqual(payload.frequency_unit,'week')

    async def test_forecast_horizon_is_bounded(self):
        self.authenticate()
        for months in (0,13):
            status,_ = await self.request('GET','/recurrences/forecast',query=f"wallet_id={self.values['wallet_id']}&months={months}".encode())
            self.assertEqual(status,422)
        self.service.forecast.assert_not_awaited()

    async def test_client_cannot_inject_owner_or_cursor(self):
        self.authenticate()
        for key,value in [('user_id',str(uuid4())),('next_index',0)]:
            status,_ = await self.request('POST','/recurrences',{**self.values,key:value},csrf=True)
            self.assertEqual(status,422)

    async def test_rule_can_be_created_paused_without_scheduling_a_payment(self):
        self.authenticate()
        self.service.save.return_value = RecurrenceResponse(**self.values,id=self.rule_id,next_date='2026-11-04',is_active=False,archived=False)
        status,data=await self.request('POST','/recurrences',{**self.values,'is_active':False},csrf=True)
        self.assertEqual(status,201)
        self.assertFalse(data['is_active'])
        self.assertFalse(self.service.save.await_args.args[1].is_active)

    async def test_archived_rules_can_be_read_only_for_authenticated_owner(self):
        self.authenticate()
        self.service.repository.list_for_user.return_value=[]
        status,_=await self.request('GET','/recurrences',query=b'include_archived=true')
        self.assertEqual(status,200)
        self.service.repository.list_for_user.assert_awaited_once_with(self.user_id,None,include_archived=True)
