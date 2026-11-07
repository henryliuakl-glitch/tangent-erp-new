# 教务记录：CuS / Astra 分类（2026-11-07）

## 页面

- `/teaching`：Owner 默认进入 **CuS 教学记录**；其他获授权教师默认进入 **Astra 教学记录**。
- `/teaching?view=astra`：Astra 教学记录，允许拥有 `care`、`astra` 或 `cus` 教师/管理成员身份的人员查看。
- 原有 **班级管理**、**教师档案**、**晚托课堂**独立保留。

课程菜单默认按新西兰当天日期优先，再按与选定日期的距离排序；可用页面日期框定位其他日期。不会再默认选中离今天最远的未来课程。

## 编号分组

针对 **原 ERP 中 `business_unit_id='cus'` 的一对一课程**：

- `student_code` 去除首尾空白后以 `1` 开头 → **CuS**，只有 `erp_memberships('cus','owner')` 能查看与写入。
- 有编号但不以 `1` 开头 → **Astra**；已授权老师可查看所有 Astra 记录，只能修改自己创建的记录。两位 Owner 可维护全部。
- 编号空白或 NULL → 暂不加入任何可共享的教学列表，避免把待分类的旧学员资料误开放给合伙人。
- 以后晚托若采用 `A` 开头编号，天然符合 Astra 的编号约定；**但晚托的 `cus_care_children` 目前是独立儿童档案，并不会自动转成 ERP 一对一课程。** 接送记录、家长签名、联系方式、医疗信息与教学记录仍然分离。

班级课次仍归 CuS Owner 管理，尚未给班课新增 Astra 品牌归属标记。若 Astra 后续开正式班课，应由负责人将班课单独标记为 Astra，不能依赖一组学生的编号反推整个班级归属。

## 数据库（必须部署）

先确认 ERP Supabase 已执行：
1. `20261106_cus_teaching_management.sql`
2. `20261107_cus_teaching_records.sql`
3. `20261107_care_access_and_daily_roster.sql`（之前晚托权限版本）

在 **真正的 Tangent ERP Supabase** 执行新的：
`supabase/migrations/20261107_cus_astra_teaching_access.sql`

这份 SQL **不会修改旧学员、排课、课时、财务或接送数据**。它只增加 Astra 范围核验函数、课程下拉框的有限数据视图，以及对 `cus_teaching_records` 的分级 RLS。

**重要：** Astra 教师无需直接读 ERP 的 `students` 或 `bookings`，仅通过受限制的函数获取日期、姓名、科目及课程标识。不能因为 Astra 教师需要课程列表就取消原始财务/学员表上的 Owner 限制。

## 给老师分配权限

在 Supabase Authentication 建立个人账号后，在 ERP 数据库由管理员按真实邮箱执行，例如：

```sql
-- 教师仅使用 Astra 教学模块：将邮箱换成真实老师邮箱。
insert into public.erp_memberships (user_id,business_unit_id,role)
select id,'astra','teacher' from auth.users where email='TEACHER_EMAIL_HERE'
on conflict(user_id,business_unit_id) do update set role='teacher';

select u.email,m.business_unit_id,m.role
from public.erp_memberships m join auth.users u on u.id=m.user_id
where u.email='TEACHER_EMAIL_HERE';
```

已经有 `care/teacher` 或 `care/admin` 的合伙人账号会被自动允许看 Astra 教学，不需要重复配置；普通未被授予任何教务角色的注册用户不能读取 Astra。

不应把合伙人赋成 `cus/owner`。系统默认限制所有非 Owner 访问内部 ERP 页面。

## 部署后验证

1. 用 Owner 打开两个记录视图：确认 `1...` 学员仅在 CuS，其他有编号学员仅在 Astra。
2. 用测试的 `astra/teacher` 登录，确认只有「教务」菜单，Astra 下拉框及历史记录可读，`/students`、`/bookings`、`/finance` 无法访问。
3. 使用浏览器以该老师身份请求 Supabase Data API，确认原始 `students`、`bookings`、`transactions` 无数据访问，`cus_teaching_records` 只能返回 Astra 行。
4. 老师创建 Astra 教学记录，Owner 能阅读；另一位老师能阅读，但不能修改前者写的记录。
5. 反向测试恶意表单目标改成 CuS 课程 ID，服务端与数据库都应拒绝。
6. 班级管理/普通 CuS 教师档案仅 Owner 可操作，晚托接送权限没有变化。

必须做实际 RLS 权限验证；GitHub 的 TypeScript 构建成功并不能代替数据库验收。
