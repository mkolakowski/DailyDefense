from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
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


@app.middleware("http")
async def cache_control(request: Request, call_next):
    """Cache-bust strategy: long-immutable static assets, revalidated HTML.

    Static assets are versioned via `?v=<APP_VERSION>` in the rendered index,
    so a new release always yields new URLs. Combined with `immutable`,
    Cloudflare and the browser can cache them effectively forever without ever
    serving stale content.
    """
    response: Response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path == "/":
        response.headers["Cache-Control"] = "no-cache"
    elif path.startswith("/api/") or path == "/health":
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(game_router)

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@lru_cache(maxsize=1)
def _rendered_index() -> str:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return html.replace("{{VERSION}}", __version__)


@app.get("/", include_in_schema=False)
async def index() -> HTMLResponse:
    return HTMLResponse(content=_rendered_index())


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "icon-32.png", media_type="image/png")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.environment == "development",
    )
