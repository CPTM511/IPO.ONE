# IPO.ONE Human & Agent User Manual

**版本：** v0.1 Draft
**日期：** 2026-07-30
**适用范围：** 本地 Closed Pilot、Synthetic Capital、No Real Funds
**当前验证状态：** LOCAL-RC-002 已于 2026-07-31 完成本地无资金封存
**语言约定：** 说明使用中文，按钮和产品名称保留实际英文 UI 文案

---

## 阅读路径

- 第一次使用：1 → 2 → 4 → 6（Human）或 7（Agent）。
- 测试还款：8 → 9。
- 资金方：10 → 11。
- Trading Capital：12。
- 风险和运营：13。
- 出错排查：16。
- 验收测试：17–19。
- 当前已知产品缺口：20。

## 1. 先读这一页

IPO.ONE 是 Human 和 Agent 共用的可验证信用市场与 Obligation
基础设施。Human 和 Agent 的身份、认证和授权方法不同，但它们必须使用
同一个：

- Credit Intent；
- Decision 和 Offer；
- Obligation 和 Facility；
- Ledger 和 repayment waterfall；
- servicing、DPD、default 和 resolution 状态；
- Event、Evidence 和 reconciliation；
- Credit Passport 和信用记录。

### 1.1 当前产品是什么状态

当前本地产品可以使用 PostgreSQL 持久化完成 no-funds Human 和 Agent
信用生命周期，并可以查看 Capital Partner、Trading Capital、Risk /
Operations 和 Evidence 功能。

当前产品不是：

- 真实现金贷款；
- 可存款或提款的 LP 资金池；
- 主网产品；
- 可以任意转账或授权 Token allowance 的钱包应用；
- 自动给 Agent 放款的黑箱信用模型；
- 已经开放的 Hyperliquid 真实交易系统。

### 1.2 四个环境状态不能混淆

| 状态 | 含义 | 当前是否可用 |
| --- | --- | --- |
| Local Synthetic | 本地 Web/API/PostgreSQL/worker，资金和 repayment 都是 synthetic | 可用 |
| Hosted No-Funds | 邀请制云端产品，仍然没有真实资金 | 尚未在本手册中宣称可用 |
| Testnet Verified | 有真实 Testnet transaction、finality、indexing 和 reconciliation | 仅限已明确列出的 Testnet Evidence |
| Real-Value Active | 真实资金、真实法律及运营责任、生产 signer 和完整风控 | 未开放 |

看到 `Sandbox`、`Synthetic` 或 `No real funds` 时，不应理解为真实贷款或真实还款。

---

## 2. 角色和入口

本地服务启动后使用四个独立入口。四个入口连接同一个 Tenant 和 PostgreSQL，
但登录为不同的服务器角色。

| 本地入口 | 角色 | 主要用途 |
| --- | --- | --- |
| `http://127.0.0.1:8787/#human` | Human Borrower | 创建 Human 信用申请、接受 Offer、执行、还款和查看 Evidence |
| `http://127.0.0.1:8788/#human` | Human Principal Controller | 创建 Agent Subject、验证 Agent account、创建和激活 Mandate，并操作受保护的参考 Agent |
| `http://127.0.0.1:8789/#risk` | Risk Operator | 查看 Tenant 风险、服务队列和执行保护性操作 |
| `http://127.0.0.1:8790/#capital-partners` | Capital Partner Operator | 审核授权 Passport、制定 synthetic Offer、查看 portfolio |

外部 Agent 使用受保护的 HTTPS Agent API 和自己的 durable、revocable
credential。为了让 Closed Pilot 可以直接在浏览器里完整验收，8788 还提供一个
已注册的服务器端参考 Agent：Principal 可以点击启动它，但 credential、私钥和
raw signature 从不进入浏览器。CLI 和 handoff 下载只是开发调试的可选路径。

Agent 可以使用：

- Agent Host；
- authenticated Agent API；
- typed SDK；
- local stdio MCP（可选开发 transport）。

Human Principal 可以查看自己控制的 Agent Obligation，也可以从页面请求已注册
参考 Agent 执行流程；真正的 accept、execute 和 repayment 调用仍由 Agent
credential 在服务器端重新认证和授权，Principal 浏览器不会冒充 Agent。

---

## 3. 本地启动和状态检查

以下命令由本地测试或开发人员在 IPO.ONE 仓库根目录执行。

### 3.1 启动

```sh
pnpm run local:up
```

功能：启动 PostgreSQL、Private Pilot Web/API 和后台 worker。

成功标志：

- 命令显示 local stack healthy；
- 8787–8790 均可打开；
- PostgreSQL、pilot 和 worker 均为 healthy。

### 3.2 检查状态

```sh
pnpm run local:status
```

功能：只读检查容器、数据库、worker 和 host-agent loopback forwarding。

### 3.3 运行本地验收

```sh
pnpm run local:acceptance
```

功能：检查 migration、持久化认证、RLS、Agent proof、worker、
reconciliation 和 Evidence anchor coverage。

这不是用户借款操作，也不会创建贷款或链上交易。

---

## 4. 通用 Sign in、网络和 Sign out

### 4.1 Sign in

| 步骤 | 在哪里 / 点击什么 | 功能 | 使用工具 | 成功标志 | Evidence / 链上影响 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 打开正确角色的本地入口 | 选择正确服务器角色 | 浏览器 | 页面显示该角色 workspace | 无链上交易 | 点击 `Sign in` |
| 2 | 点击右上角 `Sign in` | 打开认证和网络面板 | Web UI | 显示登录方式和钱包 Provider | 无链上交易 | 选择可用方式 |
| 3 | 选择钱包 Provider | 明确选择一个浏览器钱包；发现钱包不等于授权钱包 | 浏览器钱包 | Provider 处于 selected 状态 | 无链上交易 | 选择 Testnet |
| 4 | 选择 `Base Sepolia` 或 `X Layer Testnet` | 绑定当前测试网络 | 钱包 | 网络状态正确 | 可能请求 add/switch network，但不是资金交易 | 点击 wallet sign in |
| 5 | 点击 `Connect & sign in with wallet` 并签署 SIWE | 证明钱包控制权并建立 host-only session | 钱包签名 | 显示 `Signed in` 和 `Secure session active` | SIWE 是签名，不是 transaction，不收 gas | 进入角色 workspace |

当前本地 Closed Pilot 以 wallet/SIWE 路径为验收基线。Google 或 email
按钮只有在相应身份提供商已经被明确配置时才可使用；页面显示按钮不代表外部
IdP 已经开放。

### 4.2 Authentication 不等于信用授权

完成 Sign in 只证明“当前用户是谁”。它不会自动：

- 创建 Human Consent；
- 创建或激活 Agent Mandate；
- 接受 Offer；
- 创建 Obligation；
- 允许提款或转账；
- 产生链上交易。

### 4.3 Sign out

点击右上角 `Sign out`。

功能：

- 结束服务器 Session；
- 清除浏览器中的私有产品状态；
- 释放当前钱包选择；
- 尝试撤销钱包账户访问或断开支持的连接；
- 阻止继续访问 Subject、Offer、Obligation、repayment 和 Evidence。

成功标志：

- 顶部恢复 `Sign in`；
- 显示 `Sign-in required`；
- 私有金额、ID、Offer 和 Evidence 不再显示。

如果从一个端口切换到另一个角色端口，页面可能显示 `Switch role`。点击后先结束
当前角色 Session，再使用目标角色重新签名。系统不会自动扩大现有角色权限。

---

## 5. 重要对象：每一步到底创建什么

| 对象 | 功能 | 不代表什么 |
| --- | --- | --- |
| Subject | IPO.ONE 内的借款主体 | 不代表通过 KYC，也不代表已申请贷款 |
| Principal | 对 Agent 承担授权责任的 Human 控制者 | 不代表可以冒充 Agent |
| Consent | Human 对用途、金额和期限的授权 | 不代表 Offer 或放款 |
| AccountBinding | 验证 Agent 控制指定 CAIP-10 account | 不会向浏览器交付 Agent credential |
| Mandate | Principal 给 Agent 的范围、限额和期限授权 | Activate 不等于申请贷款 |
| Credit Intent | 正式的借款需求 | 不等于获批 |
| Decision | 确定性政策对申请的结果和 reason codes | 不自动移动资金 |
| Offer | 明确金额、价格、期限和 schedule 的可接受条款 | 不等于 Obligation |
| Offer Acceptance | 对 exact Offer hash 和 terms hash 的确认 | 当前是 no-funds acceptance |
| Obligation | 双方已经接受的正式信用义务和 schedule | 创建时仍可处于 pending execution |
| Execution Receipt | 允许用途的 sandbox execution 记录 | 当前不是可兑现付款 |
| Repayment | 按 waterfall 记入 fee、interest、principal | 当前金额是 synthetic |
| Evidence | 不可变的事实、状态和来源记录 | Evidence Hash 不是 transaction hash |
| Credit Passport | 经授权披露的因素、结果和 Evidence lineage | 不是通用 300–850 信用分 |

---

## 6. Human Borrower：完整使用流程

### 6.1 Human 快速路径

```text
Sign in
→ Create Human Subject
→ Create scoped Consent
→ Request & evaluate credit
→ Review Decision and Offer
→ Confirm & create sandbox Obligation
→ Confirm sandbox execution
→ Confirm sandbox repayment
→ Load timeline
→ Credit Passport / Credit Track Record
```

### 6.2 每一步的作用

| 步骤 | 在哪里 / 点击什么 | 功能 | 使用工具 | 成功标志 | Evidence / 链上影响 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 8787 → `Credit` → `Human Workspace` | 进入 Human 借贷流程 | Web UI | `Human credit` 页面和 guided path 可见 | 无链上交易 | 创建 Subject |
| 2 | 点击 `Create Human Subject` | 创建 opaque Human Subject | Web/API | Subject ID 自动写入 Advanced 区域 | PostgreSQL 记录；不是链上交易 | 创建 Consent |
| 3 | 点击 `Create scoped Consent` | 创建金额、期限、用途受限的 Human 授权，并使用 pilot 已配置的 encrypted identity reference | Web/API | Consent ID 自动写入；helper 显示 ready | PostgreSQL Evidence；raw KYC/PII 不显示；无链上交易 | 设置申请参数 |
| 4 | 填写 `Requested amount (USD)`、`Term (days)`、`Installments` | 定义 Credit Intent 经济需求 | Web UI | 输入通过范围检查 | 尚未创建借款 | 点击申请 |
| 5 | 点击 `Request & evaluate credit` | 依次创建 Credit Intent、读取 application、运行 deterministic policy，并生成 Decision 与可用 Offer | Web/API | `Your Offer` 显示 principal、rate、fee、repayment、maturity 和 reason codes | 产生 server receipts 和 Evidence digest；没有链上 transaction | 审查 Offer |
| 6 | 展开 `Decision Passport` 和 `Protocol reference` | 查看 policy、reason codes、Evidence lineage、Offer hash 和 terms hash | Web UI | Decision 为可接受状态，Offer 尚未过期 | 只读，不上链 | 勾选确认 |
| 7 | 勾选 exact Offer acknowledgement | 明确确认当前 Offer hash 和 terms hash | Web UI | `Confirm & create sandbox Obligation` 可用 | 仅浏览器确认状态 | 创建 Obligation |
| 8 | 点击 `Confirm & create sandbox Obligation`，再在确认窗口点击 `Confirm with account` | 接受 exact Offer 并创建一个 canonical Obligation 和 repayment schedule | Web/API | 显示 `Obligation created`、schedule 和 Obligation ID | PostgreSQL 事件和 Evidence；确认窗口明确 `Public chain: Not submitted` | 执行 |
| 9 | 点击 `Confirm sandbox execution` 并确认 | 通过 non-redeemable sandbox rail 执行 Obligation，建立共享 Ledger 状态 | Web/API | execution 变为 Executed；outstanding principal 更新 | offchain sandbox receipt；没有真实资金和链上 transaction | 还款 |
| 10 | 填写 `Repayment (USD)`，选择 `Wallet`、`Bank` 或 `Revenue`，点击 `Confirm early or scheduled repayment`（旧布局可能显示 `Confirm sandbox repayment`） | 随时记录部分或全额提前还款，或按期还款；无需等待到期日，当前 sandbox 无提前还款罚金；统一按 fee → interest → principal waterfall 分配 | Web/API | Total repaid、Outstanding 和 schedule 更新；全额后为 `Fully repaid` | PostgreSQL repayment 与 Evidence；默认不等于链上交易 | 验证 Evidence |
| 11 | 点击 `Load timeline` | 读取该 Obligation 的 redacted immutable Evidence | Web/API | 显示事件数量、server Evidence state 和时间 | 每行 Evidence digest 是 offchain integrity hash | 检查 anchor |
| 12 | 查看 `Base Sepolia anchor` | 区分 server record、digest、transaction、finality、indexer 和 reconciliation | Web UI / worker | 只有真实已提交且验证的 transaction 才显示 BaseScan link | 可能有独立 anchor transaction；必须看实际状态 | 查看 Passport / Track Record |

### 6.3 Human 输入范围

当前 UI 基线：

- Requested amount：USD 1–250；
- Term：1–90 days；
- Installments：1–3；
- Purpose：`Working capital`；
- Repayment：`Monthly`；
- Asset：synthetic USD cent。

这些是当前本地产品限制，不是生产授信政策。

### 6.4 Human 成功验收

- 页面产生 Credit Intent、Decision 和 Offer。
- 重复请求不会创建第二份相同经济结果。
- 未勾选 exact acknowledgement 时不能接受 Offer。
- acceptance 后只创建一个 Obligation。
- execution 前 repayment 按钮不可用。
- execution 后、首期到期日前，部分或全额提前还款按钮可用。
- `Fully Repaid` 时不能再对零余额重复还款；页面会引导选择其他 position 或新申请。
- repayment 后 schedule、outstanding 和 Evidence 同步。
- restart 后重新 Sign in，可以在 `Obligations` 恢复记录。
- Sign out 后看不到私有状态。

---

## 7. Agent：Principal 设置和 Agent Runtime

Agent 流程分成两个明确阶段，但 Closed Pilot 主路径可以全部在网页中完成。

```text
Human Principal:
Subject → Account proof → Draft Mandate

Server-held reference Agent / external authenticated Agent:
Credit Intent → Decision → Offer

Human Principal:
Review and Activate exact Mandate

Server-held reference Agent / external authenticated Agent:
Accept Offer → Obligation → Execute → Repay → Evidence
```

### 7.1 网页主路径和可选开发 Handoff

普通产品测试不需要下载文件：

1. Principal 创建并加载 Draft Mandate。
2. 打开 `Agent Console`。
3. 在 `Request, borrow, repay, and verify online` 点击
   `Run Agent application online`。
4. Decision 和 Offer 返回后点击 `Review and activate this Mandate`。
5. Principal 确认 exact Mandate 并激活。
6. 点击 `Continue in Agent workspace`；参考 Agent 使用服务器端 credential
   完成 Obligation、execution、提前全额 repayment 和 Evidence read。
7. 点击 `Review Agent obligations` 查看同一 shared kernel position。

外部 Agent 使用相同的受保护 HTTPS contract。`Download handoff` 和下面的
CLI 命令仅用于开发者调试、离线传递或本地 stdio MCP 验证，不是普通用户必经步骤。

两个阶段仍保留不同权限：

| Handoff | Mandate 状态 | 允许的主要工作 | 不允许的工作 |
| --- | --- | --- | --- |
| `application_ready` | Draft | Agent request credit、read application、evaluate Decision/Offer | accept、execute、repay |
| `ready` / runtime | Active | accept Offer、read Obligation、execute、repay、read Evidence | 发起新的 Credit Intent |

这是 Agent API 和可选本地 MCP 共用的安全边界。Active runtime authority
不能代替 Draft application authority 发起新的申请。

### 7.2 Human Principal 设置 Agent

| 步骤 | 在哪里 / 点击什么 | 功能 | 使用工具 | 成功标志 | Evidence / 链上影响 | 下一步 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 8788 Sign in → `Credit` → `Configure Agent authority` | 进入 Principal-controlled Agent setup | Web UI | `Principal access required` 消失，表单可见 | 无链上交易 | 创建 Subject |
| 2 | 检查 `Agent actor ID`、`Display name`、`Jurisdiction`，点击 `Create Agent Subject` | 将已分配 workload actor 绑定为 Agent Subject | Web/API | Subject ID 自动出现，状态为 pending | PostgreSQL 记录；不会创建 credential | 创建 proof request |
| 3 | 选择 Test chain 和 Binding purpose，点击 `Create signing request` | 创建五分钟、一次性 EIP-712 account proof challenge | Web/API | Challenge 显示 created，在线 proof 按钮可用 | challenge 不是链上 transaction | 请求 Agent proof |
| 4 | 本地 Closed Pilot 点击 `Ask registered test Agent to prove`；外部 Agent 通过受保护 Agent API 提交同一 challenge | 由 Agent 自己的 credential 和 CAIP-10 account 签名并提交 proof | Web → server-held reference Agent / external Agent API | `Proof verified`；Subject 激活 | 签名只进入受限 server verification；浏览器不接收 signature 或 key；没有链上交易 | 创建 Draft Mandate |
| 5 | 可选：点击 `Download proof request` 或 `Copy proof request` | 为开发调试、离线传递或 stdio MCP 保留 credential-free challenge | 浏览器文件 / Agent Host | challenge 可被已注册 Agent Host 使用一次 | 文件不包含 credential、私钥或 funds authority | 提交后 Refresh binding |
| 6 | 仅在外部或可选离线路径使用 `Refresh binding` | 读取 Agent Host 已提交的 AccountBinding | Web/API | Account proof verified；Subject 激活 | 只读；浏览器不接收 signature 或 key | 创建 Draft Mandate |
| 7 | 设置 `Per action (USD)`、`Aggregate (USD)`、`Validity (days)`，点击 `Create Draft Mandate` | 创建 Agent 可以申请的能力、限额和期限边界 | Web/API | Mandate status 为 Draft，hash 和 terms hash 出现 | PostgreSQL Evidence；不是贷款 | 下载 application handoff |
| 8 | 打开 `Agent Console`，点击 `Run Agent application online` | 请求已注册参考 Agent 使用 Draft Mandate 完成 Request → Decision → Offer | Web UI / protected Agent API | 页面显示 `Offer ready · activate` | credential 保留在 Agent Host；浏览器只接收 sanitized workflow receipt | Principal 激活 |

### 7.3 Agent Application：先得到 Decision 和 Offer

#### 浏览器主路径

在 `Agent Console` 点击 `Run Agent application online`。成功后页面必须显示：

- `Decision completed`；
- exact Offer amount；
- `Review and activate this Mandate`。

如果按钮不可点击或只显示 handoff 下载说明，视为浏览器验收失败。

#### 外部 Agent / 可选开发路径

Agent Host 可以读取 application handoff，并通过 typed SDK/local stdio MCP
按顺序使用：

1. `ipo_one_read_self`
   功能：确认 handoff Subject 和 authenticated Agent 是同一个 Subject。

2. `ipo_one_request_credit`
   功能：在 Draft Mandate 的 per-action、aggregate、asset 和 purpose
   范围内创建 Credit Intent。

3. `ipo_one_read_credit_application`
   功能：读取 exact Credit Intent 和当前 application 状态。

4. `ipo_one_evaluate_credit_application`
   功能：使用确定性政策生成 Decision、reason codes 和 Offer。

推荐使用项目提供的 workflow composition，而不是手工拼接 authority：

```bash
pnpm run local:agent:application -- <downloaded-application-handoff.json>
```

成功标志：

- 返回 `agent_credit_offer_workflow_receipt.v1`；
- receipt 自动保存在
  `.ipo-one/local-stack/agent-workflows/`，文件权限仅限本地用户；
- receipt 中存在 Credit Intent、Decision 和 Offer；
- `sandboxOnly=true`；
- 没有 credentials 或 funds authority；
- 此时还没有 Obligation。

### 7.4 Principal 审查并 Activate

Agent 得到 Offer 后，Human Principal 回到 8788：

1. 点击 `Load exact Mandate`，确认仍然是同一个 Draft Mandate。
2. 检查 Principal、Subject、Account hash、Proof hash、Mandate hash、
   Terms hash、Limits 和 Expires。
3. 确认 Agent 已返回 Offer workflow receipt，然后勾选：
   `I confirm this exact sandbox Mandate and understand that activation unlocks runtime use of an existing Agent Offer; it does not create or evaluate a new application.`
4. 点击 `Activate exact Sandbox Mandate`。
5. 在显式确认窗口中完成 account confirmation。

功能：把 Draft Mandate 变为 Active，使 Agent 可以接受先前的 exact Offer
并进入 Obligation 阶段。

Activate 不会自动：

- 创建 Credit Intent；
- 运行 evaluate；
- 创建 Offer；
- 接受 Offer；
- 创建 Obligation；
- 执行或 repayment。

### 7.5 Agent Runtime：接受、执行和还款

Mandate Active 后：

1. 点击 `Continue in Agent workspace`，或回到 `Agent Console`。
2. 点击 `Borrow, repay, and verify online`。
3. 参考 Agent 使用前一阶段保留的 exact Offer receipt 和服务器端 credential。
4. 页面显示 `Lifecycle verified`、Obligation、repayment 和 Evidence 数量。
5. 点击 `Review Agent obligations`，再用 `Credit Passport` 和
   `Credit Track Record` 的加载按钮查看记录。

外部 Agent / 可选开发路径可以下载 status 为 `ready` 的 runtime handoff，
由自己的 Agent Host 使用前一阶段的 Offer receipt，并按顺序调用：

| Agent tool | 功能 | 结果 |
| --- | --- | --- |
| `ipo_one_accept_credit_offer` | 校验 exact Offer hash、terms hash 和 acknowledgement hash，创建共享 Obligation | 返回 Obligation |
| `ipo_one_read_obligation` | 读取当前 Obligation、schedule 和 servicing | 只读 current state |
| `ipo_one_execute_sandbox_obligation` | 执行 non-redeemable sandbox credit | execution receipt + Ledger state |
| `ipo_one_post_sandbox_repayment` | 记录 synthetic wallet/bank/revenue repayment | waterfall 和 schedule 更新 |
| `ipo_one_read_obligation_evidence` | 读取 owned redacted Evidence timeline | immutable Evidence page |
| `ipo_one_read_credit_registry_evidence` | 读取已授权的 redacted Base Sepolia registry observation | 只读公共 Testnet Evidence |

推荐组合：

```bash
pnpm run local:agent:runtime -- <downloaded-runtime-handoff.json>
```

这个 CLI 不是 Closed Pilot UI 验收的前置条件。

Runner 会按同一 Mandate 自动读取第 7.3 步保存的 Offer receipt；如果没有
匹配的 receipt，会安全失败并提示先运行 application。完整隔离验收可执行：

```bash
pnpm run local:agent:acceptance
```

成功标志：

- 返回 `agent_sandbox_obligation_workflow_receipt.v1`；
- 另外读取 `tenant_owned_obligation_evidence_view.v1` 并保存 lifecycle
  result；
- Obligation、execution、Ledger 和 repayment 使用 Human 相同的 kernel；
- production funds moved 为 false；
- withdrawable 为 false。

### 7.6 Agent 的 12 个本地 MCP 工具

| MCP tool | Server operation | 作用 | 所需阶段 |
| --- | --- | --- | --- |
| `ipo_one_read_self` | `pilotReadAgentSelf` | 读取 authenticated Agent 自己的 Subject | application / runtime |
| `ipo_one_request_credit` | `pilotRequestCredit` | 创建 Draft Mandate 范围内的 Credit Intent | application |
| `ipo_one_read_credit_application` | `pilotReadCreditApplication` | 读取 exact Intent、Decision 和 Offer | application / runtime read |
| `ipo_one_evaluate_credit_application` | `pilotEvaluateCreditApplication` | 运行确定性申请政策 | application |
| `ipo_one_submit_account_proof` | `pilotSubmitAgentAccountProof` | 提交 one-use EIP-712 CAIP-10 proof | identity proof |
| `ipo_one_read_account_binding` | `pilotReadAgentAccountBinding` | 读取 hash-only AccountBinding | identity proof |
| `ipo_one_read_obligation` | `pilotReadOwnObligation` | 读取 owned Obligation 和 servicing | runtime |
| `ipo_one_read_obligation_evidence` | `pilotReadOwnObligationEvidence` | 读取 redacted Evidence timeline | runtime |
| `ipo_one_accept_credit_offer` | `pilotAcceptCreditOffer` | 接受 exact Offer 并创建 Obligation | runtime |
| `ipo_one_execute_sandbox_obligation` | `pilotExecuteSandboxObligation` | 执行 sandbox Obligation | runtime |
| `ipo_one_post_sandbox_repayment` | `pilotPostSandboxRepayment` | 记录 synthetic repayment | runtime |
| `ipo_one_read_credit_registry_evidence` | `pilotReadCreditRegistryEvidence` | 读取 redacted Base Sepolia Registry Evidence | runtime |

工具出现在 manifest 中不等于当前 handoff 可以使用。Agent Host 会再次检查
manifest phase、Subject、Mandate、credential、capability 和 live state。

### 7.7 Principal 查看 Agent 借贷

Human Principal 在 8788：

1. 切换顶部 `Agent Workspace`。
2. 打开左侧 `Obligations`。
3. 点击 `Refresh owned positions`。
4. 选择 relationship 为 controller 的 Agent Obligation。
5. 打开 `Repay & Settle` 查看 schedule 和 servicing。

Principal 看到的是 exact-resource read-only view。repayment action 必须由
Agent-authenticated runtime 完成。

### 7.8 如果已经 Activate，却还没有 Credit Intent

当前本地 MCP 不允许 runtime handoff 发起新 Credit Intent。不要反复调用
`ipo_one_request_credit`，也不要把 runtime manifest 改成
`application_ready`。

当前安全处理：

1. 保留现有 Active Mandate，不修改其 server truth。
2. 回到 Principal setup 创建新的 Draft application Mandate。
3. 在新 Draft Mandate 上先下载 application handoff。
4. Agent 完成 request/evaluate，得到 Offer receipt。
5. 再由 Principal 审查并激活该 exact Draft Mandate。

当前 UI 会把这个状态显示为
`Runtime ready · existing Offer required`，并明确提示创建新的 Draft
application Mandate。不要把 runtime handoff 改写成 `application_ready`。

### 7.9 Agent 成功验收

- Human 浏览器从未接收 Agent private key 或 raw signature。
- challenge 过期或重复提交时失败。
- Draft handoff 可以 request/evaluate，但不能 accept/execute/repay。
- Runtime handoff 可以 accept/execute/repay，但不能 request 新 application。
- Principal 不可以用浏览器冒充 Agent repayment。
- Agent 被暂停、credential 被撤销或 Mandate 失效后，经济操作失败。
- Agent Obligation 可以由 Agent owner 和 exact Human controller 读取。
- Cross-Tenant 或无 binding 的 Human 无法读取。

---

## 8. Obligations 与 Repay & Settle

### 8.1 `Obligations`

功能：

- 恢复当前 authenticated Actor 已绑定的 Obligation；
- 显示 original principal、rate、maturity、outstanding 和 reasons；
- 显示 schedule、execution、servicing 和 Evidence；
- Human 显示 owned Human positions；
- Principal 显示 controller-bound Agent positions。

操作：

1. 左侧点击 `Obligations`。
2. 点击 `Refresh owned positions`。
3. 从 `My obligations` 选择 exact position。
4. 查看 current state。

不要手工猜测或修改 Obligation ID。ID 输入仅用于高级恢复和 support。

### 8.2 `Repay & Settle`

功能：

- 查看 trusted-time servicing state；
- 查看 DPD、past due、interest 和 outstanding；
- Human owner 可以提交 synthetic repayment；
- Principal 对 Agent position 只读；
- Risk / Operations resolution 通过独立受控流程完成。

Repayment 成功不一定代表 fully repaid。必须检查：

- outstanding principal；
- outstanding interest；
- outstanding fee；
- installment status；
- lifecycle status；
- Evidence timeline。

---

## 9. Evidence、Hash 和链上记录

### 9.1 五种容易混淆的记录

| 显示项 | 功能 | 是否一定上链 |
| --- | --- | --- |
| Record / object hash | 绑定某一版本业务对象 | 否 |
| Evidence digest | 校验 offchain Evidence 内容完整性 | 否 |
| Transaction hash | 标识真实链上 transaction | 是 |
| Anchor receipt | 把一个或多个 Evidence requirement 绑定到链上 transaction | 只有提交后 |
| Observation / reconciliation hash | 证明 indexer 和 server 如何观察及核对链上状态 | 不一定是 transaction |

只有同时满足以下条件，页面才可以把记录称为已验证链上记录：

- 存在真实 transaction hash；
- chain ID 正确；
- 可打开正确区块浏览器；
- inclusion/finality 状态明确；
- indexer 已观察；
- reconciliation 结果明确。

### 9.2 `Activity & Proofs`

操作：

1. 打开左侧 `Activity & Proofs`。
2. 点击 `Open owner timeline`。
3. 查看 Obligation Evidence。
4. 如需公共 Registry 证明，输入 exact authorization hash，点击
   `Verify Registry Evidence`。

Public Registry Evidence 是已审查的 synthetic Base Sepolia lifecycle，
不等于当前签入用户自己的 repayment record。

### 9.3 Evidence anchor

在 Human Obligation 页面查看 `Base Sepolia anchor`：

- `Not anchored`：仅存在 PostgreSQL 和 digest；
- `Submitted/Included`：有 transaction，但还没有 finality；
- `Safe/Finalized`：链已达到相应 finality；
- `Indexed`：indexer 已读取；
- `Reconciled`：链、server Evidence 和 coverage 已核对。

不要因为看到 `0x...` 就认定它是 transaction hash。

---

## 10. Credit Passport 和 Credit Track Record

### 10.1 Credit Passport 的功能

Credit Passport 是 permissioned underwriting record，用于披露：

- Subject 和 accountable Principal；
- authority 和 credential 状态；
- Decision outcome 和 canonical reason codes；
- active/completed Obligation；
- repayment、delinquency、cure、restructure、default、write-off、recovery；
- Evidence lineage、finality、policy version 和 model version。

它不是公开信用分，也不是 bearer link。

### 10.2 Owner 创建和分享 Passport

1. 先完成或恢复一个 authenticated Credit application。
2. 打开 `Credit Passport`。
3. 点击 `Load my latest Decision`。页面必须显示
   `Verified Decision Passport ready`；Human 和 Agent 都使用这个入口。
4. 选择允许披露的 factor/outcome。
5. 输入 exact verifier actor（高级、受限操作）。
6. 设置 15–60 分钟 lifetime。
7. 点击 `Share private Passport`。

成功标志：

- 返回 artifact ID 和 artifact hash；
- purpose、issuer、lifetime 和 source passport 可见；
- raw KYC/PII、credential 和 strategy data 不包含在 artifact 中。

### 10.3 读取、验证和撤销

- `Recover Passport`：owner 恢复 exact artifact；
- `Verify online`：已绑定 verifier 在线验证；
- `Revoke active proof`：owner 终止 artifact；
- 过期或撤销后不能继续验证。

当前没有 public link、QR、bearer download 或跨 Tenant 任意验证。

### 10.4 Credit Track Record

`Credit Track Record` 只汇总已经加载的：

- Decision Passport；
- owned Obligation Evidence；
- finalized 与 non-final/invalidated 数量。

使用步骤：

1. 先完成一个 Obligation lifecycle，或从 `Obligations` 恢复一个 exact
   owned/controller position。
2. 打开 `Credit Track Record`。
3. 点击 `Load verified record`。
4. 页面必须显示 `Verified lifecycle loaded` 和实际 Evidence event 数量。

仅打开页面或看到空卡片不算通过；按钮必须可点击，且结果必须来自 authenticated
server Evidence。

浏览器历史、未验证 wallet history 或空状态不会自动形成正面信用记录。

---

## 11. Capital Partner

Capital Partner 使用 8790 的 invited operator workspace。

### 11.1 制定 synthetic Offer

这里的 Passport artifact ID、Credit Intent ID、Passport hash 和 version
来自借款人已授权的 Credit Passport 交接包。Capital Partner 页面不会搜索、
猜测或枚举借款人的申请；测试时应由借款人从自己的 Passport 页面读取这些
exact values，并通过受控的私有测试渠道交给受邀 Capital Partner。

| 步骤 | 在哪里 / 点击什么 | 功能 | 成功标志 | 链上 / 资金影响 |
| --- | --- | --- | --- | --- |
| 1 | 8790 Sign in → `Capital Partners` | 进入独立 least-privilege operator 角色 | Access 显示已认证 | 无资金权限 |
| 2 | 填入 Passport artifact ID、Credit Intent ID、Passport hash 和 version | 绑定 borrower-authorized underwriting packet | 表单通过 exact reference 检查 | 只读验证 Passport |
| 3 | 填入 Facility limit、approved principal、per-draw cap、rate、fee、installments、dates | Capital Partner 自行制定透明经济条款 | 所有经济字段可审查 | 仍为 synthetic |
| 4 | 点击 `Issue exact sandbox Offer` | 创建 Capital Partner-authored Offer | Offer ID、Offer hash、terms hash 出现 | PostgreSQL Event/Evidence；无真实资金 |
| 5 | 必要时点击 `Withdraw unaccepted Offer` | 在 borrower 接受前撤回 Offer | Offer 进入 withdrawn | 不产生提款 |
| 6 | 输入 profile ID，点击 `Refresh portfolio` | 查看 Offer、committed、outstanding、repaid 和 Facility | Portfolio 从 canonical projections 加载 | 只读 |

明确禁用：

- `Deposit`；
- `Allocate funds`；
- `Withdraw`；
- public pool；
- custody；
- production pricing authority。

### 11.2 Provider Network

`Provider Network` 是 fixed-loopback、signed、no-funds Provider
边界，不是开放资金网络。

1. 从 Provider assignment / invitation receipt 取得已分配的 exact
   TransferIntent ID。Provider 页面不会搜索或枚举其他 assignment。
2. 输入该 exact TransferIntent。
3. 点击 `Load assigned intent`。
4. 检查 Provider mandate、Facility presentation 和 delivery state。
5. 点击 `Acknowledge exact assignment`。
6. worker/Provider adapter 返回签名 callback 后，由 server 验证并
   reconciliation。

相同 nonce、callback 或 delivery 不能重复改变 canonical state。
`Join public pool`、`Fund facility`、`Withdraw` 和
`Set production pricing` 均不可用。页面中的 earnings simulation
只属于历史示例，不能理解为真实收益。

---

## 12. Trading Capital

当前 Trading Capital 是 Hyperliquid MVP 的 local no-funds product
composition，不是已经启用的外部交易账户。

### 12.1 当前页面怎么用

当前浏览器页面是 existing Facility 的检查和受控收口入口，不是 Facility
创建器。Facility creation、marketplace matching、funding simulation 和
execution setup 当前是角色受限的 API/SDK workflow。完成这些 workflow 后，
从其 receipt 取得 `trading_facility_…`，再回到页面：

1. 打开 `Trading Capital`。
2. 输入 API/SDK receipt 返回的 exact synthetic Facility ID。
3. 点击 `Load state`。
4. 如需 Evidence，点击 `Load Evidence`。
5. 使用八个视图检查 lifecycle：

| 视图 | 功能 |
| --- | --- |
| Overview | Facility、settlement 和 Evidence 总览 |
| Profile | account binding、历史导入、Evidence snapshot、credit profile |
| Marketplace | capital request、provider mandate、matching 和 bilateral acceptance |
| Setup | Facility、subject contribution、provider funding、activation |
| Live | synthetic order intent、cancel 和 state read |
| Risk | evaluate、pause new risk 和 flatten |
| Settle | close request、worker settlement 和 settlement read |
| Proof | Performance Proof 和 Facility Evidence |

### 12.2 关键限制

- 25 个 catalog operations 是协议能力映射，不代表用户当前拥有全部权限。
- `externalSystemQueried=false`；
- `externalOrderSubmitted=false`；
- `realCollateral=false`；
- `realFunding=false`；
- `withdrawable=false`；
- settlement worker 不接受用户填写 PnL、fee、cost 或 price。

`Request close` 只有在 Facility 已 flattened、零 exposure 且没有 open order
时可用。`Issue Performance Proof` 只有在 settlement finalized 后可用。
`Run settlement` 是 worker-only。`Withdraw` 始终不可用。

Hyperliquid Testnet signed execution 需要单独 signer、risk 和 L2
批准，不属于本手册当前可用功能。

---

## 13. Risk & Operations

Risk Operator 使用 8789。

Risk portfolio ID、servicing queue ID 和可 freeze 的 Agent Subject ID
由 closed-pilot operator provisioning 或对应的受控测试 fixture 提供。Risk
页面不会搜索或枚举 Tenant、portfolio、queue 或 Subject；如果手中没有 exact
ID，应先完成 operator provisioning，而不是在页面中猜测。

主要功能：

- `Load posture`：读取 Tenant aggregate exposure；
- 查看 limits、utilized、outstanding 和 adverse obligations；
- 查看 Human/Agent pilot lifecycle health；
- 查看匿名化设计伙伴反馈；
- `Load queue`：读取 delinquency/default servicing queue；
- 对 exact Agent Subject 执行保护性 freeze；
- 通过受控、可能要求 dual control 的流程执行 restructure、repurchase 或
  write-off。

Risk 页面不显示 raw borrower PII，也不能因为页面展示了 control policy
就声称当前 incident、alert 或 reconciliation 已经发生。

全局 pause、Subject freeze 或 Facility freeze 生效时，新的 risk-increasing
operation 必须失败；read 和安全恢复操作按各自权限继续。

---

## 14. Reports & Exports

1. 先在 `Obligations` 恢复 exact owned Obligation。
2. 打开 `Reports & Exports`。
3. 选择 `JSON · canonical` 或 `CSV · formula-safe`。
4. 选择 15、30 或 60 分钟 lifetime。
5. 点击 `Create from current Obligation`。
6. 使用 `Read metadata` 查看服务器元数据。
7. 使用 `Verify & download` 校验 exact SHA-256 后下载。
8. 使用 `Revoke` 终止 artifact。

报告来源最多为 50 条 redacted Evidence。没有 HTML、public link、bearer
grant、signed URL、生产 fee 或 real-funds authority。

---

## 15. 左侧导航说明

| 页面 | 主要作用 |
| --- | --- |
| Home | 当前角色、产品入口和最近 lifecycle |
| Credit | Human credit 或 Agent credit entry |
| Trading Capital | synthetic purpose-bound trading Facility |
| Capital Partners | bilateral Offer 和 portfolio |
| Obligations | 当前 Actor 已绑定的 exact positions |
| Repay & Settle | schedule、repayment 和 servicing |
| Credit Passport | permissioned Decision/credit artifact |
| Credit Track Record | Evidence-derived longitudinal summary |
| Agent Console | Agent authority、handoff、12 tools 和 SDK/MCP contract |
| Wallet & Permissions | Session、wallet、network 和 effective powers |
| Provider Network | exact no-funds TransferIntent delivery |
| Activity & Proofs | owned Evidence 和 public Registry Evidence |
| Reports & Exports | server-generated bounded artifacts |
| Risk & Operations | aggregate risk、queue、freeze 和 controlled resolution |
| Architecture | authenticated capability contract，不授予新权限 |

`More tools` 只是展开高级页面，不会增加服务器权限。

---

## 16. 常见问题和处理

### 16.1 Sign in 后页面没有切换

检查：

- 顶部是否显示 `Signed in`；
- 是否显示 `Secure session active`；
- 当前端口角色是否正确；
- 是否出现 `Switch role`；
- wallet account 或 chain 是否在签名后发生变化。

处理：

1. 点击 `Sign out`；
2. 确认私有信息隐藏；
3. 回到正确角色端口；
4. 重新选择 wallet、network 并签署新的 SIWE。

### 16.2 Sign out 后不能 Sign in

先刷新页面，重新显式选择已发现的钱包 Provider。Sign out 会结束服务器
Session 和钱包选择，但不应要求清空浏览器或删除数据库。

### 16.3 `session is not active`

含义：浏览器携带了已经结束、过期、撤销或角色不匹配的 host session。

处理：Sign out 或刷新 → 正确端口 → 重新 Sign in。不要尝试复用旧 CSRF、
Session ID 或 Agent credential。

### 16.4 Agent `Create signing request` 后没有结果

检查：

- Agent Subject 是否存在；
- challenge 是否已创建且未超过五分钟；
- proof request 是否下载到仓库内；
- 是否运行了 `pnpm run local:agent:prove -- <file>`；
- Agent key 是否属于当前 Tenant；
- 是否点击 `Refresh binding`。

### 16.5 Agent Activate 后看不到贷款

Activate 只创建 authority。检查 Agent 是否在 Draft application handoff
阶段完成：

- `ipo_one_request_credit`；
- `ipo_one_read_credit_application`；
- `ipo_one_evaluate_credit_application`。

如果没有，参见 7.8。不要把 Active runtime handoff 当成 application
handoff。

### 16.6 Obligation 看不到

检查：

- Offer 是否已经 accepted；
- acceptance 是否返回 Obligation ID；
- 是否在正确 Actor/Principal Session；
- `Obligations` 是否点击 `Refresh owned positions`；
- Principal 是否是该 Agent Subject 的 exact controller。

### 16.7 Repayment 按钮不可用

可能原因：

- Obligation 尚未 executed；
- 已 fully repaid；
- 当前是 Principal read-only view；
- Agent credential/Mandate 已撤销或失效；
- Subject 或 Facility 已暂停/冻结；
- server operation 不在当前 authenticated catalog。

### 16.8 页面显示 Evidence Hash，但 BaseScan 找不到

Evidence Hash 默认是 offchain digest，不是 transaction hash。检查
`Chain transaction` 是否明确显示 transaction、block 和 explorer link。
如果显示 `Not submitted` 或 `Not anchored`，BaseScan 不会存在对应交易。

### 16.9 API timeout 或结果 unknown

- 不要用新 idempotency key 盲目重试同一个经济操作；
- 先使用原 request/idempotency context 查询当前 server truth；
- 等待 reconciliation；
- unknown 状态下停止新的 risk-increasing action；
- 只有确认前次未执行后才允许重新提交。

### 16.10 重启后数据丢失

正常情况下 PostgreSQL volume 会保留数据。运行：

```sh
pnpm run local:status
pnpm run local:acceptance
```

不要使用 `local:reset` 处理普通登录或 UI 问题；reset 属于破坏性测试环境操作。

---

## 17. Human 测试清单

- [ ] 8787 可以打开并明确显示 Local Synthetic / No Real Funds。
- [ ] Sign in 后显示正确 Human Borrower workspace。
- [ ] Subject 和 Consent 可以创建或恢复。
- [ ] raw KYC/PII 不显示。
- [ ] Request & evaluate 返回 Decision、reason codes 和 Offer。
- [ ] 未确认 exact Offer 时无法 acceptance。
- [ ] acceptance 只创建一个 Obligation。
- [ ] execution 不移动真实资金。
- [ ] repayment 使用 fee → interest → principal waterfall。
- [ ] Evidence digest 与 chain transaction 分开显示。
- [ ] restart 后 Obligation 可以恢复。
- [ ] Sign out 后私有数据隐藏。

## 18. Agent 测试清单

- [ ] 8788 只允许 Principal Controller 设置 Agent authority。
- [ ] Human Borrower Session 不能直接使用 Principal controls。
- [ ] Agent Subject 创建后为 pending。
- [ ] EIP-712 challenge 五分钟过期且 one-use。
- [ ] Agent Host proof 成功后 AccountBinding 变为 active。
- [ ] 浏览器不接收 Agent key、credential 或 raw signature。
- [ ] Draft application handoff 可以 request/evaluate。
- [ ] Draft handoff不能 accept/execute/repay。
- [ ] Active runtime handoff不能 request 新 Credit Intent。
- [ ] Active runtime handoff可以 accept/execute/repay。
- [ ] Agent Obligation 使用与 Human 相同的 schedule、Ledger 和 Evidence。
- [ ] Principal 可以 exact-resource read。
- [ ] Principal 不能代替 Agent repayment。
- [ ] credential revoke、Mandate expiry、pause 和 freeze 均 fail closed。
- [ ] Sign out 后 Agent/private information 不显示。

## 19. Capital Partner 和 Trading Capital 测试清单

- [ ] 8790 只允许 invited Capital Partner role。
- [ ] 未授权 Passport 不能读取或制定 Offer。
- [ ] stale Passport hash/version 不能创建 Offer。
- [ ] duplicate acceptance 不创建第二个 Facility。
- [ ] Deposit、Allocate funds、Withdraw 均不可用。
- [ ] Trading Capital 加载 exact synthetic Facility。
- [ ] external execution 和 real funding 明确为 false。
- [ ] close 前必须 zero exposure 和 no open order。
- [ ] settlement 由 worker 执行并保持 contribution conservation。
- [ ] Performance Proof 不包含 raw history、strategy data 或 universal score。

---

## 20. 当前产品说明和后续优化

WEB-023 已把 Agent setup 修正为两个明确阶段：

- `Run the Agent application` 在 Activate 之前；
- Draft 状态显示 `Open application handoff`；
- Active 状态显示 `Open runtime handoff`；
- runtime 状态明确要求已有 Offer receipt，并说明新申请必须创建新的
  Draft Mandate。

仍需后续产品优化：

1. 用户主路径不应要求手工输入内部 Subject、Mandate、Credit Intent、
   Obligation 或 report ID；这些应只存在于 Advanced / Support 区域。
2. 每一个 hash 仍应持续显示明确类型、chain state、finality、indexer 和
   reconciliation。
3. 当前 authenticated screenshots 需要在完成一次新的交互式 wallet
   签名后重新采集；旧截图不能作为当前版本事实。

这些缺口不改变 canonical server rules。后续 UI 调整必须以当前两阶段
Agent protocol 和一个 shared Obligation kernel 为准。

---

## 21. Support 时应提供什么

遇到问题时只提供：

- 页面名称和角色端口；
- 屏幕显示的安全错误 code；
- Request ID；
- operation name；
- 发生时间；
- 当前 lifecycle stage；
- 可公开的 Testnet transaction hash（如果页面明确标记为 transaction）。

不要提供：

- private key；
- seed phrase；
- bearer token；
- raw Agent credential；
- raw KYC/PII；
- 未经授权的完整 handoff；
- 数据库密码；
- Session cookie 或 CSRF token。

---

## 22. 版本维护规则

每次 UI、OpenAPI、SDK/MCP、role、operation 或 lifecycle 改动后，必须：

1. 更新本手册版本和日期；
2. 验证所有按钮名称；
3. 验证 Human 和 Agent 仍使用同一 canonical kernel；
4. 运行 Human/Agent acceptance checklist；
5. 区分 implemented、locally verified、Testnet verified、hosted 和
   real-value active；
6. 重新采集对应版本截图；
7. 将手册发现的不可执行步骤作为产品 Bug，而不是修改文案掩盖。
