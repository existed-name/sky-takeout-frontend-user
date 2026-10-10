/**
 * 菜品端点。
 */
import request from '@/utils/request'

/**
 * 按分类 id 查询起售菜品（含口味）。
 *
 * 入参字段：
 *   - categoryId: number，必填（后端 @Positive，传正整数）。菜品分类的 id。
 * 出参字段（后端 Result<List<UserDishListItemVO>>）：
 *   - 数组，每项：
 *     { id:number, name:string, categoryId:number, price:number(元),
 *       image:string(后端返回的绝对 URL，直接用，禁止再拼 /common/download),
 *       description:string,
 *       flavors:Array<{ id:number, dishId:number, name:string, value:string }> }
 *   - 注意 flavors[].value 是「JSON 数组字符串」而非数组本身，例如：
 *     value = '["无糖","少糖","半糖","多糖","全糖"]'；页面需 JSON.parse 后使用。
 *   - 无规格的菜品 flavors 为空数组或 null。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.3 与 §4（UserDishListItemVO、DishFlavor）。
 * 实测：GET /user/dishes?categoryId=26 → data[0] 字段名与上完全一致；
 *       flavors[0].value 实测为 '["无糖","少糖","半糖","多糖","全糖"]'（确认为 JSON 字符串）。
 *
 * @param {number} categoryId 菜品分类 id（必填）
 * @returns {Promise<Array<object>>}
 */
export function getDishesByCategory(categoryId) {
  return request({
    url: '/user/dishes',
    method: 'get',
    params: { categoryId }
  })
}
