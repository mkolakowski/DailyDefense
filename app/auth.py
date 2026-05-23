from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.config import get_settings

settings = get_settings()

router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()

if settings.auth_enabled:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


def _ensure_enabled() -> None:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Authentication is disabled")


@router.get("/login")
async def login(request: Request):
    _ensure_enabled()
    return await oauth.google.authorize_redirect(request, settings.google_redirect_uri)


@router.get("/callback")
async def callback(request: Request):
    _ensure_enabled()
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"OAuth error: {exc}") from exc

    user = token.get("userinfo")
    if user is None:
        raise HTTPException(status_code=400, detail="No user info returned from Google")

    request.session["user"] = dict(user)
    return RedirectResponse(url="/")


@router.get("/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return RedirectResponse(url="/")
