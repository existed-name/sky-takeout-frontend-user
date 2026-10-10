/**
 * 跳转登录页的回调桥。
 *
 * 为什么需要它：request.js 需要「跳转到登录页」，而 router 会 import 视图、视图会
 * import api、api 会 import request.js —— 直接 import router 会形成循环依赖。
 * 因此这里只暴露「注册 / 触发」两个动作：
 *   - 注册方：main.js（地基第三步接入 router 后注册真正的跳转实现）
 *   - 触发方：utils/request.js（401 闭环）
 */

let handler = null

/**
 * 注册登录跳转处理器（由 main.js 调用）。
 * @param {(payload: { redirect?: string }) => void} fn
 */
export function registerAuthHandler(fn) {
  handler = typeof fn === 'function' ? fn : null
}

/**
 * 触发「需要登录」跳转。
 * @param {{ redirect?: string }} [payload] redirect 为当前路径（供登录后回跳）
 */
export function triggerAuthRequired(payload = {}) {
  if (handler) {
    handler(payload)
    return
  }
  // 尚未注册（例如地基第二步阶段）：不抛错，只给出可排查的提示。
  console.warn('[auth-bridge] 尚未注册登录跳转处理器，已忽略本次跳转请求', payload)
}
