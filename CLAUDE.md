# DailyDefense

This folder is dedicated to a project the user wants Claude to build.

## Rules

1. **Project root**: Only store files inside the `DailyDefense` project folder. Treat this directory as the root of the project — do not scatter files outside of it.
2. **Commit & push on version change**: Always make a git commit and push after any version change.
3. **Versioning**: Use `MAJOR.MINOR.PATCH` (semantic versioning). Bump the version per feature or bugfix.
4. **Changelog**: Maintain a changelog per major version. Changelog files live in the `docs/` folder.
5. **Containerization**: Use Docker Compose for running the project.
6. **Language**: Use Python.
7. **Application port**: The application listens on port `8014`.
8. **Authentication**: Use Google SSO for authentication.
9. **Environment file**: Store SSO credentials and other configuration variables in an environment file (`.env`). The `.env` file must be gitignored; commit a `.env.example` template instead.
10. **GitHub-ready**: Structure the project so it is ready to be uploaded to GitHub (include `.gitignore`, `README.md`, license, etc.).
11. **GitHub Container Registry-ready**: The project must be ready to be published to the GitHub Container Registry (GHCR) — include a working `Dockerfile` and appropriate workflow/labels.
12. **Start app after version updates**: After every version update (and the commit/push from rule 2), start the application via `docker compose up --build -d` so the running container reflects the new version.
13. **Google SSO toggle**: Google SSO is gated behind the `AUTH_ENABLED` environment variable. It is **disabled by default** for now. Keep the SSO code in place so it can be re-enabled by setting `AUTH_ENABLED=true`.
