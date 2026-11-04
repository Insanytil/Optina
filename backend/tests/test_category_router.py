import json
import unittest
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.core.config import settings
from app.core.pagination import PagePaginatedResponse, PagePaginationMeta
from app.core.security import hash_secret
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.category.dependencies import get_category_service
from app.modules.category.exceptions import CategoryHierarchyError, CategoryNotFoundError
from app.modules.category.schemas import CategoryResponse
from main import app


class CategoryRouterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = AsyncMock()
        self.user_id = uuid4()
        self.category = CategoryResponse(id=uuid4(), name="Transport", parent_id=None, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        app.dependency_overrides[get_category_service] = lambda: self.service

    def tearDown(self):
        app.dependency_overrides.clear()

    def authenticate(self):
        app.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(
            user=SimpleNamespace(id=self.user_id), session=SimpleNamespace(csrf_token_hash=hash_secret("test-csrf")),
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

    async def test_unauthenticated_request_is_rejected(self):
        status, _ = await self.request("GET", "/categories")
        self.assertEqual(status, 401)
        self.service.list_for_user.assert_not_awaited()

    async def test_mutations_require_csrf(self):
        self.authenticate()
        for method, path, payload in [("POST", "/categories", {"name": "X"}), ("PATCH", f"/categories/{self.category.id}", {"name": "X"}), ("DELETE", f"/categories/{self.category.id}", None)]:
            with self.subTest(method=method):
                status, _ = await self.request(method, path, payload)
                self.assertEqual(status, 403)
        self.service.create.assert_not_awaited()
        self.service.update.assert_not_awaited()
        self.service.delete.assert_not_awaited()

    async def test_create_uses_session_owner(self):
        self.authenticate()
        self.service.create.return_value = self.category
        status, data = await self.request("POST", "/categories", {"name": "Transport"}, csrf=True)
        self.assertEqual(status, 201)
        self.assertEqual(data["name"], "Transport")
        self.assertEqual(self.service.create.call_args.kwargs["user_id"], self.user_id)

    async def test_parent_and_page_are_query_parameters(self):
        self.authenticate()
        self.service.list_for_user.return_value = PagePaginatedResponse[CategoryResponse](items=[], pagination=PagePaginationMeta(page=2, page_size=10, total=0, total_pages=0))
        parent_id = uuid4()
        status, _ = await self.request("GET", "/categories", query=f"page=2&page_size=10&parent_id={parent_id}".encode())
        self.assertEqual(status, 200)
        args = self.service.list_for_user.call_args.kwargs
        self.assertEqual(args["parent_id"], parent_id)
        self.assertEqual((args["pagination"].page, args["pagination"].page_size), (2, 10))

    async def test_cycle_returns_actionable_conflict(self):
        self.authenticate()
        self.service.update.side_effect = CategoryHierarchyError("Déplacement impossible.")
        status, data = await self.request("PATCH", f"/categories/{self.category.id}", {"name": "X", "parent_id": str(self.category.id)}, csrf=True)
        self.assertEqual(status, 409)
        self.assertEqual(data["detail"], "Déplacement impossible.")

    async def test_foreign_category_is_not_found(self):
        self.authenticate()
        self.service.get_by_id.side_effect = CategoryNotFoundError()
        status, _ = await self.request("GET", f"/categories/{uuid4()}")
        self.assertEqual(status, 404)

    async def test_delete_leaf_returns_empty_204(self):
        self.authenticate()
        status, data = await self.request("DELETE", f"/categories/{self.category.id}", csrf=True)
        self.assertEqual(status, 204)
        self.assertIsNone(data)

    async def test_invalid_page_is_rejected(self):
        self.authenticate()
        status, _ = await self.request("GET", "/categories", query=b"page=0")
        self.assertEqual(status, 422)
        self.service.list_for_user.assert_not_awaited()

    async def test_move_requires_csrf(self):
        self.authenticate()
        status, _ = await self.request("POST", f"/categories/{self.category.id}/move", {"parent_id": None})
        self.assertEqual(status, 403)
        self.service.move.assert_not_awaited()

    async def test_tree_is_owner_scoped_and_does_not_match_uuid_route(self):
        self.authenticate()
        self.service.tree.return_value = [self.category]
        status, data = await self.request("GET", "/categories/tree")
        self.assertEqual(status, 200)
        self.assertEqual(data[0]["id"], str(self.category.id))
        self.service.tree.assert_awaited_once_with(user_id=self.user_id)

    async def test_move_uses_session_owner_and_reports_conflicts(self):
        self.authenticate()
        self.service.move.return_value = self.category
        status, _ = await self.request("POST", f"/categories/{self.category.id}/move", {"parent_id": None}, csrf=True)
        self.assertEqual(status, 200)
        self.assertEqual(self.service.move.call_args.kwargs["user_id"], self.user_id)
        self.service.move.side_effect = CategoryHierarchyError("Déplacement impossible.")
        status, _ = await self.request("POST", f"/categories/{self.category.id}/move", {"parent_id": None}, csrf=True)
        self.assertEqual(status, 409)
