# ============================================================================
# Web 用户端镜像：容器内多阶段构建（不依赖、也不使用本机的全局 Node）
#
# 构建命令（必须在【本仓库根目录】执行，因为构建上下文就是仓库根）：
#     docker build -t sky-takeout-frontend-user:1.0.0 .
#
# 仓库根目录的 .dockerignore 负责挡掉 node_modules、dist、.git、.env* 等，
# 它们不会进入构建上下文；deploy/ 需要进上下文（运行阶段要拷 nginx 模板），
# 因此 .dockerignore 里【不排除】deploy/。
#
# 端口、子路径、后端地址全部做成可配置项：
#   - 后端地址 / 容器内监听端口在【运行期】用环境变量配置（见运行阶段）；
#   - 前端挂载子路径在【构建期】用 --build-arg 配置（见构建阶段）。
# ============================================================================


# ---------- 构建阶段 ----------
# 固定 node:20-alpine（LTS），满足 package.json 的 engines: node >= 18。
# 构建全程在容器内完成，完全不触碰、不依赖本机安装的 Node 版本。
FROM node:20-alpine AS build

WORKDIR /app

# 容器内没有本机的 npm 配置，这里显式指定国内镜像源（可在构建时用 --build-arg 覆盖）。
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 先只复制依赖清单，让「安装依赖」单独成层、可被缓存复用；
# 用 package-lock.json 精确安装（npm ci），保证依赖版本可复现。
# 注意：必须包含 devDependencies（下方没有 --omit=dev），
#       因为 vite、@vitejs/plugin-vue 等构建工具都在 devDependencies 里。
COPY package.json package-lock.json ./
RUN npm ci --registry=${NPM_REGISTRY}

# 复制工程源码。node_modules / dist / .git / .env* 已被仓库根目录的
# .dockerignore 挡在构建上下文之外，不会覆盖掉上一步装好的依赖。
COPY . .

# ----------------------------------------------------------------------------
# 为什么必须在这里用 ARG/ENV 显式注入 VITE_*，而不能依赖工作区里的 .env 文件：
#
#   Vite 的环境变量是【构建期注入】的：源码里的 import.meta.env.VITE_* 会在
#   `npm run build` 时被静态替换进产物。因此运行阶段再设同名环境变量对已构建
#   好的 dist/ 毫无影响 —— 必须在这里、也就是构建时提供。
#
#   本仓库的 .env / .env.* 都不入库（.gitignore 只放行 .env.example），
#   换一台机器或新克隆仓库时，构建上下文里就没有它们。若不在这里显式提供，
#   产物会把 VITE_API_BASE_URL 编译成空串、VITE_APP_BASE 编译成默认值，
#   而且构建【不会报任何错】—— 属于静默的产物错误。
#
#   另外，操作系统 / 构建参数的优先级高于 .env 文件，所以即使上下文里恰好带了
#   .env.production，也仍以这里提供的值为准，从而消除环境差异。
# ----------------------------------------------------------------------------

# 前端挂载路径，同时驱动 Vite 的 base 与 vue-router 的 base（二者同源）。
#   默认 / = 挂在根路径。部署到子路径时在【构建时】改，例如：
#       docker build --build-arg VITE_APP_BASE=/web/ -t sky-takeout-frontend-user:1.0.0 .
#   注意：必须以 / 开头、以 / 结尾（/、/web/）；不要设成 /user/，
#         否则会与接口前缀 /user/** 抢占同一段路径，反向代理无法区分。
ARG VITE_APP_BASE=/
ENV VITE_APP_BASE=${VITE_APP_BASE}

# axios 的 baseURL（见 src/utils/request.js）。
#   默认【空】= 同源：请求直接打到同源的 /user/...，由 nginx 反向代理转发到后端。
#   仅当后端与前端不同源时才在【构建时】填绝对地址（如 http://localhost:8080）。
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# 执行生产构建，产物输出到 dist/。
RUN npm run build


# ---------- 运行阶段 ----------
# 用 nginx 托管静态产物。站点配置以「模板」形式打进镜像，容器启动时再由
# nginx 官方镜像的 envsubst 机制注入后端地址，使同一个镜像能指向不同的后端。
FROM nginx:1.27-alpine

# 把构建产物整体作为 nginx 的 web 根。
# dist/ 的最外层就是 index.html，另有 assets/ 子目录（含带内容哈希的 js/css）。
COPY --from=build /app/dist /usr/share/nginx/html

# 站点配置模板：以 *.template 放进 /etc/nginx/templates/，
# nginx 官方镜像的启动脚本会用 envsubst 把其中的 ${BACKEND_HOST} / ${BACKEND_PORT} /
# ${APP_BASE} 替换成运行期环境变量，输出到 /etc/nginx/conf.d/default.conf
# （会覆盖镜像自带的 default.conf）。这样改后端地址或挂载路径只需重启容器、
# 不用重建镜像。
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template

# 跨阶段的 ARG 不会自动传递，这里重新声明一次，把【构建时】的 VITE_APP_BASE
# 落到【运行期】的 APP_BASE，作为 nginx 模板里挂载路径的默认值 ——
# 从而让「构建时挂在哪」与「nginx 从哪提供」自动保持一致，避免两边写岔。
ARG VITE_APP_BASE=/
ENV APP_BASE=${VITE_APP_BASE} \
    BACKEND_HOST=sky-takeout-backend \
    BACKEND_PORT=8080

# 容器内固定监听 80；映射到宿主机的哪个端口由编排（compose / docker run -p）决定。
EXPOSE 80
# 沿用 nginx 官方镜像默认的启动命令（前台运行 nginx），这里不覆盖。
