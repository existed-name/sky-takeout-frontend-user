// 请求层专用常量（纯常量，禁止在这里发请求）

/** 成功业务码（后端：成功 1 / 失败 0；不存在 code:200） */
export const SUCCESS_CODE = 1

/** 鉴权请求头名（值直接是 token 字符串，无 Bearer 前缀） */
export const AUTH_HEADER = 'authentication'

/** 请求超时（与小程序一致，10000ms） */
export const REQUEST_TIMEOUT = 10000

/** 全局失败提示总开关（排查问题时置为 false 可静音全部提示） */
export const NOTIFY_ENABLED = true

/** 业务失败兜底文案 */
export const DEFAULT_FAIL_MSG = '请求失败，请稍后重试'

/** 网络/超时兜底文案 */
export const DEFAULT_NETWORK_MSG = '网络异常，请检查网络后重试'

/** 401 提示文案 */
export const LOGIN_EXPIRED_MSG = '登录已失效，请重新登录'

/** 失败提示去重窗口（毫秒）：同一 url + method + msg 在此窗口内只弹一次 */
export const FAIL_DEDUPE_WINDOW = 2000

/** 401 提示去重窗口（毫秒）：登录失效提示 3 秒内不重复弹 */
export const LOGIN_EXPIRED_DEDUPE_WINDOW = 3000

/**
 * 静默清单：这些端点失败时不弹全局提示（由页面自行渲染空态/占位）。
 * 与小程序端的 FAIL_TOAST_SILENT_REQUESTS 逐字一致，只有以下两条。
 * 必须精确匹配「METHOD + 空格 + 绝对路径」——例如 /user/shopping-carts 同时有
 * GET / POST / DELETE 三个方法，只有 GET 静默。
 */
export const SILENT_LIST = [
  'GET /user/shopping-carts',
  'GET /user/shop/status'
]

/**
 * 单次静默开关的配置键名。
 *
 * 与上面的 SILENT_LIST 互补：SILENT_LIST 是「端点级」白名单（按方法+路径精确匹配，
 * 对所有调用方生效）；本键是「按次」开关——调用方在 request({ ... }) 里传
 * { [SILENT_FLAG]: true }，仅让这一次请求失败时不弹全局提示，默认（不传）照旧弹。
 * 用于「再来一单」恢复阶段的逐项加购：由编排层自行汇总成一次提示。
 * 注意：不改动 SILENT_LIST 的匹配语义（仍为精确匹配「方法 + 绝对路径」）。
 */
export const SILENT_FLAG = 'silent'
