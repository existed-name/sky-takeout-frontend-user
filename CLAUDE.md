# CLAUDE.md

本文件面向两类读者：**以后在本仓库工作的 AI 会话**，以及**拿到本仓库的同学**。它只记录长期有效的事实与约定，不记录某一次改了什么。

---

## 1. 项目定位与范围

- 这是「苍穹外卖」的 **Web 用户端**（手机点餐 H5）。功能**对齐已有的微信小程序用户端**，**只少「微信登录」**。
- 登录不依赖微信：用昵称换取 JWT（`POST /user/users/login/web`），同一昵称永远映射到同一用户（购物车 / 订单 / 地址按该身份隔离）。
- **本仓库只负责前端**。不改后端，也不改管理端前端仓库。
- 三个兄弟仓库（各自独立仓库、独立构建、独立部署，**不共享任何代码**）：
  - 后端：`sky-takeout`
  - 管理端前端：`sky-takeout-frontend`
  - 本仓库（用户端前端）：`sky-takeout-frontend-user`
- 目的：让「后端 + 管理端前端 + Web 用户端」能一起部署，供同学体验完整业务流程。

---

## 2. 技术栈与运行命令

**技术栈**：Vue 3（组合式 API + `<script setup>`）+ Vite + vue-router 4（hash 模式）+ Pinia + axios + Vant 4（全量引入）+ **纯 JavaScript**（不启用 TypeScript）。

| 场景 | 命令 | 说明 |
|---|---|---|
| 安装依赖 | `npm install` | 在仓库根执行 |
| 开发 | `npm run dev` | Vite dev server，**端口 8090** |
| 打包 | `npm run build` | 产物输出到 **`dist/`** |
| 预览打包产物 | `npm run preview` | 同样 **8090**，且带与 dev 相同的 `/user` 代理，无需 nginx 即可跑通全链路 |

- `@` 别名指向 `src`（见 `vite.config.js`）。
- 未配置 ESLint / Prettier；质量闸门是 `npm run build` 退出码为 0。
- 包管理器用 **npm**，`package-lock.json` 入库。

---

## 3. 环境红线

- **直接使用当前全局 Node**（`package.json` 声明 `node >= 18`）。
- **禁止执行 `nvm use`**：本机是 nvm-windows，`nvm use` 会改写整机全局的 node 链接。
- **不要创建 `.nvmrc`**（nvm-windows 不读它，只会诱导后来者去 `nvm use`）。

---

## 4. 后端契约（必须逐字准确，不要凭记忆或照抄管理端）

- 后端地址与端口：`http://localhost:8080`，**无 context-path**。
- **所有端点都在 `/user/**` 下**。`src/api/**` 里写**完整路径**（如 `/user/shopping-carts`），与后端逐字一致；`baseURL` 默认空串（同源）。
- **成功业务码是 `code === 1`**（失败为 `0`）。**不存在 `code: 200`**。
- **鉴权请求头名是 `authentication`**，值是 token 字符串（**无 `Bearer` 前缀**）。⚠ 管理端前端用的是 `token`，**绝不能照抄管理端的请求层**。
- token 是 JWT（claim `userId`），有效期约 8.33 天。
- 失败表现：
  - **业务失败** = HTTP 200 + `{"code":0,"msg":"..."}`；
  - **鉴权失败** = HTTP 401 + `{"code":0,"msg":"您还没有登录哦~"}`。
- **401 闭环**（请求层统一处理，页面不各自处理）：清登录态 → 提示一次「登录已失效」→ 跳登录页。
- 请求超时 **10000 ms**。
- 免 token 的端点：`POST /user/users/login/web`、`POST /user/users/login`（微信登录，本仓库不使用）、`GET /user/shop/status`。

### 4.1 端点清单

本仓库实现除微信登录外的全部用户端端点（含 Web 登录端点），另有一份前端「再来一单」编排。

| 方法 + 路径 | 用途 | 关键出参（`data` 载荷） |
|---|---|---|
| POST `/user/users/login/web` | Web 登录（body `{name}`） | `{id, openid, token}` |
| GET `/user/shop/status` | 店铺营业状态（免 token） | `number`（1 营业 / 0 打烊） |
| GET `/user/categories` | 分类列表（`type` 可空 = 全部） | `[{id, type, name}]` |
| GET `/user/dishes` | 按 `categoryId` 查菜品（必填） | `[{id, name, categoryId, price, image, description, flavors[]}]` |
| GET `/user/setmeals` | 按 `categoryId` 查套餐（必填） | `[{id, categoryId, name, price, description, image}]` |
| GET `/user/setmeals/{id}/dishes` | 套餐包含的菜品 | `[{name, copies, description, image}]` |
| GET `/user/shopping-carts` | 购物车列表 | `{items[], totalAmount}` |
| POST `/user/shopping-carts` | 加菜/加套餐（每次 +1） | `null` |
| PUT `/user/shopping-carts/{id}/decrement` | 某行数量减一（**PUT，无 body**） | `null` |
| DELETE `/user/shopping-carts` | 清空购物车 | `null` |
| GET `/user/address-books` | 地址列表 | `[{id, consignee, phone, sex, provinceName, cityName, districtName, detail, label, isDefault}]` |
| GET `/user/address-books/default` | 默认地址（无默认地址时 `code:0`） | 地址对象 |
| GET `/user/address-books/{id}` | 地址详情（含 `provinceCode/cityCode/districtCode`） | 地址对象 |
| POST `/user/address-books` | 新增地址 | `null` |
| PUT `/user/address-books/{id}` | 修改地址 | `null` |
| DELETE `/user/address-books/{id}` | 删除地址 | `null` |
| PUT `/user/address-books/{id}/default` | 设为默认地址（无 body） | `null` |
| POST `/user/orders` | 提交订单 | `{id, orderNumber, orderAmount, orderTime}` |
| POST `/user/orders/{id}/payment` | 创建支付单（后端空桩，字段全 null） | `OrderPaymentVO` |
| POST `/user/orders/{id}/payment/success` | 支付成功通知（后端清购物车 + 推进状态） | `null` |
| PUT `/user/orders/{id}/cancellation` | 取消订单（**body 必填**） | `null` |
| POST `/user/orders/{id}/repetition` | 再来一单（后端只校验+插入，**不清购物车**） | `null` |
| POST `/user/orders/{id}/urge-acceptance` | 催单 | `null` |
| GET `/user/orders/history` | 历史订单分页（`page`/`pageSize` 必填正、`status` 可空） | `{total, records[]}` |
| GET `/user/orders/{id}` | 订单详情 | `UserOrderInfoVO` |

### 4.2 字段速查

- **加菜请求体**：`{dishId?, setmealId?, dishFlavor?}`；`dishFlavor` 是**逗号连接的字符串**（多个规格值用 `,` 拼接），无规格时为 `null`。
- **购物车行 `items[]`**：`id, dishId, setmealId, name, number, image, amount, dishFlavor` —— **`amount` 是单价**。
- **下单请求体**：`addressBookId, payMethod(1=微信), remark, estimatedDeliveryTime("yyyy-MM-dd HH:mm:ss"), deliveryStatus(1=立即送出/0=选时间), tablewareNumber, tablewareStatus(1=依据餐量提供/0=无需餐具), packAmount, amount`。其中 **`amount` / `packAmount` 由前端计算，后端原样落库、不重算**。
- **订单详情**：`amount` = 实收金额（含配送费/打包费），`packAmount` = 打包费，`orderDetailList[].amount` = **单价**。
- **历史订单**：`PageResult{total, records[]}`。
- **地址写入字段**：`consignee, phone, sex, provinceCode, provinceName, cityCode, cityName, districtCode, districtName, detail, label, isDefault`。**`sex` 只接受 `"1"`(男)/`"2"`(女)**（发 `"0"` 会被后端业务校验拒绝）；`label` 取值 `"1"`(公司)/`"2"`(家)/`"3"`(学校)；`isDefault` 为 `0/1`。**不要携带 `id`**（id 只走路径）。
- **订单状态**：`1 待付款 / 2 待接单 / 3 待派送 / 4 派送中 / 5 已完成 / 6 已取消 / 7 已退款`。`status=1` 且倒计时已过则展示为「已取消」。

---

## 5. 本仓库自身的约定

- **请求出口唯一**：`src/utils/request.js` 是全仓唯一的 axios 实例与拦截器。其它任何地方（含 `utils/`、`components/`、`views/`）**不得**再 `axios.create()` 或直接 `fetch`。成功时它 resolve 的是**业务载荷**（`data` 字段内容），页面里不再写 `res.code === 1`。
- **失败提示唯一**：只有 `src/utils/notify.js` 负责弹失败提示，页面只做状态复位、不自己弹。静默控制有两层：端点级白名单 `SILENT_LIST`（精确匹配「METHOD + 空格 + 绝对路径」，见 `src/constants/request.js`），以及按次静默 `SILENT_FLAG`（调用时传 `{ [SILENT_FLAG]: true }`）。
- **金额只能用 `src/utils/money.js`**：内部一律以「**分**」做整数运算，仅在展示与提交时转成两位小数。禁止浮点累加 —— **后端把前端传来的 `amount` 原样落库、不重算**，浮点误差会被永久写进数据库。
- **金额口径**（常量在 `src/constants/business.js`）：
  - 配送费 `6` 元、打包费 `1` 元/份；
  - 首页购物车合计 = Σ(份数 × 单价)，**不含**配送费与打包费；
  - 结算页合计 = Σ + 配送费 + 总份数；下单时 `amount` 传该合计、`packAmount` 传总份数。
- **目录写入边界**：`src/api`、`src/stores`、`src/router`、`src/constants`、`src/utils`、`src/components` 是共享底座；页面按目录分组写在 `src/views/<组>/`，只写自己的页面文件，不改动底座。
- **路由表一次性建全**（`src/router/index.js`，12 条 + 登录守卫）。懒加载用 `import.meta.glob` 收集 `src/views/**/*.vue`，文件不存在时回退到内联占位组件 —— 因此**新增视图文件会被自动纳入，无需改路由表**；但文件名必须与路由表里约定的路径一致。路由用 **hash 模式**（`createWebHashHistory`），任意静态托管 / 子路径下都不会 404。
- **登录路径唯一**：`src/api/auth.js` 的 `WEB_LOGIN_ENDPOINT` 是全仓唯一写登录路径的地方；改动登录路径时，必须同步后端 JWT 免鉴权白名单。
- **避免循环依赖**：`utils/request.js` 需要跳登录页，但直接 import router 会形成循环（router → views → api → request）。因此 `request.js` 只 import `utils/auth-bridge.js`，真正的跳转由 `main.js` 注册。页面跳转一律走 `router` / `<RouterLink>`，不要用 `location.href`。
- **不做乐观更新**：购物车的真相源是后端，所有加减都是「发请求 → 重新 `GET /user/shopping-carts` 回灌」，store 只是缓存。不做重复请求取消，防重复点击由页面按钮的 in-flight 禁用承担。

---

## 6. 刻意偏离微信小程序的地方（都是有意为之，不要「修回去」）

| 偏离点 | 小程序做法 | 本仓库做法与理由 |
|---|---|---|
| 备注 | 独立页面 | 改为结算页内**弹层**，减少一次页面跳转 |
| 成功页 | 只读内存态，刷新即空白 | **支持刷新 / 深链**：缺失时用 `orderId` 调 `GET /user/orders/{id}` 兜底取预计送达时间 |
| 结算页数据 | 依赖进入时的内存态 | 进入时**重新拉购物车与默认地址**，避免陈旧数据 |
| 打烊遮罩 | 透明层吃掉点击 + 底部半透明条 | 改为**可见的半透明遮罩 + 居中卡片**（透明层在浏览器里是可用性陷阱：点了没反应且无解释） |
| 结算页拨号 | 占位值 `114` | 用门店电话常量 `SHOP_PHONE`（`400-618-4000`） |
| 401 后跳转 | `reLaunch` 回首页 | **跳登录页**（并把当前路径塞进 `redirect`，登录后回跳） |
| 无默认地址 | 弹提示 | `GET /user/address-books/default` 加入静默清单，由结算页自行渲染「请选择收货地址」空态 |
| 成功页跳首页 | 带遗留参数 `?status=不验证` | **不复刻**该无后端语义的参数 |

---

## 7. 容易写错的地方（防幻觉清单）

- **路径复数与双写字母**：`orders` / `shopping-carts` / `address-books` / `users`；取消订单路径是 `cancellation`（**双 l**）。`baseURL` 默认空串，写错路径不会被任何前缀掩盖，会直接 404。
- **减一是 PUT**（`PUT /user/shopping-carts/{id}/decrement`，无 body），不是 POST。
- **取消订单必须带请求体**（后端 `@RequestBody`），至少传 `{cancelReason: ''}`。
- **购物车列表响应是 `{items, totalAmount}`**，**不是数组**；取值用 `res.items`。
- **`OrderDetail.amount` 是单价**，不是小计；小计要自己用份数乘。
- **历史订单分页响应是 `{total, records}`**（不是 `list`）。
- **菜品/套餐图片是后端返回的绝对 URL**，直接用；**禁止**再拼小程序里那套 `/common/download`（后端不存在该前缀）。
- **规格 `flavors[].value` 是 JSON 数组字符串**（如 `'["无糖","少糖",...]'`），页面需 `JSON.parse` 后使用；无规格的菜品 `flavors` 为空数组或 null。
- **套餐包含菜品的出参 `{name, copies, description, image}` 不含菜品 id**，仅用于展示。
- **`GET /user/shop/status` 返回的是裸数字**（1/0），不是对象。
- **`GET /user/categories` 不传 `type` = 查全部**（首页一次拉全部，菜品与套餐分类混在同一份列表里）。
- **地址 `sex` 只接受字符串 `"1"/"2"`**，发 `"0"` 会被拒。
- **订单状态 3 是「待派送」、7 是「已退款」**（不要说成「已接单」「退款」）。
- **再来一单后端只做「校验 + 插入」**：不清空原购物车、失败不回滚。因此前端必须走 `src/api/reorder.js` 的编排函数（快照 → 清空 → 复制 → 失败按快照尽力恢复），**页面不得直接调用 order 模块里的 `reorderOrder`**。

---

## 8. 部署与开源注意

- **环境变量**（全部 `VITE_` 前缀，三个都有代码内默认值，不写任何 `.env` 文件也能 `dev` / `build`）：

  | 变量 | 默认值 | 用途 |
  |---|---|---|
  | `VITE_API_BASE_URL` | 空串（同源） | axios 的 `baseURL`。默认留空 → 请求直接打到同源 `/user/...`；仅当后端与前端不同源时才填绝对地址（如 `http://host:8080`） |
  | `VITE_APP_BASE` | `/` | 同时驱动 Vite 的 `base` 与 vue-router 的 base；部署到子路径时改为该子路径。**不要设成 `/user/`** —— 会与接口前缀 `/user/**` 抢占同一段路径，代理无法区分 |
  | `VITE_DEV_PROXY_TARGET` | `http://localhost:8080` | 仅 dev / preview 的 `/user` 代理目标 |

- **dev / preview 只代理 `/user` 前缀**到后端，且**不做路径重写**；生产由反向代理把 `/user/` 转发到后端（同样不需 `pathRewrite`），前端代码无需改动。
- **`.env*` 不进版本库**（`.gitignore` 已忽略），**只提交 `.env.example`**（`.gitignore` 放行 `*.example`）。**仓库内不得出现任何密钥**（三个变量都是地址类，无敏感值）。
- **`dist/` 不进库**（`.gitignore` 已忽略）。
- 若前端为 HTTPS 而后端为 HTTP，浏览器会拦截混合内容，必须走同源反向代理或给后端上证书。
- **配送距离限制是后端配置项**（`sky.shop.limit-distance`，默认 5000 米，配合店铺地址配置）：地址离店太远下单会被拒。部署给同学体验时，若同学大多不在店铺附近，需调整该配置或店铺地址，否则几乎无法下单。
- 登录：未实现的微信登录端点 `POST /user/users/login` 在本仓库保留对照但不调用。
