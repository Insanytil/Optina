import json
import unittest
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.core.config import settings
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.core.security import hash_secret
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.transaction.dependencies import get_transaction_service
from app.modules.transaction.exceptions import TransactionNotFoundError
from app.modules.transaction.schemas import TransactionResponse
from main import app


class TransactionRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = AsyncMock()
        self.user_id, self.wallet_id, self.category_id = uuid4(), uuid4(), uuid4()
        self.transaction = TransactionResponse(id=uuid4(), wallet_id=self.wallet_id, category_id=self.category_id,
            type="expense", kind="standard", amount=Decimal("12.34"), date=date.today(), label="Courses", note=None,
            created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        app.dependency_overrides[get_transaction_service] = lambda: self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(user=SimpleNamespace(id=self.user_id),
            session=SimpleNamespace(csrf_token_hash=hash_secret("test-csrf")))

    def payload(self):
        return dict(wallet_id=str(self.wallet_id), category_id=str(self.category_id), type="expense", amount="12.34", date=date.today().isoformat(), label="Courses")

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

    async def test_unauthenticated_read_is_rejected(self):
        status, _ = await self.request("GET", "/transactions")
        self.assertEqual(status, 401)

    async def test_every_mutation_requires_csrf(self):
        self.authenticate()
        for method, path, payload in [("POST", "/transactions", self.payload()), ("PATCH", f"/transactions/{self.transaction.id}", self.payload()), ("DELETE", f"/transactions/{self.transaction.id}", None)]:
            with self.subTest(method=method):
                status, _ = await self.request(method, path, payload)
                self.assertEqual(status, 403)
        self.service.create.assert_not_awaited()
        self.service.update.assert_not_awaited()
        self.service.delete.assert_not_awaited()

    async def test_create_uses_session_owner_and_exact_decimal(self):
        self.authenticate()
        self.service.create.return_value = self.transaction
        status, data = await self.request("POST", "/transactions", self.payload(), csrf=True)
        self.assertEqual(status, 201)
        self.assertEqual(data["amount"], "12.34")
        self.assertEqual(self.service.create.call_args.kwargs["user_id"], self.user_id)

    async def test_filters_are_parsed_from_query_parameters(self):
        self.authenticate()
        self.service.list_for_user.return_value = PagePaginatedResponse[TransactionResponse](items=[self.transaction], pagination=PagePaginationMeta(page=2, page_size=10, total=11, total_pages=2))
        status, _ = await self.request("GET", "/transactions", query=f"page=2&page_size=10&wallet_id={self.wallet_id}&category_id={self.category_id}&type=expense&kind=standard&include_subcategories=false".encode())
        self.assertEqual(status, 200)
        params = self.service.list_for_user.call_args.kwargs["params"]
        self.assertEqual(params.page, 2)
        self.assertEqual(params.wallet_id, self.wallet_id)
        self.assertFalse(params.include_subcategories)
        self.assertEqual(params.kind, "standard")

    async def test_foreign_movement_returns_not_found(self):
        self.authenticate()
        self.service.get_by_id.side_effect = TransactionNotFoundError()
        status, _ = await self.request("GET", f"/transactions/{uuid4()}")
        self.assertEqual(status, 404)

    async def test_delete_returns_empty_204(self):
        self.authenticate()
        status, data = await self.request("DELETE", f"/transactions/{self.transaction.id}", csrf=True)
        self.assertEqual(status, 204)
        self.assertIsNone(data)

    async def test_opening_cannot_be_created_through_regular_endpoint(self):
        self.authenticate()
        payload = self.payload()
        payload["kind"] = "opening_balance"
        status, _ = await self.request("POST", "/transactions", payload, csrf=True)
        self.assertEqual(status, 422)
        self.service.create.assert_not_awaited()
