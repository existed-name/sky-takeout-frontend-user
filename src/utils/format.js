/**
 * 展示格式化：日期、订单状态文案、手机号分段、备注加权计数。
 * 纯函数，无副作用、不访问网络。
 */
import { resolveOrderStatusText } from '@/constants/orderStatus'

/** 数字补零到两位 */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 把后端时间值安全解析为毫秒时间戳。
 * 后端通常返回 "yyyy-MM-dd HH:mm:ss"；部分浏览器（Safari）无法直接解析该格式，
 * 因此统一把首个空格替换为 'T' 再解析。
 * @param {string|number|Date} value
 * @returns {number} 毫秒时间戳；无法解析时返回 NaN
 */
export function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const normalized = String(value).trim().replace(' ', 'T')
  return new Date(normalized).getTime()
}

/**
 * 日期格式化。
 * @param {string|number|Date} value
 * @param {string} [pattern='yyyy-MM-dd HH:mm:ss']
 */
export function formatDateTime(value, pattern = 'yyyy-MM-dd HH:mm:ss') {
  const date = value instanceof Date ? value : new Date(toTimestamp(value))
  if (Number.isNaN(date.getTime())) return ''

  const map = {
    yyyy: String(date.getFullYear()),
    MM: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    HH: pad2(date.getHours()),
    mm: pad2(date.getMinutes()),
    ss: pad2(date.getSeconds())
  }

  return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, (token) => map[token])
}

/**
 * 订单状态文案（含「待付款超时判定」）。
 * 单一真相源在 src/constants/orderStatus.js（常量归 constants）；此处仅转发，
 * 保留本模块历史上的导出名 orderStatusText，避免调用点漂移。
 * 口径：1 待付款（剩余时间 ≤0 → 已取消）/ 2 待接单 / 3 待派送 / 4 派送中 /
 *       5 已完成 / 6 已取消 / 7 已退款；未知状态回落「未知状态」。
 * @param {number|string} status
 * @param {number|null} [remainMs] 倒计时剩余毫秒
 */
export function orderStatusText(status, remainMs) {
  return resolveOrderStatusText(status, remainMs)
}

/**
 * 手机号分段显示（11 位 → "138 1234 5678"；其它格式原样返回）。
 * @param {string|number} phone
 */
export function formatPhone(phone) {
  const raw = String(phone || '')
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 11) return raw
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
}

/** 备注加权计数的上限（加权值，非字符数） */
export const REMARK_MAX_WEIGHT = 50

/**
 * 备注加权计数：中文 / 中文标点 / 全角字符按 1，英文 / 数字 / 半角符号按 0.5。
 * @param {string} text
 * @returns {number} 加权值（可能为 x.5）
 */
export function countRemarkWeight(text) {
  const chars = Array.from(String(text || ''))
  let weight = 0
  for (const ch of chars) {
    const code = ch.codePointAt(0)
    // 0xFF 以上视为全角/中文（含中文标点、假名、emoji）
    weight += code > 0xff ? 1 : 0.5
  }
  return weight
}

/** 备注是否超出加权上限 */
export function isRemarkOverWeight(text) {
  return countRemarkWeight(text) > REMARK_MAX_WEIGHT
}
