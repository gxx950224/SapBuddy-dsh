# 货物移动 / 反冲（跨模块：MM-IM）

本域对象属于 **MM-IM**，不是 PP 自有 BAPI。PP 投料、成品收货、报工反冲、预留与 STO 收发等场景常用，故在本技能交叉引用，暂不拆第二技能。FS 与代码方案须写明所属模块。

选用顺序：过账用 `BAPI_GOODSMVT_CREATE`；按物料凭证冲销用 `BAPI_GOODSMVT_CANCEL`；按凭证号读取明细用 `BAPI_GOODSMVT_GETDETAIL`；按条件检索用 `BAPI_GOODSMVT_GETITEMS`。

| 对象名称 | 类型 | 事务码 | 主要用途 | 发布状态 | 约束 |
| --- | --- | --- | --- | --- | --- |
| BAPI_GOODSMVT_CREATE | BAPI | MIGO | 货物移动过账：生产订单投料 / 收货、预留、STO 收发、反冲 | 已发布 BAPI（MM-IM） | 事务纪律见 `abap-templates`。移动类型、GM_CODE 与参考单据必须与业务场景匹配，不得套用其它场景的过账参数。 |
| BAPI_GOODSMVT_GETITEM | 工作簿所列 BAPI | MIGO（查询） | 工作簿用途：读取物料凭证行项目 | 工作簿存疑（对象不存在） | **DS4 上不存在名为 `BAPI_GOODSMVT_GETITEM` 的 BAPI。** 不要按此名称调用。按凭证号读取用 `BAPI_GOODSMVT_GETDETAIL`；按条件列出用 `BAPI_GOODSMVT_GETITEMS`（二者均存在、可远程调用，DS4 发布日期 1998-07-23）。 |
| BAPI_GOODSMVT_GETDETAIL | BAPI | MIGO（查询） | 按物料凭证号 + 年度读取抬头与行项目 | 已发布 BAPI（MM-IM） | 工作簿未列此名，作为 `GETITEM` 的对应标准对象收入。只读。 |
| BAPI_GOODSMVT_GETITEMS | BAPI | MIGO（查询） | 按物料 / 工厂 / 移动类型 / 日期等条件检索物料凭证 | 已发布 BAPI（MM-IM） | 工作簿未列此名。与 `GETDETAIL` 用途不同，不要混用。只读。 |
| BAPI_GOODSMVT_CANCEL | BAPI | MIGO（冲销） | 冲销物料凭证 | 已发布 BAPI（MM-IM） | 冲销已过账物料凭证。报工确认的取消见 `references/confirmation.md`，二者不要互相替代。 |
