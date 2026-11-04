import json
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.core.config import settings
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.core.security import hash_secret
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.wallet.dependencies import get_wallet_service
from app.modules.wallet.exceptions import WalletNotFoundError
from app.modules.wallet.schemas import WalletResponse
from main import app


class WalletRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = AsyncMock()
        self.user_id = uuid4()
        self.wallet = WalletResponse(id=uuid4(), name="Courant", balance=Decimal("12.34"), created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        app.dependency_overrides[get_wallet_service] = lambda: self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(
            user=SimpleNamespace(id=self.user_id),
            session=SimpleNamespace(csrf_token_hash=hash_secret("test-csrf")),
        )

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

    async def test_unauthenticated_list_is_rejected(self):
        status, _ = await self.request("GET", "/wallets")
        self.assertEqual(status, 401)
        self.service.list_for_user.assert_not_awaited()

    async def test_create_requires_csrf(self):
        self.authenticate()
        status, _ = await self.request("POST", "/wallets", {"name": "Courant"})
        self.assertEqual(status, 403)
        self.service.create.assert_not_awaited()

    async def test_create_sets_owner_from_session_and_serializes_decimal(self):
        self.authenticate()
        self.service.create.return_value = self.wallet
        status, data = await self.request("POST", "/wallets", {"name": "Courant", "balance": "12.34"}, csrf=True)
        self.assertEqual(status, 201)
        self.assertEqual(data["balance"], "12.34")
        self.assertEqual(self.service.create.call_args.kwargs["user_id"], self.user_id)

    async def test_list_uses_page_query_parameters(self):
        self.authenticate()
        self.service.list_for_user.return_value = PagePaginatedResponse[WalletResponse](items=[self.wallet], pagination=PagePaginationMeta(page=2, page_size=10, total=11, total_pages=2))
        status, data = await self.request("GET", "/wallets", query=b"page=2&page_size=10")
        self.assertEqual(status, 200)
        self.assertEqual(data["pagination"]["total_pages"], 2)
        params = self.service.list_for_user.call_args.kwargs["pagination"]
        self.assertEqual((params.page, params.page_size), (2, 10))

    async def test_patch_missing_or_foreign_wallet_returns_404(self):
        self.authenticate()
        self.service.update.side_effect = WalletNotFoundError()
        status, _ = await self.request("PATCH", f"/wallets/{uuid4()}", {"name": "Épargne"}, csrf=True)
        self.assertEqual(status, 404)

    async def test_invalid_page_is_rejected(self):
        self.authenticate()
        status, _ = await self.request("GET", "/wallets", query=b"page=0")
        self.assertEqual(status, 422)
        self.service.list_for_user.assert_not_awaited()

    async def test_delete_requires_csrf(self):
        self.authenticate()
        status, _ = await self.request("DELETE", f"/wallets/{self.wallet.id}")
        self.assertEqual(status, 403)
        self.service.delete.assert_not_awaited()

    async def test_delete_returns_empty_response_and_uses_session_owner(self):
        self.authenticate()
        status, data = await self.request("DELETE", f"/wallets/{self.wallet.id}", csrf=True)
        self.assertEqual(status, 204)
        self.assertIsNone(data)
        self.service.delete.assert_awaited_once_with(wallet_id=self.wallet.id, user_id=self.user_id)

    async def test_delete_foreign_wallet_returns_404(self):
        self.authenticate()
        self.service.delete.side_effect = WalletNotFoundError()
        status, _ = await self.request("DELETE", f"/wallets/{self.wallet.id}", csrf=True)
        self.assertEqual(status, 404)
