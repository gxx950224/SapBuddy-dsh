# BOM（物料清单）

选用顺序：物料 BOM 的创建 / 修改 / 删除 / 读取，传统开发优先 `CSAP_MAT_BOM_*`；多层展开用 `CS_BOM_EXPL_MAT_V2`（S/4 HANA 环境再评估 `CS_BOM_EXPL_MAT_V2_HANA`）。不要默认使用 `CSAI_*`。

ABAP Cloud / clean core 下上述函数通常均未发布；是否改用已发布业务对象（如物料清单相关 BDEF）须按目标系统核实，本页不展开。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| CSAP_MAT_BOM_MAINTAIN | 功能模块 | CS01/CS02/CS03 | 创建、修改、删除物料 BOM（BOM 头 / 行项目 / 子项目 / 替代项） | 已文档化经典接口 | 物料 BOM 维护的首选经典接口，不是 BAPI，通常未云发布。写操作是否自带提交须核对该函数文档，事务纪律仍见 `abap-templates`。 |
| CSAP_MAT_BOM_CREATE | 功能模块 | CS01 | 新建物料 BOM | 已文档化经典接口 | 仅新建；已存在的 BOM 不要用本函数改写，改用 `CSAP_MAT_BOM_MAINTAIN`。 |
| CSAP_MAT_BOM_READ | 功能模块 | CS03 | 读取物料 BOM 完整结构 | 已文档化经典接口 | 只读。 |
| CSAP_MAT_BOM_DELETE | 功能模块 | CS02 | 删除物料 BOM（支持逻辑 / 物理删除） | 已文档化经典接口 | 须分清逻辑删除与物理删除及变更号要求，以目标系统与函数文档为准。 |
| CS_BOM_EXPL_MAT_V2 | 功能模块 | CS12/CS15 | 物料 BOM 多层展开（单层 / 多层，含递归） | 已文档化经典接口 | 不是 BAPI。传统展开的常用入口。DS4：未发布，且不能远程调用。同系统存在 RFC 版 `CS_BOM_EXPL_MAT_V2_RFC`，同样未发布；需要远程调用时须在目标系统核实后再用，不要把 V2 本身当成 RFC。仍优于自写递归读表。 |
| CS_BOM_EXPL_MAT_V2_HANA | 功能模块 | CS12（S/4） | S/4HANA 环境下的 BOM 展开（HANA 优化版） | 已文档化经典接口 | **不是** `CS_BOM_EXPL_MAT_V2` 的即插即用替换（接口与层级参数不同）。仅在 S/4HANA 且已核实存在、并确认参数差异后使用。 |
| CSAI_BOM_CREATE | 功能模块 | （工作簿未给事务码） | 创建各类型 BOM | 内部 / 未发布 | 不要作为默认方案。各类型 BOM 的客户侧经典入口优先评估 `CSAP_*`。 |
| CSAI_BOM_DELETE | 功能模块 | （工作簿未给事务码） | 删除各类型 BOM | 内部 / 未发布 | 同上。 |
| CSAI_BOM_MAINTAIN | 功能模块 | （工作簿未给事务码） | 创建 / 修改 / 删除各类型 BOM | 内部 / 未发布 | 工作簿原写作「各类型BOm」。此组为 CSAP / ALE 下层接口，不对客户发布。 |
| CSAI_BOM_READ | 功能模块 | （工作簿未给事务码） | 读取 BOM | 内部 / 未发布 | 读取物料 BOM 优先 `CSAP_MAT_BOM_READ`。 |

域内注意：

- 本域没有已发布 BAPI。FS 须写清「经典功能模块，非 BAPI」。
- 不得把 `CSAI_*` 写成与 `CSAP_*` 等价的标准接口。
