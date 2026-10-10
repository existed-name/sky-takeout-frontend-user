/**
 * localStorage 读写封装（token / 用户信息 / 登录名 / 其它草稿）。
 * 选 localStorage 而非 Cookie：避免作用域/端口/同源策略干扰；代价是 XSS 面，
 * 本仓库禁止 v-html、不渲染任何外部 HTML。
 */

/** 存储键名（token / 用户信息与小程序 storage 键名保持一致，便于两端对照） */
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER_INFO: 'baseUserInfo',
  /** 上次登录使用的用户名（登录页预填，避免忘记用户名后回不到自己的账号） */
  LAST_LOGIN_NAME: 'lastLoginName'
}

/**
 * 读取并反序列化（JSON 解析失败时返回 fallback）。
 * @param {string} key
 * @param {*} [fallback]
 */
export function getItem(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

/**
 * 序列化并写入。
 * @param {string} key
 * @param {*} value
 */
export function setItem(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    return false
  }
}

/**
 * 删除某个键。
 * @param {string} key
 */
export function removeItem(key) {
  try {
    window.localStorage.removeItem(key)
    return true
  } catch (e) {
    return false
  }
}

/** 读取 token（直接返回字符串，不是 JSON 包装） */
export function getToken() {
  const raw = getItem(STORAGE_KEYS.TOKEN, '')
  return typeof raw === 'string' ? raw : ''
}

/** 写入 token */
export function setToken(token) {
  return setItem(STORAGE_KEYS.TOKEN, token)
}

/** 删除 token */
export function removeToken() {
  return removeItem(STORAGE_KEYS.TOKEN)
}

/** 读取用户信息（{ id, openid, name } 或 null） */
export function getUserInfo() {
  return getItem(STORAGE_KEYS.USER_INFO, null)
}

/** 写入用户信息 */
export function setUserInfo(info) {
  return setItem(STORAGE_KEYS.USER_INFO, info)
}

/** 删除用户信息 */
export function removeUserInfo() {
  return removeItem(STORAGE_KEYS.USER_INFO)
}

/** 读取上次登录使用的用户名 */
export function getLastLoginName() {
  const raw = getItem(STORAGE_KEYS.LAST_LOGIN_NAME, '')
  return typeof raw === 'string' ? raw : ''
}

/** 记录本次登录使用的用户名 */
export function setLastLoginName(name) {
  return setItem(STORAGE_KEYS.LAST_LOGIN_NAME, name)
}

/** 清空鉴权相关信息（token + 用户信息）；401 闭环时调用 */
export function clearAuth() {
  removeToken()
  removeUserInfo()
}
