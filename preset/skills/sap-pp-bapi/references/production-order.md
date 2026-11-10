# 生产订单

选用顺序：本域均为已发布 BAPI，传统开发应优先使用，而不是直接改订单表或自写等效接口。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_PRODORD_CREATE | BAPI | CO01 | 创建生产订单（头 / 组件 / 工序 / 数量 / 日期） | 已发布 BAPI | 事务纪律见 `abap-templates`。由计划订单转换等未列入工作簿的已发布 BAPI，不在本表展开，需要时在系统核实后再用。 |
| BAPI_PRODORD_CHANGE | BAPI | CO02 | 修改生产订单（数量、日期、组件、工序） | 已发布 BAPI | 可改范围以该 BAPI 文档与返回消息为准，不要假定任意字段都可改。 |
| BAPI_PRODORD_RELEASE | BAPI | CO02（下达） | 下达生产订单 | 已发布 BAPI | 只做下达，不替代创建或修改。 |
| BAPI_PRODORD_GET_DETAIL | BAPI | CO03 | 读取订单头 / 状态 / 数量汇总 | 已发布 BAPI | 只读。 |
| BAPI_PRODORD_GET_LIST | BAPI | CO03 | 按工厂 / 订单类型 / 期间等条件查询订单列表 | 已发布 BAPI | 只读。用于列表而不是单张订单全量明细。 |
| BAPI_PRODORD_COMPLETE_TECH | BAPI | COHV/CO02 | 订单技术性完成 | 已发布 BAPI | 技术完成（TECO）与关闭（CLSD）不是同一状态，不要与 `BAPI_PRODORD_CLOSE` 混用。 |
| BAPI_PRODORD_CLOSE | BAPI | COHV/CO02 | 生产订单关闭 | 已发布 BAPI | 关闭与技术完成不同。 |
| BAPI_PRODORD_EXIST_CHECK | BAPI | CO03 | 检查订单是否存在 | 已发布 BAPI | 只做存在性检查，不返回明细。 |

域内注意：

- 工作簿未收入同族其它已发布 BAPI（如从计划订单创建、设置删除标记、可用性检查等）。本目录以工作簿范围为准；需要时在目标系统核实名称后再写入方案，并标明「未收入本目录」。
