# 微信公众号扫码登录

更新日期：2026-09-09。本站采用公众号**临时带参数二维码**：网站为每次登录生成专用二维码，用户用微信扫码，未关注者先关注，微信将扫码事件推送给本站，发起登录的原浏览器随后建立会话。只使用 AppID + OpenID 识别账号，不获取微信昵称、头像或手机号。

用户当前公众号是订阅号或尚未认证，已决定先完成参数二维码接入，之后准备有权限的公众号。当前还没有正式域名和生产凭证，本轮未部署，也未完成真实扫码验收。

## 权限与使用范围

微信官方“生成带参数的二维码”接口明确支持**已认证服务号**。现有订阅号或未认证账号不能直接视为具备此权限；后续需准备可调用该接口的账号，并在实际后台确认开发者权限。更换公众号 AppID 会改变 OpenID 身份范围，不能期待旧账号课程自动迁移。

普通静态关注二维码没有本站生成的唯一场景值，无法确认该给哪个电脑或浏览器登录；已经关注的用户再次扫描普通关注码也不能靠一次关注事件关联登录。因此不能用一张静态公众号二维码替换本功能的临时参数码。

本方案支持电脑网页展示二维码后用手机微信扫描。手机上可按微信实际支持的操作识别本站生成的码，登录完成仍需回到原网站浏览器。本版本不使用公众号 H5 OAuth、`snsapi_base` 或微信开放平台的网站应用登录接口，不要求用户提供个人资料。

扫码会把**发送该二维码的网页**登录为扫码者账号。使用时只扫描自己打开的知屿网站中的码，不替陌生网页或他人登录。

## 运营者需要准备

1. 准备具备“生成带参数的二维码”接口权限的公众号，核实认证、开发者权限和账号归属；取得该账号的 AppID 和 AppSecret。
2. 准备正式域名并绑定到本站 Cloudflare Pages，等待 HTTPS 证书生效。回调服务器须能从公网访问 `https://正式域名/api/auth/wechat/events`，使用 443 端口。
3. 准备正式 D1 数据库、私有 R2 桶和部署凭证，详见[部署说明](deployment.md)。不将本机假身份、会话或 `.wrangler/state` 导入生产库。
4. 在微信开发者平台的“我的业务 → 服务号 → 消息与事件推送”配置服务器 URL、Token、EncodingAESKey，选择**安全模式**及 **XML** 数据格式。不同账号的菜单名称可能调整，以实际后台为准。
5. Token 与 EncodingAESKey 必须和本站的加密 Secret 一致。AppSecret、Token、EncodingAESKey 由账号持有人直接录入云端配置，无需发送到聊天。

这里配置的是“消息与事件推送”的公网服务器 URL，**不需要配置“网页授权域名”或 OAuth 回调域名校验文件**。`localhost`、`127.0.0.1` 不能接收微信公网回调；随机预览网址也不应作为正式配置。可以先完成代码、自动化检查和静态页面检查，再准备稳定的正式 HTTPS 地址。

启用服务器配置会把公众号消息转发到该地址。微信官方说明原后台自动回复和自定义菜单会受到影响，配置提交后立即生效；上线前先核对公众号是否已有机器人、第三方服务、自动回复或菜单。本次不会自动替换真实公众号配置。

## 配置与部署

| 配置 | 放置位置 | 值 |
| --- | --- | --- |
| `AUTH_MODE` | GitHub Actions Variable | 准备就绪后设为 `wechat`；默认 `disabled` |
| `WECHAT_APP_ID` | GitHub Actions Variable | 具备参数二维码接口权限的公众号 AppID |
| `WECHAT_SERVER_URL` | GitHub Actions Variable | `https://正式域名/api/auth/wechat/events` |
| `WECHAT_APP_SECRET` | Cloudflare Pages production 加密 Secret | 公众号 AppSecret，用于服务器获取接口凭证和二维码 |
| `WECHAT_WEBHOOK_TOKEN` | Cloudflare Pages production 加密 Secret | 与微信消息推送设置中的 Token 完全一致 |
| `WECHAT_ENCODING_AES_KEY` | Cloudflare Pages production 加密 Secret | 与微信消息推送设置中的 43 字符 EncodingAESKey 完全一致 |
| `DB` / `COURSE_IMAGES` | Pages D1 / R2 绑定 | 独立生产数据库和私有图片桶 |

三个密钥都不能放进 Git、`wrangler.jsonc` 的 `vars`、GitHub Variables、前端 `VITE_*`、构建产物或日志。生产密钥只配置给生产环境，不分发给任意预览部署。

先创建并绑定云端资源、录入加密 Secret，再设置三个非敏感 Actions 变量并发布。应用仓库中的全部 D1 迁移，包括 `0005_wechat_login.sql`；正式数据库先备份并确认迁移目标。上线后，在公众号后台提交消息推送设置，完成 GET 验签校验，再进行真实微信扫码验收。二维码生成还受下述微信接口 IP 白名单限制，不能因公共页面或回调地址可访问就认定接口已可用。

二维码接口所需的短期 `access_token` 由服务器获取，并缓存在 D1 的 `wechat_api_tokens` 中供后续生成二维码复用，不能返回客户端或公开数据库导出。AppSecret、Token 和 AES Key 仍只在云端加密配置中，不写入 D1。

本站只在 `AUTH_MODE=wechat`、配置完整、服务器 URL 为正式 HTTPS 地址且当前请求与其同源时开放微信登录。网站若有多个域名，应引导用户打开配置的正式主机名。密钥更新、服务器域名变更或微信配置调整后，重新部署并验收。

## 微信接口 IP 白名单与 Cloudflare 出口

本站调用 `POST https://api.weixin.qq.com/cgi-bin/stable_token` 获取接口凭证。微信官方错误码明确列出 `40164 invalid ip not in whitelist`，因此改用稳定版 token 并不绕过 IP 白名单要求。该地址的调用出口应与公众号后台白名单一致；还可能需要公众号管理员确认新的调用 IP。

当前 Pages Functions 直接向微信 API 发起 `fetch`，项目没有配置专属固定出口。Cloudflare Workers 在分布式网络执行，不能把网站 DNS 解析地址、接收回调的域名 IP，或某一次请求观察到的出口 IP 当作本站稳定的专属出口。现有代码在要求固定 IP 白名单的生产账号上，仍需解决出口问题后才能完成真实二维码生成验收；只配置上述环境变量不等于已满足此条件。

上线前可增加由运营者控制、具有专属固定公网出口的微信接口服务，后续步骤为：

1. 由运营者选择并准备具有固定出口 IP 的服务器或云网络，将准确的专属出口 IP 加入公众号白名单。
2. 为本站增加经过服务间认证的 HTTPS 接口调用通道，只允许获取微信接口凭证、生成本站登录二维码等明确操作；限制目标主机、参数、频率和超时，不能做可任意转发 URL 的公共代理。
3. 根据最终托管边界把 AppSecret 安全存于该服务，调整本站微信 API 适配层及缓存归属；事件回调可继续由现有 Pages 接收，但仍须校验安全模式签名和 AppID。
4. 在正式账号实测获取 token、生成二维码、接收事件及原浏览器登录，并验证出口变化/凭证错误时能够安全失败。

该固定出口服务与调用通道**尚未实现或部署**，本轮未购买服务。不要通过放行 Cloudflare 共享 IP 大网段、使用无关第三方代理或关闭白名单来代替专属出口方案。

## 登录与身份规则

网站以同源请求开始登录，生成 **180 秒有效**、与原浏览器绑定的随机场景二维码。微信服务器回调只确认对应场景的 OpenID；只有发起请求的原浏览器可以领取本站会话。单凭二维码场景值、OpenID 或回调 URL 不能在另一浏览器领取会话。

| 请求 | 用途 |
| --- | --- |
| `POST /api/auth/wechat/qr/start` | 为登录或绑定生成临时参数二维码 |
| `POST /api/auth/wechat/qr/poll` | 原浏览器检查扫码结果并领取会话或完成绑定 |
| `GET /api/auth/wechat/events` | 公众号服务器 URL 的签名校验与回显 |
| `POST /api/auth/wechat/events` | 接收已验签和解密的安全模式扫码/关注事件 |

服务器接收未关注用户的 `subscribe` 事件时，从 `EventKey` 去掉 `qrscene_` 前缀取得场景；接收已关注用户的 `SCAN` 事件时，直接读取场景。普通关注、取消关注、菜单或其他消息不会完成一次扫码登录。服务器先验证安全模式签名、解密、核对 AppID，再处理场景；第一个有效扫码身份不能被后续扫码覆盖，微信重试、重复扫码和并发领取不会重复开通账号或转移课程。

微信身份按 **AppID + OpenID** 唯一归属本站 `user_id`。首次登录始终创建普通学员，后续同一微信回到原账号。课程、密钥、收款保持归属于本站账号，不使用 UnionID、昵称或手机号自动合并。

已有账号可明确发起绑定未占用的微信；原账号会话要在发起与完成绑定时都有效。微信已归其他账号所有时返回冲突，不迁移付费课程。同一账号在同一 AppID 下只绑定一个微信身份。自助解绑、账号合并、手机号登录和账号找回尚未开放。

## 首位生产管理员

所有微信新用户默认都是 `student`。不要使用首位注册者、微信昵称、客户端角色或本机测试邮箱自动初始化生产管理员。

1. 由运营者本人扫码登录，创建自己的普通学员账号。
2. 运维通过受信渠道核实确为运营者本人，并核对精确的站内 `user_id`，可从本人会话的 `/api/me` 响应获取。不能只凭最早注册或显示名相似判断。
3. 在 Cloudflare 正式 D1 控制台先查该账号，再将以下占位符替换为核验后的 ID 并执行：

```sql
SELECT id, display_name, role, status FROM users WHERE id = '已核验的站内用户ID';
UPDATE users SET role = 'admin'
WHERE id = '已核验的站内用户ID' AND role = 'student' AND status = 'active';
DELETE FROM sessions WHERE user_id = '已核验的站内用户ID';
SELECT id, role, status FROM users WHERE id = '已核验的站内用户ID';
```

删除该账号旧会话后，运营者重新扫码登录，获得管理员的 8 小时会话；不能沿用原学员的 7 天会话。保留运维操作记录，确认只提升了指定账号，其他学员仍不能进入后台。本过程不移动微信身份、课程、密钥或订单。

## 验收与排障

先运行 `pnpm build` 和 `pnpm test`。自动化使用测试公众号数据与签名，仅验证本站逻辑，不能证明真实账号权限、微信平台配置、外网回调或实际手机行为正常。

真实配置完成后验收：

1. 微信后台服务器地址验证成功，安全模式 XML 消息能到达正式接口。
2. 未关注用户扫码并关注后，原电脑网页登录；已关注用户扫码后也能登录。其他浏览器不应自动获得会话。
3. 退出后再次扫描新码，应进入同一账号且课程不变；所有新用户均是学员。
4. 二维码过期或失效时提示重新生成；重复事件、旧场景、篡改签名、错误 AppID、重复领取和换浏览器均不能绕过验证。
5. 已有账号绑定未占用微信成功；绑定已占用身份时有冲突提示，双方课程不变。
6. 运维核验的管理员重新登录后能进后台，普通学员仍被拒绝；真机检查中英文与手机布局。

| 现象 | 检查方向 |
| --- | --- |
| 页面提示微信登录尚未配置 | `AUTH_MODE`、AppID、三个生产加密 Secret、服务器 URL、当前域名与最近部署 |
| 无法生成二维码 | 公众号是否已认证服务号且有接口权限、AppSecret、基础接口凭证、IP 白名单与接口限额 |
| 公众号服务器地址验证失败 | URL 的公网 HTTPS 443 可达性、GET 校验响应、Token、时间戳与代理/WAF规则 |
| 扫码或关注后网站没有登录 | 是否是本站生成的临时参数码、事件是否投递到当前服务器、安全模式与 AES Key、场景是否过期、原浏览器 Cookie 是否保留 |
| 二维码已过期 | 从原网站重新生成二维码，不重复使用截图或旧码 |
| 登录后没有原课程 | 是否仍用同一 AppID 和站内账号；不要通过自动合并或重绑他人身份修复 |

排查只记录必要的时间和错误码，不保存或公开 AppSecret、Token、AES Key、接口 access_token、Cookie、原始扫码事件、完整 OpenID 或登录二维码内容。后续运营还需落实账号找回、注销、数据保留和公众号已有消息功能的衔接。

## 已核查的官方资料

2026-09-09 实际读取并核查：

- [生成带参数的二维码](https://developers.weixin.qq.com/doc/service/api/qrcode/qrcodes/api_createqrcode.html)：接口只在服务端调用；临时字符串类型为 `QR_STR_SCENE`，`scene_str` 最长 64 字符，`expire_seconds` 上限 2592000 秒；接口适用“服务号（仅认证）”。通过 URL 编码的 ticket 调用官方 `showqrcode` 接口获取二维码图片。
- [接收事件推送](https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_event_pushes.html)：明确 `subscribe` / `qrscene_` 与 `SCAN` 场景事件、`FromUserName` 为 OpenID，以及 5 秒超时和重试规则。
- [消息加解密说明](https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html)：安全模式使用 `msg_signature` 对 Token、timestamp、nonce、Encrypt 排序后 SHA1 验签；AES-CBC 解密后校验公众号 AppID，微信采用 32 字节 PKCS#7 填充。无需回复消息内容时可以直接回复空串或 `success`。
- [获取稳定版接口调用凭据](https://developers.weixin.qq.com/doc/service/api/base/api_getstableaccesstoken.html)：普通模式 `force_refresh=false` 可复用有效 token；错误码 `40164` 明确要求调用 IP 在白名单内。
- [Cloudflare Workers 的运行方式](https://developers.cloudflare.com/workers/reference/how-workers-works/)：说明分布式执行与请求调度；本项目未额外配置专属固定出口。
- [公众号消息与事件推送配置](https://developers.weixin.qq.com/doc/subscription/guide/dev/push/)：列明 URL、Token、EncodingAESKey、GET signature/echostr 校验与配置即时生效的影响。普通消息接入不代表获得参数二维码接口权限。

平台菜单与权限可能调整，上线时仍须在实际公众号中确认。代码接入与自动化通过不等于该公众号已经获得接口权限。
