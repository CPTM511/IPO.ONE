# IPO.ONE Human & Agent 可执行用户手册

**版本：** v0.2 Draft

**日期：** 2026-07-31

**适用环境：** Local Closed Pilot / Synthetic Capital / No Real Funds

**界面语言：** 操作说明使用中文，按钮名称保留实际英文 UI 文案

## 1. 这份手册解决什么问题

IPO.ONE 当前要让两类用户完成同一条信用闭环：

```text
Human 或 Agent
→ 申请与信用评估
→ Decision 与 Offer
→ Obligation
→ 允许用途执行
→ 还款
→ Evidence
→ Credit Track Record / Credit Passport
```

Human 和 Agent 的身份与授权方式不同，但共用同一套 Decision、Offer、
Obligation、repayment waterfall、servicing、Evidence 和信用记录。

本手册只把“页面上真实可点击、并已通过浏览器流程验证”的操作作为普通用户主路径。
下载 handoff、CLI、SDK 和 MCP 是外部 Agent 或开发者的可选集成方式，不是网页测试
的前置条件。

## 2. 当前能力边界

当前产品可以在本地 PostgreSQL 中持久化完成 Human 和 Agent 的 no-funds
信用生命周期。当前不代表：

- 真实现金贷款或真实还款；
- 可提取到任意钱包的余额；
- 主网资金、托管、公开 LP 池或真实 Hyperliquid 交易；
- 已经接入真实 KYC、生产签名人或生产风控；
- 每个 Evidence Hash 都已经上链。

页面中的对象 hash 和 Evidence digest 默认是服务器完整性证明。只有页面明确显示
chain ID、真实 transaction hash、finality、indexer 和 reconciliation 状态时，
才属于已验证的 Testnet 链上记录。

## 3. 入口与角色

| 地址 | 角色 | 用途 |
| --- | --- | --- |
| `http://127.0.0.1:8787/#overview` | Human Borrower | Human 申请、评估、Obligation、执行、还款和信用记录 |
| `http://127.0.0.1:8788/#human` | Human Principal Controller | Agent Subject、account proof、Mandate 与受保护参考 Agent |
| `http://127.0.0.1:8789/#risk` | Risk Operator | 风险、暂停、冻结和运营检查 |
| `http://127.0.0.1:8790/#capital-partners` | Capital Partner Operator | 受邀资金方的 no-funds 工作区 |

启动与检查：

```bash
pnpm run local:up
pnpm run local:status
```

成功时，8787–8790、PostgreSQL、pilot 和 worker 均应为 healthy。

## 4. Sign in 与 Sign out

### Sign in

1. 打开与自己角色对应的端口。
2. 点击右上角 `Sign in`。
3. 选择本地已配置的认证方式；使用钱包时选择测试网络并完成 SIWE 签名。
4. 顶部必须同时显示 `Signed in` 与 `Secure session active`。

SIWE 是账户控制权签名，不是链上 transaction，也不会自动创建信用授权或贷款。

### Sign out

点击 `Sign out`。成功后：

- 账户 Session 和钱包选择一起退出；
- 顶部恢复 `Sign in`；
- Subject、Offer、Obligation、repayment 和 Evidence 等私有信息不再显示；
- 再次使用时必须重新认证。

## 5. Human：申请、评估、借款和还款

### 5.1 从哪里开始

登录 8787 后有两个明确入口：

- Home → `Start a credit request`；
- Home → `Human borrowing` → `Start Human application`。

两个按钮都会进入 `Credit` → `Human Workspace`，并定位到
`Request and price no-funds credit`。

如果账户恢复了上一笔 active 或 fully repaid Obligation，Home 的
`Start Human application` 会直接打开一份新的申请，同时保留原
Obligation。若从侧栏 `Credit` 进入旧贷款详情，可点击标题右侧
`Start a new Human loan`。新申请沿用同一个 Human Subject，但必须创建
新的 scoped Consent；原贷款仍可在 `Obligations`、`Repay & Settle` 和
Evidence 中查看。

### 5.2 Human 完整点击流程

| 步骤 | 点击 / 输入 | 功能 | 成功标志 |
| --- | --- | --- | --- |
| 1 | `Create Human Subject` | 创建不含姓名和 raw KYC 的 opaque Human Subject | `Profile ready` |
| 2 | `Create scoped Consent` | 对用途、金额、期限和身份引用进行范围授权 | helper 显示 Consent ready |
| 3 | 填写 `Requested amount (USD)`、`Term (days)`、`Installments` | 定义 Credit Intent | 输入通过界面校验 |
| 4 | 点击 `Request & evaluate credit` | 创建 Intent，运行确定性评估，生成 Decision、reason codes 和 exact Offer | `Your Offer` 显示 Approved/Declined、金额、利率、期限和理由 |
| 5 | 阅读 `Decision Passport` 与 `Protocol reference` | 核对 policy、Evidence lineage、Offer hash 和 terms hash | `Exact server Offer` 校验一致 |
| 6 | 勾选 exact Offer acknowledgement | 确认接受的正是当前 Offer | `Confirm & create sandbox Obligation` 可点击 |
| 7 | 点击 `Confirm & create sandbox Obligation` | 打开敏感操作二次确认 | 出现 `Create sandbox Obligation` 窗口 |
| 8 | 点击 `Confirm with account` | 接受 Offer 并创建 Obligation 与 repayment schedule | 页面显示 `Obligation created` |
| 9 | 点击 `Confirm sandbox execution` 并再次确认 | 在不可兑现的 sandbox rail 上执行允许用途 | execution 状态为 Executed |
| 10 | 输入还款金额，点击 `Confirm early or scheduled repayment` | 记录部分、全额提前或按期 synthetic repayment | outstanding 与 schedule 更新 |
| 11 | 点击 `Load timeline` / `Open Evidence` | 读取该 Obligation 的不可变 Evidence | 显示 Evidence event 数量与 anchor 状态 |

### 5.3 Human 的信用评估在哪里

信用评估没有独立的隐藏后台页面。它就在：

```text
Home
→ Start Human application
→ Credit / Human Workspace
→ Request and price no-funds credit
→ Request & evaluate credit
```

按钮在 Subject 与 Consent 准备完成前会保持 disabled。完成两项后必须变为可点击。

评估结果不是只有一个分数。当前界面返回：

- Decision outcome；
- approved principal；
- annual rate、fee、repayment schedule 和 maturity；
- canonical reason codes；
- policy version；
- Evidence lineage；
- exact Offer hash 与 terms hash。

### 5.4 Human 提前还款

无需等到 installment 到期。执行 Obligation 后，可以立即进行部分或全额提前还款。
当前 sandbox 无提前还款罚金，waterfall 固定为：

```text
fee → interest → principal
```

余额为零后，重复还款按钮会禁用，避免重复入账。

## 6. Agent：授权、申请、用款、还款

### 6.1 Agent 不是什么

IPO.ONE 不替用户创建或托管 Agent。Agent 是用户，通过受保护 API、SDK、MCP，
或 Closed Pilot 中已注册的服务器端参考 Agent 使用 IPO.ONE。

浏览器不接收 Agent credential、私钥、raw signature 或可重复使用的 token。

### 6.2 Principal 先设置 Agent authority

在 8788 登录 Human Principal Controller：

1. 打开 `Credit` → `Configure Agent authority`。
2. 填写 `Agent actor ID`、`Display name`、`Jurisdiction`。
3. 点击 `Create Agent Subject`。
4. 点击 `Create signing request`。
5. Closed Pilot 点击 `Ask registered test Agent to prove`；外部 Agent 使用自己的
   Agent Host/API 提交同一 challenge。
6. 成功状态必须为 `Proof verified` 与 `Subject active`。
7. 填写 `Per action (USD)`、`Aggregate (USD)`、`Validity (days)`。
8. 点击 `Create Draft Mandate`。

`Download proof request` 与 `Refresh binding` 仍可用于外部或离线调试，但本地参考
Agent 网页主路径不要求用户下载文件。

### 6.3 Agent 申请与评估

1. 切换顶部 `Agent Workspace`。
2. 从 Home 点击 `Agent borrowing` → `Open Agent credit`，或打开左侧
   `Agent Console`。
3. 在 `Request, borrow, repay, and verify online` 点击
   `Run Agent application online`。
4. 页面应显示：
   - `Decision completed`；
   - `Offered · $...`；
   - `Review and activate this Mandate`。
5. 点击 `Review and activate this Mandate`。
6. 在 Principal 页面核对 exact Mandate、limits、hashes 和 expiry。
7. 勾选 exact Mandate acknowledgement。
8. 点击 `Activate exact Sandbox Mandate`。

Draft Mandate 用于申请与评估；Active Mandate 用于接受已有 Offer 和运行
Obligation。Activate 不会自动借款，也不会自动花钱。

### 6.4 Agent 怎么借钱和使用信用

Mandate 激活后，回到 `Agent Workspace` → `Open Agent credit`。页面现在提供四个
相互独立的经济步骤，不再压缩成一个黑箱按钮：

| 顺序 | 按钮 | 功能 | 成功标志 |
| --- | --- | --- | --- |
| 1 | `Create Agent Obligation` | 使用先前 exact Offer 创建共享 Obligation；不执行、不还款 | `Obligation: Created`，下一步按钮启用 |
| 2 | `Execute approved use` | 通过 Mandate-approved、non-withdrawable sandbox rail 执行允许用途 | `Approved use: Executed` |
| 3 | `Repay Agent obligation` | 使用 Agent 自己的服务器端 credential 进行提前全额 synthetic repayment | `Repayment: $... posted`、余额更新 |
| 4 | `Verify Agent Evidence` | 读取 Agent-owned immutable Evidence timeline | `Lifecycle verified` 和 verified event 数量 |
| 5 | `Review Agent obligations` | 打开 Agent 自己的共享 Obligation 位置 | `Obligations` 显示该 Agent position、余额和状态 |

每个按钮只执行一个动作。前一步没有成功时，后一步保持 disabled。

### 6.5 “Agent 使用这笔钱”具体指什么

当前 MVP 中，Agent 的信用不是可以提到任意钱包的现金余额。`Execute approved use`
表示：

- 使用同一 Active Mandate；
- 只执行已批准 purpose；
- 受 per-action、aggregate、asset、expiry 和 capability 限制；
- 通过不可提款的 synthetic rail；
- 产生 execution receipt、Ledger state 和 Evidence；
- 不向任意钱包转账，不移动 production funds。

未来接入 Hyperliquid Testnet 时，也应由 purpose-bound Facility/Provider adapter
执行，而不是先把无限制资金交给 Agent。

### 6.6 外部 Agent 如何接入

外部 Agent 使用 `Open Agent API` 中的受保护 HTTPS contract，或使用 SDK/MCP。
核心 runtime 操作与网页按钮一一对应：

| UI 动作 | Agent operation |
| --- | --- |
| 申请信用 | `pilotRequestCredit` |
| 评估 | `pilotEvaluateCreditApplication` |
| 创建 Obligation | `pilotAcceptCreditOffer` |
| 执行允许用途 | `pilotExecuteSandboxObligation` |
| 还款 | `pilotPostSandboxRepayment` |
| 读取 Evidence | `pilotReadOwnObligationEvidence` |

外部 Agent 需要自己的 durable、revocable credential。网页 Principal 不会冒充
Agent，handoff 文件也不包含 credential 或资金权限。

## 7. Obligations、还款与信用记录

### Obligations

左侧 `Obligations` 用于恢复当前认证用户可见的 position：

1. 点击 `Refresh owned positions`。
2. 选择 Human owner 或 Agent/controller relationship 下的 exact Obligation。
3. 查看 principal、rate、maturity、execution、schedule、servicing 和 Evidence。

### Repay & Settle

这里显示 outstanding、past due、DPD、next due 和 repayment waterfall。

- Human owner 可以操作自己的 synthetic repayment；
- Agent 的 repayment 主操作由 Agent-authenticated runtime 完成；
- Principal 可以查看自己控制的 Agent position；
- Risk resolution 不在借款人按钮中完成。

### Credit Track Record

`Credit Track Record` 是 Evidence-derived 生命周期记录，不是浏览器历史。

1. 先创建或恢复一个 Obligation。
2. 打开 `Credit Track Record`。
3. 点击 `Load verified record`。
4. 页面应显示 Decision/Obligation Evidence、finalized 数量和 lifecycle 结果。

还款及时、逾期、cure、default、restructure、write-off 和 recovery 都应作为事实记录，
而不是只累积“正向分数”。

### Credit Passport

`Credit Passport` 是可控披露的 Decision/underwriting record，不是通用 300–850
信用分。

1. 先完成或恢复一个 Decision。
2. 打开 `Credit Passport`。
3. 点击 `Load my latest Decision`。
4. 选择允许披露的 factor/outcome、reviewer 和有效期。
5. 点击 `Share private Passport`。

Passport 不应包含 raw KYC/PII、Agent credential、私钥或完整策略数据。

## 8. Evidence 与链上状态

| 页面内容 | 含义 | 是否一定上链 |
| --- | --- | --- |
| Object hash | 绑定一个业务对象版本 | 否 |
| Evidence digest | 校验服务器 Evidence 完整性 | 否 |
| Transaction hash | 真实链上交易标识 | 是 |
| Anchor receipt | Evidence 与 transaction 的绑定 | 只有提交成功后 |
| Indexer / reconciliation | 链、server 和 coverage 的核对 | 需要看实际状态 |

页面必须明确区分：

- `Not submitted` / `Unavailable`：没有链上 transaction；
- `Submitted` / `Included`：已有 transaction，但未必 finalized；
- `Finalized`：链达到最终性；
- `Indexed`：indexer 已读取；
- `Reconciled`：链上与服务器 Evidence 已核对。

不能因为字符串以 `0x` 开头，就把 Evidence digest 当作 transaction hash。

## 9. 最短验收清单

`Obligations`、`Repay & Settle`、`Credit Passport` 和
`Credit Track Record` 是核心生命周期入口，必须直接显示在左侧主导航；只有集成和
运营工具可以收进 `More tools`。本手册的按钮、页面与安全边界同时受
`IPO_ONE_MANUAL_PRODUCT_CONTRACT_v0.1.md` 和自动化 action inventory 约束。

### Human

- [ ] Home 的 `Start Human application` 可点击。
- [ ] Subject 与 Consent 创建后，`Request & evaluate credit` 可点击。
- [ ] 评估结果显示 Decision、Offer、理由和 hashes。
- [ ] account confirmation 后创建一个 Obligation。
- [ ] execution 后可以提前还款。
- [ ] Evidence 与 Credit Track Record 可加载。
- [ ] Sign out 后私有信息消失。

### Agent

- [ ] Agent Subject、account proof 和 Draft Mandate 可创建。
- [ ] `Run Agent application online` 返回 Decision 与 Offer。
- [ ] exact Mandate 可由 Principal 激活。
- [ ] `Create Agent Obligation` 可单独点击。
- [ ] `Execute approved use` 可单独点击。
- [ ] `Repay Agent obligation` 可单独点击。
- [ ] `Verify Agent Evidence` 可单独点击。
- [ ] `Review Agent obligations` 可打开当前 Agent 的 Obligation。
- [ ] 页面明确说明用途受限、不可任意提款。
- [ ] Agent credential、私钥和 raw signature 不进入浏览器。

## 10. 常见问题

| 问题 | 原因 | 处理 |
| --- | --- | --- |
| `Request & evaluate credit` 灰色 | Subject 或 Consent 尚未完成 | 先点击前两个创建按钮 |
| Agent 只能看到 handoff 下载 | 进入了开发集成区，或没有加载 Draft/Active Mandate | 回到 `Agent Console` 的 browser-operable 区域 |
| `Create Agent Obligation` 灰色 | Offer 尚未生成，或 exact Mandate 未激活 | 先运行 application，再由 Principal 激活 |
| `Execute approved use` 灰色 | Obligation 尚未创建 | 先点击 `Create Agent Obligation` |
| `Repay Agent obligation` 灰色 | approved use 尚未执行，或余额为零 | 先执行用途；零余额无需重复还款 |
| `Verify Agent Evidence` 灰色 | 还款未完成 | 先完成当前测试还款 |
| 看到 hash 但 BaseScan 查不到 | 看到的是 object/Evidence digest，不是 transaction hash | 查看 Base Sepolia anchor 的 transaction/finality/indexer 状态 |
| Sign in 后又失效 | Session 已过期、角色端口切换或钱包变化 | Sign out，回到正确端口重新 Sign in |

## 11. 当前验收结论

本版本的网页主路径已经明确提供：

- Human 首页借款入口和可点击信用评估；
- Human Offer、Obligation 与提前还款路径；
- Agent Decision/Offer、Obligation、批准用途执行、还款与 Evidence 的分步按钮；
- Human 与 Agent 共用的 Obligation、repayment 和 Evidence 语义；
- 对 offchain hash 与真实 Testnet transaction 的明确区分。

这仍是 no-real-funds 本地 Closed Pilot。进入 hosted、live testnet 或真实资金阶段前，
需要分别通过部署、认证、KYC/privacy、risk、capital、servicing、signer、contract
和链上 Evidence 的人类审批与验收。
