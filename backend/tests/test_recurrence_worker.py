import asyncio
import unittest
from contextlib import asynccontextmanager
from datetime import date
from unittest.mock import AsyncMock, patch
from app.modules.recurrence.worker import run_forever


@asynccontextmanager
async def session():
    yield object()


class DailyWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_sleeps_until_daily_boundary_without_minute_polling(self):
        with patch('app.modules.recurrence.worker.async_session_factory', session), patch(
            'app.modules.recurrence.worker.daily_window', AsyncMock(return_value=(date(2026,10,24),25*3600))), patch(
            'app.modules.recurrence.worker.run_once', AsyncMock()) as run, patch(
            'app.modules.recurrence.worker.asyncio.sleep', AsyncMock(side_effect=asyncio.CancelledError)) as sleep:
            with self.assertRaises(asyncio.CancelledError):
                await run_forever()
            run.assert_awaited_once()
            sleep.assert_awaited_once_with(25*3600)

    async def test_failure_retries_instead_of_waiting_until_tomorrow(self):
        with patch('app.modules.recurrence.worker.async_session_factory', session), patch(
            'app.modules.recurrence.worker.daily_window', AsyncMock(return_value=(date(2026,11,4),86400))), patch(
            'app.modules.recurrence.worker.run_once', AsyncMock(side_effect=RuntimeError('database unavailable'))), patch(
            'app.modules.recurrence.worker.logger'), patch(
            'app.modules.recurrence.worker.asyncio.sleep', AsyncMock(side_effect=asyncio.CancelledError)) as sleep:
            with self.assertRaises(asyncio.CancelledError):
                await run_forever()
            sleep.assert_awaited_once_with(300)
