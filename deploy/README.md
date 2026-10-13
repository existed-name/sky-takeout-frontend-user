# Web 用户端 · 容器化部署物料说明

本目录是「苍穹外卖 · Web 用户端前端」的容器化物料。目标：把本仓库构建成**一个 nginx 镜像**，
对外提供**静态页面 + `/user/**` 反向代理**，并且**端口、子路径、后端地址全部可配置**，
便于与后端 / 管理端一起编排部署。

> 本目录**只负责本仓库的镜像与配置**。整套服务（后端 + 管理端 + 本用户端 + MySQL + Redis）的
> 编排（`docker-compose.yml` 等）由**全局编排方**统一维护；与本用户端相关的接入值已经定下：
> 对外宿主机端口 **8082**、镜像 **`sky-takeout-frontend-user:1.0.0`**、后端主机名
> **`sky-takeout-backend`**（可直接采用的服务块见第八节）。

## 一、本目录里有什么

| 文件 | 作用 |
| --- | --- |
| `nginx/default.conf.template` | nginx 站点配置**模板**，随镜像发布，容器启动时由 envsubst 注入后端地址与挂载路径。 |
| `README.md` | 本文件。 |

本仓库**根目录**里与本部署相关的文件：

| 文件 | 作用 |
| --- | --- |
| `Dockerfile` | 前端镜像：容器内用 `node:20-alpine` 构建，再用 `nginx:1.27-alpine` 托管 `dist/`。构建上下文是**仓库根目录**。 |
| `.dockerignore` | 挡掉 `node_modules`、`dist`、`.git`、`.env*`（放行 `.env.example`）、`.idea`、本机草稿类目录等，避免它们进入构建上下文。 |
| `.env.example` | 开发期（dev / preview）的环境变量模板，**不参与镜像构建**，仅供本地参考。 |

---

## 二、运行架构速览

```
访问者浏览器
     │  http://<宿主地址>:<宿主机端口>/
┌────▼──────────────────────────────────────────────┐
│ 本仓库构建出的容器（nginx:1.27-alpine，内部监听 80）│
│    /              → dist/ 静态产物（index.html 等）│
│    /assets/**     → dist/ 带哈希资源（长缓存）      │
│    /user/**       → http://<BACKEND_HOST>:<BACKEND_PORT>（透传，不重写）│
└───────────────────────────────────────────────────┘
```

- 镜像内部 nginx **固定监听 80**；对外映射到宿主机 **8082**（由编排的 `ports:` 落地）。
- 前端是**纯静态文件 + hash 路由**，因此**不需要**后端同源之外的额外处理；本模板仍带了
  `try_files` 回退，更稳妥（见第三节说明）。

---

## 三、构建参数（构建期注入，会被打进产物）

> ⚠ Vite 的 `VITE_*` 是**构建期**变量：源码里的 `import.meta.env.VITE_*` 在 `npm run build`
> 时就被静态替换进 `dist/`。**运行阶段再设同名环境变量无效**，必须构建时就定好。

| 构建参数（`--build-arg`） | 默认值 | 作用 / 什么时候该改 |
| --- | --- | --- |
| `VITE_APP_BASE` | `/` | 前端挂载路径，同时驱动 Vite 的 `base` 与 vue-router 的 base（源码 `src/router/index.js` 读同一个变量）。**挂根路径就保持默认**；要挂在子路径（如 `/web/`）时在构建时改。必须以 `/` 开头且以 `/` 结尾。**不要设成 `/user/`** —— 会与接口前缀 `/user/**` 抢占同一段路径。 |
| `VITE_API_BASE_URL` | （空） | axios 的 `baseURL`（`src/utils/request.js`）。**默认留空 = 同源**：请求直接打到 `/user/...`，由本容器 nginx 反向代理转发到后端 —— 这是推荐形态，**通常不用改**。仅当后端与前端**不同源**时才填绝对地址（如 `http://backend-host:8080`）。 |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | 容器内 `npm ci` 的镜像源。内网 / 私有源环境可覆盖。 |

**如何在构建时指定子路径**：

```bash
# 挂根路径（默认，无需额外参数）
docker build -t sky-takeout-frontend-user:1.0.0 .

# 挂在 /web/ 子路径
docker build --build-arg VITE_APP_BASE=/web/ -t sky-takeout-frontend-user:1.0.0 .
```

---

## 四、运行期环境变量（容器启动时注入，决定 nginx 行为）

这些变量由 `deploy/nginx/default.conf.template` 里的 `${...}` 占位符读取，
在**容器启动时**用 envsubst 替换（官方 nginx 镜像的 `/etc/nginx/templates/*.template` 机制），
输出到 `/etc/nginx/conf.d/default.conf`。**改后端地址 / 挂载路径只需重启容器，不用重建镜像。**

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `BACKEND_HOST` | `sky-takeout-backend` | `/user/**` 反向代理的后端**主机名**。同 compose 编排时填后端服务名；跨主机时填主机名 / IP。 |
| `BACKEND_PORT` | `8080` | 后端端口。 |
| `APP_BASE` | `/`（随构建期 `VITE_APP_BASE` 自动取值） | 前端**挂载路径**，必须与构建期 `VITE_APP_BASE` 一致。Dockerfile 已把构建期的值默认落到这里，正常构建无需手动设。取值 `/` 或 `/web/`（须以 `/` 开头且结尾）。 |

> `APP_BASE` 与 `VITE_APP_BASE` 的关系：前者是**运行期**（nginx 从哪个路径提供文件），
> 后者是**构建期**（产物里的资源引用写成哪个路径）。两者必须相等。Dockerfile 里
> `ARG VITE_APP_BASE` → `ENV APP_BASE=${VITE_APP_BASE}` 已让两者默认一致；
> 只有你**手动**用 `--build-arg VITE_APP_BASE=...` 构建后、又用 `-e APP_BASE=...` 覆盖成
> 另一个值时才会写岔，请避免。

---

## 五、容器内监听端口

- 容器内固定 **80**（`EXPOSE 80`）。对外映射到宿主机的 **8082**（即 `8082:80`），由编排的
  compose `ports:` 或 `docker run -p` 落地。

---

## 六、与后端的关系

- 后端服务地址约定为 **`http://<BACKEND_HOST>:<BACKEND_PORT>`**，**无 context-path**；
  用户端所有端点都在 **`/user/**`** 下。
- 本容器把 **`/user/` 前缀整体反向代理**到后端，且**不做路径重写**（`proxy_pass` 只写主机端口、
  不带 URI，原始 URI 原样透传）—— 与开发期 `vite.config.js` 的 `/user` 代理语义完全一致。
  因此**前端源码无需任何改动**：例如前端请求 `/user/shopping-carts`，后端就收到
  `/user/shopping-carts`。
- 后端必须先起好，否则页面里所有接口请求都会失败。

---

## 七、最小示例（**只读**）

> ⚠ 下面命令用于**本机单跑验证**，正式部署请以第八节的服务块为准。**8082** 是本用户端
> 约定的**对外宿主机端口**（它在编写本文档的本机是空闲端口，本机已占用：
> 3306 / 3307 / 33060 / 6379 / 8080 / 8090 等）。本示例会**真的启动容器并占用 8082**，
> 不需要时请自行 `docker stop` / `docker rm`。

```bash
# 1) 构建镜像（在【本仓库根目录】执行；构建上下文是仓库根）
docker build -t sky-takeout-frontend-user:1.0.0 .

# 2) 运行（宿主机 8082 -> 容器 80；后端指向宿主机上的 8080）
#    跨容器编排时，用后端服务名替换 host.docker.internal、并把容器接入同一个网络。
docker run --rm -d \
  --name sky-user-web \
  -p 8082:80 \
  -e BACKEND_HOST=host.docker.internal \
  -e BACKEND_PORT=8080 \
  sky-takeout-frontend-user:1.0.0

# 3) 验证：浏览器打开 http://localhost:8082/ 应看到用户端首页
#    （后端在宿主机 8080 时，接口请求经容器内 nginx 转发到 host.docker.internal:8080）
```

> Linux 上 `host.docker.internal` 默认不可用，需加 `--add-host=host.docker.internal:host-gateway`，
> 或直接改用后端所在主机名 / IP。跨容器编排请优先把它们放进同一 Docker 网络、用服务名互访。

> **排查提示（如何验证渲染结果）**：要确认站点配置真的生效，**必须让容器命令以 `nginx` 开头**
> —— 例如 `docker run --rm sky-takeout-frontend-user:1.0.0 nginx -T`，它会打印**渲染后**的完整生效配置。
> nginx 官方 entrypoint 只在第一个参数是 `nginx` / `nginx-debug` 时才执行 `/docker-entrypoint.d/`
> 下的脚本；**若把容器命令覆盖成 `sh`**（如 `docker run ... sh -c "…"`），**模板不会被渲染**，
> 看到的会是镜像自带的默认配置 —— 这一点容易被误判成「配置没生效」。

---

## 八、接入全局编排

本容器可直接并入整套服务的 `docker-compose.yml`。把下面这段服务块加进对方编排的
`services:` 下即可（缩进与编排里其它服务对齐）：

```yaml
  frontend-user:
    image: sky-takeout-frontend-user:1.0.0
    container_name: sky-takeout-frontend-user
    restart: unless-stopped
    environment:
      BACKEND_HOST: sky-takeout-backend
      BACKEND_PORT: "8080"
    ports:
      - "8082:80"
    networks:
      - sky-takeout-net
```

要点：

- **网络**：`sky-takeout-net` 是对方已用 `name:` 固定的**外部网络**，本服务的
  `networks` 必须与对方 compose 里的取值完全一致，容器才能用服务名解析到后端。
- **`BACKEND_HOST` 要指向后端服务名**：本镜像的默认值已经是 `sky-takeout-backend`，
  与对方后端服务名一致时无需再设；若对方后端服务名不同，务必在 `environment` 里覆盖
  成实际服务名，否则 nginx 解析不到上游。`BACKEND_PORT` 默认 `8080`（后端容器内端口）。
- ⚠ **`proxy_pass` 里的主机名是 nginx 启动时解析的**：若后端容器比本容器晚就绪，
  本容器会因解析不到上游而启动失败。建议在编排里对本服务加 `depends_on`，指向后端服务。
- 本前端**不使用 WebSocket**，只需要普通 HTTP 请求与静态资源：对方验收项里若有
  WebSocket 通路，与本容器无关。

---

## 九、已确定的接入契约

以下接入值已经定下，编排方可直接采用；各项仍保持可配置，需要时可在编排里覆盖：

1. **宿主机端口**：对外发布 **8082**（`8082:80`）。
2. **`BACKEND_HOST` / `BACKEND_PORT`**：**`sky-takeout-backend:8080`**（本镜像默认值即此）。
3. **镜像命名与版本**：**`sky-takeout-frontend-user:1.0.0`**。
4. **是否挂在子路径**：默认挂根路径（`APP_BASE=/`）。若整套服务要把用户端放在 `/web/` 之类子路径下，则需
   `--build-arg VITE_APP_BASE=/web/` 构建，并让 `APP_BASE` 同步为 `/web/`。
