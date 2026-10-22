<img src="docs/logo.svg" width="64" alt="MioHub"/>

# MioHub

中文 | [English](README.en.md)

Mio 的私有 Git 托管，运行在 Cloudflare Workers 上，没有服务器、没有续费。

线上地址：https://miohub.300031.xyz

## 功能

- 标准 Git smart HTTP：`clone` / `fetch` / `push` / 浅克隆，直接用原生 git
- 推送到一个不存在的名字就自动创建仓库
- 私有仓库：未登录看不到、克隆需要密码；网页 `/login` 用推送密码登录，可记住 30 天
- MioUI 界面：中 / EN 切换，浅色 / 跟随系统 / 深色，手机适配
- 首页按最近推送排序，可切换按名称；显示所有者、更新时间、主要语言
- 仓库概览：文件列表 + README，分支 / 标签数量，GitHub 风格语言占比条
- 提交、差异、日志、blame、统计、tar.gz / zip 快照、Atom 订阅

## 使用

用户名任意（如 `x`），密码是推送密码。

```sh
# 新建并推送
git remote add origin https://miohub.300031.xyz/myrepo.git
git push -u origin main

# 设为私有（新仓库默认公开；也可以在第一次推送前先设）
curl -X PUT -u x:密码 -d '{"private":true,"description":"一句话简介"}' \
  https://miohub.300031.xyz/myrepo/config

# 删除仓库（不可恢复）
curl -X DELETE -u x:密码 https://miohub.300031.xyz/myrepo
```

免费套餐下单次推送上限 100 MB，大仓库分几次推送。

## 部署

```sh
npm install
npx wrangler r2 bucket create dgit-pack-cache   # 可选：包文件存 R2，克隆走缓存
npx wrangler deploy
npx wrangler secret put GIT_TOKEN              # 推送密码
```

`wrangler.jsonc` 里的变量：

| 变量 | 作用 |
| --- | --- |
| `SITE_NAME` | 站点名，默认 `MioHub` |
| `SITE_OWNER` | 仓库默认所有者 |
| `CANONICAL_HOST` | 主域名，其他域名的网页访问会 301 跳过来 |

改了 `GIT_TOKEN` 会让所有网页登录失效。

## 代码结构

| 文件 | 内容 |
| --- | --- |
| `src/mod.ts` | 路由、鉴权、网页登录、首页 |
| `src/repo.ts` | 仓库页面、语言统计 |
| `src/registry.ts` | 仓库列表与元数据 |
| `src/ui/html.ts` | 页面结构 |
| `src/ui/mio.ts` | MioUI 样式与前端脚本 |
| `src/ui/langs.ts` | 语言识别与颜色 |

接口文档见 [docs/api.md](docs/api.md)。

## 致谢

基于 [durable-git (dgit)](https://github.com/littledivy/durable-git) v0.0.8，MIT 许可证，原作者 Divy Srivastava。
