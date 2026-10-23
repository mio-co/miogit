<img src="docs/logo.svg" width="64" alt="MioGit"/>

# MioGit

中文 | [English](README.en.md)

Mio 的私有 Git 托管，运行在 Cloudflare Workers 上，没有服务器、没有续费。

线上地址：https://miogit.300031.xyz

## 功能

- 标准 Git smart HTTP：`clone` / `fetch` / `push` / 浅克隆，直接用原生 git
- 三级访问令牌：管理员 / 写入 / 只读，每个助手一个令牌，可单独吊销
- main 与默认分支保护：写入令牌不能推送、强推或删除 main
- 管理员推送到一个不存在的名字就自动创建仓库
- 私有仓库：没有令牌看不到、也克隆不了
- 管理台 `/~mio/`：账号密码登录，管理令牌、仓库设置、修改密码、网页编辑文件；由 Cloudflare Access 保护，Worker 内再校验 Access JWT
- MioUI 界面：中 / EN 切换，浅色 / 跟随系统 / 深色，手机适配
- 首页按最近推送排序，可切换按名称；显示所有者、更新时间、主要语言
- 仓库概览：文件列表 + README，分支 / 标签数量，GitHub 风格语言占比条
- 提交、差异、日志、blame、统计、tar.gz / zip 快照、Atom 订阅

## 令牌与权限

git 用 HTTP Basic 认证：用户名任意（如 `x`），密码填令牌。

| 角色 | 读（含私有） | 推送 | 建仓库 | 管理 |
| --- | --- | --- | --- | --- |
| 管理员 admin | ✓ | 全部，包括 main、强推、删除、标签 | ✓ | ✓ |
| 写入 writer | ✓ | main 和默认分支以外的分支：新建、快进；只能删除 / 强推自己建的分支；不能推标签 | ✗ | ✗ |
| 只读 reader | ✓ | ✗ | ✗ | ✗ |

- `GIT_TOKEN`（原来的推送密码）和 `GIT_TOKENS` 一直是管理员令牌。
- 其他令牌在管理台 `/~mio/tokens` 新建（登录后右上角账户菜单或仓库列表页头「访问令牌」），明文只在创建时显示一次；服务器只保存 SHA-256 哈希。吊销立即生效。
- 新建令牌可选过期时间：7 天 / 30 天（默认）/ 90 天 / 1 年 / 永不过期。过期后任何 git / API 请求都返回 401（公开仓库也一样）；列表里标红「已过期」。过期功能上线前建的令牌一律视为永不过期。
- 一次推送里只要有一条引用被拒绝，整次推送都不生效（不会只推上一半）；被拒绝时 git 显示标准的 `! [remote rejected] … (原因)` 或 `remote error: …`。
- 令牌不能登录网页，网页登录的 cookie（只在 `/~mio/` 下有效）也不能用于 git。

```sh
git remote add origin https://miogit.300031.xyz/myrepo.git
git push -u origin main          # 管理员令牌：推送到新名字即建仓库
```

免费套餐下单次推送上限 100 MB，大仓库分几次推送。

## 管理台 `/~mio/`

所有管理功能都在 `/~mio/` 下：登录、访问令牌、仓库设置（描述 / 所有者 / 分组 / 私有）、修改密码、网页编辑器。仓库名不能以 `~ . _ -` 开头，所以这个目录永远不会和仓库重名。

- 登录：用户名 `ADMIN_USER`（默认 `mio`），密码以 PBKDF2-SHA256（10 万次、随机盐）哈希存在 `ADMIN_PASSWORD_HASH` secret 里；在管理台改过密码后，新哈希存在 Registry Durable Object 里并优先生效。
- 会话：签名 cookie，`HttpOnly; Secure; SameSite=Strict; Path=/~mio/`，12 小时过期；改密码会让所有会话失效。
- 登录失败按 IP 限速（15 分钟内 5 次）。所有修改操作都要 CSRF 令牌 + 同源检查。
- Cloudflare Access：一条 Access 应用保护 `miogit.300031.xyz/~mio/`；Worker 再按 `ACCESS_TEAM_DOMAIN` + `ACCESS_AUD` 校验 `Cf-Access-Jwt-Assertion` 签名，没配置或校验失败一律拒绝。git 路径和公开页面不经过 Access。

## 部署

```sh
npm install
npx wrangler r2 bucket create dgit-pack-cache   # 可选：包文件存 R2，克隆走缓存
npx wrangler deploy
npx wrangler secret put GIT_TOKEN              # 管理员 git 令牌
printf '%s' "$PASSWORD" | node scripts/hash-password.mjs | npx wrangler secret put ADMIN_PASSWORD_HASH
```

`wrangler.jsonc` 里的变量：

| 变量 | 作用 |
| --- | --- |
| `SITE_NAME` | 站点名，默认 `MioGit` |
| `SITE_OWNER` | 仓库默认所有者 |
| `CANONICAL_HOST` | 主域名，其他域名的网页访问会 301 跳过来 |
| `ADMIN_USER` | 管理台用户名，默认 `mio` |
| `ACCESS_TEAM_DOMAIN` | Cloudflare Access 团队域，如 `xxx.cloudflareaccess.com` |
| `ACCESS_AUD` | 保护 `/~mio/` 的 Access 应用的 AUD 标签 |

Worker 名保持 `git-cells`：Durable Object 数据绑定在这个名字上，改名会丢掉所有仓库。

## 测试

```sh
npm test            # 权限规则单元测试
npm run test:e2e    # 本地 wrangler dev 端到端：三级令牌、main 保护、管理台、Access、CSRF、吊销
```

## 代码结构

| 文件 | 内容 |
| --- | --- |
| `src/mod.ts` | 路由、git 鉴权、首页 |
| `src/policy.ts` | 三级权限规则（纯函数） |
| `src/auth.ts` | 令牌、PBKDF2 密码、会话、CSRF、Access JWT |
| `src/admin.ts` | 管理台 `/~mio/` |
| `src/repo.ts` | 仓库页面、推送（含逐条引用的权限检查）、语言统计 |
| `src/registry.ts` | 仓库列表与元数据、令牌表、登录限速 |
| `src/ui/html.ts` | 页面结构 |
| `src/ui/mio.ts` | MioUI 样式与前端脚本 |
| `src/ui/langs.ts` | 语言识别与颜色 |

接口文档见 [docs/api.md](docs/api.md)。

## 致谢

基于 [durable-git (dgit)](https://github.com/littledivy/durable-git) v0.0.8，MIT 许可证，原作者 Divy Srivastava。
