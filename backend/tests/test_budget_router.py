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
from app.modules.budget.schemas import BudgetResponse, BudgetCollection, BudgetViewResponse
from main import app


class BudgetRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service=AsyncMock()
        self.user,self.category,self.wallet,self.budget_id=[uuid4() for _ in range(4)]
        self.payload=dict(name='Courses',category_id=str(self.category),wallet_ids=[str(self.wallet)],date_from='2026-01-01',date_to='2026-01-31',period_type='month',amount='1000.01')
        app.dependency_overrides[get_budget_service]=lambda:self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session]=lambda:SimpleNamespace(user=SimpleNamespace(id=self.user),session=SimpleNamespace(csrf_token_hash=hash_secret('csrf')))

    async def request(self, method, path='/budgets', payload=None, query=b'', csrf=False):
        messages=[]
        body=json.dumps(payload).encode() if payload is not None else b''
        headers=[(b'content-type',b'application/json')]
        if csrf: headers.append((settings.auth_csrf_header_name.lower().encode(),b'csrf'))
        async def receive(): return {'type':'http.request','body':body,'more_body':False}
        async def send(message): messages.append(message)
        await app({'type':'http','asgi':{'version':'3.0'},'http_version':'1.1','method':method,'scheme':'http','path':path,'raw_path':path.encode(),'query_string':query,'root_path':'','headers':headers,'client':('127.0.0.1',1),'server':('localhost',8000)},receive,send)
        status=next(message['status'] for message in messages if message['type']=='http.response.start')
        content=b''.join(message.get('body',b'') for message in messages if message['type']=='http.response.body')
        return status,json.loads(content) if content else None

    async def test_reads_require_auth_and_mutations_require_csrf(self):
        status,_=await self.request('GET',query=b'date_from=2026-01-01&date_to=2026-01-31')
        self.assertEqual(status,401)
        self.authenticate()
        for method,path,payload in [('POST','/budgets',self.payload),('PATCH',f'/budgets/{self.budget_id}',self.payload),('DELETE',f'/budgets/{self.budget_id}',None),('POST','/budgets/views',{'name':'Ma vue','preset':'daily','config':{'period_types':['month']}})]:
            status,_=await self.request(method,path,payload)
            self.assertEqual(status,403)
        self.service.save.assert_not_awaited()
        self.service.save_view.assert_not_awaited()

    async def test_create_uses_owner_from_session_and_preserves_cents(self):
        self.authenticate()
        self.service.save.return_value=BudgetResponse(**self.payload,id=self.budget_id)
        status,data=await self.request('POST',payload=self.payload,csrf=True)
        self.assertEqual(status,201)
        self.assertEqual(data['amount'],'1000.01')
        self.assertEqual(self.service.save.await_args.args[0],self.user)
        self.assertEqual(self.service.save.await_args.args[1].wallet_ids,[self.wallet])

    async def test_month_validation_and_mass_assignment(self):
        self.authenticate()
        status,_=await self.request('GET',query=b'date_from=2026-02-01&date_to=2026-01-01')
        self.assertEqual(status,422)
        status,_=await self.request('POST',payload={**self.payload,'user_id':str(uuid4())},csrf=True)
        self.assertEqual(status,422)
        self.service.save.assert_not_awaited()

    async def test_list_routes_month_to_service(self):
        self.authenticate()
        self.service.list.return_value=BudgetCollection(as_of=date(2026,1,15),items=[])
        status,data=await self.request('GET',query=b'date_from=2026-01-01&date_to=2026-01-31')
        self.assertEqual(status,200)
        self.assertEqual(set(data),{'as_of','items'})
        self.service.list.assert_awaited_once_with(self.user,date(2026,1,1),date(2026,1,31))

    async def test_saved_view_endpoint_uses_session_owner_and_preserves_configuration(self):
        self.authenticate()
        payload={'name':'Mon bilan familial','preset':'review','config':{'period_types':['year'],'wallet_ids':[str(self.wallet)],'widgets':['progress','trend']},'is_default':True}
        self.service.save_view.return_value=BudgetViewResponse(**payload,id=uuid4())
        status,data=await self.request('POST','/budgets/views',payload,csrf=True)
        self.assertEqual(status,201)
        self.assertEqual(data['config']['widgets'],['progress','trend'])
        self.assertEqual(self.service.save_view.await_args.args[0],self.user)
        self.service.save.assert_not_awaited()
        self.service.views.return_value=[self.service.save_view.return_value]
        status,data=await self.request('GET','/budgets/views')
        self.assertEqual(status,200)
        self.assertEqual(data[0]['name'],payload['name'])
        self.service.views.assert_awaited_once_with(self.user)

    async def test_management_reads_require_authentication(self):
        for path in ['/budgets/definitions',f'/budgets/{self.budget_id}']:
            status,_=await self.request('GET',path)
            self.assertEqual(status,401)
        self.service.definitions.assert_not_awaited()
        self.service.required.assert_not_awaited()

    async def test_definitions_route_is_paginated_and_uses_session_owner(self):
        self.authenticate()
        self.service.definitions.return_value={'items':[BudgetResponse(**self.payload,id=self.budget_id)],'pagination':{'page':2,'page_size':20,'total':21,'total_pages':2}}
        status,data=await self.request('GET','/budgets/definitions',query=b'page=2&page_size=20')
        self.assertEqual(status,200)
        self.assertEqual(data['pagination']['page'],2)
        self.assertNotIn('spent',data['items'][0])
        self.assertEqual(self.service.definitions.await_args.args[0],self.user)
        self.assertEqual(self.service.definitions.await_args.args[1].offset,20)
        self.service.list.assert_not_awaited()
        status,_=await self.request('GET','/budgets/definitions',query=b'page=0')
        self.assertEqual(status,422)

    async def test_single_definition_is_owned_and_handles_missing_goal(self):
        from fastapi import HTTPException
        self.authenticate()
        self.service.required.return_value=BudgetResponse(**self.payload,id=self.budget_id)
        status,data=await self.request('GET',f'/budgets/{self.budget_id}')
        self.assertEqual(status,200)
        self.assertEqual(data['id'],str(self.budget_id))
        self.service.required.assert_awaited_once_with(self.user,self.budget_id)
        self.service.required.side_effect=HTTPException(404,'Objectif introuvable.')
        status,_=await self.request('GET',f'/budgets/{uuid4()}')
        self.assertEqual(status,404)

    async def test_period_history_is_owned_and_update_scope_is_explicit(self):
        self.authenticate()
        self.service.history.return_value=BudgetCollection(as_of=date(2026,1,15),items=[])
        status,_=await self.request('GET',f'/budgets/{self.budget_id}/history',query=b'count=12')
        self.assertEqual(status,200)
        self.service.history.assert_awaited_once_with(self.user,self.budget_id,12)
        status,_=await self.request('GET',f'/budgets/{self.budget_id}/history',query=b'count=10000')
        self.assertEqual(status,422)
        self.service.save.return_value=BudgetResponse(**self.payload,id=self.budget_id)
        status,_=await self.request('PATCH',f'/budgets/{self.budget_id}',payload=self.payload,query=b'scope=following',csrf=True)
        self.assertEqual(status,200)
        self.assertEqual(self.service.save.await_args.args[-1],'following')
        status,_=await self.request('PATCH',f'/budgets/{self.budget_id}',payload=self.payload,query=b'scope=unknown',csrf=True)
        self.assertEqual(status,422)
