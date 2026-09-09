# 从 GitHub 发布到 Cloudflare Pages

部署入口：GitHub → Actions → **Deploy to Cloudflare Pages** → Run workflow，选择 `main`。

该流程手动执行，发布到现有 `https://zhiyu-learning.pages.dev`。普通 push 仍只触发构建与测试。GitHub Pages 的静态托管无法运行本项目的 Pages Functions、D1 权限接口和私有图片接口，因此这里使用 GitHub Actions 上传到 Cloudflare Pages。

## 首次配置

在拥有现有 Pages 项目的 Cloudflare 账号中准备：

- Pages 项目 `zhiyu-learning`，production branch 为 `main`。
- 正式 D1 数据库。使用独立数据库，不导入 `.wrangler/` 中的本机账号或演示课程。
- 私有 R2 桶，默认名称 `zhiyu-course-images`。不要启用公共访问。若账号尚未开通 R2，应先由账号持有人检查所需服务与费用；工作流不会自动开通或购买服务。
- 仅限定该 Cloudflare 账号的专用 API Token，允许 Cloudflare Pages Edit、D1 Edit，以及用于检查桶的 Workers R2 Storage Read。后续图片读写由 Pages 绑定完成。不要使用 Global API Key，也不要复制本机 OAuth 会话到 GitHub。

在仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 值 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 专用部署 API Token |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |
| Variable | `CLOUDFLARE_D1_DATABASE_ID` | 正式数据库 UUID |
| Variable，可选 | `CLOUDFLARE_R2_BUCKET` | 私有桶名，默认 `zhiyu-course-images` |
| Variable，可选 | `AUTH_MODE` | 默认 `disabled`；真实微信登录准备就绪后设置为 `wechat` |
| Variable，微信模式必填 | `WECHAT_APP_ID` | 有参数二维码接口权限的公众号 AppID |
| Variable，微信模式必填 | `WECHAT_SERVER_URL` | `https://正式域名/api/auth/wechat/events` |

如使用 GitHub `production` Environment，也可在该环境中配置对应值。令牌只存入 Secret，不要贴进源码、工作流正文、Issue 或聊天。

微信模式还需在 **Cloudflare Pages 项目的 production 环境**单独配置三个加密 Secret：`WECHAT_APP_SECRET`、`WECHAT_WEBHOOK_TOKEN`、`WECHAT_ENCODING_AES_KEY`。它们不进入 GitHub Variables、生成的 `wrangler.jsonc`、前端 `VITE_*` 或构建产物。准备具备参数二维码权限的认证服务号和正式 HTTPS 服务器地址，在公众号消息与事件推送中选安全模式 XML；完整步骤及管理员初始化见 [微信公众号登录](wechat-login.md)。用户目前公众号尚不满足该接口条件且没有正式域名，因此代码接入完成不代表微信扫码已经上线。

微信 `stable_token` 接口也要求调用 IP 白名单。当前 Pages Functions 没有配置专属固定出口，直接 `fetch` 不能以站点域名的 IP 代替出口 IP；生产账号若要求白名单，需先增加有固定公网出口且经过认证的微信接口服务，再修改本站适配层。此通道尚未实现，详见 [微信接口 IP 白名单与 Cloudflare 出口](wechat-login.md#微信接口-ip-白名单与-cloudflare-出口)。不要通过放宽 Cloudflare 共享 IP 大段白名单处理。健康接口通过也不能证明微信上游可用。

## 发布时会执行什么

1. 检查 main 分支和配置是否齐全，构建并运行部署配置、后端及界面测试。
2. 核验目标 Pages 项目、生产分支、D1 与 R2 资源。若发现正在替换既有生产数据库/图片桶，或登录配置不兼容，则停止；微信模式还检查生产加密 Secret 和已有 AppID，拒绝悄然更换公众号身份范围。
3. 在 GitHub 临时工作目录生成真实资源配置，应用远端 D1 迁移。
4. 勾选 `seed_public_demo` 时，只用 `INSERT OR IGNORE` 补充缺少的公开首页、课程和案例；已有内容保持原样。不会上传本机学员、密钥、会话、小节正文或图片。
5. 用锁文件指定的 Wrangler 发布静态资源和 Functions，随后检查生产健康接口、公开首页数据以及匿名访问后台被拒绝。微信模式还在配置的正式域名检查身份模式；这些探测不替代真实二维码生成、公众号回调和手机扫码验收。

首次空库应保留 `seed_public_demo` 勾选，否则没有首页内容。之后可以取消勾选。

## 当前上线范围

默认 `AUTH_MODE=disabled`，可先发布公开首页、课程和案例。显式启用 `wechat` 并完成公众号、HTTPS 回调、密钥和正式资源配置后，可开放微信扫码登录、兑换及后台会话；所有微信新用户默认学员，首位管理员需由运维核实具体站内用户 ID 后提升、撤销旧会话并重新登录。生产环境不支持 `local` 测试登录。

微信登录只在 `WECHAT_SERVER_URL` 的 HTTPS origin 生效，生产密钥不应配置给任意预览环境。改变回调服务器地址需同步更新公众号后台并重新部署；变更前生成的二维码可能失效，应重新生成。更换 AppID 会改变微信身份范围，不属于普通配置调整。本方案无需网页授权域名。

启用公众号服务器配置会影响原后台自动回复和自定义菜单。部署前核对现有公众号消息服务；不要把文件上传成功当作已安全接管公众号功能。

上传成功而健康检查失败时，Actions 会标为失败，应先检查 Pages 最近部署及 Functions 日志；不要将文件上传成功当作业务验收完成。站点代码可在 Cloudflare 回滚到先前部署，数据库结构变更则需要单独检查兼容性。
