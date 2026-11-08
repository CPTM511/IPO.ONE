# B3 — 抵押提交范围与首个验收卡点

状态：2026-11-08 Founder 已明确选择“先做无真实资金合成闭环”，进入 L0 实施与本地持久化验收。生产发布及其配置/金融权限变更须在精确实现与门禁可审阅后按对应授权执行。
目标：PRD B3 / 原任务书 AT02，复用现有 M2 共享 Obligation/Ledger/Event/Evidence。当前体验：<https://ipo.one>。
依据：当前产品宪章 v2.0、授权注册表、工程标准 v1.1、PRD；旧 M2A-007/008 仅用于代码与历史来源，不借用旧单次 signer/run 授权。

## 已核实与最先卡点

1. Web `securedPoolMarketApi`、Tenant OpenAPI 和 Gateway `submissionView()` 一致只读；返回 `pool_submission_unavailable`、`transactionHash: null`。缺少可授权、可持久化的提交操作，打开按钮不能完成 B3。
2. 既有参考模型有 `addPoolReferenceCollateral` 等确定性转换；它只是模型函数，不是已部署的用户提交 API。
3. 既有 Pool→Obligation 导入要求 `pool_chain_finalized_effects` 与 `pool_chain_observations` 的精确对应。不得为合成确认伪造链交易、finalized event 或历史用户凭证。
4. 当前 launch policy 已登记一个 Base Sepolia 测试资产池（eip155:84532 / 0x3FB68c0776d610A57ED94C012AFa81b7C3c632Da）；资产为该链 WETH 与 test USDC。配置存在不证明当前 RPC、oracle、暂停、余额或对账可用，本轮未声称已验证。无须为此另建第二池。

## 已固定的产品输入

Founder 已选择无真实资金合成闭环。本轮固定为现有 USD-cent 合成信用义务 + 非兑付合成 WETH 抵押场景，复用既有 M2 75% LTV/80% 清算阈值与 $2,000/WETH 确定性测试价格（非市场报价）。无新链/资产接入、无新池/资金系统。抵押 profile 必须先进入申请与 Offer 条款哈希，用户接受后才可确认抵押；不对既有无抵押义务追加强制条件。

## 实施顺序（生产尚未启用）

P0：固定模式、单一组合、资金模式和验收负责人。输入至少包含链/资产/金额范围、现有 Subject 与账户绑定、对应义务及抵押状态语义。合成与链上各自展示明确标识；不合并不同 CAIP 账户。

P1：补版本化服务端提交契约与持久化。复用现有 M2 状态机和共享 Event/Evidence/Ledger，校验身份、Tenant、对象、当前授权、金额、链、状态版本及幂等键。以同一数据库事务落地状态、Event、Evidence、command result；Agent API/SDK/MCP 与 Human 共用操作。合成 origin/finality 必须明确独立于链观测，不写假交易哈希。若现有存储需扩展，先审阅最小 additive schema 和迁移。

P2：可见 Human 操作。现有抵押入口可达，确认前显示资产、金额、网络、资金模式、动作和预期状态。提交后从服务端读取结果并可打开 Evidence；刷新/退出重登恢复。未确认抵押时不能执行依赖抵押的放款，结清与解除按当前模型判定。

P3：必要回归后部署/验收。六语、窄屏、可见点击、Agent 传输一致性；exact SHA CI、固定产物、实际部署与回退核对。B3 发布需其明确范围的授权；B2 发布许可不自动覆盖 B3 经济操作。

若选链上：在 P1 前先对既有池做两个独立 RPC 的只读新鲜核对（代码哈希、精确配置、oracle/暂停/caps、账户绑定及对账）；再固定用户账户、测试资产、金额/次数、gas 上限、有效期和批准边界。交易由用户钱包确认，按提交→观察→最终性→对账分阶段展示；不使用历史或已销毁 signer。

## 验收标准

- 确认页面的资产/金额/链与服务端回执逐项一致；合成明确无真实资金且无链交易，链上回执有当前真实来源。
- 重复/并发同一提交只产生一次业务效果，返回可查询的同一回执；不同内容复用幂等键被拒。
- 跨 Tenant/非本人/错链/过期报价或授权/超限/未知或未对账状态按适用动作被拒，拒绝不产生副作用。
- 抵押未确认不能走依赖抵押的发放；结清、解除与共享义务和账本一致，无旁路。
- 刷新、退出重登、进程重启与事件重放保留同一抵押状态和 Evidence；新增持久化覆盖实际恢复检查。
- 六语可见 Human 旅程和版本化 Agent 操作均完成；仅本地通过不能记部署用户验收 PASS。

## 预计文件与验证

Gateway secured-pool handlers、domain M2 model/integration、api-contract/OpenAPI、persistence（仅必要时）、SDK/MCP、Web pool presentation 与当前 UI、对应授权/幂等/PostgreSQL/浏览器测试。先运行受影响的 pool/contract/transport/PostgreSQL 测试，完整 `pnpm check`、`pnpm check:ui-baseline` 及实际部署可见流程按发布门禁完成。具体命令在实施模式冻结后使用仓库现有 scripts，不新建重复测试系统。

## 边界、迁移与回退

无真实资金、主网、新池/资产、任意提现、账户自动合并、新服务或新增支出。授权/金融/隐私/发布变化需相应人工审阅。保护现有根目录改动，使用独立工作树；不改风控阈值或降低检查。迁移只允许必要的 additive 变更并保持旧读兼容；回退关闭新提交、恢复准确已验收部署，保留所有已提交事实与 Evidence，不通过数据库回滚抹去历史。最终须给 CODE/RUNTIME/DEPLOYED/REACHABLE/VERIFIED 各自证据；当前尚无完成结论；实际实现与证据在同一任务更新。

本轮细化：抵押状态作为既有 `obligation.v2` 的可选合成 profile 通过现有义务表的 nullable `synthetic_collateral` JSONB 列及不可变 projection snapshots 同事务持久化，不复写链观测或创建第二套 Ledger。确认与解除均通过同一 Tenant Gateway 的幂等命令、当前授权和确认契约。默认生产停用；本地明确配置启用。覆盖 Human 和 Agent 的等价协议操作。


## 2026-11-09 实现与可审阅结果

本地体验：<http://127.0.0.1:8877/#request-credit>；线上仍为 <https://ipo.one> / `50ee192`，无 B3 生产操作。
独立工作树 `/private/tmp/ipo-one-b3-synthetic-20261108`，分支 `codex/b3-synthetic-collateral`，基线 `9a967138daadda4e1c38b8ee1a6ffe52a762aed8`。根目录原有改动保留。

- Intent 可选 `m2_synthetic_weth_usd_cent.v1`；Offer 的 `credit_terms.synthetic_secured.v1` 哈希绑定完整抵押条件，接受后不可增改。$120 示例要求 0.08 非兑付合成 WETH。固定测试价格不是市场报价，不占用钱包余额。
- 新增三个封闭操作：`pilotReadSyntheticCollateralProfile`、`pilotConfirmSyntheticCollateral`、`pilotReleaseSyntheticCollateral`。沿用现有能力与 Human Consent / Agent Mandate；确认与解除均需精确经济动作确认与幂等键。Human 可见控件、Agent SDK 与本地 MCP 使用同一 Gateway。
- 共享义务状态依次为 awaiting_confirmation → confirmed → released。确认前服务端在 Rail 调用前拒绝执行；解除要求已执行、`fully_repaid`、本金/利息/费用余额均为零。
- 迁移 `0089_synthetic_collateral_terms`：新增 nullable JSONB 列与精确 Offer 版本；约束/trigger 防止抵押删除、条款更改、状态倒退和未确认执行。无新表、第二账本、Pool 交易或假最终性。down 在存在 B3 Offer/义务时拒绝。
- 默认停用。受限本地评审开启；生产仅准备了精确配置 `IPO_ONE_SYNTHETIC_COLLATERAL_PROFILE=m2_synthetic_weth_usd_cent.v1`，未知值/Risk 角色拒绝。未设置时新申请、抵押确认及 B3 新执行停用；现有记录、已执行义务还款及合格解除仍可处理，原暂停/冻结/授权规则保留。

已验证：真实 PostgreSQL Human/Agent 闭环、并发重复同一回执、跨 Tenant/错链/不匹配拒绝、服务重建恢复、类型化读与不可变快照一致及重放、兼容停用读/防执行/解除；Agent 三操作经过真实 SDK/MCP→Gateway；实际 HTTP/PostgreSQL 的 Human 可见点击、条款披露、确认/执行/还款/解除、刷新、主动退出重登、服务进程重启；六语×两主题390px并展开回执无横溢出；71项现有 UI 回归通过；独立合成库备份恢复保持同一义务/快照哈希。浏览器使用临时测试 EOA 实际签名及只读 RPC 元数据 fixture，金融 API/数据均为真实本地服务；不代表生产或钱包品牌验收。

完成命令与最终门禁/源码/产物哈希记录在 `output/b3-synthetic-collateral-20261108/`。完整 `pnpm check` 退出码0：35项安全、106项传输、117项 PostgreSQL、1574项单元测试通过；Foundry25项通过、2项既有 fork 测试按原策略跳过，未执行链上操作。125项封闭协议、147份 schema、90对本地迁移与79条 hosted迁移集合、UI基线和1367条六语文案门禁通过。独立远端 CI、发布产物、实际部署/用户验收各自记录，不由本地通过代替。

## 精确发布与回退提案（待本项人工审阅）

1. 原团队、原 `ipo-one-internal` Primary 项目与 `ipo.one`；既有 no-funds profile 和持久化、风控、权限不变。审批仅限本 B3 合成 profile，无链写、真实资金、新服务/资产/SDK/费用或重新启用 QR。
2. 核对 exact SHA/CI、固定产物、0089 pair SHA 与79条 hosted迁移摘要；先完成生产备份/恢复可用性及原记录基线核对，再应用 additive0089。禁止修改旧迁移/checksum、直接使用全量本地90条迁移或以 down 清历史。
3. 先部署同一候选源码的停用版，不设置新变量，核对旧记录与新列兼容并保留该部署为回退目标；再在原 Primary production 设置上述单一公开 profile 值并建立启用部署。未通过门禁不得推广。
4. 在实际已部署 SHA 用同一原钱包检查旧义务/Evidence未变化；另建一条合成抵押记录完成可见确认→执行→还款→解除与六语、刷新/退出重登。发布前、部署 Ready 或本地通过均不等于此项 PASS。
5. 失败时切回已核对的兼容停用部署，并撤去启用配置以防后续误构建。保留0089、所有既有记录/Evidence、读取与保护；不得把旧 `50ee192`/`bcce697` 作为有 B3 记录后的安全回退目标。

CODE/RUNTIME/本地 REACHABLE 已有证据；DEPLOYED/实际生产 VERIFIED 尚缺。整体结论仍为 `BLOCKED — NOT COMPLETE`，所缺为精确 B3 发布审阅与部署用户验收，不再是合成抵押接口缺失。
