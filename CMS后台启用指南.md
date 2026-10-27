# 内容管理后台（CMS）启用指南

> 面向**不熟悉命令行**的课题组同学。启用后，你可以在浏览器里点点鼠标就更新主页，
> 不用碰命令行、不用写代码。

---

## 一、这个后台是什么

课题组主页的原始模板内置了一套 **Decap CMS**（开源的内容管理系统）。
启用后，访问 https://mjcui.github.io/lab-site/admin/ 就能看到图形化界面：

- 左边是栏目树：成员、论文、项目、新闻、实验室、招生
- 右边是表单，填好点「保存」就行
- 图片可以直接拖进页面里上传

### 它的三个关键特性

| 特性 | 说明 |
|---|---|
| **表单化编辑** | 每个字段都有输入框，不用手写 Markdown 格式 |
| **自动校验** | 字段填错当场提示，不会把错误内容推到线上 |
| **草稿→审核→发布** | 学生提交后生成 PR，**崔老师合并后**才真正上线 |

> 第三个特性很重要：**学生改错不会直接影响网站**，崔老师有审核把关。

---

## 二、为什么现在还不能用

打开 https://mjcui.github.io/lab-site/admin/ 会看到：

```
CMS setup required
- CMS_OAUTH_BASE_URL
```

原因是 **GitHub 不允许浏览器直接做 OAuth 登录**（浏览器里放密钥不安全）。
需要一个中间服务器来完成授权，这个服务器叫 **OAuth 代理**。

我已经把代理程序写好了，放在 `lab-site/cms-oauth-proxy/` 目录，
**你不需要改任何代码**，只需要按下面的步骤操作。

---

## 三、启用步骤（一次性，约 20 分钟）

### 步骤 1：注册 Cloudflare 账号

1. 打开 https://dash.cloudflare.com/sign-up
2. 用邮箱注册并验证
3. 选 Free 套餐（免费额度足够课题组使用）

> 为什么选 Cloudflare：免费、稳定、部署 Worker 不需要服务器。

### 步骤 2：创建 GitHub OAuth App

1. 打开 https://github.com/settings/developers
2. 点 **OAuth Apps** → **New OAuth App**
3. 按下面填写：

| 字段 | 填什么 |
|---|---|
| Application name | `崔明建课题组主页 CMS` |
| Homepage URL | `https://mjcui.github.io/lab-site/` |
| Authorization callback URL | `https://decap-proxy.YOURNAME.workers.dev/callback` |

> ⚠️ `YOURNAME` 换成你在步骤 5 拿到的 Cloudflare 子域名。
> **顺序很重要**：先做步骤 3～5 拿到地址，再回来填这里。

4. 点 **Register application**
5. 页面会显示 **Client ID**，点 **Generate a new client secret** 生成
   **Client secret**
6. **把这两个值复制保存到记事本**，待会儿要用
   （secret 只显示这一次，关掉就看不到了）

### 步骤 3：安装 wrangler（部署工具）

在命令行里执行：

```cmd
npm install -g wrangler
```

### 步骤 4：登录 Cloudflare

```cmd
wrangler login
```

浏览器会弹出授权页，点「Allow」。

### 步骤 5：部署代理

```cmd
cd C:\Users\你的用户名\...\lab-site\cms-oauth-proxy
wrangler deploy
```

部署成功后会显示类似这样的地址：

```
Uploaded lab-site-cms-oauth
Deployed lab-site-cms-oauth triggers
  https://lab-site-cms-oauth.YOURNAME.workers.dev
```

**把这个地址记下来**，接下来要用。

### 步骤 6：设置密钥

```cmd
wrangler secret put GITHUB_OAUTH_ID
```
粘贴步骤 2 里的 Client ID，回车。

```cmd
wrangler secret put GITHUB_OAUTH_SECRET
```
粘贴步骤 2 里的 Client secret，回车。

### 步骤 7：回到步骤 2 补上回调地址

现在你知道自己的 workers.dev 地址了，回到 GitHub 的 OAuth App 设置页，
把 **Authorization callback URL** 改成：

```
https://decap-proxy.YOURNAME.workers.dev/callback
```

（把 `lab-site-cms-oauth` 换成你实际的 Worker 名）

保存即可。

### 步骤 8：让主页用上这个代理

在 `lab-site` 项目目录里改两个文件。

**改 `.github/workflows/deploy.yml`**，找到 `Build site` 那一步的 `env:`，
在 `CMS_BRANCH: main` 下面加一行：

```yaml
          CMS_OAUTH_BASE_URL: https://decap-proxy.YOURNAME.workers.dev
```

**改 `ci.yml`** 同样加一行（保持两个工作流一致）。

改完提交推送：

```cmd
git add .
git commit -m "feat: 启用内容管理后台"
git push origin main
```

### 步骤 9：验证

等 2 分钟，打开 https://mjcui.github.io/lab-site/admin/

应该看到 **Login with GitHub** 按钮。点它：

1. 弹出 GitHub 授权页 → 点「Authorize」
2. 自动跳回来，显示「Loading Decap CMS...」
3. 几秒后进入管理界面，左边是六个栏目

**成了。**

---

## 四、给组内同学开通权限

CMS 需要每位编辑者**有仓库的推送权限**才能保存内容。

### 方式 A：在 GitHub 上邀请（推荐）

1. 打开 https://github.com/mjcui/lab-site/settings/access
2. 点 **Add people**，输入对方的 GitHub 用户名
3. 角色选 **Write**（可推送内容）
4. 对方会收到邮件邀请，接受即可

### 方式 B：给一个 Team 统一授权

适合人数较多：

1. 仓库 → **Settings** → **Teams** → **Add team**
2. 或者在组织里建一个 team，把成员拉进去

---

## 五、日常怎么用（给组内同学）

### 基本流程

```
登录 /admin/  →  选栏目  →  点条目或新建  →  填表单  →  保存
                                    ↓
                        状态变为 "待审核"，自动开 PR
                                    ↓
                        崔老师合并 PR  →  网站更新（约2分钟）
```

### 各栏目的操作

| 想做什么 | 操作 |
|---|---|
| **加论文** | 左侧 `Papers` → 右上 `New Entry` → 填 Year / Title / Venue 等 → Save |
| **改论文信息** | 左侧 `Papers` → 点标题 → 修改 → Save |
| **加成员** | 左侧 `Members` → `New Entry` → 填 Name（中文/英文）→ Save |
| **更新项目进展** | 左侧 `Projects` → 点项目 → 改里程碑表 → Save |
| **发新闻** | 左侧 `News` → `New Entry` → 选日期、填 Slug 和标题 → Save |
| **传实验室照片** | 左侧 `Media Library` → 拖图片进去 |

### 几个要注意的地方

**1. 新闻的 Slug 字段**

Slug 只能是小写字母、数字和短横线，比如 `new-paper-2026`。
不能有中文、空格、大写字母。填错了后台会红字提示。

**2. 论文的 Year 字段**

只填数字，比如 `2026`，**不要加引号或写成"2026年"**。

**3. 中英文内容**

带 `i18n` 标记的字段，中英文分开填。英文版可以先留空，
之后补——但**整条记录的中英必须都存在**，否则英文站那一页会构建失败。

**4. 上传的图片**

直接拖进图片字段即可，会存到 `public/uploads/`。
建议上传前先压缩（超过 1MB 会拖慢网页）。

**5. 看到的内容不更新**

按 `Ctrl + Shift + R` 强制刷新——后台的配置是运行时拉取的，
浏览器缓存会导致改动的字段看不见。

---

## 六、审核与发布

后台设置的是 `publish_mode: editorial_workflow`，所以：

| 状态 | 含义 |
|---|---|
| **Draft（草稿）** | 还在编辑，没提交 |
| **In review（待审核）** | 已提交，PR 已创建，等崔老师合并 |
| **Published（已发布）** | PR 已合并，网站已更新 |

**学生提交后**，到 https://github.com/mjcui/lab-site/pulls 能看到待合并的 PR。
崔老师检查无误后点 **Merge pull request**，等待 2 分钟网站就更新了。

---

## 七、常见问题

### 登录按钮点了没反应

- 检查浏览器是否拦截了弹窗（地址栏右侧可能有提示，允许弹窗）
- 确认 Cloudflare Worker 的两个 secret 都已设置
- 访问 `https://你的worker地址/` 看到 "Decap OAuth Proxy" 说明 Worker 正常

### 提示 "repo not found" 或 404

- 检查 `CMS_GITHUB_REPO` 是不是写成了 `mjcui/lab-site`（斜杠，不是空格）
- 确认登录的 GitHub 账号对该仓库有 Write 权限
- 确认 OAuth App 的 callback URL 与 Worker 地址完全一致（协议、域名、路径都要一致）

### 提示 state 校验失败

授权超时了。从 `/admin/` 重新发起登录，不要直接刷新回调页面。

### 登录成功但一直转圈

- 检查 `public/uploads` 目录是否存在于仓库
- 看浏览器控制台（F12）的报错

### 改了内容但网站没变

1. 确认状态变成了「已发布」而不是「待审核」
2. 确认 PR 已合并
3. 看 https://github.com/mjcui/lab-site/actions 最新一次是否绿色
4. 浏览器 `Ctrl + F5` 强制刷新

### 能不能不用后台，直接改文件？

**可以，两种方式并存。**

后台适合**填表格、更新进展**；直接改文件适合**批量调整格式**。
详细方法见《内容录入手册.md》。

### 后台和直接改文件会冲突吗？

不会。后台走 PR，文件改动走 push，最终都汇入 `main` 分支。
但**不要同时改同一份文件**，否则会产生合并冲突。
建议：**用后台做日常更新**，需要大批量改格式时再切到文件方式。

---

## 八、安全说明

这套方案的权限模型：

- 每位编辑者用**自己的 GitHub 账号**登录，改动记录在提交历史里
- 仓库的写入权限由 GitHub 控制，随时可以收回
- OAuth 密钥保存在 Cloudflare 的加密变量中，不进代码仓库
- 学生提交的内容需经 PR 审核，不直接上线

**不要把 GitHub Token、Client Secret 发给任何人**，包括 AI 助手。
