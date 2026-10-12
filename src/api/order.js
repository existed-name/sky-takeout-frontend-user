/**
 * 订单端点。
 *
 * 注意：新增「再来一单」请走 api/reorder.js 的编排函数，不要直接调用本文件的 reorderOrder
 * （后端只做「校验 + 插入」，不清购物车、失败不回滚，前端必须做购物车保护）。
 */
import request from '@/utils/request'

/**
 * 提交订单。
 *
 * 入参字段（后端 OrdersSubmitDTO）：
 *   - addressBookId: number        必填（@Positive）。收货地址 id。
 *   - payMethod: number            必填。1 = 微信，2 = 支付宝（Web 端固定传 1）。
 *   - remark: string               可选。备注。
 *   - estimatedDeliveryTime: string 可选，格式 "yyyy-MM-dd HH:mm:ss"（含秒）。
 *                                  deliveryStatus=1（立即送出）时后端不依赖它。
 *   - deliveryStatus: number       必填。1 = 立即送出，0 = 选时间。
 *   - tablewareNumber: number      可选（@NotNull）。餐具份数。
 *   - tablewareStatus: number      必填。1 = 依据餐量提供，0 = 无需餐具。
 *   - packAmount: number           必填。打包费口径 = 商品总份数（前端计算，后端原样入库）。
 *   - amount: number               必填。订单金额（元）= Σ(份数×单价) + 配送费 + 总份数；
 *                                   由前端用 utils/money.js 以「分」整数算好后转元传入，后端不重算。
 * 出参字段（后端 Result<OrderSubmitVO>）：
 *   - { id:number(订单 id), orderNumber:string, orderAmount:number, orderTime:string }
 * 是否需要 token：是。
 * 字段以接口文档为准（OrdersSubmitDTO、OrderSubmitVO）。
 * 实测：因后端有「配送距离 5000 米」业务校验（测试地址太远被拒，返回
 *       {"code":0,"msg":"配送距离限制 5000.000000 米, 您的收货地址太远啦~~~"}），
 *       本端点「成功响应体」未能在本次实测中取得，字段名以源码 OrdersSubmitDTO/OrderSubmitVO 为准（待联调补测）。
 *
 * @param {object} payload 下单字段（见上）
 * @returns {Promise<{id:number, orderNumber:string, orderAmount:number, orderTime:string}>}
 */
export function submitOrder(payload) {
  return request({
    url: '/user/orders',
    method: 'post',
    data: payload
  })
}

/**
 * 创建支付单（后端目前是空桩，返回全 null 的预支付参数）。
 *
 * 入参字段：
 *   - id: number，必填。订单 id，拼进路径。
 * 出参字段（后端 Result<OrderPaymentVO>）：
 *   - { nonceStr:string, paySign:string, timeStamp:string, signType:string, packageStr:string }
 *   - 后端实现直接 new OrderPaymentVO()（全字段 null），因此 Web 端不真正调起微信支付。
 * 是否需要 token：是。
 * 字段以接口文档为准（OrderPaymentVO）。
 * 备注：支付页应「先 payment 再 payment/success」两步走（照抄小程序已验证顺序）。
 *
 * @param {number} id 订单 id
 * @returns {Promise<object>}
 */
export function createPayment(id) {
  return request({
    url: `/user/orders/${id}/payment`,
    method: 'post'
  })
}

/**
 * 支付成功通知（后端在此清空购物车并推进订单状态）。
 *
 * 入参字段：
 *   - id: number，必填。订单 id，拼进路径。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准。
 * 备注：成功后后端会清空该用户购物车，调用方应同步清本地 cart 缓存。
 *
 * @param {number} id 订单 id
 * @returns {Promise<null>}
 */
export function notifyPaymentSuccess(id) {
  return request({
    url: `/user/orders/${id}/payment/success`,
    method: 'post'
  })
}

/**
 * 取消订单。
 *
 * 入参字段：
 *   - id: number，必填。订单 id，拼进路径。
 *   - cancelReason: string，可选（@NotNull 未标，可传空串）。取消原因。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准（OrderCancelDTO{cancelReason}）。
 * 易错点：路径是 /user/orders/{id}/cancellation（orders 复数 + cancellation 双 l）；
 *         HTTP 方法 PUT；请求体必填（后端 @RequestBody），至少传 { cancelReason: '' }。
 *
 * @param {number} id 订单 id
 * @param {string} [cancelReason='']
 * @returns {Promise<null>}
 */
export function cancelOrder(id, cancelReason = '') {
  return request({
    url: `/user/orders/${id}/cancellation`,
    method: 'put',
    data: { cancelReason }
  })
}

/**
 * 再来一单（后端原始端点，仅供 api/reorder.js 编排调用）。
 *
 * 入参字段：
 *   - id: number，必填。源订单 id，拼进路径；不带请求体。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准。
 * 后端语义（务必知道）：只做「校验 + 插入」——把源订单明细复制进购物车，
 *   不清空原购物车、失败不回滚；失败原因含商品停售/下架、明细缺失、网络异常（code:0 + 文案）。
 *   因此三个页面的「再来一单」必须调用 api/reorder.js 的编排函数，本函数不得被页面直接使用。
 *
 * @param {number} id 源订单 id
 * @returns {Promise<null>}
 */
export function reorderOrder(id) {
  return request({
    url: `/user/orders/${id}/repetition`,
    method: 'post'
  })
}

/**
 * 催单。
 *
 * 入参字段：
 *   - id: number，必填。订单 id，拼进路径；不带请求体。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准。
 *
 * @param {number} id 订单 id
 * @returns {Promise<null>}
 */
export function urgeOrder(id) {
  return request({
    url: `/user/orders/${id}/urge-acceptance`,
    method: 'post'
  })
}

/**
 * 分页查询历史订单。
 *
 * 入参字段（query）：
 *   - page: number，必填正（后端 @NotNull + @Positive）。页码。
 *   - pageSize: number，必填正（后端 @NotNull + @Positive）。每页条数。
 *   - status: number，可选。订单状态过滤；「全部」页签请传 undefined（不要传空串 ""，
 *             本函数会自动从 query 里剔除 undefined）。
 * 出参字段（后端 Result<PageResult<UserOrderHistoryItemVO>>）：
 *   - { total:number, records: Array<{ id:number, status:number, orderTime:string,
 *                                       amount:number(实收金额，含配送费/打包费),
 *                                       orderDetailList:Array<OrderDetail> }> }
 *   - OrderDetail：{ id, name, orderId, dishId, setmealId, dishFlavor, number, amount(单价), image }
 * 是否需要 token：是。
 * 字段以接口文档为准（UserOrderPageQueryDTO、PageResult、UserOrderHistoryItemVO、OrderDetail）。
 * 实测：GET /user/orders/history?page=1&pageSize=10 → {"code":1,"msg":null,"data":{"total":0,"records":[]}}；
 *       带 status=1 同样 200（未含订单故 records 为空，明细字段名以源码为准）。
 *
 * @param {{page:number, pageSize:number, status?:number}} query
 * @returns {Promise<{total:number, records:Array<object>}>}
 */
export function getOrderHistory(query = {}) {
  const params = { page: query.page, pageSize: query.pageSize }
  if (query.status !== undefined && query.status !== null) params.status = query.status
  return request({
    url: '/user/orders/history',
    method: 'get',
    params
  })
}

/**
 * 查询订单详情。
 *
 * 入参字段：
 *   - id: number，必填。订单 id，拼进路径。
 * 出参字段（后端 Result<UserOrderInfoVO>）：
 *   - { id:number, number:string(订单号), status:number, addressBookId:number,
 *       orderTime:string, payMethod:number, payStatus:number,
 *       amount:number(实收金额，含配送费/打包费), remark:string,
 *       phone:string, address:string, consignee:string,
 *       estimatedDeliveryTime:string, deliveryStatus:number, deliveryTime:string,
 *       packAmount:number(打包费), tablewareNumber:number, tablewareStatus:number,
 *       orderDetailList:Array<OrderDetail> }
 *   - OrderDetail.amount 是「单价」（不是小计）。
 *   - 倒计时基准取 orderTime（15 分钟），不要用页面加载时间。
 * 是否需要 token：是。
 * 字段以接口文档为准（UserOrderInfoVO、OrderDetail）。
 * 实测：GET /user/orders/1 → {"code":0,"msg":"订单不存在"}（测试用户无该订单，未能取得成功体，字段名以源码为准）。
 *
 * @param {number} id 订单 id
 * @returns {Promise<object>}
 */
export function getOrderDetail(id) {
  return request({
    url: `/user/orders/${id}`,
    method: 'get'
  })
}
