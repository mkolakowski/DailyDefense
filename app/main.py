from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.auth import router as auth_router
from app.config import get_settings
from app.routes.health import router as health_router

settings = get_settings()

app = FastAPI(title=settings.app_name, version=__version__)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

app.include_router(health_router)
app.include_router(auth_router)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> str:
    user = request.session.get("user")
    if user:
        return f"<h1>DailyDefense</h1><p>Signed in as {user.get('email')}</p><a href='/auth/logout'>Logout</a>"
    return "<h1>DailyDefense</h1><a href='/auth/login'>Sign in with Google</a>"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.environment == "development",
    )
