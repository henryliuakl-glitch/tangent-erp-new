# CuS 晚托班管理（试运行版本，2026-11-06）

> 该功能用于儿童托管的内部管理，不代表取得 OSCAR 认证或满足全部适用法律、安全、隐私或运营要求。正式招生前须由负责人核对适用的儿童保护、场地、保险、隐私及监护交接要求。

## 页面

- `/afterschool/register`：创建或关联 CuS 学生；录入学校、年级、过敏信息；选择周一至周五；两位家长分别手写签名；主要联系人；第三紧急联系人；迟接费用与录像/SMS 知情同意
- `/afterschool`：生成今日托管清单、Clock In/Out（现场签名）、主要家长电话一键拨打、第三方接送审批、私密视频上传、家长已通知确认、迟接费用展示、补签第二家长、调整每周班次
- `/teaching`：现有 Programmes / Classes / Enrolments / Attendance；此模块与晚托独立，尚未自动扣课时或关联一周多班报名

## 数据库部署顺序（**在真正的 ERP Supabase**，不是题库数据库）

先备份数据库，确认已安装早先的 `20261106_cus_teaching_management.sql` 且两个 Owner 已配置。

按顺序运行：
1. `supabase/migrations/20261106_cus_care_safeguarding.sql`
2. `supabase/migrations/20261106_cus_care_handover_guards.sql`
3. `supabase/migrations/20261106_cus_care_sms_consent.sql`
4. `supabase/migrations/20261106_cus_care_policy_patch.sql`

务必使用 ERP 数据库 SQL Editor 的管理员权限；执行后手动验证新表与 RLS 是否启用。

**不要执行** `20261106_erp_core_scope_after_membership_bootstrap.sql`，除非已有所有 ERP 账户、业务单元权限映射并验证现有业务不会被锁住。

## 接送安全流程

- 完成两位家长签名后才允许激活档案与正常打卡；缺第二签名的学员保持 `pending`，仅 Owner/Admin 可补签并激活
- Clock In：选择已备案家长、填写与档案一致的姓名、本人手写签名、工作人员核验身份
- Clock Out：同样签名和核验，数据库触发器要求只能从 `in_care` → `released`，记录不可再修改
- 第三人：仅紧急联系人不等于可接人。必须由有权家长通过已核实渠道明确批准；检查孩子反应；**事先获得录像同意**；上传交接视频到私有 bucket；通过安全渠道通知批准家长；记录后方允许第三方签名接走
- 数据库触发器记录进出状态变更与第三方审批的不可修改审计事件
- 当前签名是现场触屏/鼠标签名，**不是短信 OTP 或法律身份鉴定**；未实现可独立远程认证的家长自助签署链接。对于监护权、法院限制和其他争议，必须人工核实相关证明，不能只依赖系统名字匹配
- **数字签退不是法律上自动解除全部义务**。交接必须真实完成且安全，不得仅凭纸面签字放行

## 迟接收费（目前为暂定规则）

- 0 分钟：NZ$0
- 迟接 1–60 分钟：NZ$20
- 超过 60 分钟：NZ$20 + 每超出一个开始的小时 NZ$10
- 仅记录**暂计金额**，不自动生成应收/扣款；收费条款和补充免收费场景须先与家长签约并经合伙人确认

## 短信自动提醒（**默认关闭，必须配置后才能发**）

已经提供 `GET /api/cron/care-reminders`，需 HTTP Header
`Authorization: Bearer <CRON_SECRET>`。脚本每次：
- 自动为周一至周五已激活的学生生成当日 visit（幂等）
- 根据首联家长明确的短信同意，仅向首联家长发送托管事务提醒
- 开始前 60 分钟：提醒送达；开始后 60 分钟：提醒预约接送；结束前 30 分钟：提醒准备接；结束后 15 分钟仍未离开：催接并提示教务人工电话联系
- 短信按 `(visit_id,reminder_type)` 唯一去重，并记录发送时间、Twilio 返回编号和失败原因。此记录为**调用/排队证据**，并不保证送达手机
- 请将首联手机号填写为国际格式（`+64...`）或新西兰本地 `0...` 格式

请在 **Vercel 的 ERP 项目环境变量**中配置：
- `CRON_SECRET`：至少16字符随机值，秘密保管
- `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM_NUMBER`：从合法使用的短信供应商控制台配置
- 可选 `CARE_CONTACT_PHONE`：短信里显示的机构联系电话
- ERP 自己已经使用的 `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`

调度方式：仓库 `.github/workflows/care-reminders.yml` 有每5分钟触发一次的 GitHub Actions 计划任务，**默认不执行发送**。启用时，在 GitHub 仓库 Actions variables/secrets 配置：
- Variable `CARE_REMINDERS_ENABLED=true`
- Variable `ERP_PRODUCTION_URL=https://<你的ERP线上域名>`
- Secret `CARE_CRON_SECRET`：和 Vercel 的 `CRON_SECRET` 完全一致

GitHub Actions cron 有延迟可能，不保证精确到分钟。若使用 Vercel Cron，按其当前计划最低频次限制配置；不要在 Hobby 计划部署每5分钟 cron（Hobby 最多每天一次）。儿童交接、安全事故处理及超时联系**不能依赖短信定时器**，必须有值班人员主动检查。

## 上线前仍需做的事

1. 实测 ERP DB schema、RLS、同时多名家长提交以及时间切换；用不含真实儿童资料的测试学员
2. 完成法律审阅版家长协议、接送政策、影像使用告知、录像保留期限、安全删除流程、隐私访问记录与纠错流程
3. 家长远程独立认证签署、家长审批回执、视频通过受保护渠道自动发送**尚未实现**
4. SMS/视频基础设施尚需第三方账号、费用及真实发送测试；用户无法在界面内直接点击短信回执查看送达状态
5. 监护权限变更、特殊接送名单、应急事故上报、迟接账单/付款的财务闭环仍需完善
6. 当前注册码中的创建学生及多个表插入是多次数据库请求，尚未封装为单一数据库事务；请勿用此未经实测流程直接录入真实家庭信息

参考：NZ Privacy Commissioner 的儿童影像与教育信息保护指南；OSCN 对 OSCAR 注册及紧急联系信息的业务说明。
