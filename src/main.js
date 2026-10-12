import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Vant, { setDialogDefaultOptions, setToastDefaultOptions } from 'vant'
// 顺序要紧：vant 的样式先加载，本项目主题变量后加载，后者赢（同级 :root 选择器）。
import 'vant/lib/index.css'

import App from './App.vue'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { registerAuthHandler } from '@/utils/auth-bridge'
import { OVERLAY_TARGET } from '@/constants/layout'
import '@/styles/index.css'

// Vant 的函数式弹窗（Dialog / Toast）默认 teleport 到 document.body，会铺满整个浏览器窗口。
// 这里把它们的默认挂载点统一指向「手机屏容器」内的覆盖层，弹层便自动与手机等宽、贴手机底。
// ⚠ 必须在顶层、app.mount() 之前调用；且挂载点（AppShell 内的 #app-overlay-layer）必须常驻，
//    做成按需渲染（v-if）会导致目标不存在时弹层完全不显示（Vue 仅 warn）。
setDialogDefaultOptions({ teleport: OVERLAY_TARGET })
setToastDefaultOptions({ teleport: OVERLAY_TARGET })

// 应用装配：pinia → router → Vant → 全局样式。
const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Vant)

// 401 闭环的落地端：
//   utils/request.js 在收到 401 时已清 localStorage（token + 用户信息）并弹过一次「登录已失效」，
//   随后通过 auth-bridge 触发这里。此处只做两件 request 层做不到的事：
//     1) 同步清空 Pinia 的 auth store（否则守卫/个人中心还会看到过期的内存 token）；
//     2) 跳转登录页，并把当前路径塞进 redirect（供登录成功后回跳）。
registerAuthHandler(({ redirect } = {}) => {
  const auth = useAuthStore()
  auth.logout()

  // 已在登录页则不重复导航，避免重定向打转
  if (router.currentRoute.value.name === 'login') return

  const query = redirect && redirect.startsWith('/') && redirect !== '/login' ? { redirect } : {}
  router.replace({ name: 'login', query })
})

app.mount('#app')
