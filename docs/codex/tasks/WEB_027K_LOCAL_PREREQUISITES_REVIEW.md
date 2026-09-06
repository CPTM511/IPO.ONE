# WEB-027K — 剩余本地激活条件评审

状态：PROPOSED — 尚未授权实施或激活。2026-09-06。

## 已完成的前提

WEB-027J 已获授权并在 `68c5036` 本地候选完成 J1 受邀角色登录、J2 两种普通角色报表、J3 Principal 执行账户绑定及两种角色能力发现、J4 全新 Principal 独立 Agent 完整流程。J3 Human 绑定仍被真实的待激活 Subject 状态阻塞。Risk 登录成功不等于风控操作可用。

原始 8895–8898 服务及数据库保留。候选为 8935–8938，数据库 `ipo_one_web027_candidate`，无真实资金；正式环境未变更。

## K1 — 明确的本地 Human 档案激活

**证据。** 当前三条 Human Subject 均为 `pending`；现有 `walletReadAccountBindings` / prepare handler 和 live policy 要求 `active`。Human Subject、Consent、合成身份引用与信用申请可用，但当前可见流程没有把 Human Subject 激活的操作。不得直接改数据库、把 pending 当 active，或冒充真实 KYC。

**拟定变更。** 在同一 Human workspace 增加明确的“Activate sandbox profile”操作。经现有 Gateway、单一 Subject 内核、版本化 API/MCP 和幂等事件执行，状态仅允许 `pending → active`。必须验证精确 Tenant/本人 Subject、有效 Principal、当前限定 Consent、已批准的合成身份引用、当前版本和现有未冻结状态。确认页说明只激活无资金沙盒身份，不授予信用、提款或真实 KYC 认证。登录、Consent 创建和钱包连接不得隐式触发。

- 拟增加 `pilotActivateSandboxHumanSubject` 与 `subject.activate.sandbox.self`，只在已批准的隔离本地主机/数据库开放；需要审阅后的版本化契约、能力枚举和命名凭证轮换。
- 禁止激活 frozen/default/未知状态；禁止修改风险、授信、Consent、资本或真实身份策略。
- 可能文件：Human Subject handler、tenant protocol/schema/SDK/MCP、local identity provisioning、Human preparation UI 与对应测试。若需要 schema migration，使用下一空闲编号，保持历史事件可追溯。
- 验收：从全新及现有 pending Human 可见点击完成激活，再完成执行账户 challenge/sign/submit/read/discovery/revoke；验证越权、过期 Consent、缺失引用、重复提交、冻结状态、刷新/注销/重启。
- 回滚：关闭新入口与新增授权、撤销新凭证；保留已发生事件与状态，不把 active 记录伪装回 pending。

## K2 — 受邀 Risk 的真实 MFA

**证据。** Risk 已可登录、刷新、注销重登、服务重启恢复并进入可见工作区，但 `pilotReadTenantRiskPortfolioReference` / `pilotReadServicingQueueReference` 返回授权拒绝。审计记录为 `actor_capability_rejected`；该阶段同时校验角色、能力和 MFA。已配置 Risk 能力包含对应 reads；当前 SIWE session 没有 `assertRecentPhishingResistantAuthentication` 所需的近期抗钓鱼认证。不能把钱包签名或测试断言写成 WebAuthn/MFA 事实。

**拟定变更。** 为精确预登记的 Risk 操作者提供本地、邀请绑定的 Passkey 注册和安全验证流程。使用浏览器实际 WebAuthn 签名，服务端验证一次性 challenge、精确 RP ID/origin、credential 与 Tenant/Actor 绑定、user verification、签名、有效期及适用的 counter；完成后才更新当前 session 的真实认证证据。保持现有 MFA 时效要求、角色权限、租户隔离、撤销与审计。

- 普通 Human/Principal 公共注册不得注册成 Risk；钱包登录不自动完成 step-up。新凭证须有可见撤销方式，注销和凭证轮换后不能复用旧认证结果。
- 不新增 Risk 能力，不放宽金融或权限规则，不接入外部 IdP、不提供测试后门。具体 WebAuthn 验证依赖若需要新增，先列出固定版本和必要性供审阅。
- 可能文件：authentication role/session 与 challenge persistence、受邀本地主机 composition、auth routes、Risk step-up UI、相关迁移和安全测试。
- 验收：真实浏览器 Passkey 验证后点击 portfolio/queue/health/case 等原有角色允许操作；拒绝错误 RP/origin、未验证用户、重放、他人凭证、过期/撤销/跨租户。自动化浏览器 authenticator 只证明测试协议路径；Founder 自己的真实设备需单独完成操作确认。
- 回滚：停用新增入口/注册及 step-up 路径，撤销新增会话与测试 Passkey；保留审计。SIWE 仍可登录但不能冒充 MFA。

## 交付与权限

请求只覆盖上述两个本地依赖的实现与验证。先补齐实现契约、迁移/撤销/负面测试，再在隔离候选浏览器验收；继续按完整语义矩阵检查原有功能。建议命令：authentication/web/security/transport tests、migration/schema/protocol checks、新专用库 PostgreSQL suite、实际候选浏览器检查。

K1 是新增身份激活状态转换与授权；K2 是新增认证凭证和 session 强度模型。它们超出 J1 保留既有权限登录、J3 增加既有绑定操作的精确批准范围。依据已批准 WEB-027 指令 §2.2：“若正确修复涉及权限模型或迁移，应提交具体方案供单独审阅”。这不是重新申请 J1–J4 或普通 UI 开发权限。

批准本提案也不等于正式发布、真实资金、外部服务、风险参数变更、链上执行或其余特殊角色的授权。Capital Partner 全生命周期/Servicing 双人审批、Pool/Provider/venue 等语义矩阵行仍需逐项验收；当前不能承诺全站通过或跳过这些行。
