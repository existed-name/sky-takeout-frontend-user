/**
 * 路由表（12 条一次性建全）+ 登录守卫。
 *
 * 约定：
 *   - hash 模式（createWebHashHistory）：任何静态托管/任意子路径下都不会 404，不需要服务端 rewrite；
 *     base 与 Vite 的 base 同源（都读 VITE_APP_BASE），部署到子路径时只改一处环境变量。
 *   - 全部路由**懒加载**：页面组按文件路径各自实现，路由表本身不改动。
 *   - 登录守卫：目标路由 meta.public !== true 且本地无 token 时 → 跳登录页并把当前路径塞进 redirect。
 *     token 存在但已过期**不**在此预检，交给请求层的 401 闭环处理（避免每个路由多一次往返）。
 *   - 已登录访问 /login 直接放行（不强制跳走，避免重定向打转）。
 */
import { h } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

// 视图懒加载集合：只包含「当前构建时已存在」的视图文件。
//
// 为什么用 glob 而不是逐条 `() => import('@/views/...')`：
//   直接写死的动态 import 会在构建时被 Rollup 静态解析，一旦目标文件尚不存在（页面组还没落地），
//   构建会以「Could not resolve / ENOENT」失败。glob 只收集实际存在的文件，缺失的路径回退到占位组件，
//   于是：路由表可以现在就把 12 条一次建全；页面组后续新增/覆盖视图文件会被自动纳入，**无需再改本文件**。
//   这里刻意不创建任何 views/ 下的占位文件，避免与页面组的文件所有权冲突。
const viewModules = import.meta.glob('../views/**/*.vue')

// 尚未实现的页面占位：内联渲染函数（不新增视图文件、不依赖运行时模板编译器）。
const MissingView = {
  name: 'MissingView',
  render: () =>
    h(
      'div',
      { style: 'padding:48px 16px;text-align:center;color:#999;font-size:14px;' },
      '该页面尚未实现'
    )
}

/**
 * 取某个视图的懒加载组件；对应文件不存在时回退占位组件。
 * @param {string} relativePath 相对 src/views 的路径，如 'home/HomeView.vue'
 */
function view(relativePath) {
  return viewModules[`../views/${relativePath}`] || MissingView
}

/** 12 条路由（登录页与无网络页为公开路由） */
const routes = [
  // —— 公开路由 ——
  {
    path: '/login',
    name: 'login',
    component: view('login/LoginView.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/offline',
    name: 'offline',
    component: view('offline/OfflineView.vue'),
    meta: { public: true, title: '网络无法连接' }
  },

  // —— 需登录路由 ——
  {
    path: '/',
    name: 'home',
    component: view('home/HomeView.vue'),
    meta: { title: '首页点餐' }
  },
  {
    path: '/checkout',
    name: 'checkout',
    component: view('checkout/CheckoutView.vue'),
    meta: { title: '提交订单' }
  },
  {
    path: '/orders',
    name: 'orderList',
    component: view('order/OrderListView.vue'),
    meta: { title: '历史订单' }
  },
  {
    path: '/orders/:orderId',
    name: 'orderDetail',
    component: view('order/OrderDetailView.vue'),
    meta: { title: '订单详情' }
  },
  {
    path: '/pay/:orderId',
    name: 'pay',
    component: view('order/PayView.vue'),
    meta: { title: '支付订单' }
  },
  {
    path: '/success/:orderId',
    name: 'success',
    component: view('order/SuccessView.vue'),
    meta: { title: '下单成功' }
  },
  {
    path: '/addresses',
    name: 'addressList',
    component: view('address/AddressListView.vue'),
    meta: { title: '地址管理' }
  },
  {
    path: '/addresses/new',
    name: 'addressNew',
    component: view('address/AddressFormView.vue'),
    meta: { title: '新增收货地址' }
  },
  {
    path: '/addresses/:id/edit',
    name: 'addressEdit',
    component: view('address/AddressFormView.vue'),
    meta: { title: '编辑收货地址' }
  },
  {
    path: '/mine',
    name: 'mine',
    component: view('mine/MineView.vue'),
    meta: { title: '个人中心' }
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_APP_BASE || '/'),
  routes
})

// 登录守卫
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public !== true && !auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
