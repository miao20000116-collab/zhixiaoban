# 职小伴 · Netlify 前端 + Oracle 免费 VM 后端

> **推荐部署架构（0 元 24h 在线）**  
> - **前端**：Netlify（0 元，固定链接发给面试官）  
> - **后端**：Oracle Cloud 免费 VM（FastAPI + Postgres + 语音存储）  
> 预计耗时：Netlify 30 分钟 + Oracle 1～2 小时

---

## 架构

```
面试官浏览器
    ↓
Netlify（Next.js 前端）          ← 0 元，如 https://zhixiaoban.netlify.app
    ↓  HTTPS API
Oracle VM + Caddy（后端 API）     ← 0 元，如 https://api.你的域名.com
    ├─ FastAPI
    ├─ PostgreSQL
    └─ /media/audio（语音 mp3）
         ↓
    DeepSeek + 硅基流动
```

**你需要两个地址：**

| 用途 | 示例 | 平台 |
|------|------|------|
| 前端（发给面试官） | `https://zhixiaoban.netlify.app` | Netlify |
| 后端 API | `https://api.你的域名.com` | Oracle VM |

> 语音面试要求 **前后端都是 HTTPS**。Netlify 默认有 HTTPS；Oracle 后端用 Caddy 自动申请证书。

---

## 第一部分：部署前端到 Netlify

### 1. 推送代码到 GitHub / GitLab

确保仓库包含 `frontend/` 目录和根目录的 `netlify.toml`。

### 2. 连接 Netlify

1. 登录 [app.netlify.com](https://app.netlify.com)
2. **Add new site → Import an existing project**
3. 选择你的 Git 仓库
4. Netlify 会自动读取根目录 `netlify.toml`：
   - Base directory：`frontend`
   - Build command：`npm run build`
   - Plugin：`@netlify/plugin-nextjs`（首次构建 Netlify 会提示安装，点允许）

### 3. 配置环境变量（重要）

Netlify 控制台 → **Site configuration → Environment variables**：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NEXT_PUBLIC_API_URL` | `https://api.你的域名.com` | Oracle 后端地址，**Deploy 后再填** |

先留空或填占位，等 Oracle 后端部署完成后再改并 **Trigger deploy**。

参考模板：`deploy/netlify.env.example`

### 4. 部署并记下前端地址

部署成功后得到类似：

```
https://zhixiaoban.netlify.app
```

也可在 Netlify 绑定自定义域名（可选）。

### 5. 本地开发不受影响

本地仍用 `http://localhost:3001`，`NEXT_PUBLIC_API_URL` 留空或指向 localhost 时，会自动走 `/backend-api` 代理。

---

## 第二部分：部署后端到 Oracle 免费 VM

### 1. 创建 Oracle VM

1. [cloud.oracle.com](https://cloud.oracle.com) 注册（Always Free，需信用卡验证不扣费）
2. **Compute → Instances → Create**
3. **Shape**：Ampere A1 Flex（Always Free），建议 2 OCPU + 12GB RAM
4. **Image**：Ubuntu 22.04 / 24.04
5. 分配 **公网 IPv4**，配置 SSH Key

**Security List 入站规则**（Oracle 控制台）：

| 端口 | 说明 |
|------|------|
| 22 | SSH |
| 80 | HTTP（Caddy 申请证书） |
| 443 | HTTPS |

### 2. 域名解析（后端 API 用）

添加 **A 记录**（可与前端 Netlify 域名不同）：

```
api.你的域名.com  →  Oracle VM 公网 IP
```

### 3. SSH 安装 Docker

```bash
ssh ubuntu@<VM公网IP>
sudo bash deploy/scripts/bootstrap-oracle.sh
# 或：curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录 SSH
```

### 4. 克隆项目并配置

```bash
git clone <你的仓库> /opt/zhixiaoban
cd /opt/zhixiaoban
cp deploy/.env.example deploy/.env
nano deploy/.env
```

**deploy/.env 必填项：**

```env
# 后端 API 域名（与 DNS A 记录一致）
DOMAIN=api.你的域名.com

# Netlify 前端地址（CORS 白名单，填你 Netlify 站点 URL，无末尾斜杠）
NETLIFY_ORIGIN=https://zhixiaoban.netlify.app

POSTGRES_PASSWORD=强密码
OPENAI_API_KEY=sk-...          # DeepSeek
SPEECH_API_KEY=sk-...          # 硅基流动
```

### 5. 启动后端（backend-only 模式）

```bash
docker compose -f deploy/docker-compose.backend-only.yml up -d --build
docker compose -f deploy/docker-compose.backend-only.yml logs -f backend
```

### 6. 验证后端

```bash
curl https://api.你的域名.com/api/health
# {"status":"ok","service":"ai-career-assistant-backend"}
```

---

## 第三部分：前后端联调

### 1. 回 Netlify 填写 API 地址

Netlify → Environment variables：

```
NEXT_PUBLIC_API_URL = https://api.你的域名.com
```

保存后 **Deploys → Trigger deploy → Deploy site**。

### 2. 浏览器验收

打开 `https://你的-netlify-站点.netlify.app`：

- [ ] 首页正常，能新建对话
- [ ] 文字聊天有 AI 回复
- [ ] 语音面试能申请麦克风（Chrome/Edge）
- [ ] 面试官 TTS 语音正常

### 3. 发给面试官

> **职小伴 · AI 求职 Agent**  
> 演示链接：https://zhixiaoban.netlify.app  
> 说明：无需登录；支持文字对话、简历/JD 分析、语音模拟面试（请用 Chrome/Edge 并允许麦克风）

---

## 常见问题

### Netlify 构建失败

- 确认根目录有 `netlify.toml`，且 `base = "frontend"`
- 首次需允许安装 `@netlify/plugin-nextjs`
- 查看 Netlify 构建日志中的 Node 版本（建议 20+）

### 前端报「无法连接后端」

1. `NEXT_PUBLIC_API_URL` 是否正确（含 `https://`，无末尾 `/`）
2. Oracle 后端 `/api/health` 是否 200
3. `deploy/.env` 里 `NETLIFY_ORIGIN` 是否与 Netlify 站点 URL **完全一致**
4. Netlify 重新 deploy 一次（环境变量改后必须重新构建）

### 语音 mp3 播不了

- 后端 `MEDIA_BASE_URL` 应为 `https://api.你的域名.com/media`
- 浏览器 Network 里看 mp3 请求是否 200

### CORS 错误

后端 `CORS_ORIGINS` 需包含 Netlify 地址，在 `docker-compose.backend-only.yml` 中通过 `NETLIFY_ORIGIN` 注入。修改后：

```bash
docker compose -f deploy/docker-compose.backend-only.yml up -d --build backend
```

### 国内访问慢

Netlify 与 Oracle 均在海外，国内比本机慢但 24h 可用。重要面试可备 **cpolar 本机隧道** 作 Plan B。

---

## 费用

| 项目 | 费用 |
|------|------|
| Netlify 前端 | **0 元** |
| Oracle VM 后端 | **0 元**（Always Free 额度内） |
| 后端 API 域名 | 约 ¥30～60/年（仅 api 子域名需要） |
| DeepSeek + 硅基流动 | 按量 |

---

## 相关文件

| 文件 | 用途 |
|------|------|
| `netlify.toml` | Netlify 构建配置（项目根目录） |
| `deploy/netlify.env.example` | Netlify 环境变量模板 |
| `deploy/docker-compose.backend-only.yml` | Oracle 仅后端 |
| `deploy/Caddyfile.api-only` | 后端 HTTPS |
| `deploy/.env.example` | Oracle 后端环境变量 |
| `deploy/scripts/bootstrap-oracle.sh` | VM 装 Docker |

---

*最后更新：2026-08-17*
