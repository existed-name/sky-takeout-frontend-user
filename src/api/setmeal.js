/**
 * 套餐端点。
 */
import request from '@/utils/request'

/**
 * 按分类 id 查询起售套餐。
 *
 * 入参字段：
 *   - categoryId: number，必填（后端 @Positive）。套餐分类的 id。
 * 出参字段（后端 Result<List<UserSetmealListItemVO>>）：
 *   - 数组，每项：
 *     { id:number, categoryId:number, name:string, price:number(元),
 *       description:string, image:string(后端绝对 URL，直接用) }
 * 是否需要 token：是。
 * 字段以接口文档为准（UserSetmealListItemVO）。
 * 实测：GET /user/setmeals?categoryId=13 → data[0] = {id:44,categoryId:13,name:"牛蛙答辩",price:321.00,description:"",image:"https://..."}。
 *
 * @param {number} categoryId 套餐分类 id（必填）
 * @returns {Promise<Array<object>>}
 */
export function getSetmealsByCategory(categoryId) {
  return request({
    url: '/user/setmeals',
    method: 'get',
    params: { categoryId }
  })
}

/**
 * 查询套餐包含的菜品（套餐详情弹层用）。
 *
 * 入参字段：
 *   - id: number，必填（后端 @Positive）。套餐 id，拼进路径。
 * 出参字段（后端 Result<List<UserSetmealDishItemVO>>）：
 *   - 数组，每项：{ name:string, copies:number(份数), description:string, image:string }
 *   - 注意：不含菜品 id，仅用于展示；页面按 name/image/copies 渲染。
 * 是否需要 token：是。
 * 字段以接口文档为准（UserSetmealDishItemVO）。
 * 实测：GET /user/setmeals/44/dishes → data[0] = {name:"金汤酸菜牛蛙",copies:3,description:"...",image:"https://..."}。
 *
 * @param {number} id 套餐 id
 * @returns {Promise<Array<{name:string, copies:number, description:string, image:string}>>}
 */
export function getSetmealDishes(id) {
  return request({
    url: `/user/setmeals/${id}/dishes`,
    method: 'get'
  })
}
