from fastapi import FastAPI

from app.modules.auth.router.auth_router import router as auth_router

from app.modules.wallet.router.wallet_router import router as wallet_router

app = FastAPI()
app.include_router(auth_router)
app.include_router(wallet_router)


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}
