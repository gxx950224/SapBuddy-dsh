# 发布状态约定

本目录区分「传统 ECC/S/4 开发能不能用」与「ABAP Cloud / clean core 是否 C1 已发布」。后者须以目标系统 ATC / ADT 为准，本目录不声称任何对象已在云上发布。

## 标签

**已发布 BAPI**
- 作为 BOR 业务对象方法提供、通常可 RFC 调用的 `BAPI_*`。
- 传统开发中创建 / 变更 / 读取对应对象时优先选用。
- 调用后的提交、回滚与 `BAPIRET2` 处理见 `abap-templates`，此处不重复。

**已文档化经典接口**
- SAP 以 API / 接口功能模块形式文档化、或在应用组件中长期作为集成入口的非 BAPI 函数（如部分 `CSAP_*`、`CPCC_S_*`、`CCAP_*`）。
- 传统开发可以使用，但它们一般不是 BAPI，也通常未针对 ABAP Cloud / clean core 发布。
- 写 FS 时必须写清「经典接口，非 BAPI；云就绪需另核」。

**内部 / 未发布**
- 未对客户发布、或社区与支持信息明确不建议作为客户 API 的函数。
- 不得作为 FS 或代码的默认可选方案。
- 若必须提及：标明「内部 / 未发布」、风险、限制、谁来批准，并尽量给出已发布 BAPI 或已文档化经典接口作为替代。

**跨模块引用**
- 货物移动（`BAPI_GOODSMVT_*`）属 MM-IM；批次（`BAPI_BATCH_*`）属 LO-BM。
- PP 报工收发、投料反冲、批次主数据等场景常用，故收入本技能，暂不拆第二技能。
- 在 FS 中同时写明所属模块，避免写成「PP 自有 BAPI」。

**工作簿存疑**
- 来源工作簿「函数清单」与公开 SAP 对象名称或用途不一致。
- 目录保留工作簿原名以便对照，并写明建议采用的标准名称或「对象不存在」。

## 本目录明确标为内部 / 未发布的对象

- `CM_FV_PROD_VERS_DB_UPDATE`、`CM_FV_MKAL_CONSISTENCY_CHECK`（生产版本，已知内部）
- `CSAI_BOM_CREATE`、`CSAI_BOM_DELETE`、`CSAI_BOM_MAINTAIN`、`CSAI_BOM_READ`（BOM 内部接口；经典开发应优先 `CSAP_*`）
- `MD_STOCK_REQUIREMENTS_LIST_API`、`MD_PEGGING_NODIALOG`（MRP；客户侧优先已发布 BAPI `BAPI_MATERIAL_STOCK_REQ_LIST`。Pegging 无对等已发布 BAPI 时，不得把内部函数写成默认方案）
- `BAPI_BATCH_DELETE`（批次；DS4 上存在且可远程调用，但 SE37「已发布」标记为空。只设置删除标记，不是物理删除，不得作为默认可选方案）

`CSAP_*`、`CS_BOM_EXPL_*`、`CPCC_S_*`、`CCAP_ECN_*` 不与上列内部函数同等对待：它们是已文档化或长期使用的经典接口，但 **不是** 已发布 BAPI，也通常 **未** 云发布。DS4 / 100 上这些对象的 SE37「已发布」标记均为空。其中 `CPCC_S_TASK_LIST_READ` 与 `CS_BOM_EXPL_MAT_V2` 不能远程调用，`CPCC_S_TASK_LIST_MAINTAIN` 可远程调用。`CCAP_ECN_*` 在部分支持说明里仍可能被标为不对客户发布，使用前必须在目标系统核实，并在 FS 中写明状态。

## 本目录明确标为不存在的工作簿名称（DS4 / 100 核实）

- `BAPI_ROUTING_DELETE`、`BAPI_ROUTING_GETDETAIL`、`CPCC_S_TASK_LIST_DELETE`、`BAPI_GOODSMVT_GETITEM`
- 读取工艺路线改走 `CPCC_S_TASK_LIST_READ`（未发布、不能远程调用）。DS4 上 `BAPI_ROUTING_*` 仅有 `BAPI_ROUTING_CREATE`（已发布 2016-05-10）与 `BAPI_ROUTING_EXISTENCE_CHECK`。
- 删除工艺路线 / 任务清单改走 `CPCC_S_TASK_LIST_MAINTAIN`（可远程调用、未发布）。`CPCC_S_TASK_LIST_*` 仅有 `FIND`、`READ`、`MAINTAIN`。
- 货物移动查询改走 `BAPI_GOODSMVT_GETDETAIL` / `BAPI_GOODSMVT_GETITEMS`（均存在、可远程调用，DS4 发布日期 1998-07-23）。

## 核实方式

在已连接系统中用 `search_abap_objects` / `get_abap_object_info` 确认函数存在；不要把本目录当作系统清单。云就绪或 clean core 场景另用 ATC / 对象发布信息判断，本目录不作 C1 认证。
