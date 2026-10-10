/**
 * 全局失败提示（等价于小程序的 uni.showModal）。
 * 职责：归一空白 → 截断 40 字 → 兜底文案 → 去重 → 弹出。
 * 只有请求层（utils/request.js）应调用本模块；页面不再各自弹提示，只负责状态复位。
 */
import { showDialog, showToast } from 'vant'
import {
  DEFAULT_FAIL_MSG,
  FAIL_DEDUPE_WINDOW,
  MAX_MSG_LENGTH,
  NOTIFY_ENABLED,
  SILENT_LIST
} from '@/constants/request'

/** 去重记录：key → 上次弹出时间戳 */
const lastShownAt = new Map()

/** 归一空白字符（换行/连续空格压成单个空格，去首尾空白） */
function normalize(text) {
  if (text === null || text === undefined) return ''
  return String(text).replace(/\s+/g, ' ').trim()
}

/** 按字符（码点）截断，超长追加省略号 */
function truncate(text, max) {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, max).join('') + '…'
}

/**
 * 判断某请求是否在静默清单内。
 * @param {string} method HTTP 方法（任意大小写）
 * @param {string} url    绝对路径，如 /user/shopping-carts
 * @returns {boolean}
 */
export function shouldSilence(method, url) {
  if (!method || !url) return false
  return SILENT_LIST.includes(`${String(method).toUpperCase()} ${url}`)
}

/**
 * 弹一次失败提示（阻断式单按钮弹窗）。
 * @param {string} message 后端 msg 或兜底文案
 * @param {object} [options]
 * @param {string} [options.key] 去重键；不传则不去重
 * @param {number} [options.dedupeWindow] 去重窗口（毫秒），默认 2000
 * @param {string} [options.title] 弹窗标题，默认「提示」
 * @param {string} [options.fallback] 无文案时的兜底文案
 */
export function notifyError(message, options = {}) {
  if (!NOTIFY_ENABLED) return

  const { key, dedupeWindow = FAIL_DEDUPE_WINDOW, title = '提示', fallback = DEFAULT_FAIL_MSG } =
    options

  const text = truncate(normalize(message) || fallback, MAX_MSG_LENGTH)

  if (key) {
    const now = Date.now()
    const last = lastShownAt.get(key)
    if (last !== undefined && now - last < dedupeWindow) return
    lastShownAt.set(key, now)
  }

  showDialog({
    title,
    message: text,
    confirmButtonText: '我知道了',
    showCancelButton: false
  })
}

/**
 * 轻提示（用于非阻断的即时反馈；页面级成功提示可自行调用）。
 * @param {string} message
 */
export function notifyToast(message) {
  if (!NOTIFY_ENABLED) return
  const text = truncate(normalize(message), MAX_MSG_LENGTH)
  if (!text) return
  showToast(text)
}

/** 清空去重记录（测试或需要强制重弹时使用） */
export function resetNotifyDedupe() {
  lastShownAt.clear()
}
