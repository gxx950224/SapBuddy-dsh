# 重复制造（PP-REM）

选用顺序：按库存生产（MTS）反冲用 `BAPI_REPMANCONF1_CREATE_MTS`；按销售订单（MTO）用 `CREATE_MTO`；冲销用 `CANCEL`。均为已发布 BAPI。不要用离散制造的 `BAPI_PRODORDCONF_*` 替代本域对象。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_REPMANCONF1_CREATE_MTS | BAPI | MFBF | 重复制造反冲（按库存生产 MTS） | 已发布 BAPI | 仅 MTS。事务纪律见 `abap-templates`。伴随的库存过账仍属货物移动语义，但本 BAPI 是 REM 确认入口，不要改用离散报工 BAPI。 |
| BAPI_REPMANCONF1_CREATE_MTO | BAPI | MFBF | 重复制造反冲（按销售订单 MTO） | 已发布 BAPI | 仅 MTO。与 MTS 接口不要混用。 |
| BAPI_REPMANCONF1_CANCEL | BAPI | MF41 | 重复制造确认冲销 | 已发布 BAPI | 冲销 REM 确认；事务为 MF41，不是 CO11N。 |
