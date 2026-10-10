import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Vant from 'vant'
import 'vant/lib/index.css'

import App from './App.vue'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'
import { registerAuthHandler } from '@/utils/auth-bridge'
import '@/styles/index.css'

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
