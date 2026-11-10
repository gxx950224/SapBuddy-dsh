# 批次（跨模块：LO-BM）

本域对象属于 **LO-BM**（批次管理），不是 PP 自有 BAPI。PP 收发货、报工、生产订单组件常涉及批次主数据，故在本技能交叉引用，暂不拆第二技能。FS 与代码方案须写明所属模块。

选用顺序：创建、修改、读取优先已发布 BAPI `BAPI_BATCH_CREATE` / `CHANGE` / `GET_DETAIL`。`BAPI_BATCH_DELETE` 在 DS4 上存在且可远程调用，但未发布，不得作为默认可选方案；它只设置删除标记，不是物理删除。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_BATCH_CREATE | BAPI | MSC1 / MSC1N | 创建批次主数据 | 已发布 BAPI（LO-BM） | 工作簿写作 MSC1；现行 Enjoy 事务多为 MSC1N，以目标系统为准。事务纪律见 `abap-templates`。 |
| BAPI_BATCH_CHANGE | BAPI | MSC2N | 修改批次（含特性值） | 已发布 BAPI（LO-BM） | 可改范围以该 BAPI 与分类/特性配置为准。 |
| BAPI_BATCH_DELETE | BAPI | MSC2N | 设置批次删除标记（工作簿写作「删除批次」） | 未发布（可 RFC；LO-BM） | DS4：存在、已启用远程调用，但 SE37「已发布」标记为空。同组 `BAPI_BATCH_RESTRICT` / `UNRESTRICT` / `UNDELETE` 在 DS4 上同样未发布。**只设置删除标记，不是物理删除。** FS 不得写成「从数据库删除批次」。因未发布，不得作为默认可选方案；若现场必须使用，须在 FS 标明风险与待确认。 |
| BAPI_BATCH_GET_DETAIL | BAPI | MSC3N | 读取批次明细 | 已发布 BAPI（LO-BM） | 只读。 |
