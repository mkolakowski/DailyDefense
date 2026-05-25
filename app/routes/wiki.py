"""In-app wiki: renders the Markdown files in `docs/` as HTML pages.

Two routes:
- `GET /wiki`          → index page (list of docs + link to the GitHub repo)
- `GET /wiki/{slug}`   → renders `docs/{slug}.md`

Only `.md` files that resolve inside the `docs/` directory are served, and
slugs are restricted to a safe character set, so the route cannot be coaxed
into reading arbitrary files on disk.
"""

from __future__ import annotations

import re
from functools import lru_cache
from html import escape
from pathlib import Path

import markdown
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app import __version__

GITHUB_URL = "https://github.com/mkolakowski/DailyDefense"

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"

# Slugs map 1:1 to filenames without the .md suffix.
_SLUG_RE = re.compile(r"^[A-Za-z0-9._-]+$")

_MD_EXTENSIONS = ["extra", "sane_lists", "toc"]

router = APIRouter(tags=["wiki"])


def _doc_paths() -> list[Path]:
    """All Markdown files in `docs/`, sorted alphabetically."""
    if not DOCS_DIR.is_dir():
        return []
    return sorted(p for p in DOCS_DIR.glob("*.md") if p.is_file())


def _first_heading(path: Path) -> str:
    """Return the first H1 in a Markdown file, or the filename stem as fallback."""
    try:
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("# "):
                    return line[2:].strip()
    except OSError:
        pass
    return path.stem


def _safe_doc_path(slug: str) -> Path:
    """Resolve `slug` to a Markdown file inside `docs/` or raise 404."""
    if not _SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Not found")
    candidate = (DOCS_DIR / f"{slug}.md").resolve()
    try:
        candidate.relative_to(DOCS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Not found")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return candidate


def _page(title: str, body_html: str, *, show_back: bool = False) -> str:
    back_link = (
        '<p class="wiki-back"><a href="/wiki">← Wiki home</a></p>'
        if show_back
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0b1020" />
<title>{escape(title)} — DailyDefense Wiki</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500&display=swap" />
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg?v={__version__}" />
<link rel="stylesheet" href="/static/wiki.css?v={__version__}" />
</head>
<body>
<header class="wiki-hud">
  <a href="/" class="wiki-home-link">← DailyDefense</a>
  <span class="wiki-version" title="App version">v{__version__}</span>
</header>
<main class="wiki-main">
  {back_link}
  {body_html}
</main>
<footer class="wiki-footer">
  <a href="{GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
  <span>·</span>
  <a href="/wiki">Wiki</a>
  <span>·</span>
  <a href="/">App</a>
</footer>
</body>
</html>
"""


@lru_cache(maxsize=1)
def _index_html() -> str:
    items: list[str] = []
    for path in _doc_paths():
        slug = path.stem
        title = _first_heading(path)
        items.append(
            f'<li><a href="/wiki/{escape(slug)}">{escape(title)}</a> '
            f'<span class="wiki-slug">{escape(path.name)}</span></li>'
        )
    if not items:
        items.append("<li><em>No documents found in <code>docs/</code>.</em></li>")
    body = f"""
<h1>DailyDefense Wiki</h1>
<p>Project documentation, rendered from the Markdown files in
<code>docs/</code>. Every release ships its changelog here.</p>

<h2>Documents</h2>
<ul class="wiki-doc-list">
{"".join(items)}
</ul>

<h2>Project</h2>
<p>Source code, issues, and releases:
<a href="{GITHUB_URL}" target="_blank" rel="noopener">{escape(GITHUB_URL)}</a>.</p>
"""
    return _page("Wiki", body)


@router.get("/wiki", include_in_schema=False, response_class=HTMLResponse)
async def wiki_index() -> HTMLResponse:
    return HTMLResponse(content=_index_html())


@router.get("/wiki/{slug}", include_in_schema=False, response_class=HTMLResponse)
async def wiki_page(slug: str) -> HTMLResponse:
    path = _safe_doc_path(slug)
    md_text = path.read_text(encoding="utf-8")
    body_html = markdown.markdown(md_text, extensions=_MD_EXTENSIONS)
    title = _first_heading(path)
    return HTMLResponse(
        content=_page(title, f'<article class="wiki-article">{body_html}</article>',
                      show_back=True)
    )
