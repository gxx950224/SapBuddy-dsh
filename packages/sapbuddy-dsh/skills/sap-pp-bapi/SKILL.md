---
name: sap-pp-bapi
description: >-
  PP（生产计划）标准 BAPI / 功能模块目录。编写或审查 PP 相关功能规格书（FS），
  或编写/修改创建、变更、读取 PP 对象的 ABAP 时使用：BOM、工艺路线/任务清单、
  生产版本、生产订单、计划订单、报工确认、MRP、工程变更、重复制造（PP-REM）。
  PP 场景常用的货物移动（BAPI_GOODSMVT_*）与批次（BAPI_BATCH_*）在本技能交叉引用
  （分属 MM-IM / LO-BM，暂不拆第二技能）。
  触发关键词：PP BAPI、生产订单 BAPI、BOM 接口、工艺路线、生产版本、报工、
  计划订单、MD04、工程变更、重复制造、MFBF、C223、CO01、CS01、CA01、CO11N。
  DO NOT USE FOR：常规命名与写入规范 → dev-write；BAPI 事务纪律
  （COMMIT / ROLLBACK / BAPIRET2）→ abap-templates；写 FS 的流程与模板 → sap-fs。
disable: false
---

# sap-pp-bapi — PP 标准 BAPI / 功能模块目录

> 本技能是目录与约束，不是写法模板。BAPI 事务纪律（`BAPI_TRANSACTION_COMMIT` / `ROLLBACK`、`BAPIRET2` 处理）只引用 `abap-templates` 的「常用 BAPI 参考」与「异常处理模式」，此处不重复。
> 本技能不放调用示例或参数填法。

## 何时使用

- 编写或审查 **PP 相关** FS（接口、增强、查询/功能报表），需求模块为 PP，或涉及下列对象 / 事务码。
- 编写或修改 **创建 / 变更 / 读取** 这些对象的 ABAP。

对象与常见事务码：BOM（CS01/CS02/CS03、CS12/CS15）、工艺路线/任务清单（CA01/CA02/CA03）、生产版本（C223）、生产订单（CO01/CO02/CO03、COHV）、报工（CO11N）、计划订单（MD11/MD12/MD13）、MRP（MD04）、工程变更（CC01/CC02/CC03）、重复制造（MFBF/MF41）。货物移动（MIGO）与批次（MSC1N/MSC2N/MSC3N）为 PP 常用的跨模块接口，见对应参考页。

不替代：`sap-fs`（FS 流程与模板）、`dev-write`（命名与写入规范）、`abap-templates`（语法模板与事务纪律）、`grilling`（业务决策追问）。

## 使用规则（强制）

1. **先加载本技能，再点名接口**。写 FS 或写代码前按「资源地图」只读相关域文件，不要一次读完全部参考。
2. **优先用目录中的标准 BAPI / 已文档化经典接口**，在 FS 的接口 / 增强 / 报表方案中写清：对象名称、对应事务码、主要用途、发布状态与约束。禁止在已有标准接口可用时发明自定义 API 替代。
3. **内部 / 未发布函数不得作为默认可选方案**。若现场已使用或业务坚持，必须在 FS 标明风险、限制与待确认，并给出已发布或已文档化的替代（若有）。
4. **目录不是目标系统的实证**。点名后须在所连 SAP 系统用只读工具核实对象是否存在；发布状态以系统（SE37 发布标记 / ATC / ADT）为准。目录与系统不一致时，以系统为准并写入取证或待确认。
5. **写操作的提交与回滚、返回消息处理** 遵循 `abap-templates`，不要在本技能或 FS/代码方案里另写一套事务纪律。部分经典功能模块自带提交参数，须核对该对象文档，仍不在此展开写法。

## 发布状态（本目录用语）

完整约定见 `references/release-status.md`。正文与各域文件使用同一套标签：

| 标签 | 含义 |
| --- | --- |
| 已发布 BAPI | 传统 ECC/S/4 开发可作首选的 BOR/RFC BAPI。**不等于** ABAP Cloud C1 已发布。 |
| 已文档化经典接口 | 有官方或长期文档的功能模块，传统开发可用，通常不是 BAPI，且一般 **未** 针对 ABAP Cloud / clean core 发布。 |
| 内部 / 未发布 | 不得作为默认方案。 |
| 跨模块引用 | 本技能收录但不改所属模块：货物移动属 MM-IM，批次属 LO-BM。 |
| 工作簿存疑 | 工作簿名称或用途与公开 SAP 对象不一致，已在该条目标明。 |

## 资源地图（按需加载，勿一次全读）

| 时机 | 读什么 |
| --- | --- |
| 触发后立刻 | 本文件 + `references/release-status.md` |
| BOM / 物料清单 | `references/bom.md` |
| 工艺路线 / 任务清单 | `references/routing.md` |
| 生产版本 | `references/production-version.md` |
| 生产订单 | `references/production-order.md` |
| 报工 / 订单确认 | `references/confirmation.md` |
| 货物移动 / 反冲（MM-IM，交叉引用） | `references/goods-movement.md` |
| 计划订单 | `references/planned-order.md` |
| MRP 查询 / 分析 | `references/mrp.md` |
| 工程变更 | `references/ecn.md` |
| 批次（LO-BM，交叉引用） | `references/batch.md` |
| 重复制造 PP-REM | `references/rem.md` |

## 硬边界

- 不把内部函数写成「标准 BAPI」。
- 不把跨模块对象拆成第二个技能；在方案中写明所属模块。
- 不在本技能中放置示例代码、参数填法或样例报文。
- 不要调用已标明不存在的工作簿名称（见 `references/release-status.md` 与各域文件），尤其不要使用 `BAPI_ROUTING_DELETE`、`BAPI_ROUTING_GETDETAIL`、`CPCC_S_TASK_LIST_DELETE`、`BAPI_GOODSMVT_GETITEM`。
