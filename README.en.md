<img src="docs/logo.svg" width="64" alt="MioGit"/>

# MioGit

[中文](README.md) | English

Mio's private Git hosting on Cloudflare Workers. No server, nothing to renew.

Live: https://miogit.300031.xyz

## Features

- Standard Git smart HTTP: `clone` / `fetch` / `push` / shallow clones with stock git
- Three-tier access tokens — admin / writer / reader — one per assistant, individually revocable
- main / default-branch protection: writer tokens cannot push, force-push or delete main
- An admin pushing to a name that doesn't exist creates the repository
- Private repositories: hidden and unclonable without a token
- Console at `/~mio/`: username + password sign-in, token management, repository settings, password change, web editor; behind Cloudflare Access, with the Access JWT re-verified in the Worker
- MioUI interface: 中 / EN switch, light / system / dark, mobile-friendly
- Home page sorted by latest push, or by name; shows owner, last update and main language
- Repository overview: file list + README, branch / tag counts, GitHub-style language bar
- Commits, diffs, log, blame, stats, tar.gz / zip snapshots, Atom feeds

## Tokens and roles

git uses HTTP Basic: any username (e.g. `x`), the token as the password.

| Role | Read (incl. private) | Push | Create repos | Manage |
| --- | --- | --- | --- | --- |
| admin | ✓ | everything, incl. main, force, delete, tags | ✓ | ✓ |
| writer | ✓ | branches other than main / the default branch: create, fast-forward; delete or force-push only branches it created; no tags | ✗ | ✗ |
| reader | ✓ | ✗ | ✗ | ✗ |

- `GIT_TOKEN` (the original push password) and `GIT_TOKENS` are always admin.
- Other tokens are created in the console (`/~mio/tokens`); the secret is shown once, only its SHA-256 is stored. Revocation is immediate.
- If any ref in a push is refused, the whole push is refused (never half-applied); git shows the standard `! [remote rejected] … (reason)` or `remote error: …`.
- Tokens cannot sign in to the web console, and the console cookie (scoped to `/~mio/`) is never a git credential.

```sh
git remote add origin https://miogit.300031.xyz/myrepo.git
git push -u origin main          # admin token: pushing to a new name creates it
```

On the Workers free plan a single push is capped at 100 MB; push large histories in several steps.

## Console `/~mio/`

Everything administrative lives under `/~mio/`: sign-in, access tokens, repository settings (description / owner / section / private), password change and the web editor. Repository names cannot start with `~ . _ -`, so the directory can never collide with a repository.

- Sign-in: username `ADMIN_USER` (default `mio`); the password is a PBKDF2-SHA256 hash (100k iterations, random salt) in the `ADMIN_PASSWORD_HASH` secret. After a password change in the console the new hash lives in the Registry Durable Object and takes precedence.
- Session: signed cookie, `HttpOnly; Secure; SameSite=Strict; Path=/~mio/`, 12 h; a password change ends every session.
- Failed sign-ins are rate limited per IP (5 per 15 min). Every state change needs a CSRF token and a same-origin request.
- Cloudflare Access: a single Access application on `miogit.300031.xyz/~mio/`; the Worker also verifies `Cf-Access-Jwt-Assertion` against `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` and refuses when unset or invalid. git paths and public pages never go through Access.

## Deploy

```sh
npm install
npx wrangler r2 bucket create dgit-pack-cache   # optional: packs in R2, cached clones
npx wrangler deploy
npx wrangler secret put GIT_TOKEN              # admin git token
printf '%s' "$PASSWORD" | node scripts/hash-password.mjs | npx wrangler secret put ADMIN_PASSWORD_HASH
```

Variables in `wrangler.jsonc`:

| Variable | Purpose |
| --- | --- |
| `SITE_NAME` | Site name, defaults to `MioGit` |
| `SITE_OWNER` | Default repository owner |
| `CANONICAL_HOST` | Main domain; browser visits on other hosts get a 301 here |
| `ADMIN_USER` | Console username, default `mio` |
| `ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain, e.g. `xxx.cloudflareaccess.com` |
| `ACCESS_AUD` | AUD tag of the Access application protecting `/~mio/` |

The Worker keeps the script name `git-cells`: Durable Object data is bound to it, and renaming would orphan every repository.

## Tests

```sh
npm test            # access-policy unit tests
npm run test:e2e    # local wrangler dev end-to-end: tokens, main protection, console, Access, CSRF, revocation
```

## Code map

| File | Contents |
| --- | --- |
| `src/mod.ts` | Routing, git auth, home page |
| `src/policy.ts` | Three-tier access rules (pure functions) |
| `src/auth.ts` | Tokens, PBKDF2 passwords, sessions, CSRF, Access JWT |
| `src/admin.ts` | The `/~mio/` console |
| `src/repo.ts` | Repository pages, push (with per-ref policy), language stats |
| `src/registry.ts` | Repository list and metadata, token table, login throttle |
| `src/ui/html.ts` | Page layout |
| `src/ui/mio.ts` | MioUI styles and client script |
| `src/ui/langs.ts` | Language detection and colors |

API reference: [docs/api.md](docs/api.md).

## Credits

Built on [durable-git (dgit)](https://github.com/littledivy/durable-git) v0.0.8, MIT License, by Divy Srivastava.
