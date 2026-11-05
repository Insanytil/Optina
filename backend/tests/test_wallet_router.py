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

    async def test_summary_requires_authentication(self):
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/summary")
        self.assertEqual(status, 401)
        self.service.summary.assert_not_awaited()

    async def test_summary_parses_period_and_serializes_exact_money(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletSummaryResponse
        self.authenticate()
        self.service.summary.return_value = WalletSummaryResponse(wallet=self.wallet, date_from=date(2026, 1, 1),
            date_to=date(2026, 1, 31), income=Decimal("100.01"), expenses=Decimal("25.02"), net=Decimal("74.99"))
        status, data = await self.request("GET", f"/wallets/{self.wallet.id}/summary", query=b"date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(status, 200)
        self.assertEqual(data["income"], "100.01")
        self.assertEqual(data["net"], "74.99")
        args = self.service.summary.call_args.kwargs
        self.assertEqual(args["user_id"], self.user_id)
        self.assertEqual(args["wallet_id"], self.wallet.id)
        self.assertEqual(args["period"].date_from, date(2026, 1, 1))

    async def test_summary_invalid_period_returns_validation_error(self):
        self.authenticate()
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/summary", query=b"date_from=2026-02-01&date_to=2026-01-01")
        self.assertEqual(status, 422)
        self.service.summary.assert_not_awaited()

    async def test_summary_foreign_wallet_returns_not_found(self):
        self.authenticate()
        self.service.summary.side_effect = WalletNotFoundError()
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/summary")
        self.assertEqual(status, 404)

    async def test_analytics_requires_authentication(self):
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/analytics")
        self.assertEqual(status, 401)
        self.service.analytics.assert_not_awaited()

    async def test_analytics_returns_exact_amounts_and_uses_session_owner(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletAnalyticsResponse, ExpenseBucket
        self.authenticate()
        self.service.analytics.return_value = WalletAnalyticsResponse(expense_granularity="day",
            expenses_by_date=[ExpenseBucket(date=date(2026, 1, 1), amount=Decimal("12.34"))],
            expenses_by_category=[], monthly=[], top_expenses=[], activity=[], activity_from=date(2025, 11, 3), activity_to=date(2026, 1, 31))
        status, data = await self.request("GET", f"/wallets/{self.wallet.id}/analytics", query=b"date_from=2026-01-01&date_to=2026-01-31")
        self.assertEqual(status, 200)
        self.assertEqual(data["expenses_by_date"][0]["amount"], "12.34")
        self.assertEqual(self.service.analytics.call_args.kwargs["user_id"], self.user_id)

    async def test_analytics_missing_wallet_returns_not_found(self):
        self.authenticate()
        self.service.analytics.side_effect = WalletNotFoundError()
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/analytics")
        self.assertEqual(status, 404)

    async def test_category_breakdown_parses_category_and_period(self):
        from datetime import date
        from app.modules.wallet.schemas import WalletCategoryBreakdown
        self.authenticate()
        identifier = uuid4()
        self.service.category_breakdown.return_value = WalletCategoryBreakdown(path=[], items=[], direct_amount=Decimal("1.23"), total=Decimal("1.23"))
        status, data = await self.request("GET", f"/wallets/{self.wallet.id}/category-breakdown",
            query=f"category_id={identifier}&date_from=2026-01-01&date_to=2026-01-31".encode())
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], "1.23")
        kwargs = self.service.category_breakdown.call_args.kwargs
        self.assertEqual(kwargs["user_id"], self.user_id)
        self.assertEqual(kwargs["params"].category_id, identifier)
        self.assertEqual(kwargs["params"].date_from, date(2026, 1, 1))

    async def test_category_breakdown_requires_authentication(self):
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/category-breakdown")
        self.assertEqual(status, 401)
        self.service.category_breakdown.assert_not_awaited()

    async def test_category_breakdown_foreign_category_returns_not_found(self):
        from app.modules.category.exceptions import CategoryNotFoundError
        self.authenticate()
        self.service.category_breakdown.side_effect = CategoryNotFoundError()
        status, _ = await self.request("GET", f"/wallets/{self.wallet.id}/category-breakdown")
        self.assertEqual(status, 404)
