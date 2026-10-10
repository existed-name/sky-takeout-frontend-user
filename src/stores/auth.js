/**
 * 鉴权状态（token / 用户信息 / 登录登出）。
 *
 * 设计约定：
 *   - 登录路径只出现在 api 层（src/api/auth.js 的 WEB_LOGIN_ENDPOINT），本 store 不写死任何路径。
 *   - 登录动作只调用 src/api/auth.js 的 loginWeb()；token 注入、code 判定、失败提示都由
 *     utils/request.js 统一完成，本 store 只负责「拿到载荷 → 落地状态 + localStorage」。
 *   - token 与用户信息同时写入 localStorage（键名 token / baseUserInfo，与小程序保持对照），
 *     页面刷新后由这里从 storage 初始化，保证路由守卫能立即看到登录态。
 *   - 401 闭环：utils/request.js 会清 localStorage；Pinia 状态由 main.js 注册的 auth-bridge
 *     处理器调用本 store 的 logout() 同步清空（见 main.js 注释）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { loginWeb } from '@/api/auth'
import {
  clearAuth,
  getToken,
  getUserInfo,
  setLastLoginName,
  setToken,
  setUserInfo
} from '@/utils/storage'

export const useAuthStore = defineStore('auth', () => {
  /** JWT（初值从 localStorage 读取，保证刷新后登录态不丢） */
  const token = ref(getToken())
  /** 用户信息 { id, openid, name } 或 null */
  const userInfo = ref(getUserInfo())

  /** 是否已登录（仅判断本地是否有 token，不做 token 有效性预检——过期交给 401 闭环） */
  const isLoggedIn = computed(() => !!token.value)

  /** 展示用昵称（个人中心用；微信头像已随微信登录一并去掉） */
  const displayName = computed(() => (userInfo.value && userInfo.value.name) || '')

  /**
   * 登录：调用 api 层的 Web 登录函数，成功后落地 token 与用户信息。
   *
   * 失败会 reject（业务失败 / 网络异常），请求层已弹过一次提示；调用方只需 try/catch 复位 UI。
   *
   * @param {string} name 用户名（1–20 字符，由登录页校验）
   * @returns {Promise<{id:number, openid:string, name:string}>}
   */
  async function login(name) {
    // 出参：{ id, openid, token }（openid 由后端拼成 tourist_{name}）
    const result = await loginWeb(name)

    token.value = result.token
    setToken(result.token)

    // 只保存展示所需的昵称与本地的 name，不臆造后端不存在的字段
    userInfo.value = { id: result.id, openid: result.openid, name }
    setUserInfo(userInfo.value)

    // 记录「上次用过的用户名」，供登录页下次预填（用户名 = 账号，忘了就回不到自己的订单）
    setLastLoginName(name)

    return userInfo.value
  }

  /**
   * 登出 / 401 失效时清空登录态（token + 用户信息；保留 lastLoginName 以便重新登录预填）。
   */
  function logout() {
    token.value = ''
    userInfo.value = null
    clearAuth()
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    displayName,
    login,
    logout
  }
})
