# 工艺路线 / 任务清单

选用顺序：新建工艺路线优先已发布 BAPI `BAPI_ROUTING_CREATE`（DS4 发布日期 2016-05-10）；存在性检查用已发布 BAPI `BAPI_ROUTING_EXISTENCE_CHECK`。读取走 `CPCC_S_TASK_LIST_READ`（未发布，且不能远程调用）。变更或删除走 `CPCC_S_TASK_LIST_MAINTAIN`（可远程调用，但未发布）。不要调用工作簿中的 `BAPI_ROUTING_DELETE`、`BAPI_ROUTING_GETDETAIL`、`CPCC_S_TASK_LIST_DELETE`（在 DS4 上均不存在）。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_ROUTING_CREATE | BAPI | CA01 | 创建工艺路线（含序列 / 工序 / 子工序 / 组件） | 已发布 BAPI | DS4：已发布（2016-05-10），可远程调用。以创建为主；不要假定它等同于全面变更接口。事务纪律见 `abap-templates`。 |
| BAPI_ROUTING_EXISTENCE_CHECK | BAPI | CA03 | 检查工艺路线是否存在 | 已发布 BAPI | DS4 上与 `BAPI_ROUTING_CREATE` 同为仅有的两个 `BAPI_ROUTING_*`。已发布（2000-02-02），可远程调用。只做存在性检查，不返回明细。工作簿未列此名，按系统实测收入。 |
| CPCC_S_TASK_LIST_MAINTAIN | 功能模块 | CA01/CA02 | 创建 / 修改任务清单（工艺路线、主配方），含工序、组件分配；删除也评估本函数 | 已文档化经典接口 | 不是 BAPI。DS4：可远程调用，但未发布。`BAPI_ROUTING_CREATE` 覆盖不了的变更，以及删除（因 `CPCC_S_TASK_LIST_DELETE` 不存在），走本函数。须在目标系统核实存在与发布标记。 |
| CPCC_S_TASK_LIST_READ | 功能模块 | CA03 | 读取任务清单数据（工序、组件） | 已文档化经典接口 | 不是 BAPI。读取的标准入口。DS4：未发布，且不能远程调用（非 RFC）。不要改写不存在的 `BAPI_ROUTING_GETDETAIL`。 |
| BAPI_ROUTING_GETDETAIL | 工作簿所列 BAPI | CA03 | 工作簿用途：读取工艺路线明细 | 工作簿存疑（对象不存在） | **DS4 上不存在该函数。** 禁止在 FS 或代码中按此名称调用。读取改走 `CPCC_S_TASK_LIST_READ`（未发布、不能远程调用）。 |
| BAPI_ROUTING_DELETE | 工作簿所列 BAPI | CA02 | 工作簿用途：删除工艺路线 | 工作簿存疑（对象不存在） | **标准 SAP / DS4 不提供名为 `BAPI_ROUTING_DELETE` 的 BAPI。** 禁止按此名称调用。删除改走 `CPCC_S_TASK_LIST_MAINTAIN`（可远程调用、未发布）。 |
| CPCC_S_TASK_LIST_DELETE | 工作簿所列功能模块 | CA02 | 工作簿用途：删除任务清单 | 工作簿存疑（对象不存在） | **DS4 上不存在该函数。** `CPCC_S_TASK_LIST_*` 仅有 `FIND`、`READ`、`MAINTAIN`。禁止按此名称调用。删除改走 `CPCC_S_TASK_LIST_MAINTAIN`。 |

域内注意：

- 工作簿将 `CPCC_S_*` 与 `BAPI_ROUTING_*` 并列，二者不是同一接口族：前者是任务清单经典功能模块，后者是工艺路线 BAPI。
- DS4 上 `BAPI_ROUTING_*` 仅有 `BAPI_ROUTING_CREATE` 与 `BAPI_ROUTING_EXISTENCE_CHECK`；`CPCC_S_TASK_LIST_*` 仅有 `FIND`、`READ`、`MAINTAIN`。`CPCC_S_TASK_LIST_FIND` 存在但未发布、不能远程调用，工作簿未列，需要时在目标系统核实后再写入方案。
- 不要编造其它删除或读取函数名。
