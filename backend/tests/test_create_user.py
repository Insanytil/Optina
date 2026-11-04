"""Account creation policy, without accessing a live database."""

import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi_users import exceptions
from fastapi_users.password import PasswordHelper
from fastapi_users.schemas import BaseUserCreate

from app.cli.create_user import AccountCreationError, create_user


class CreateUserTests(unittest.IsolatedAsyncioTestCase):
    def session(self, results):
        session = MagicMock()
        session.begin.return_value.__aenter__ = AsyncMock()
        session.begin.return_value.__aexit__ = AsyncMock(return_value=False)
        session.execute = AsyncMock()
        session.scalar = AsyncMock(side_effect=results)
        session.flush = AsyncMock()
        return session

    def payload(self, superuser=False, password="a-long-password-for-testing"):
        return BaseUserCreate(email="User@example.com", password=password, is_superuser=superuser)

    async def test_standard_account_is_verified_and_password_is_hashed(self):
        session = self.session([None])
        payload = self.payload()
        user = await create_user(session, payload)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_verified)
        self.assertTrue(user.is_active)
        self.assertEqual(user.email, "user@example.com")
        self.assertNotEqual(user.hashed_password, payload.password)
        self.assertTrue(PasswordHelper().verify_and_update(payload.password, user.hashed_password)[0])
        session.add.assert_called_once_with(user)
        self.assertIn("LOCK TABLE users", str(session.execute.call_args.args[0]))

    async def test_first_superuser_is_allowed(self):
        session = self.session([None, None])
        user = await create_user(session, self.payload(superuser=True))
        self.assertTrue(user.is_superuser)
        session.add.assert_called_once_with(user)

    async def test_existing_superuser_refuses_insertion(self):
        session = self.session([uuid4()])
        with self.assertRaisesRegex(AccountCreationError, "superutilisateur existe"):
            await create_user(session, self.payload(superuser=True))
        session.add.assert_not_called()
        session.flush.assert_not_awaited()

    async def test_duplicate_email_refuses_insertion(self):
        session = self.session([uuid4()])
        with self.assertRaisesRegex(AccountCreationError, "adresse email"):
            await create_user(session, self.payload())
        session.add.assert_not_called()

    async def test_short_password_refused_before_database_access(self):
        session = self.session([])
        with self.assertRaises(exceptions.InvalidPasswordException):
            await create_user(session, self.payload(password="short"))
        session.execute.assert_not_awaited()
        session.add.assert_not_called()
