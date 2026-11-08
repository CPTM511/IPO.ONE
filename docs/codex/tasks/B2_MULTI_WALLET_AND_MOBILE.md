# B2 — Three-wallet and mobile acceptance

2026-11-08 · 当前交付：B2 三钱包与手机受限实现及条件发布。现行产品仍为 B1 `bcce697`。
状态：Founder 已明确批准上述续批、配置与条件发布，并确认 iPhone／Android 均可安排；已进入隔离分支实现。**B2 产品整体 BLOCKED — NOT COMPLETE**，不把本次核对当作移动钱包已交付。

## 目标、权威与已确定输入

目标：Binance Wallet、OKX Wallet、MetaMask 在约定桌面和手机环境中可见地连接、签名登录、拒绝／取消、返回同一申请，并从服务端恢复所属记录。Founder 本轮明确要求首批加入 MetaMask，三品牌均为必需项。认证不授予借款、Agent Mandate 或资金权限。

依据：[产品宪章 v2.0](../../PRODUCT_CONSTITUTION.md) §4–5、[当前授权注册表](../../governance/CURRENT_AUTHORIZATION_REGISTER.md) §6、[工程标准 v1.1](../../guidance/IPO_ONE_PRODUCT_ENGINEERING_AND_EXPERIENCE_STANDARD_v1.1.md) §10–13、现有 [PRD B2 / R01 / AT09](../../guidance/IPO_ONE_DEVELOPMENT_SPEC_DRAFT.md)及 Jarvis v1.1 原文。映射 REQ-ID-001/004、REQ-UX-001/004/005、REQ-CHAIN-001。现行普通 Human/Principal 无邀请门槛，旧 WALLET-003 的未登记钱包禁止登录规则不能覆盖当前公开 Beta 决策。

Founder 随后明确批准精确续批、配置和条件发布，iPhone／Android 均可安排。新授权见 [B2 批准记录](../../governance/approvals/B2_MOBILE_NO_FUNDS_20261108.json)，期限为 `2026-12-08T15:59:59.999Z`；保留原 WALLET-003 到期历史，不靠修改文档复活旧授权。

## 实施前核实的基线与最先阻断点

| 优先级 | 已核实事实 | 解决动作与放行条件 |
|---|---|---|
| P0 配置 | 正式 `https://ipo.one` 仍为 bcce697、Primary/no-funds。公开 HTML 的 WalletConnect Project ID 未配置；Vercel 同项目元数据列出 31 个变量，没有 IPO_ONE_WALLETCONNECT_PROJECT_ID。 | 复用已找到的项目，经批准只增加 production 的这一公开配置变量，不读取／改写其余变量或秘密。 |
| P0 有效授权 | UI 可用性和连接器构造器均拒绝旧授权到期后的连接；真实当前日期验证未加载 Provider。仅补 ID 仍被期限阻断。 | 对下列精确项目、Origin、Relay、版本、方法、网络和到期日明确续批；保留所有门禁，并覆盖页面跨越到期时刻及晚到回调。 |
| P1 同机手机流程 | 当前 mobile-wallet-access 提供准备、二维码与取消控件，未实现该模块内可见的本机钱包唤起／返回步骤。 | 手机端提供明确的连接、打开钱包、登录签名及继续／返回操作；每次需要唤起 App 的行为源于可见用户动作。先跑一个真机闭环，再推广至另外两钱包。 |
| P1 真机与伙伴输入 | 没有本轮 iOS/Android 版本、三钱包 App 版本、真机操作者或伙伴 App 回跳契约。 | 固定设备与操作人员；记录真实版本与每格证据。真实伙伴包名／Bundle ID、入口和回跳 URL／scheme 必须由伙伴经 Founder 提供并审核，不能凭空造一个伙伴 App。 |

Reown 中已有 `IPOONE / IPO.ONE Testnet`，`ipo.one` 已 allowlist。Project ID 只保存掩码及指纹，未写入代码或文档。项目设置未修改、没有新建项目。Usage 页显示 Starter 额度和当前用量费用 $0，未核实基础月费，也不据此保证未来总费用为零；测试仅限现有额度，不升级套餐或承诺新增支出。

根目录有 157 项既有 tracked 改动；本轮读取的 mobile-wallet-access、mobile-wallet-connector、wallet-provider-registry 与已发布 bcce697 字节相同。实现必须从隔离的当前已发布／已合并基线继续，保护根目录全部现有工作，不复制旧 UI 分支。

上述为实施前基线。当前授权已齐；Founder 已进一步确认“两台现在都可配合，随后补版本信息”。两类设备当前均有操作者，具体系统／钱包版本须验收时补录；本地候选已补本机唤起、单独签名按钮、取消和到期保护，尚无 B2 真机通过证据。原正式部署及配置尚未变更，最终状态见当前结果记录。

## 实施顺序及完整性

1. **P0：固定边界。** 确认本任务下的续批包和真机人员；复用既有 Reown 项目及部署项目，固定公开配置指纹。其他 31 个变量、single_v2、同源保护及 RPC/CSP 边界保持现行约束。
2. **P1：首个纵向闭环。** 先选择具备真机的一个钱包，完成可见连接 → 所选网络／账户确认 → 单次 SIWE 登录 → 钱包 App 返回 → 服务端恢复同一申请／义务 → 拒签／取消后可重试。完成一个可核验闭环后再补另两钱包；首个闭环不能冒充整个 B2 完成。
3. **P2：三品牌矩阵与恢复。** 完成首批三钱包全部声明支持的组合、六语提示、账户／网络／Provider 变化、跨标签退出、过期／晚回调和进程恢复；不兼容组合诚实标明原因和系统浏览器恢复路径。
4. **P3：精确发布验收。** 独立门禁、固定产物和暂存检查通过且真机操作者可配合后，按获批条件推广唯一 SHA；真实手机／规范域名验收失败立即回退 B1。部署不是完成；B2 整体验收仍包括约定的伙伴返回契约。

正式 Origin 仅 `https://ipo.one`，不为抢跑扩大到 localhost、临时 Vercel 域名或伪造 Host。未推广的临时域名有来源保护，因此真实规范域名手机 E2E 放在获批候选推广后执行；发布前先做本地受控投影、源代码／产物／健康验证。必须提前安排真机人员，不发布一个无人能够验收的候选。

## 钱包 × 设备 × 路径矩阵

[逐格机器可读矩阵](../../../output/b2-wallet-alignment-20261108/compatibility-matrix.csv)共有 21 核心组合、2 伙伴场景、2 不兼容浏览器恢复场景，目前均未记作 B2 当前候选 PASS。

| 每个首批钱包的路径 | 设备与浏览器 | 三钱包合计 |
|---|---|---|
| 桌面注入式 | 当前实际可操控的 macOS Chrome | 3 |
| 手机系统浏览器 → 本机钱包 → 返回 | iPhone/Safari、Android/Chrome | 6 |
| 桌面 QR → 手机钱包 → 桌面登录 | iPhone、Android 分别扫码 | 6 |
| 钱包 App 自带浏览器 | iPhone、Android | 6 |

Windows、其他桌面浏览器及未实测版本不自动宣称支持。每条记录包含设备、系统、浏览器、钱包真实版本、SHA、CAIP-2、连接方式、结果及证据。各钱包在 `84532/1952/97/56` 上的状态分别标明；先使用现有原记录所在的同一网络跑连续性，不猜测网络。某钱包支持 EVM 不等于该网络已在该组合通过。Ethereum `eip155:1` 仍是 B5，未加入本轮。

伙伴 iOS/Android 外跳和不兼容内置浏览器单列。缺少真实伙伴契约时可以验证受控测试链接／拒绝路径，但不得声明伙伴联调成功；若只发布核心切片，须明确该范围，不能把整个 B2 标成通过。

## Given / When / Then 验收

- **A01 可见接入：** Given 零／一／多个注入 Provider 或手机环境，When 选择钱包，Then 显示明确品牌／来源和网络，选择本身不请求签名或静默切换 Provider；缺失／禁用入口有原因与恢复方法。
- **A02 精确配置：** Given 缺失／错误 Project ID、错误 Origin、过期／撤销批准，When 准备、连接或恢复，Then fail closed，不初始化越界 SDK；跨越到期边界、取消后晚到 URI 或 Provider 回调不能恢复授权。
- **A03 分段唤起：** Given iOS/Android 本机钱包，When 连接和登录，Then 每次需要唤起 App 都有可见用户动作，连接批准与 SIWE 签名语义分开；页面不能停在无法继续或只剩自身二维码的状态。
- **A04 身份隔离：** Given 账户、链或 Provider 变化，When 再操作私有视图，Then 旧会话立即失效并重新验证，同地址不同链不静默合并。不同钱包地址应隔离；只有用户已有的同一 CAIP-10 才做跨品牌同记录对照，绝不要求导入助记词／私钥来跑测试。
- **A05 拒绝与重试：** Given 拒绝连接、拒签、网络失败、超时或已存在待处理请求，When 返回页面，Then 有明确状态和可用重试／取消；晚到结果不复活旧尝试，不重复提交认证或业务命令。
- **A06 返回与恢复：** Given 当前登录尝试和已保存的申请／义务，When App 切换、刷新、页面关闭或进程重启，Then 经重新认证从服务端恢复当前用户有权的记录，不依赖浏览器私有缓存；未保存输入丢失时必须明确提示，不能伪装已保存。
- **A07 回跳边界：** Given 外部返回，When 校验目标和尝试状态，Then 目标只来自允许列表，状态短期、一次性且绑定当前尝试；重复／篡改／过期被拒。URL 不携带会话、签名、PII、KYC 或完整信用资料；返回参数不能授予权限。不为尚未存在的伙伴契约先造通用 open-redirect。
- **A08 现有记录：** Given 原 Human 钱包和同一网络，When 登入／退出重登／刷新／手机回到页面，Then 同一原义务、$120 已还／$0 余额、14 条链下 Evidence 摘要和信用 Outcome／一个周期一致。其他地址不能看到这组私有记录。
- **A09 六语与 UI：** Given en/zh/es/fr/ru/vi、明暗主题、1440/390 宽度，When 使用新增钱包／返回／错误控件，Then 无缺译、溢出或孤立入口，键盘与焦点恢复可用，遵守 Precision Terminal。
- **A10 作用边界：** Given 任何钱包模式，When 请求交易／转账／原始交易／代币授权、未批准方法、Ethereum 主网或特权角色，Then 拒绝；登录不创建资金权限、借款同意或 Agent Mandate。保留 Human/Principal 合法入口，共用内核，保持服务端 RLS／对象授权。
- **A11 敏感状态：** Given 配对 URI、密钥、原始签名、认证 cookie、KYC／PII，When 连接／取消／退出／记录 Evidence，Then 不进入 URL 回跳、日志、分析、持久存储或仓库；配对依现行 memory-only 边界清除，安全重登后读取持久业务记录。

## 技术选择及主要未知

复用现有 EIP-6963/EIP-1193、WalletConnect 2.23.10、memory-only storage、SIWE/BFF 和授权网关，不另建钱包内核或为每个品牌复制登录。两个现有到期检查必须一致，并新增跨到期及晚回调覆盖；不靠删除日期、改系统时间或放开 Origin 解决。

[OKX 官方排障文档](https://web3.okx.com/onchainos/dev-docs/wallet/dapp-connect/app-connect-faq)说明 iOS 唤起依赖直接用户动作，并建议连接完成后再由一次点击请求签名。这是 OKX Connect 文档的指导，采用分段手机交互作为候选方案，仍须用本仓库 WalletConnect 真机验证，不能把文档当兼容性证明。

[MetaMask 当前文档](https://docs.metamask.io/metamask-connect/)已提供独立的 MetaMask Connect。该事实不证明本仓库已有此 SDK；先验证既有标准发现／WalletConnect 路线。若必须新增 MetaMask/OKX/Binance 专用 SDK、Relay、Infura Key 或持久化策略，先提交差异与依赖／数据流评审，不自动叠加依赖。[MetaMask 账户操作指引](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/)的嵌套取消错误属于其新 SDK，只有采用该 SDK 时才据此增加适配，不能套用到当前 Provider。

[Binance 官方自测指引](https://developers.binance.com/en/docs/products/web3-dapp/self-testing)要求分别检查 iOS 与 Android；本轮只采用连接、签名与界面恢复用例，不执行其交易清单。[Reown 项目配置说明](https://docs.reown.com/appkit/react/core/installation)提供 Project ID 机制；本项目已有 owner-managed 项目，不新增项目或改用 AppKit。

## 已批准的具体续批与配置范围

原提案保留为提交时快照；有效批准见 [规范批准记录](../../governance/approvals/B2_MOBILE_NO_FUNDS_20261108.json)。Founder 回复：“批准上述续批、配置与条件发布”；设备回复：“iPhone 和 Android 均可安排”。批准不表示已经部署或真机验收。

- Owner：IPO.ONE Founder。项目：已存在的 IPO.ONE Testnet，真实 ID 仅在 owner-managed runtime 使用，仓库只留掩码／指纹。
- 建议期限：至 **2026-12-08 23:59:59 北京时间**（`2026-12-08T15:59:59.999Z`），撤销或超出本提案边界时先失效。该期限已由 Founder 按上述具体提案批准。
- Origin `https://ipo.one`，Relay `wss://relay.walletconnect.org`；包精确 `@walletconnect/ethereum-provider@2.23.10`。维持现有 8 方法和 4 个已登记网络的最大边界，仅连接、链切换、账户／能力读取及已获准签名用途；结构化签名能力不等于资金授权。
- 范围：三钱包受限实现与无资金真机验证；Vercel 原项目 `prj_KLyAPHnFCtQAxIbUjdJa012gAq7Y` / 原团队，仅配置 production 的 IPO_ONE_WALLETCONNECT_PROJECT_ID。其他变量、权限、数据流和保护不变。
- 不启用交易、真实资金、新链／Ethereum mainnet、新特权身份、专用钱包 SDK、付费功能或新增服务套餐；外部新增支出预算 $0。现有套餐基础成本未核实，不称免费。
- 已批准完整本地／CI／固定产物／暂存检查通过后的可回滚规范域名候选发布，且真机操作者已安排；精确 SHA 与回退清单冻结后才推广，失败立即回退。本次 B2 精确批准覆盖这项新启用，原 B1 记录保留。

## 文件、验证、安全、迁移与回退

可能文件：`apps/web/src/mobile-wallet-{access,connector}.js`、必要的新最小共享到期约束、`wallet-provider-registry.js`、`wallet-sign-in-attempt.js`、`app.js` 最小接入、`index.html`／本地化文案、对应 unit/e2e、WalletConnect 构建入口、现有生产环境映射。不得手改 vendor 产物；需要变更时使用已有构建命令，核对固定依赖、摘要和 CSP。

计划验证命令：`pnpm check:ui-baseline`、`pnpm check:product-i18n`、`node --test apps/web/test/mobile-wallet-access.test.js apps/web/test/mobile-wallet-connector.test.js apps/web/test/wallet-provider-registry.test.js apps/web/test/wallet-sign-in-attempt.test.js`、`pnpm build:web:walletconnect`、受影响的 `pnpm test:browser:wallet-sign-in`／`pnpm test:browser:record-recovery`／`pnpm test:browser:click-path`、`pnpm check`、当前生产依赖审计。数据库门禁只用隔离临时库；实际真机 evidence 单列，不把 fixture、模拟手机 UA 或桌面窄屏当作真机。

安全清单：精确配置与有效期；无新方法／网络；事件与会话绑定；一次性挑战和回跳状态；RLS／对象授权；memory-only pairing；无敏感信息持久化；无交易方法；现行认证／CSRF／同源保护；旧账户失效；六语拒绝和恢复路径；包、许可、依赖完整性及 CSP。

本轮对齐无迁移／经济写入。预期实现复用既有认证和业务持久化；若需要新 durable 返回状态或迁移，先更新这份任务的模型、清理、隐私及回退影响再评审。

直接回退：当前已验收 B1 源码 `bcce697fa70dc04e83a05c3cb9bb4de54f3e90d6` / `dpl_3HJLd2Xi8EPA5eadzLqCtfaBxFL1`。回退须同时核对项目目标、ipo.one 别名、实际健康／资源；平台命令遗漏别名时，仅恢复同一已批准目标。新配置恢复到本轮前缺失的状态，不动其余变量，不回退数据库或改写业务记录。

## 责任、投入与复核

Codex 负责受限实现、自动检查、产物绑定及证据；Founder 负责精确续批、设备／钱包操作人员、伙伴输入与最终验收。建议工程投入 12–24 小时，真机操作另预留 2–4 小时；这是工程估计，未包含等待授权、设备或伙伴反馈。建议复核日 2026-11-10 18:00 Asia/Shanghai，授权／设备不齐时明确改期，不倒推一个虚假的交付日期。

首个真机闭环是最早有价值的检查点。若 8 个工程小时后仍被钱包协议／系统唤起限制阻断，保存最小复现、实际版本及候选修复，再决定是否更换专用 SDK；不为继续投入任意增加钱包、服务或依赖，也不降低整体验收。真正完成需 CODE / RUNTIME / DEPLOYED / REACHABLE / VERIFIED 及本矩阵全部约定要求，不以连接器数量或静态报告代替。

实施前已执行：[当前日期门禁证明](../../../output/b2-wallet-alignment-20261108/current-date-guard-proof.json)：缺失配置禁用、有效形状的测试 ID 在当前日期仍被 UI／构造器拒绝，Provider 加载次数 0。该证明记录旧版基线，未进行真实配对。随后已开始隔离候选实现；Vercel/Reown 设置及正式部署仍未变更。
