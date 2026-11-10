# MRP 查询 / 分析

选用顺序：对外集成或客户程序读取库存 / 需求清单，优先已发布 BAPI `BAPI_MATERIAL_STOCK_REQ_LIST`。不要默认使用 `MD_STOCK_REQUIREMENTS_LIST_API` 或 `MD_PEGGING_NODIALOG`。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| MD_STOCK_REQUIREMENTS_LIST_API | 功能模块 | MD04 | 读取库存 / 需求清单（MD04 数据）：可用量、MRP 元素 | 内部 / 未发布 | 常见于历史代码，但对客户通常不作为已发布 API。DS4：已启用远程调用，但未发布。默认改用 `BAPI_MATERIAL_STOCK_REQ_LIST`。若现场已调用，FS 须标明内部状态与迁移意向。 |
| MD_PEGGING_NODIALOG | 功能模块 | MD04 | MRP 需求溯源（Pegging）：需求来源与供给去向 | 内部 / 未发布 | DS4：常规函数，不能远程调用，未发布。无对等的已发布 BAPI 列入本目录。不得作为默认可选方案；若业务必须做溯源，在 FS 列为待确认，并标明本函数为内部接口。 |
| BAPI_MATERIAL_STOCK_REQ_LIST | BAPI | MD04（RFC） | 物料库存需求清单接口（外部系统集成） | 已发布 BAPI | 本域首选。只读查询仍须处理返回消息；不在此重复事务纪律。 |

域内注意：

- 本域是查询 / 分析，不是 MRP 运算（MD01/MD02）本身。不要把上述对象写成「跑 MRP」的接口。
