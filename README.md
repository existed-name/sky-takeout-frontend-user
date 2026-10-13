# 苍穹外卖 · Web 用户端（前端）

## 项目简介

本仓库是教学项目「苍穹外卖」的 **Web 用户端前端**（手机点餐 H5）。它功能对齐同一项目的微信小程序用户端，**只少了「微信登录」** —— 登录改为「体验登录」（输入昵称即建号）。

在整个项目里，前端与后端分属独立仓库、独立构建、独立部署。本仓库只负责用户端的页面与交互，不含后端逻辑；后端是一个独立的 Spring Boot 服务（仓库 `sky-takeout-backend`），开发时通过代理把请求转发给它。这样，后端 + 用户端前端即可一起部署，供同学体验完整业务流程。

## 技术栈

- Vue 3（组合式 API + `<script setup>`）
- Vite 5
- vue-router 4（hash 模式）
- Pinia
- axios
- Vant 4
- 纯 JavaScript（不启用 TypeScript）

## 环境要求

- **Node.js >= 18**
- 包管理器：**npm**（仓库内附 `package-lock.json`）
- 需要同时把后端服务起好（见下文「与后端的关系」）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务（默认 http://localhost:8090）
npm run dev

# 3. 构建生产包（产物输出到 dist/）
npm run build

# 4. 预览构建产物（同样 8090，且带与 dev 相同的 /user 代理）
npm run preview
```

开发服务端口为 **8090**。以上命令与 `package.json` 的 scripts 一致。

## 配置说明

所有环境变量都以 `VITE_` 前缀，且都有代码内默认值 —— **不写任何 `.env` 文件也能 `dev` / `build`**。需要自定义时，把 `.env.example` 复制为 `.env.development` / `.env.production` 再改。

| 变量 | 默认值 | 作用 |
|---|---|---|
| `VITE_API_BASE_URL` | 空串（同源） | axios 的 `baseURL`。默认留空 → 请求直接打到同源 `/user/...`，由 dev / preview 代理或生产反向代理转发。**仅当后端与前端不同源时**才填绝对地址，例如 `http://localhost:8080`（拼出来仍是 `http://localhost:8080/user/...`） |
| `VITE_APP_BASE` | `/` | 前端挂载路径，同时驱动 Vite 的 `base` 与 vue-router 的 base。部署在子路径时改为该子路径（如 `/web/`）。**不要设成 `/user/`** —— 会与接口前缀 `/user/**` 抢占同一段路径，代理无法区分 |
| `VITE_DEV_PROXY_TARGET` | `http://localhost:8080` | 仅 dev / preview 阶段，`/user` 代理的转发目标（后端换机器 / 换端口时改这里） |

`.env` 文件已被 `.gitignore` 忽略，仓库只提交 `.env.example`。

## 目录结构

```
src/
├── api/          # 接口层：按后端模块拆分的请求函数（登录 / 分类 / 菜品 / 套餐 / 购物车 / 地址 / 订单等）
├── components/   # 公共组件：手机屏外壳、导航栏、弹层、金额与订单状态展示等
├── constants/    # 常量：业务常量（费率、门店信息）、请求静默配置、布局契约、订单状态
├── router/       # 路由表与登录守卫（hash 模式）
├── stores/       # Pinia store：登录态、购物车、结算草稿、店铺状态
├── styles/       # 全局样式与设计变量（配色 / 圆角 / 间距 / 字号 / 阴影等）
├── utils/        # 工具：axios 请求层与拦截器、金额整数运算、格式化、登录跳转桥等
├── views/        # 页面：按业务分组（home / login / address / checkout / order / mine / offline 等）
├── App.vue       # 根组件（装配「手机屏」外壳与路由出口）
└── main.js       # 应用入口（装配 Pinia、路由、Vant 与全局样式）
```

`@` 别名指向 `src`（见 `vite.config.js`）。

## 与后端的关系

- 后端服务地址约定为 **`http://localhost:8080`**，**无 context-path**；用户端的所有端点都在 **`/user/**`** 下。
- 本仓库的 dev / preview 只把 **`/user` 前缀整体代理**到 `VITE_DEV_PROXY_TARGET`（默认 `http://localhost:8080`），且**不做路径重写** —— 因此后端端点路径必须与前端请求路径逐字一致（例如 `/user/shopping-carts` 原样发到后端）。生产环境由反向代理把 `/user/` 转发到后端，同样不需要重写。
- 运行本项目前，**请先在 8080 端口把后端服务起好**，否则接口请求会失败。
- 前端是纯静态文件 + hash 路由，静态托管不需要任何 try_files / history fallback 之类的路由改写。

## 注意事项

- **登录是「体验登录」，不是真实微信授权**：输入一个昵称即可创建 / 登录账号（后端按该昵称派生一个稳定身份），同一昵称始终映射到同一个用户，购物车 / 订单 / 地址按该身份隔离。这是为了让同学快速体验业务流程而做的简化。
- **配送距离限制**是后端的配置项：收货地址离店铺太远，提交订单会被后端拒绝。若体验时地址大多离店较远，需要调整后端配置或店铺地址。
- **下单金额由前端计算后传给后端**（合计 = Σ(份数 × 单价) + 配送费 + 打包费），后端对收到的金额**原样落库、不重算**；相关费率集中在本仓库 `src/constants/business.js` 的业务常量里，调整金额口径时需前后端一起确认。
- 本项目为教学演示用途，不接入真实支付。
- 构建产物输出到 `dist/`，该目录已被 `.gitignore` 忽略。

## 容器化部署

本仓库自带了容器化物料：仓库根的 `Dockerfile`（多阶段：`node:20-alpine` 构建 → `nginx:1.27-alpine` 托管 `dist/`）与 `.dockerignore`，站点配置模板在 `deploy/nginx/default.conf.template`。**完整说明见 [`deploy/README.md`](deploy/README.md)**，这里只列要点：

- **构建期参数**（会被打进产物，因为 Vite 的 `VITE_*` 是构建期注入）：
  - `VITE_APP_BASE`：前端挂载路径，默认 `/`；挂子路径时用 `--build-arg VITE_APP_BASE=/web/` 构建。
  - `VITE_API_BASE_URL`：默认**留空 = 同源**（请求打到 `/user/...`，由容器内 nginx 反代到后端），通常不用改。
- **运行期环境变量**（容器启动时由 nginx 的 envsubst 注入，改后端地址只需重启容器）：
  - `BACKEND_HOST`（默认 `sky-backend`）、`BACKEND_PORT`（默认 `8080`）、`APP_BASE`（默认随构建期的 `VITE_APP_BASE`）。
- 容器内 **固定监听 80**；映射到宿主机的端口由全局编排决定。
- 容器内 nginx 把 `/user/` **原样反向代理**到后端（不做路径重写，与开发期 dev 代理语义一致），静态资源带合理缓存头，并带 SPA 回退。

```bash
# 在仓库根目录构建（宿主机端口仅为示例，实际由编排决定）
docker build -t sky-takeout-frontend-user:1.0.0 .
docker run --rm -d --name sky-user-web -p 8081:80 \
  -e BACKEND_HOST=host.docker.internal -e BACKEND_PORT=8080 \
  sky-takeout-frontend-user:1.0.0
```

## 许可

本项目采用 [GNU General Public License v3.0](LICENSE)（GPL-3.0）许可。
