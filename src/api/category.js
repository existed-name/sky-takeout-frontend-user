/**
 * 商品分类端点。
 */
import request from '@/utils/request'

/**
 * 查询所有启用的商品分类。
 *
 * 入参字段：
 *   - type: number，可选。1 = 菜品分类，2 = 套餐分类；不传（undefined）= 查全部。
 *          首页一次拉全部（菜品与套餐分类混在同一份列表里）。
 * 出参字段（后端 Result<List<UserCategoryListItemVO>>）：
 *   - 数组，每项：{ id:number, type:number(1 菜品/2 套餐), name:string }
 * 是否需要 token：是。
 * 字段以接口文档为准（UserCategoryListItemVO）。
 * 实测：GET /user/categories → {"code":1,"msg":null,"data":[{"id":26,"type":1,"name":"超级答辩"}, ...]}
 *
 * @param {number} [type] 分类类型，1 菜品 / 2 套餐；不传表示全部
 * @returns {Promise<Array<{id:number, type:number, name:string}>>}
 */
export function getCategories(type) {
  return request({
    url: '/user/categories',
    method: 'get',
    params: type === undefined || type === null ? {} : { type }
  })
}
