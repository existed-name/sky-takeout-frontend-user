/**
 * 订单状态枚举与文案映射（全仓唯一来源，供 OrderStatusText 与页面 Tab 使用）。
 *
 * 取值语义逐条对照小程序 statusWord 语义核对（勿凭记忆改动）：
 *   1 待付款（已超时则展示为「已取消」——由 resolveOrderStatusText 判定）
 *   2 待接单
 *   3 待派送
 *   4 派送中
 *   5 已完成
 *   6 已取消
 *   7 已退款
 *
 * 纯常量 + 纯函数，禁止在此发请求。
 */

/** 订单状态枚举（与后端取值一一对应） */
export const ORDER_STATUS = Object.freeze({
  UNPAID: 1, // 待付款
  PENDING_ACCEPT: 2, // 待接单
  ACCEPTED: 3, // 待派送
  DELIVERING: 4, // 派送中
  COMPLETED: 5, // 已完成
  CANCELED: 6, // 已取消
  REFUNDED: 7 // 已退款
})

/**
 * 状态 → 文案映射。
 * 注意：status=1 的「待付款 / 已取消」需要剩余时间参与判定，见 resolveOrderStatusText；
 * 本表给出的是「未超时」时的基准文案。
 */
export const ORDER_STATUS_TEXT = Object.freeze({
  [ORDER_STATUS.UNPAID]: '待付款',
  [ORDER_STATUS.PENDING_ACCEPT]: '待接单',
  [ORDER_STATUS.ACCEPTED]: '待派送',
  [ORDER_STATUS.DELIVERING]: '派送中',
  [ORDER_STATUS.COMPLETED]: '已完成',
  [ORDER_STATUS.CANCELED]: '已取消',
  [ORDER_STATUS.REFUNDED]: '已退款'
})

/** 未知状态的兜底文案 */
export const ORDER_STATUS_UNKNOWN_TEXT = '未知状态'

/**
 * 解析订单状态文案（含「待付款超时显示为已取消」的判定）。
 *
 * 判定规则（照抄小程序 statusWord 语义）：
 *   - status=1 且 remainMs > 0 → 「待付款」
 *   - status=1 且 remainMs ≤ 0 → 「已取消」
 *   - status=1 且未传 remainMs → 按「待付款」处理（避免误显示为已取消）
 *   - 其余按 ORDER_STATUS_TEXT 映射，未知状态回落 ORDER_STATUS_UNKNOWN_TEXT
 *
 * 本函数是订单状态文案的**唯一实现**（常量归 constants）；src/utils/format.js 的
 * orderStatusText 仅转发到此，避免出现第二份文案映射。
 *
 * @param {number|string} status 订单状态（1–7）
 * @param {number|null} [remainMs] 待付款倒计时剩余毫秒
 * @returns {string}
 */
export function resolveOrderStatusText(status, remainMs) {
  const s = Number(status)

  if (s === ORDER_STATUS.UNPAID) {
    // 未传倒计时时按「仍待付款」处理，避免误显示为「已取消」
    const remain = remainMs === null || remainMs === undefined ? 1 : Number(remainMs)
    return remain > 0
      ? ORDER_STATUS_TEXT[ORDER_STATUS.UNPAID]
      : ORDER_STATUS_TEXT[ORDER_STATUS.CANCELED]
  }

  return ORDER_STATUS_TEXT[s] || ORDER_STATUS_UNKNOWN_TEXT
}

/** 设置菜单/订单结算页可取的电话常量不在此文件（属 business 常量，由父组件传入）。 */

/**
 * 历史订单列表的 Tab 定义。
 * status 为 undefined 表示「全部」（不传该参数，避免出现空的 status= 查询串）。
 */
export const ORDER_LIST_TABS = Object.freeze([
  { name: 'all', title: '全部', status: undefined },
  { name: 'unpaid', title: '待付款', status: ORDER_STATUS.UNPAID },
  { name: 'canceled', title: '已取消', status: ORDER_STATUS.CANCELED }
])
