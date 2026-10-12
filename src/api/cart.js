/**
 * 购物车端点（购物车的真相源是后端，本地只做缓存）。
 */
import request from '@/utils/request'

/**
 * 查看购物车全部内容。
 *
 * 入参字段：无。
 * 出参字段（后端 Result<ShoppingCartListVO>）：
 *   - { items: Array<item>, totalAmount: number(元) }
 *   - item：{ id:number(购物车行 id，减一/删除用),
 *             dishId:number|null, setmealId:number|null, name:string,
 *             number:number(份数), image:string, amount:number(单价，单位元),
 *             dishFlavor:string|null(规格，逗号串) }
 *   - 关键提醒：amount 是「单价」而非小计；合计只算 Σ(number × amount)，不含配送费/打包费。
 * 是否需要 token：是。
 * 字段以接口文档为准（ShoppingCartListVO、ShoppingCartItemVO）。
 * 备注：已在请求层静默清单（GET /user/shopping-carts），失败不弹全局提示。
 * 实测：GET /user/shopping-carts →
 *       {"code":1,"msg":null,"data":{"items":[{"id":90,"dishId":77,"setmealId":null,"name":"鱼香肉丝02",
 *        "number":1,"image":"https://...","amount":8.00,"dishFlavor":null}],"totalAmount":8.00}}；
 *       空车时为 {"items":[],"totalAmount":0}（不是数组，取值务必用 res.items）。
 *
 * @returns {Promise<{items:Array<object>, totalAmount:number}>}
 */
export function getCart() {
  return request({
    url: '/user/shopping-carts',
    method: 'get'
  })
}

/**
 * 加菜 / 加套餐（每调用一次 +1 份）。
 *
 * 入参字段（后端 ShoppingCartDTO，三项皆可空，但 dishId 与 setmealId 二选一）：
 *   - dishId: number，可选。菜品 id。
 *   - setmealId: number，可选。套餐 id。
 *   - dishFlavor: string，可选。有规格菜品才传，多个规格值用英文逗号连接（如 "无糖,微辣"）；
 *                 无规格时传 null / 不传。
 * 出参字段：无（后端返回 Void，request 层 resolve 出 null）。
 * 是否需要 token：是。
 * 字段以接口文档为准（ShoppingCartDTO）。
 * 备注：后端按「同菜品同规格」合并行、每次数量 +1；不做乐观更新，调用方应重新 getCart() 回灌。
 * 实测：POST /user/shopping-carts {"dishId":77} → {"code":1,"msg":null,"data":null}，随后 GET 可见新行。
 *
 * @param {{dishId?:number, setmealId?:number, dishFlavor?:string|null}} payload
 * @returns {Promise<null>}
 */
export function addToCart(payload) {
  const data = {}
  if (payload && payload.dishId !== undefined && payload.dishId !== null) data.dishId = payload.dishId
  if (payload && payload.setmealId !== undefined && payload.setmealId !== null) {
    data.setmealId = payload.setmealId
  }
  if (payload && payload.dishFlavor !== undefined && payload.dishFlavor !== null) {
    data.dishFlavor = payload.dishFlavor
  }
  return request({
    url: '/user/shopping-carts',
    method: 'post',
    data
  })
}

/**
 * 购物车某行数量减一。
 *
 * 入参字段：
 *   - id: number，必填（后端 @Positive）。购物车行的 id（不是 dishId/setmealId），拼进路径。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准。
 * 易错点：HTTP 方法是 PUT（不是 POST），且不带请求体。
 *
 * @param {number} id 购物车行 id
 * @returns {Promise<null>}
 */
export function decrementCartItem(id) {
  return request({
    url: `/user/shopping-carts/${id}/decrement`,
    method: 'put'
  })
}

/**
 * 清空购物车。
 *
 * 入参字段：无。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段以接口文档为准。
 * 备注：DELETE /user/shopping-carts；「再来一单」编排在复制前会先调它（见 api/reorder.js）。
 *
 * @returns {Promise<null>}
 */
export function clearCart() {
  return request({
    url: '/user/shopping-carts',
    method: 'delete'
  })
}
