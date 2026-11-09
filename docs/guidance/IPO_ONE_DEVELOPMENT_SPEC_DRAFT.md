# IPO.ONE 产品需求与验收 PRD

2026-11-09 更新 · A2/B0 完成，B1 Human 核心六语已部署验收。B2 首批 Binance/OKX/MetaMask 不变；两轮桌面扫码失败后 Founder 暂缓 QR，公开 WalletConnect 保持停用；直连提示补修已发布，完整钱包矩阵未完成。B3 Human 无真实资金合成抵押闭环已在 56f2718 / https://ipo.one 完成实际用户验收：接受、确认、执行、还清、解除及刷新/退出重登恢复通过，原14条与新12条凭证一致，信用快照 v2 / 2周期。B4方案A与B4-F1已按Founder批准完成L0本地合成实现及验证；未部署或启用生产收费/退款。其他未测范围不由此通过。

## 1. 产品目标与本轮交付

IPO.ONE 是 Human 与 Agent 共用的信用义务协议。用户完成身份与授权、信用申请、条款审阅、接受 Offer、形成 Obligation、合成执行与还款，并能重新登录找回同一记录和 Evidence。Human 通过可见控件操作。Agent 由可追责的 Principal 在有效 Mandate 下，经版本化接口操作。两种入口共享身份、义务、账本、风控、服务事件、对账和 Evidence。

| 交付 | 用户可见结果 | 判定标准 |
| --- | --- | --- |
| **A · L2 无真实资金 Beta** | 普通 Human 和 Principal 可进入并恢复自己的工作台。Human 能找到历史义务、还款和凭证。Principal 只看到有权控制的 Agent，Agent 可通过授权 API 恢复记录。 | 在同一实际托管 SHA 上完成 A0–A8 所适用的检查，交付体验 URL 和逐项证据。 |
| **B · Jarvis 两周伙伴演示／测试** | 在同一信用流程中演示六语言、多钱包及移动端批准，并展示原文约定的抵押提交、费用策略、BNB Chain 与 Ethereum 主网目标对应的行为。 | 每项需求对应原文、明确的环境和验收用例。伙伴可按脚本操作并找回回执。演示范围和发布状态分别记录。 |

产品原则和权限判断以 [Product Constitution v2.0](../PRODUCT_CONSTITUTION.md) 为准，当前规范性需求 ID 与获准范围由 [Current Authorization Register](../governance/CURRENT_AUTHORIZATION_REGISTER.md) 维护，并与 [Product Charter v1.1](IPO_ONE_PRODUCT_CHARTER_v1.1.md) 和 [Launch Policy](../../deploy/launch-policy.v1.json) 对照。A0–A8、B0–B5 是本 PRD 的验收编号，不新增运行权限。

## 2. Codex 启动顺序

1. **先做 A0。** 核实当前目标 SHA、项目访问、候选 URL、回退目标和相关授权。完成后才可判定哪些托管验收能开始。
2. **按交付范围执行 A1–A8。** 已承诺的 Human/Principal/Agent 路径保留，记录实际覆盖与首个失败点。A3–A8 的隔离数据、身份和故障矩阵按对应任务安排；不把无关矩阵变成所有后续开发的串行前置门槛，也不把未测项标为通过。
3. **B0 对照后拆解 B1–B5。** 保留原文六语言、两类贷款、两链及费用/额度要求。每个增量明确完成范围与剩余差额；阶段性切片不能被宣称为整个伙伴版本完成。
4. **按 issue 实施。** 开始前选定一个可验收增量，核对当前分支、现有实现及版本差异，引用本 PRD 验收编号和宪章需求 ID，按 [产品工程与体验标准 v1.1](IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.1.md) 的相关要求记录范围、授权、验证与回退。项目级访问、独立资源、原文或特定批准缺失时，记录所缺证据和可以继续的独立工作。

### A0 · 确定候选和环境

11 月 6 日核查记录显示，公开 `/readyz` 返回 `bbd7ba2`，为 L2 无真实资金配置。GitHub `main` 当时为 `572c224`，包含 PR #93 的义务历史与信用快照，以及 PR #94 的公开披露和 sitemap。该 SHA 有 Quality Gate 和封存发布包记录。9 月 BNB 钱包真人验收与 10 月钱包亲验反馈按各自版本及范围保留。执行时重读目标和实际服务 SHA，解释任何变化。 [GitHub main](https://github.com/CPTM511/IPO.ONE/commit/572c22484603b8f19183d4836647654c2e2d4120) · [公开就绪端点](https://ipo.one/readyz) · [发布结果](../../output/release-20261018-pr93-pr94/RESULT.md) · [BNB-004](../codex/tasks/BNB_004_PUBLIC_NO_FUNDS_ACCEPTANCE_AND_RELEASE.md) · [钱包反馈](../../output/acceptance-20261018-offline-final-audit/WALLET_USER_FEEDBACK_ADDENDUM_20261018.md)

| 对象 | 启动所需证据 |
| --- | --- |
| **既有 L2 发布候选 `572c224`** | 核实 `ipo-one-internal` 项目访问，记录目标 commit、构建及迁移清单、实际部署 ID、体验 URL 和可操作的兼容回退目标。复用已有精确发布包和环境流程。当前记录仍缺候选的实际托管验收。 |
| **独立预览候选 `2a0ab24`** | 单独核实项目及候选策略、隔离合成数据库、应用角色、origin/audience、已有授权身份、配额和有效期。资源仍是 `PENDING_RESOURCE_BINDING` 或候选 URL 未确定时，停在环境核对。 |
| **Jarvis 演示候选** | 原文需求逐项确认后再记录选定的 SHA、环境、测试身份、设备、网络和适用决策。 |

已有发布或预览授权按原范围复用，实际动作及回退以对应交接为准。缺项目操作权限、兼容回退或精确资源绑定时，指出缺的是哪一项。环境与证据始终按各自候选 SHA 归档。 [发布交接](../../output/release-20261018-pr93-pr94/DEPLOYMENT_HANDOFF.md) · [PREVIEW-001](../../output/acceptance-20261017-preview/implementation/PREVIEW_001_ISOLATED_NO_FUNDS_ACCEPTANCE.md)

**11 月 7 日执行更新：** A0 的 Primary 发布核对已完成。原候选 `572c224` 因最新生产依赖审计未通过而未公开推广；Founder 批准三条依赖链修复后，PR #95 合并为 `347478f`，实际发布源码为 `b01782f`，二者源码树一致。正式地址为 <https://ipo.one>，部署 `dpl_VnhV1yYA6aCvB5g7eHyAhhMywixP`，兼容回退目标仍为 `dpl_DZdWYtxvBEtMy6du3yFsMi7abKau` / `bbd7ba2`。A2 已以本次 Human 样本完成主动退出、同钱包重登与刷新恢复：同一义务、还款、14 条链下 Evidence 和 v1 信用快照一致，服务端退出/重登均返回 200。A3–A8 和 B1–B5 尚未由此通过。 [当前发布与回退清单](../../output/release-20261107-pr93-pr94/RELEASE_CHECKLIST.md) · [逐项浏览器证据](../../output/release-20261107-pr93-pr94/repair-public-browser-acceptance.json)

## 3. 角色、界面和协议

| 角色 | 可以完成的行为 | 系统验收边界 |
| --- | --- | --- |
| **访客** | 阅读公开信息、合成资金披露、可用性说明，打开登录。 | 私有对象和工作区数据只对通过认证和授权的主体返回。 |
| **Human** | 登录或恢复自己的工作台，管理 Consent 和适用 KYC/VC 引用，申请、审阅并接受条款，查看还款计划、操作已批准的合成还款及查看 Evidence。 | 能从可见导航到达角色允许的视图。已有主体、历史义务与授权按服务端状态恢复。 |
| **Principal** | 管理其有权控制的 Agent、Mandate、许可范围与状态，在合法范围内查看相关义务和 Evidence。 | 每次读取或变更复核 Tenant、控制关系及当前权限。工作区切换后，前一主体的内容和迟到响应失效。 |
| **Agent** | 用现有授权身份经版本化 API 执行 Mandate 所允许的动作并获取回执。MCP 验收覆盖实际注册的工具。 | 与 Human 共用协议状态和授权规则。过期、撤销、越权和重复请求按已有契约处理。 |
| **Capital Partner、Risk、Operations 等受控角色** | 在获准环境按现有任务操作审阅、Offer、服务或运营视图。 | 保留角色分离和需要的独立批准。相应视图通过角色允许的入口到达。 |

现有能力的完整范围留在当前授权注册表。人类信用流程保留逾期、违约、补救、重组、回购与核销。Credit Passport 按权限披露可验证记录，信用历史用于解释新的决策或 Offer。M3 使用获批的单一合成计量 profile。上述能力各自按既有阶段和权限交付。 [产品结构与生命周期](IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md) · [当前需求注册表](../governance/CURRENT_AUTHORIZATION_REGISTER.md#4-stable-approved-capability-registry)

页面沿用 WEB-027 Precision Terminal。每个工作区显示当前状态、下一步和可见的历史入口。经济动作的按钮明确表述实际动作，确认页显示对象和关键条款。禁用功能说明原因及恢复条件。技术标识可展开查看，普通操作通过界面完成。加载、空记录、失败、拒绝及恢复各有可见状态。 [当前 UI 基线](IPO_ONE_CURRENT_UI_BASELINE.md)

## 4. L2 功能及验收矩阵

以下用例沿用现有验收脚本。固定已授权的 Human A/B、Principal P、Agent G 与对照主体。涉及变更、批量合成历史、故障注入和运维恢复的用例按独立环境和对应授权执行。 [PR93/94 发布验收矩阵](../../output/release-20261018-pr93-pr94/ACCEPTANCE_MATRIX.md) · [独立预览验收脚本](../../output/acceptance-20261018-offline-final-audit/DEPLOYED_CHECKLIST_DRAFT.md)

| 编号与需求 | 前提与操作 | 可验证结果 |
| --- | --- | --- |
| **A1 · 公开入口与环境** | 打开实际托管 URL，查看公开披露、登录入口与 sitemap。核对 `/livez`、`/readyz`、能力说明和实际页面资产。 | 版本、部署和配置指向同一候选。公开披露与无真实资金、外部执行禁用等服务端状态一致。sitemap 只包含批准公开的页面。私有入口要求认证。 |
| **A2 · Human 登录与恢复** · `REQ-ID-001`、`REQ-UX-001`、`REQ-UX-005` | Human A 从公开页登录，从可见义务历史找到记录，打开还款与 Evidence。刷新、退出并重新登录后重复查询。 | 进入同一主体的工作台，义务、条款、还款和凭证与服务端一致。无需内部 ID。查询及重新登录不会新增义务、还款或 Outcome。 |
| **A3 · 义务分页和信用聚合** · `REQ-EVID-004` | 获准隔离环境中有一份至少 513 条授权记录的冻结对照集。按时间与状态筛选，遍历前后页，载入信用快照。 | 每页至多 25 条，遍历结果与冻结对照集一致，无漏重。变更筛选重置游标，信用聚合与完整权威记录一致。未完成、空结果和查询失败的状态可区分。 |
| **A4 · Principal 与 Agent** · `REQ-ID-002`、`REQ-ID-005`、`REQ-UX-002` | P 从可见工作区选择 G。G 经授权的 `POST /tenant/v1/operations` 调用 `pilotReadWorkspaceResume` 恢复引用，再读取 Obligation、Evidence 及 Credit State。 | 结果只含获准主体的数据，与服务端归属和可读状态一致。使用现行 API 契约，分别记录 HTTP 和适用的 MCP 证据。 |
| **A5 · 切换、越权与撤权** · `REQ-PRIV-001` | 从 A 切至 B，尝试用失效会话、前一主体的游标、错误主体或跨 Tenant 访问。在已授权测试范围撤销角色或绑定后再试。 | 旧游标、旧请求和未授权访问被拒，授权拒绝不泄漏记录，迟到响应不覆盖当前页面。有效主体恢复后只见当前允许的信息。 |
| **A6 · 核心信用闭环回归** · `REQ-CREDIT-001`、`REQ-CREDIT-002`、`REQ-CREDIT-006`、`REQ-CREDIT-007`、`REQ-EXEC-001`、`REQ-PAY-001`、`REQ-PAY-002` | 在获准合成环境，用 Human 控件及 Agent 授权接口各跑适用场景，依次完成申请、解释和审阅 Offer、接受、合成执行与还款。重发同一命令，并尝试接受失效 Offer 或超出 Mandate 执行。 | 接受精确条款后生成唯一义务，金额、币种和还款计划与 Offer 一致。失效与越权操作被拒。重试只保留一次业务效果，账本和回执可核对。实际使用的 Capital Partner 或合成出价机制按授权与环境记录。 |
| **A7 · 故障与持久性** · `REQ-EVID-001`、`REQ-EVID-002` | 在已批准的环境覆盖查询不可用、重复事件、worker 重放和适用的数据库恢复。通过可见入口重试并重新读取。 | 失败时显示可执行的恢复方式，旧信息不冒充新结果。恢复后权威状态、账本与投影一致，重复事件无第二次业务效果。Evidence 区分摘要、交易、观察、最终确认和对账。 |
| **A8 · UI、主题与可达性** · `REQ-UX-001`、`REQ-UX-004`、`REQ-UX-005` | 使用实际服务的页面，在 1440px 和 390px 下验证登录、导航、工作台及受影响视图。覆盖亮暗主题和受影响控件的键盘及焦点行为。 | 每个角色允许的视图有可见入口。用户能看清并完成下一步。禁用状态给出原因与恢复条件，当前可用流程在移动宽度和两种主题下均可操作。 |

A4 使用的具体读取操作为 `pilotReadOwnObligation`、`pilotReadOwnObligationEvidence`、`pilotReadOwnCreditState`，以实际部署目录和授权为准。现有历史查询由 HTTP 提供，MCP 中对应已有工具按其实际能力验收。 [Tenant Protocol v1](../../api/tenant-protocol/ipo-one.tenant-protocol.v1.json)

## 5. Jarvis 伙伴演示需求

**B0 原文已读取。** 已通过原始 Library 页面只读核对《IPO.one 两周产品迭代任务指导书》v1.1，文内日期为 2026-10-29；已保存全文渲染文本及其摘要。原文有 R01–R08 和 AT01–AT10，区分“Michael 已确认的需求”“工程建议”“外部待确认项”。两周是开发启动并固定资源后的目标窗口，没有据此推定已开工天数或固定交付日期。下文的需求确认是对原文的忠实记录；实施、策略生效和发布仍按当前宪章及授权范围。 [原始指导书](https://chatgpt.com/library?file_id=libfile_8a71710b36b88191a2b1b56ab650c02d&account_id=personal) · [全文文本快照](../../output/release-20261107-pr93-pr94/jarvis-development-guide-v1.1-rendered-source.txt) · [来源与核对证据](../../output/release-20261107-pr93-pr94/b0-source-verification-20261107.json)

| 编号与需求 | 开工前固定的输入 | 建议验收 |
| --- | --- | --- |
| **B0 · 原文对照** | 原文版本、日期和条款。每条原文对应 PRD 编号、现有仓库需求、目标环境、可执行验收及未决差额。 | 每条均可追溯。原文未覆盖或与现行权限冲突的内容列为独立待决项，保留其来源与提出人。 |
| **B1 · 六语言** | 已明确 `en/zh/es/fr/ru/vi`，对应英、中、西、法、俄、越。核心路径与所有阻断信息均覆盖；默认/回退、术语表及文案复核责任在实施任务中固定。 | 逐语言完成登录、借款/报价/费用披露、确认、还款、错误和 Evidence 流程。切换语言不改变主体、金额、币种、期限或条款；缺译阻止该六语版本发布，长文本和变音字符不得截断。 |
| **B2 · 多钱包与移动端批准** | Founder 本轮已确定首批 Binance Wallet、OKX Wallet、MetaMask。桌面 macOS Chrome、iPhone/Safari、Android/Chrome、钱包内浏览器、桌面 QR 和恢复分别建矩阵；其余未测平台不自动宣称支持。复用现有注入式钱包和 WalletConnect，旧截止日与线上配置须明确续批／接入。 | 三钱包共 21 个核心连接组合；逐个记录实际版本、网络、连接／拒签／取消／换账户／换链／重登／App 返回和原记录恢复证据。另有 2 个伙伴回跳及 2 个不兼容浏览器恢复场景。回跳允许列表、短期一次性状态和隐私边界保持，缺少真机或伙伴契约不记为通过。 |
| **B3 · 抵押提交** | 明确提交意向、合成确认或链上提交的范围，以及资产、金额、网络、抵押状态和对应批准。复用 M2 既有模型。 | 用户确认前可见资产、金额、网络和动作。相同提交只生效一次。错误链、失效报价或超限请求被拒。Evidence 精确表明合成、提交、最终确认和对账状态。 |
| **B4 · 费用策略** | 原文确认：机构端按合格实收正常利息的 **10%** 分成；借款人端按实际成功放款本金的 **0.10%**，无最低费、单笔经济贷款累计封顶 **$10**。本轮已批准A：费用额外单列，USD整数累计向下取整保留余数、UTC自然月合成结算；新B4贷款适用，具体约束见B4任务。生产合同/收费及发布仍未获准。 | 用整数最小单位/受控定点数计算；$100/$1,000/$10,000 对应 $0.10/$1/$10。技术分批与重试不得重置封顶或重复收费；冲回以补偿分录关联原流水。区分平台服务费与资金方 origination fee，确认页与账本一致。 |
| **B5 · BNB Chain 与 Ethereum 主网** | 两条网络各自确认连接、登录、账户证明、公开读取与链上写入是否属于演示，以及网络和动作的授权。 | 按「网络 × 动作」记录通过和拒绝结果。CAIP-2 与 CAIP-10 绑定一致，错链、未授权和过期签名被拒。界面明确区分钱包连接、链下合成与链上证据。 |

演示先串起一条伙伴可亲手完成的旅程。选择语言和钱包，登录，提交或打开信用请求，审阅条款及适用费用，在获准环境做约定的抵押与合成操作，随后退出再进入，从历史找回同一义务和回执。再按原文确认的语言、设备和网络组合补齐验收。该顺序是本稿提出的执行方案。

### 5.1 原文需求与仓库逐项对照

初始对照绑定已发布源码 `b01782f`，后续行按各自证据更新；当前 B3 完成基线为 `56f271862941f22c9f54ba44fa6fcfb934d5f382`，不把当前根工作区的并行修改当作已发布版本。现行权限按本工作区宪章 v2.0 和授权注册表核对。下面是必要文件和已取得验收的核对结果，不是全仓库每项功能均已完成的声明。

| 原文需求 | 复用与映射 | 当前差额及验收 |
| --- | --- | --- |
| **R01 · 伙伴入口、钱包、BSC/Ethereum** | B2/B5；`REQ-ID-001/004`、`REQ-CHAIN-001`、`REQ-UX-001`；现有钱包适配器。 | Founder 已批准三钱包受限实现和条件发布至 2026-12-08 北京时间 23:59:59。7e75f33 与 959b044 两轮实际桌面扫码均未完成，已回退 B1、删除公开 Project ID；Founder 明确暂缓 QR，6 个组合记 DEFERRED_BY_FOUNDER_NOT_PASSED，需明确恢复请求才可重启。内置浏览器成功仅为用户反馈；桌面及钱包内置注入直连继续，外部 App 路径停用、未验收。现有四网络仅沿用已批准动作，Ethereum eip155:1、伙伴回跳与完整适配未验收。 |
| **R02 · 六语言核心流程** | B1；Precision Terminal 与 REQ-UX-001/005。 | 本轮批准的 Human 核心切片已通过：bcce697 正式发布；两条同 SHA CI、176 浏览器测试、正式资源和六语公开登录框通过，实际 144 页面/12 标签/42 历史状态通过。用户同钱包重登及真实刷新重新查询后，原义务、$120 已还/$0 余额、14 条链下 Evidence 和信用 Outcome 一致。动画、深层介绍及 Agent 操作工作区全面翻译仍不在本轮完成声明内。 |
| **R03 · 信用贷与一组抵押组合** | B3/A6；共享 Obligation/Ledger，`REQ-CREDIT-001/007`、`REQ-POOL-001`、`REQ-COLL-001`。 | B3 Human 合成 USD-cent / 非兑付合成 WETH 已在56f2718完成接受→确认→执行→还清→解除和恢复，复用共享内核。该合成路径与仍只读的链上 Pool 接口分开；不伪造链交易。真实首发组合、外部资金方及完整双类型伙伴演示仍待验收，不激活真实信用贷或主网托管。 |
| **R04 · 人的履约归人，Agent 行为单列、不重复记信用** | A3/A4；`REQ-CORE-001`、`REQ-EVID-001/004`、Principal/Subject 关系。 | 当前 Human 样本恢复为2个信用周期，原14条与新12条 Evidence、两条 Outcome 一致；旧记录未被重写。没有据此验证人/Agent混合归因。AT07仍需在同一业务下分别查询事实、Agent行为、模型结果与资金方决定，并证明履约只计一次。 |
| **R05 · Agent 默认子额度与共同总额占用** | `REQ-ID-005`、`REQ-CREDIT-009`；复用 CreditLine/Facility、Mandate 和已有预留模型。 | 原文 CreditFacility/AgentAllocation/Reservation 是建议逻辑对象名，不构成第二套内核。AT03/AT04 要证明本人和两个 Agent 竞争同一总额的原子约束、放款转占用、失败依证据释放、撤权拒绝；当前未取得该场景通过证据。 |
| **R06 · 10% / 0.10% / $10 费用** | B4；`REQ-PAY-001/002`、Offer 披露和版本化费用政策。 | 旧 `fee_audit_policy.v1` 保持 unavailable及原flags。新版本仅本地合成费用条款已按Founder批准实现并通过AT05/AT06；F1源信用、费用补偿、Agent占用及信用归因同步通过。无生产激活或真实收费；[本地结果](../../output/b4-fee-policy-20261109/RESULT.md)明确验证层级。 |
| **R07 · 资金方最终决定并承担信用风险；平台不出资/兜底** | 现有 Capital Partner Offer、确定性策略、`REQ-CREDIT-004/005/006`。 | 未核实的伙伴、资金方或评估接口不得标为已集成；无真实接口时只用明确测试/模拟数据。真实审批、资金来源、身份核验、贷后与争议分工需要相应主体确认。 |
| **R08 · 两周演示/测试，真实资金另验收** | A0–A8 与原文 AT01–AT10；当前 no-funds 基线。 | D1 起点、人力/资源和伙伴接口到位时间尚未冻结。本次 A2 和 B0 不等于两周版本完成；没有启动真实资金、收费、主网写入或新增支出。 |

原文验收交叉索引：AT01→A6 Human；AT02→B3；AT03→R05 共同总额；AT04→A5；AT05/AT06→B4 与账本对账；AT07→A3/A4；AT08→A7 及抵押/链异常；AT09→B1/B2/B5/A8；AT10→身份隔离、模拟/真实边界和服务端关停。原文“第二次申请引用上一笔已验证记录、展示模型或资金方决定来源”的演示要求保留，尚未在本轮验证。

### 5.2 下一开发增量与待决事项

**B1 Human 核心六语已完成本轮验收。** 正式源码 bcce697，部署 dpl_3HJLd2Xi8EPA5eadzLqCtfaBxFL1，PR99 合并为 06ddecf，源码树一致。完整本地门禁、两条同 SHA CI（176 项浏览器测试、生产审计无已知漏洞）、正式健康和 12 个资源摘要通过。实际六语言 × 六视图 × 明暗主题 × 1440/390 的 144 项页面检查、12 项进度标签边界和 42 项历史状态检查全部通过；俄语长标签换行已目视核验。用户同钱包重登后，又完成真实刷新和可见服务端重新查询：同一义务、$120 已还 / $0 余额、14 条链下 Evidence ID/摘要、同一 Outcome 以及快照 v1 的 1 个信用周期一致，逾期 0 天、已还 100%、损失 $0。**PASS — DEPLOYED AND USER-VERIFIED**，范围限本轮批准的 Human 核心切片。先前 2f/071 缺译失败和 b5 标签缺陷证据保留，当前结论使用 bcce697 的新证据。 [当前结果](../../output/b1-language-review-20261108/RESULT.md) · [实施任务](../codex/tasks/B1_SIX_LANGUAGE_CORE_JOURNEY.md)

**B2 续批历史保留，执行范围已按 Founder 指令收窄。** 三钱包和原四网络／八方法最大签名边界不变；无交易、真实资金、新 SDK／链或新增支出。7e75f33 与 SDK 修复版 959b044 均曾完成技术门禁及条件部署，但两轮 iPhone＋OKX 桌面扫码均未完成。Founder 决定暂缓，已恢复 B1 bcce697、删除唯一 Project ID，禁止旧候选重新激活。直接钱包入口继续；50ee192 / PR #102 已完成同头双 CI、同树合并及正式发布，六语网络提示和停用说明经 96 正式浏览器状态核验，WalletConnect 保持关闭。OKX iOS/Android 内置浏览器登录只记用户反馈，版本、网络、原记录和刷新/重登未冒记通过。

B2 的直接回退基线为已验收 B1 bcce697 / dpl_3HJLd2Xi8EPA5eadzLqCtfaBxFL1；无数据库回退。当前不再等待扫码复测，继续直接钱包路径与下一里程碑。B3 已选择合成确认：复用既有 M2 约束，在申请与 Offer 中先固定非兑付合成 WETH 条款，确认→执行→还款→解除共用同一 Obligation/Ledger/Event/Evidence。本轮无链提交，原 Pool 链接口仍只读。B3 记录产生后不得退回缺少抵押保护的旧 B1/B2 代码；先在旧迁移集合推广兼容停用版，再新增0089、最后启用；停用仅兼容旧/新两个精确集合，启用要求新集合，保留 schema、记录和回执。[B3 首个卡点与待审实施方案](../codex/tasks/B3_COLLATERAL_SUBMISSION_ALIGNMENT.md)。伙伴契约与完整矩阵缺证仍未验收。 [B1 精确清单](../../output/b1-language-review-20261108/RELEASE_CHECKLIST.md) · [现有正式体验](https://ipo.one)

**B3 当前完成状态（2026-11-09）：PASS — DEPLOYED AND USER-VERIFIED，范围为批准的 Human 合成闭环。** 精确源码56f2718、生产部署`dpl_9Jdtb51bGHrRATTXgmyey9sSStL5`，exact CI与实际资源匹配。Founder原钱包接受$120/9%/2期/0.08合成WETH，依次完成确认、执行、还清、解除；刷新和主动退出/重登后同一解除回执、原14与新12完整凭证及v2/2周期信用记录一致，账本平衡。六语全文日期/金额/解除面板与390px两主题通过。Agent同源HTTP/PostgreSQL/SDK/MCP证据单独保留，不扩大为新生产Agent身份验收。保留79迁移，不再DDL。先前漏译、日期匹配及语言切换失败/回退记录留在[B3结果](../../output/b3-synthetic-collateral-20261108/RESULT.md)；当前批准的失败目标为128停用部署`dpl_HMyGYYcC8X43MYyCxEbtkVwTG8iD`，保留全部数据，不能退旧B1/B2代码。

**B4当前结果：PASS — LOCAL VERIFIED。** Founder已批准A额外单列费用及B4-F1本地源信用扩展；整数计算、借还/费用、受保护源信用及冲回、冻结UTC月结、Agent占用/信用归因、六语可见流程和数据库恢复已按L0目标通过。[B4契约与授权](../codex/tasks/B4_SYNTHETIC_FEE_POLICY_ALIGNMENT.md)及[逐项结果](../../output/b4-fee-policy-20261109/RESULT.md)。本地体验http://127.0.0.1:8907/#request-credit；F1执行在独立测试profile验证，Founder入口待真实独立审阅钱包绑定而保持关闭。尚无B4生产发布/验收或真实收费权限；若推进上线，先审阅精确发布与兼容回退方案。

并行准备三个明确决策包，不要求它们先阻断普通国际化工作：

- **移动钱包：** 三钱包和续批已明确；QR 按 Founder 当前指令暂缓，公开激活撤回。直接钱包剩余组合保留版本、网络、身份隔离与恢复验收，伙伴回跳契约仍待补齐。
- **费用：** 固定从净放款扣除还是额外支付、结算周期、币种/上限 FX、舍入与退款规则，版本化处理旧政策与新需求的差额；需求费率不等于收费已经启用。
- **抵押与新增链：** 固定一组资产/链/借款币种/资金方及精确允许动作。保留 BSC 与 Ethereum 目标，分开声明连接/签名/读取/写入的权限和验证状态。

伙伴允许的跳转/回跳、资金方和评估方测试契约及样例、KYC/贷后分工和首发市场仍是外部输入。缺失时可做明确标记的模拟和契约工作，不能称真实伙伴联调已完成。后续实施从干净、已核对的代码基线开始，保留当前并行修改。

现行 BNB 56/97 范围为指定的钱包连接、SIWE、链下账户证明与无真实资金流程。Ethereum 主网接入、主网链上写入和生产收费各自依赖明确决策。M2 的 L3 测试使用获批的 Base Sepolia 指定市场和单次授权。L2 使用无真实资金模式，M3 沿用已批准的单一合成计量配置，L4/L5 按宪章门槛。 [产品宪章](../PRODUCT_CONSTITUTION.md) · [BNB 验收范围](../codex/tasks/BNB_004_PUBLIC_NO_FUNDS_ACCEPTANCE_AND_RELEASE.md) · [M2 对齐](IPO_ONE_M2_PRE_DEVELOPMENT_ALIGNMENT_v1.0.md)

## 6. 开发与回归边界

- **共用协议。** 新的语言、钱包和网络是呈现或适配层。Human 和 Agent 共用已有的 Offer、Obligation、Ledger、服务、风险与 Evidence 语义。协议变更遵循版本兼容和迁移要求。先核查 `apps/web/`、`apps/tenant-api/`、`apps/private-pilot/`、现有协议目录和对应模块，再在 issue 中锁定最小文件范围。
- **服务端授权与恢复。** 每次读取及写入按当前身份、对象、Tenant 和策略校验。变更按现有幂等契约处理。重要状态覆盖旧数据、刷新、重登、重试和适用的恢复机制。原始 KYC、凭证和 PII 留在授权的链下边界，验收使用合成或脱敏数据。
- **验证入口。** 用户可见改动运行 `pnpm check:ui-baseline` 和受影响浏览器用例，点击路径使用 `pnpm test:browser:click-path` 的相关范围。协议及授权改动按影响运行 `pnpm check:tenant-protocol`、`pnpm test:security`、`pnpm test:transport` 与获准数据库上的 `pnpm test:postgres`。发布候选运行 `pnpm check` 和对应发布包检查。实际测试命令、数据与环境由对应 issue 和仓库脚本确定。隔离预览的通过证据按其实际 SHA 记录，公开版本的验收单独判定。
- **数据与回退。** A0 优先核对现有清单。已有发布包记录为无新增迁移。新任务如需变更持久数据、合约或配置，应先记录兼容性、迁移范围、责任人和可恢复路径。发布前验证回退目标与当前配置和数据相容，保留权威义务、账本和审计记录。
- **范围归属。** Capital Partner、Trading Capital、运营、申诉与 Credit Passport 按宪章与产品优化措施继续追踪。新的风险限额、定价、支付路径、外部 Provider、签名权限或部署范围由对应权威记录审批。 [产品优化措施](IPO_ONE_PRODUCT_OPTIMIZATION_MEASURE_v1.0.md) · [MVP Build Spec](IPO_ONE_MVP_Build_PRD_Technical_Architecture_Codex_Task_Spec_v0.1_FINAL.md)

## 7. 交付证据和下一项任务

| 状态 | 所需证据 |
| --- | --- |
| **CODE** | 精确 commit、需求和 issue 对应关系、变更范围以及通过的适用测试。 |
| **RUNTIME** | 实际服务、接口版本、环境与持久数据行为的证据。标明本地、隔离预览或公开环境。 |
| **DEPLOYED** | 实际托管部署 ID、体验 URL、SHA、资产及环境清单。 |
| **REACHABLE** | 对应角色从真实可见控件到达功能，或使用实际已授权的 Agent 接口。 |
| **VERIFIED** | 同 SHA 的用户流程、拒绝和恢复结果，附可复核的证据引用。 |

每条验收记录编号、SHA、环境、角色、输入、预期与实际、时间和脱敏回执引用。开发者向 Founder 提供可点击体验链接和一份逐项结果。五态齐备且所需用户流程通过，判为 `PASS — DEPLOYED AND USER-VERIFIED`。可执行用例失败，判为 `FAIL — NOT COMPLETE`。缺环境、权限或必需证据，判为 `BLOCKED — NOT COMPLETE`，注明受影响的编号及恢复条件。 [仓库验收规则](../../AGENTS.md)

**当前结果：A2完成既有Human样本恢复，B0完成原文对照，B1 Human核心六语和B3 Human合成抵押闭环均已部署用户验收。** [B1证据](../../output/b1-language-review-20261108/RESULT.md)、[B2当前记录](../../output/b2-wallet-alignment-20261108/RESULT.md)与[B3当前结果](../../output/b3-synthetic-collateral-20261108/RESULT.md)分开。B2桌面QR由Founder暂缓、公开激活撤回；直接钱包提示补修已正式验证，完整钱包兼容性未通过。B4方案A及F1已通过批准范围内的L0本地验收，证据独立保存；未部署或启用生产收费/退款。B2完整矩阵、B4生产目标、B5、A3–A8和真实伙伴联调均未由此通过。
