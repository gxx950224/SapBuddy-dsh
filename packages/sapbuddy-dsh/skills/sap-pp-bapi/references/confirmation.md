# 订单确认 / 报工

选用顺序：按工序报工用 `BAPI_PRODORDCONF_CREATE_TT`；整单抬头确认用 `BAPI_PRODORDCONF_CREATE_HDR`；查询用 `GETLIST`；冲销用 `CANCEL`。均为已发布 BAPI。

与报工同时发生的货物移动 / 反冲见 `references/goods-movement.md`（MM-IM），不要在本域重复定义货物移动接口。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_PRODORDCONF_CREATE_TT | BAPI | CO11N | 计工单确认（数量 + 工时，按工序报工） | 已发布 BAPI | 按工序 / 计工单确认。自动货物移动是否发生取决于订单与确认参数，货物移动本身仍属 MM-IM。事务纪律见 `abap-templates`。 |
| BAPI_PRODORDCONF_CREATE_HDR | BAPI | CO11N | 订单整单确认（抬头级） | 已发布 BAPI | 与 `CREATE_TT` 不要混用；按业务是工序报工还是整单确认选择。 |
| BAPI_PRODORDCONF_GETLIST | BAPI | CO11N（查询） | 查询订单已确认清单 | 已发布 BAPI | 只读。 |
| BAPI_PRODORDCONF_CANCEL | BAPI | CO11N（取消） | 取消 / 冲销生产订单确认 | 已发布 BAPI | 冲销确认与冲销物料凭证不是同一对象；已过账的物料凭证还须按货物移动接口处理。 |

重复制造的确认 / 反冲不在本域，见 `references/rem.md`。
