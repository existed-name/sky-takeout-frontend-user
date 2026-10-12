/**
 * 登录相关端点（登录方式的可插拔点：登录路径只出现在本文件的常量里）。
 *
 * 设计约定：
 *   - 本文件是全仓唯一写登录路径的地方；若后端日后调整登录端点，只改 WEB_LOGIN_ENDPOINT 一处。
 *   - api 函数只负责「拼路径、传参、把载荷返回」：token 注入、code 判定、失败提示都由
 *     utils/request.js 与 utils/notify.js 统一完成，此处不再处理。
 */
import request from '@/utils/request'

/**
 * Web 登录端点（唯一登录路径常量）。
 * 端点：POST /user/users/login/web，body 为 WebEndUserLoginDTO{name}。
 * 注意：该路径已在后端 JWT 拦截器排除白名单内（免 token）。
 */
export const WEB_LOGIN_ENDPOINT = '/user/users/login/web'

/**
 * 体验登录（用昵称换取 token，绕开微信授权）。
 *
 * 入参字段：
 *   - name: string，必填。用户名，用于后端拼接模拟 openid（后端拼成 tourist_{name}）。
 *          同一个 name 永远映射到同一个用户（购物车/订单/地址簿按该身份隔离）。
 * 出参字段（后端 Result<UserLoginVO>，request 层已剥掉 code/msg，这里拿到的就是 data）：
 *   - id: number，用户主键 id
 *   - openid: string，形如 tourist_{name}
 *   - token: string，JWT；由调用方（auth store）原样存下，请求层会自动放进 authentication 头
 * 是否需要 token：否（免鉴权）。
 * 字段以接口文档为准；对应后端 WebEndUserLoginDTO.java 与 UserLoginVO.java。
 *
 * 后端真实行为不在此处理：失败时 request 层会 reject 并弹一次提示，调用方只需 try/catch 复位 UI。
 *
 * @param {string} name 用户名（1–20 字符由登录页校验，后端未给出长度上限）
 * @returns {Promise<{id:number, openid:string, token:string}>}
 */
export function loginWeb(name) {
  return request({
    url: WEB_LOGIN_ENDPOINT,
    method: 'post',
    data: { name }
  })
}
