<img src="docs/logo.svg" width="64" alt="MioHub"/>

# MioHub

[中文](README.md) | English

Mio's private Git hosting on Cloudflare Workers. No server, nothing to renew.

Live: https://miohub.300031.xyz

## Features

- Standard Git smart HTTP: `clone` / `fetch` / `push` / shallow clones with stock git
- Pushing to a name that doesn't exist creates the repository
- Private repositories: hidden when signed out, cloning needs the password; sign in on the web at `/login` with the push password, optionally remembered for 30 days
- MioUI interface: 中 / EN switch, light / system / dark, mobile-friendly
- Home page sorted by latest push, or by name; shows owner, last update and main language
- Repository overview: file list + README, branch / tag counts, GitHub-style language bar
- Commits, diffs, log, blame, stats, tar.gz / zip snapshots, Atom feeds

## Usage

Any username (e.g. `x`); the password is the push password.

```sh
# create and push
git remote add origin https://miohub.300031.xyz/myrepo.git
git push -u origin main

# make it private (new repos are public; you can also set this before the first push)
curl -X PUT -u x:PASSWORD -d '{"private":true,"description":"One-line summary"}' \
  https://miohub.300031.xyz/myrepo/config

# delete a repository (permanent)
curl -X DELETE -u x:PASSWORD https://miohub.300031.xyz/myrepo
```

On the Workers free plan a single push is capped at 100 MB; push large histories in several steps.

## Deploy

```sh
npm install
npx wrangler r2 bucket create dgit-pack-cache   # optional: packs in R2, cached clones
npx wrangler deploy
npx wrangler secret put GIT_TOKEN              # the push password
```

Variables in `wrangler.jsonc`:

| Variable | Purpose |
| --- | --- |
| `SITE_NAME` | Site name, defaults to `MioHub` |
| `SITE_OWNER` | Default repository owner |
| `CANONICAL_HOST` | Main domain; browser visits on other hosts get a 301 here |

Changing `GIT_TOKEN` signs out every web session.

## Code map

| File | Contents |
| --- | --- |
| `src/mod.ts` | Routing, auth, web sign-in, home page |
| `src/repo.ts` | Repository pages, language stats |
| `src/registry.ts` | Repository list and metadata |
| `src/ui/html.ts` | Page layout |
| `src/ui/mio.ts` | MioUI styles and client script |
| `src/ui/langs.ts` | Language detection and colors |

API reference: [docs/api.md](docs/api.md).

## Credits

Built on [durable-git (dgit)](https://github.com/littledivy/durable-git) v0.0.8, MIT License, by Divy Srivastava.
