# 后端方案与实施进度

状态：2026-09-09 已完成第一版本地联调后端，尚未新增远端数据库、短信账号或支付渠道，也未更新线上部署。正式登录和经营主体仍需确定。

## 本轮已实现

- Pages Functions + D1 本地运行、迁移、公开演示内容种子和前端代理。
- 本机测试身份、单次验证码、请求限频、HttpOnly 会话、服务端管理员权限和退出撤销。生产登录默认关闭，不能把测试邮箱模式作为真实认证。
- 一次性兑换码只存哈希；条件更新与数据库触发器原子开通课程，同账号重试不重复开通，也不能恢复已撤销的权限。
- 私有章节使用 `course_curricula` 保存草稿、发布快照与版本；公开接口只返回目录，正文与每小节可选视频仅对有课程权限的会话返回。
- 小节插图上传接入 `COURSE_IMAGES` 私有 R2，限制格式与大小；发布前仅管理员预览，发布后学员按课程权限读取。
- 旧版整课私有网盘资料独立存放；查询校验当前权限，不返回到公开课程对象，不缓存，记录领取时间与资料版本。
- 首页/讲师、课程、案例的双语编辑、草稿/发布/下架、乐观版本检查。前端不再读取 localStorage 作为业务数据。
- 人工权限调整、审计记录、人工确认收款与防重复提交；尚未对接支付平台。
- 学员、密钥和收款记录的服务端搜索分页，学员角色/密钥状态筛选，配套列表索引及手机后台两行导航。
- 构建、真实本地 Workers + D1 集成测试，以及 DOM 表单测试。详细运行步骤及剩余边界见 [本地开发说明](local-development.md)。

目前的公开内容存储使用 `content_entries` 的 `kind`、`draft_json`、`published_json` 和 `revision`，而不是下文长期数据设计中的独立翻译表。`courses` 提供稳定课程 ID 和外键关联。现有身份适配只处理 `local` 测试身份；微信 AppID 范围与身份绑定冲突将在正式供应商接入时补充，不视为已实现。

## 部署与成本

建议沿用 Cloudflare Pages 前台，使用 TypeScript 编写 Pages Functions `/api/*`，连接 D1 数据库。小节图片已接入 R2，正式部署需创建私有桶并绑定 `COURSE_IMAGES`；视频仅在需要的小节附百度网盘链接。

Node.js 用于本地开发和构建；Pages Functions 在线上运行于 Workers 环境，不是常驻 Node.js 服务器。服务端业务采用标准 Request/Response、Web Crypto 和明确的数据库边界，方便将来迁移到大陆 Node.js 服务。短信供应商若只有 Node SDK，需要验证运行时兼容性；优先调用其正式 HTTPS API。

截至 2026-09-09 查阅的 [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)：免费额度含每天 500 万行读取、10 万行写入和账号总计 5 GB 存储。行扫描会计入额度，业务查询要建索引。Functions 另受 [Workers 计费和额度](https://developers.cloudflare.com/workers/platform/pricing/)约束。额度内计算和数据库可以很低成本，独立域名、短信、对象存储和支付手续费单独计算，不能承诺总费用始终低于 300 元/年。

面向大陆学员，正式上线前测量目标网络下的访问和短信接口耗时，再决定是否换大陆服务。部署地域与账号资质不应在需求未定时提前购买。

## 数据边界

| 数据 | 用途与约束 |
| --- | --- |
| users | 内部稳定 user_id、显示名、状态、角色；首次注册不能自行指定管理员 |
| auth_identities | user_id、provider、provider_app_id、provider_subject，组合唯一；手机号、邮箱、微信分别绑定 |
| sessions | 随机会话令牌的哈希、有效期、撤销状态；浏览器使用 HttpOnly、Secure Cookie |
| verification_challenges | 验证目的、过期时间、尝试次数和使用状态；供应商代核验时不保存明文验证码 |
| courses / course_translations | 课程结构、封面、排序、发布状态、中文/英文内容；价格如启用使用整数分 |
| course_curricula | 课程下章节与小节的结构化 JSON，段落/标题/图片、每节可选影片、草稿与发布版、乐观版本检查 |
| COURSE_IMAGES (R2) | 按课程 ID/随机图片 ID 存储，仅通过受控 API 读取，不开放桶公网访问 |
| course_resources | 私有网盘 URL、提取码、资源版本；不混入公开课程对象 |
| entitlements | 用户、课程、有效期、来源、撤销状态；唯一用户课程组合或等价约束 |
| redemption_codes / code_courses | 高熵随机码的哈希、关联课程、有效期、兑换人、兑换时间 |
| orders / payments | 开通的业务凭据；人工收款也有记录。自动支付阶段保存幂等交易编号与回调状态 |
| site_content / case_studies | 草稿与已发布版本、语言、排序；公开接口只返回发布版 |
| audit_logs / resource_access_logs | 管理员改动与资料领取记录；不记录验证码、私有链接或会话明文 |

验证码登录、微信身份和订单都关联内部 user_id。换手机号、绑定微信或昵称变化不能改变课程归属。微信 OpenID 按 AppID 区分，UnionID 仅在满足平台条件时用于同一开放平台下的身份关联，不能假设始终存在。

## 拟定 API

| 区域 | 接口 | 权限 |
| --- | --- | --- |
| 公开内容 | GET /api/site、/api/courses、/api/cases | 公开，仅发布版 |
| 验证码 | POST /api/auth/code/request、/api/auth/code/verify | 服务端限频；核验后建立会话 |
| 账号 | GET /api/me；POST /api/auth/logout | 当前会话 |
| 账号绑定 | POST /api/me/identities/* | 已登录并验证新身份；敏感操作重新验证 |
| 已购课程 | GET /api/me/courses | 当前用户 |
| 兑换 | POST /api/redemptions | 已登录；原子核销和开通 |
| 课程目录 | GET /api/courses/:id/outline | 公开，仅已发布标题与小节编号，不含正文或链接 |
| 课程阅读 | GET /api/courses/:id/curriculum | 有效会话及课程权限，仅发布版 |
| 插图读取 | GET /api/courses/:id/images/:imageId | 管理员或有课程权限且图片在发布版中的学员 |
| 章节管理 | GET/PUT /api/admin/courses/:id/curriculum | 管理员，草稿/发布/暂停发布与并发版本检查 |
| 插图上传 | POST /api/admin/courses/:id/images | 管理员，原始图片请求体，JPG/PNG/WebP，最多 5 MiB |
| 旧版整课资料 | GET /api/courses/:id/resources | 有效会话与课程权限；Cache-Control: no-store |
| 内容管理 | GET /api/admin/content；PUT /api/admin/content/:kind/:id | 管理员；区分草稿保存与发布 |
| 权限管理 | /api/admin/entitlements、/redemption-codes | 管理员；审计记录 |
| 自动支付（后续） | /api/orders、/api/payments/:provider/notify | 订单归属检查，回调验签 |

最终路由及字段将在选择身份供应商后固化。API 不直接信任前端发送的角色、价格、购买成功标识或解锁列表。

## 实施顺序

1. 建立公开仓库，纳入源码、锁文件和构建检查，排除本机配置。
2. 确定登录、收款和权限模式；增加本地数据库迁移与服务端开发入口。
3. 接通主登录、会话、管理员初始化，替换当前演示身份。
4. 完成兑换、权限和资料查询，重点验证并发核销及越权请求。
5. 连接内容后台，支持双语草稿、发布、图片和案例管理；验证跨设备保存。
6. 按已确认的收款方式实现订单；自动支付需要商户审核通过后再联调。
7. 备份与恢复演练、错误告警、验证码预算限制和上线验证。

第一阶段重点测试身份绑定冲突、一次性验证码、并发兑换、权限撤销、管理员访问控制及私有资料不泄漏。没有站内播放就不采集虚构的观看时长。

## 仓库与现有 Pages

现有 `zhiyu-learning` 是 Direct Upload 项目。Cloudflare [官方说明](https://developers.cloudflare.com/pages/get-started/direct-upload/)指出它不能直接切换为原生 Git 集成；要用原生集成需另建项目。

可以保留现有项目和地址，今后通过 GitHub Actions 构建，再由 Wrangler 上传。当前工作流只做构建与自动化测试，不部署。启用自动部署时，应在 GitHub Secrets 保存专用最小权限令牌；不把本机 Wrangler OAuth 凭证复制进仓库。

## 需要站点运营者完成

| 事项 | 何时需要 | 运营者负责 |
| --- | --- | --- |
| GitHub 登录 | 创建公开仓库 | 登录账号、完成平台要求的验证码或双重验证 |
| 登录服务 | 选择供应商后 | 实名认证、开通服务、确认签名方案、充值及预算；API 密钥通过安全配置录入 |
| 独立域名 | 正式品牌上线及部分平台审核前 | 购买/持有域名、实名认证，确认最终归属 |
| 微信接入 | 要启用微信登录或绑定时 | 主体/应用申请、材料提交、平台认证；开发者配置回调与服务端密钥 |
| 支付 | 要站内自动收款时 | 支付商户申请、经营材料和本人/企业结算账户 |
| 备案与经营类目 | 选择大陆接入及正式经营前 | 根据主体、实际业务与接入商要求办理。个人备案不能默认用于经营性知识付费业务；有需要时核实许可/前置审批 |
| 数据与素材 | 对外正式销售前 | 提供真实课程、定价、联系信息、合法使用的素材、退款规则和案例展示授权 |

使用境外 Cloudflare 托管不等于微信应用或支付审核一定不需要备案，也不等于免除适用的经营要求。具体材料应在确定主体和渠道后核实，不提前断言所有知识付费网站都必须办理同一种许可证。
