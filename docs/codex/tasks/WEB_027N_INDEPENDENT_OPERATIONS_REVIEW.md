# WEB-027N — 独立 Operations 审批人与剩余偿付处置验收

状态：待 Founder 批准；本文件不激活身份、权限、端口或迁移。

## 为什么需要这项补充

WEB-027M 已按批准范围安装并验收三名本地角色。现有 `modules/approval/src/approval-policy.js` 要求 Risk 与 Operations 两个审批角色；`approval-service.js` 同时禁止发起人和执行人充当审批人。M 的 Operations 账号只有发起、查看、取消和处置权限，没有 `approval.decide`，也没有第二名 Operations。不得把 M 的批准解释成对第四名特权账号的批准。

已有 M 授权继续有效，普通测试、登录、修复和验收无需再次申请。本次只审阅以下新增特权配置及必要的处置页面连续性。依据已批准 WEB-027 指令 §2.2：“若正确修复涉及权限模型或迁移，应提交具体方案供单独审阅”。

## 精确范围

1. 在 `ipo_one_web027_candidate` 新增一名独立受邀 Operations Reviewer：
   - Actor：`actor_web027n_operations_reviewer`；角色/类型：`operations_operator`。
   - Credential：`credential_864bfa21-8e96-4ff9-b633-aa1542f38698`。
   - Client：`client_web027n_actor_web027n_operations_reviewer`。
   - 仅授予 `approval.read`、`approval.decide`、`servicing.queue.read`。没有发起、执行、资金、冻结或权限管理能力。
   - 本地入口：`http://localhost:8942/#risk-operations`，激活前再次确认端口空闲。
   - 独立合成钱包与原生 Passkey；仅邀请绑定；独立端口会话 Cookie。密钥只保存在受保护的本地运行目录。
2. 使用独立 N 开关及精确数据库、Actor、Client、角色和端口校验，保留 M 的三名角色及旧账号授权不变。新增迁移只增加 8942 的原生 Passkey origin；当前已安装 0082，使用下一可用编号并核对全部既有校验和。
3. 让新审批人通过现有版本化审批接口与可见页面查看、批准或拒绝精确提案。所有审批继续绑定当前 MFA、会话、凭证、角色、版本、金额/计划、原因、状态哈希、时效及一次性执行。发起人本人不能审批。
4. 在本轮三个测试计划范围内保持处置的连续可操作性：执行完成后，通过可见历史入口查看同一计划的服务器当前状态，再明确发起下一项处置。当前队列仅覆盖不良状态；重组/回购后计划不可因此失去入口。复用既有授权回执/读取；若需补齐读取适配，只允许本轮三个精确计划、对应已授权角色与现有服务权限，不新增一般账户枚举。选择或查看不能隐含发起、审批或执行。

## 已准备的真实本地测试计划

三笔均通过 Human 页面创建、确认并执行，单笔本金 100 USD-cent，无真实资金。原始计划和回执在 `docs/design/web-027/m-verification-evidence.json` 的关联证据中。

| 用途 | Obligation | 原始到期时间（UTC） |
| --- | --- | --- |
| 重组 | `obligation_ad6fb93d-d18a-479a-8e58-f56a328be9a9` | 2026-09-08 09:33:43.789 |
| 回购 | `obligation_355d2cf4-4c17-41e5-adc1-e0ae5236a33a` | 2026-09-08 09:35:34.204 |
| 核销路径 | `obligation_c3746224-101c-4de6-a512-54cba5c7fc51` | 2026-09-08 09:35:37.822 |

到期不等于所有处置都符合条件。重组需要 delinquent/defaulted；回购允许 delinquent/defaulted/restructured；核销只允许 defaulted/restructured/repurchased。核销计划可在正常到期并进入 delinquent 后，先经过完整独立审批执行重组，再重新审阅当前状态、单独审批并执行核销。每一步都保留原始计划和明确后果，不跳过任何生命周期门槛。不得改数据库日期、系统时钟、宽限期或违约阈值以制造验收。

## 验收、修改位置与回滚

在实际安装的 SHA 上，亲自通过四名独立角色的可见控制完成提案、两项独立审批、精确执行、查询 Evidence、刷新、退出重登、API/worker 重启恢复。验证同人审批、错误角色、过期/撤销会话、版本/状态变化、重复使用与并发重放被拒绝。重组保留旧计划；回购不产生虚构付款；核销不标为还清。Auditor 全程只读。到期前如实保留等待状态。

预计文件：本地角色/钱包邀请配置、原生 Passkey origin 与会话隔离、审批适配器、处置页面、版本化读取契约（仅在需要时）、迁移和相应回归。运行现有 `node scripts/web027-postgres.mjs`、相关 auth/approval/gateway/web 测试、协议/schema/type/bundle 检查及真实本地浏览器验收；不会用前端 fixture 代替最终证据。

回滚关闭 N 入口与开关，撤销这一个账号的凭证、邀请和会话，保留全部审计、审批、处置及原始计划；不得重新激活已撤销账号或删除历史以回退迁移。

非目标：正式网站发布、公开特权注册、真实资金、链交易、Provider/venue 启用、经济或风险规则调整、自动批准、削弱双人控制。M 的其他测试、现有工作台和服务继续保留。
