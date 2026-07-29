# GitHub Pages Deployment

Clear Writer is published as a static site. The GitHub Actions workflow at
`.github/workflows/deploy.yml` runs the release gate and publishes `dist-web`
to GitHub Pages whenever `main` is updated.

## One-time repository setup

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. In **Settings → Environments → github-pages**, set any required production
   protection rules and configure the approved deployment URL if one exists.

## Staging an RC

GitHub Pages is currently configured for `main`, so a release-candidate branch
does not publish automatically. To test an RC publicly, use either a temporary
repository/environment or merge the reviewed RC into `main` only after all
checks and manual acceptance checks succeed.

Before promotion, run locally from a clean checkout:

```powershell
npm ci
npm run release:prep
```

The deployed artifact is `dist-web/`. The Vite configuration uses a relative
base path, so it supports deployment beneath a GitHub Pages project subpath as
well as at a domain root.

## Post-deployment checks

1. Open the deployed URL in a fresh browser profile.
2. Create, edit, close, and reopen a browser-backed project.
3. Open PDF preview and print/save a test PDF.
4. Install the PWA, refresh after the deployment, then confirm the latest
   version loads and the offline shell reopens.
5. Record the deployed URL and commit/tag in the release notes.
