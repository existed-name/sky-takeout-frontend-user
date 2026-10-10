/**
 * 全仓唯一的 axios 实例与拦截器（唯一请求出口）。
 * 其它任何地方（包括 utils/、components/）不得再 axios.create() 或直接用 fetch。
 *
 * 约定（与后端逐字一致，禁止照抄管理端）：
 *   - 鉴权请求头名是 authentication，值是 token 字符串（无 Bearer 前缀）
 *   - api 层写完整 /user/... 路径；baseURL 默认空串（同源）
 *   - 成功判定 code === 1（失败 0，不存在 code:200）
 *   - 成功时把业务载荷（data 字段内容）resolve 出去
 */
import axios from 'axios'

import {
  AUTH_HEADER,
  DEFAULT_FAIL_MSG,
  DEFAULT_NETWORK_MSG,
  FAIL_DEDUPE_WINDOW,
  LOGIN_EXPIRED_DEDUPE_WINDOW,
  LOGIN_EXPIRED_MSG,
  REQUEST_TIMEOUT,
  SILENT_FLAG,
  SUCCESS_CODE
} from '@/constants/request'
import { notifyError, shouldSilence } from '@/utils/notify'
import { clearAuth, getToken } from '@/utils/storage'
import { triggerAuthRequired } from '@/utils/auth-bridge'

const service = axios.create({
  // 默认空串 = 同源：请求直接打到 /user/...，由 dev/preview 代理或生产反代转发
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: REQUEST_TIMEOUT
})

/** 取请求方法（大写，缺省为 GET） */
function resolveMethod(config) {
  return String((config && config.method) || 'get').toUpperCase()
}

/** 取用于静默清单匹配的路径（去掉查询串） */
function resolvePath(config) {
  const url = String((config && config.url) || '')
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

/** 当前路由路径（hash 模式，用于 401 后回跳） */
function currentRoutePath() {
  const hash = window.location.hash || ''
  const path = hash.charAt(0) === '#' ? hash.slice(1) : hash
  return path || '/'
}

/**
 * 该次请求是否要求按次静默（失败不弹全局提示）。
 * 由调用方在 request({ ..., [SILENT_FLAG]: true }) 里传入；默认 false（照旧弹）。
 * @param {object} config axios 请求配置
 * @returns {boolean}
 */
function isCallSilent(config) {
  return Boolean(config && config[SILENT_FLAG])
}

// 请求拦截：只给带 token 的请求注入 authentication 头
service.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers[AUTH_HEADER] = token
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截：统一成功判定、失败提示、401 闭环
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 成功：只把业务载荷 resolve 出去，页面里不再写 res.code === 1
    if (res && res.code === SUCCESS_CODE) {
      return res.data
    }

    // 业务失败：HTTP 200 且 code !== 1
    const method = resolveMethod(response.config)
    const path = resolvePath(response.config)
    const msg = (res && res.msg) || DEFAULT_FAIL_MSG

    if (!shouldSilence(method, path) && !isCallSilent(response.config)) {
      notifyError(msg, {
        key: `${method} ${path} ${msg}`,
        dedupeWindow: FAIL_DEDUPE_WINDOW
      })
    }

    return Promise.reject({
      code: res ? res.code : 0,
      msg,
      raw: res,
      config: response.config
    })
  },
  (error) => {
    const config = error.config || {}
    const response = error.response
    const method = resolveMethod(config)
    const path = resolvePath(config)

    // 401 闭环：清 token + 弹一次 + 跳登录页（刻意不接入全局失败提示，避免双弹）
    if (response && response.status === 401) {
      clearAuth()
      notifyError(LOGIN_EXPIRED_MSG, {
        key: 'auth-expired',
        dedupeWindow: LOGIN_EXPIRED_DEDUPE_WINDOW
      })
      triggerAuthRequired({ redirect: currentRoutePath() })
      return Promise.reject({ code: 0, msg: LOGIN_EXPIRED_MSG, status: 401 })
    }

    let msg
    if (response) {
      // HTTP 4xx/5xx（非 401）：Web 特有的一档，优先用后端 msg，否则兜底文案
      msg = (response.data && response.data.msg) || DEFAULT_FAIL_MSG
    } else {
      // 网络异常 / 超时 / 请求被中断
      msg = DEFAULT_NETWORK_MSG
    }

    if (!shouldSilence(method, path) && !isCallSilent(config)) {
      notifyError(msg, {
        key: `${method} ${path} ${msg}`,
        dedupeWindow: FAIL_DEDUPE_WINDOW
      })
    }

    return Promise.reject({
      code: response && response.data ? response.data.code : 0,
      msg,
      status: response ? response.status : 0
    })
  }
)

export default service
