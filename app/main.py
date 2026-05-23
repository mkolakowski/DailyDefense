from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import __version__
from app.auth import router as auth_router
from app.config import get_settings
from app.routes.game import router as game_router
from app.routes.health import router as health_router

settings = get_settings()

app = FastAPI(title=settings.app_name, version=__version__)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(game_router)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.environment == "development",
    )
