/**
 * 店铺相关端点。
 */
import request from '@/utils/request'

/**
 * 查询店铺营业状态。
 *
 * 入参字段：无。
 * 出参字段（后端 Result<Integer>，request 层已剥离外层）：
 *   - number：营业状态，1 = 营业中，0 = 打烊/休息中。
 *     （注意：这是裸数字，不是对象；首页据它渲染打烊遮罩。）
 * 是否需要 token：否（后端 JWT 白名单放行，与登录端点并列）。
 * 字段来源依据：调查报告 §2.5 用户模块 ShopController（返回 Integer）。
 * 备注：该端点已加入请求层静默清单（失败不弹全局提示，由首页自行渲染占位/空态）。
 * 实测：GET /user/shop/status → {"code":1,"msg":null,"data":1}（真实调用确认）。
 *
 * @returns {Promise<number>}
 */
export function getShopStatus() {
  return request({
    url: '/user/shop/status',
    method: 'get'
  })
}
