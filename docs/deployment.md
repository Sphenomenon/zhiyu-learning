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

如使用 GitHub `production` Environment，也可在该环境中配置对应值。令牌只存入 Secret，不要贴进源码、工作流正文、Issue 或聊天。

## 发布时会执行什么

1. 检查 main 分支和配置是否齐全，构建并运行部署配置、后端及界面测试。
2. 核验目标 Pages 项目、生产分支、D1 与 R2 资源。若发现正在替换既有生产数据库/图片桶，或已有不同的正式登录配置，则停止。
3. 在 GitHub 临时工作目录生成真实资源配置，应用远端 D1 迁移。
4. 勾选 `seed_public_demo` 时，只用 `INSERT OR IGNORE` 补充缺少的公开首页、课程和案例；已有内容保持原样。不会上传本机学员、密钥、会话、小节正文或图片。
5. 用锁文件指定的 Wrangler 发布静态资源和 Functions，随后检查生产健康接口、公开首页数据以及匿名访问后台被拒绝。

首次空库应保留 `seed_public_demo` 勾选，否则没有首页内容。之后可以取消勾选。

## 当前上线范围

此版本的 `AUTH_MODE` 在线上固定为 `disabled`：公开首页、课程和案例可以发布，正式登录、学员兑换以及后台登录仍需要接入真实身份供应商后开放。不会把仅供 loopback 使用的本机验证码登录搬到公网。

上传成功而健康检查失败时，Actions 会标为失败，应先检查 Pages 最近部署及 Functions 日志；不要将文件上传成功当作业务验收完成。站点代码可在 Cloudflare 回滚到先前部署，数据库结构变更则需要单独检查兼容性。
