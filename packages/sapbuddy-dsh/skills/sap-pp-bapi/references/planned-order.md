# 计划订单

选用顺序：本域均为已发布 BAPI，传统开发应优先使用。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_PLANNEDORDER_CREATE | BAPI | MD11 | 创建计划订单（含 BOM 展开与组件） | 已发布 BAPI | 事务纪律见 `abap-templates`。创建后是否立即转生产订单不在本函数范围内，转单须用生产订单侧已发布 BAPI（工作簿未收入，需时在系统核实）。 |
| BAPI_PLANNEDORDER_CHANGE | BAPI | MD12 | 修改计划订单 | 已发布 BAPI | 可改范围以该 BAPI 文档与返回消息为准。 |
| BAPI_PLANNEDORDER_GET_DETAIL | BAPI | MD13 | 读取计划订单明细 | 已发布 BAPI | 只读。 |
| BAPI_PLANNEDORDER_DELETE | BAPI | MD12 | 删除计划订单 | 已发布 BAPI | 删除前须确认计划订单状态允许删除（如尚未转成生产订单等），以返回消息为准。 |
| BAPI_PLANNEDORDER_EXIST_CHECK | BAPI | MD13 | 检查计划订单是否存在 | 已发布 BAPI | 只做存在性检查。 |
