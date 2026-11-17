from fastapi import FastAPI

from app.modules.auth.router.auth_router import router as auth_router
from app.modules.wallet.router.wallet_router import router as wallet_router
from app.modules.category.router.category_router import router as category_router
from app.modules.transaction.router.transaction_router import router as transaction_router
from app.modules.recurrence.router import router as recurrence_router
from app.modules.wallet.overview import router as wallet_overview_router

from app.modules.recurrence.worker import lifespan

from app.modules.budget.router import router as budget_router

app = FastAPI(lifespan=lifespan)
app.include_router(budget_router)

app.include_router(recurrence_router)
app.include_router(auth_router)
app.include_router(wallet_overview_router)
app.include_router(wallet_router)
app.include_router(category_router)
app.include_router(transaction_router)

