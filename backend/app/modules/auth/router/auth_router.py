from fastapi import (
    APIRouter,
    HTTPException,
    Response,
    status,
)

from app.modules.auth.cookie import (
    clear_auth_cookies,
    set_auth_cookies,
)
from app.modules.auth.dependencies import (
    AuthServiceDep,
    CsrfProtectedSession,
    CurrentUser,
)
from app.modules.auth.exceptions import (
    InvalidCredentialsError,
)
from app.modules.auth.schemas import (

    CurrentUserResponse,
    LoginRequest,
)


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post(
    "/login",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def login(
    payload: LoginRequest,
    response: Response,
    auth_service: AuthServiceDep,
) -> None:
    try:
        result = await auth_service.login(
            email=payload.email,
            password=payload.password,
        )
    except InvalidCredentialsError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        ) from None

    set_auth_cookies(
        response,
        result,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout(
    response: Response,
    auth: CsrfProtectedSession,
    auth_service: AuthServiceDep
) -> None:
    await auth_service.logout(auth)

    clear_auth_cookies(response)


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def logout_all(
    response: Response,
    auth: CsrfProtectedSession,
    auth_service: AuthServiceDep,
) -> None:
    await auth_service.logout_all(
        auth.user,
    )

    clear_auth_cookies(response)


@router.get(
    "/me",
    response_model=CurrentUserResponse,
)
async def get_me(
    user: CurrentUser,
) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        is_superuser=user.is_superuser,
        is_verified=user.is_verified,
    )
