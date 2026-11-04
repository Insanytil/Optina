import unittest

from pydantic import ValidationError

from app.core.pagination import (
    CursorPaginatedResponse,
    CursorPaginationParams,
    PagePaginatedResponse,
    PagePaginationMeta,
    PagePaginationParams,
)


class PaginationTests(unittest.TestCase):
    def test_page_defaults_and_offset(self):
        params = PagePaginationParams()
        self.assertEqual((params.page, params.page_size, params.offset), (1, 20, 0))
        self.assertEqual(PagePaginationParams(page=3, page_size=10).offset, 20)

    def test_page_bounds(self):
        for params in [{"page": 0}, {"page_size": 0}, {"page_size": 101}]:
            with self.subTest(params=params), self.assertRaises(ValidationError):
                PagePaginationParams(**params)
        self.assertEqual(PagePaginationParams(page_size=100).page_size, 100)

    def test_cursor_defaults_and_bounds(self):
        params = CursorPaginationParams()
        self.assertIsNone(params.cursor)
        self.assertEqual(params.limit, 20)
        for limit in [0, 101]:
            with self.subTest(limit=limit), self.assertRaises(ValidationError):
                CursorPaginationParams(limit=limit)

    def test_generic_page_response_serialization(self):
        response = PagePaginatedResponse[str](
            items=["Courant"],
            pagination=PagePaginationMeta(page=1, page_size=20, total=1, total_pages=1),
        )
        self.assertEqual(response.model_dump(), {
            "items": ["Courant"],
            "pagination": {"page": 1, "page_size": 20, "total": 1, "total_pages": 1},
        })
        with self.assertRaises(ValidationError):
            PagePaginatedResponse[int](items=["invalid"], pagination=response.pagination)

    def test_generic_cursor_response_serialization(self):
        response = CursorPaginatedResponse[str](items=[], next_cursor=None, has_more=False)
        self.assertEqual(response.model_dump(), {"items": [], "next_cursor": None, "has_more": False})
        with self.assertRaises(ValidationError):
            CursorPaginatedResponse[int](items=["invalid"], next_cursor=None, has_more=False)
