/**
 * 业务常量（集中一处，页面只引用常量、不写魔法值）。
 *
 * 说明：配送费、打包费、门店电话、店铺静态文案在小程序端都是硬编码（后端没有对应接口，
 * 只有 /user/shop/status 一个营业状态接口），Web 端统一收敛到本文件；若用户调整业务口径，
 * 只改这一处即可。
 */

/** 配送费（单位：元）。首页购物车合计不含它，结算页合计才加。 */
export const DELIVERY_FEE_YUAN = 6

/**
 * 打包费（单位：元 / 每份）。
 * 结算页打包费 = 商品总份数 × 该值；下单时 packAmount 传「总份数」、amount 里含这份费用。
 * 注意：该口径是小程序沿用值，后端对 packAmount/amount 只存不校验（见方案 §13.3 第 14 条）。
 */
export const PACK_FEE_PER_ITEM_YUAN = 1

/** 门店电话（联系商家用）。小程序结算页曾用占位值 114，Web 端统一用此门店电话。 */
export const SHOP_PHONE = '400-618-4000'

/** 店铺静态信息（首页展示；后端无对应接口，均为本地文案）。 */
export const SHOP_INFO = {
  /** 店铺名 */
  name: '苍穹外卖',
  /** 店铺描述 */
  description: '苍穹餐厅为顾客打造专业的大众化美食外送餐饮',
  /** 店铺地址 */
  address: '北京市朝阳区新街大道一号楼8层',
  /** 距离文案（小程序硬编码，纯装饰） */
  distance: '1.5km',
  /** 配送费文案（首页费用说明行） */
  deliveryFeeText: '配送费6元',
  /** 预计时长文案（小程序硬编码，纯装饰） */
  estimatedDuration: '12min',
  /** 月销量文案（小程序硬编码「月销量0」，纯装饰，不接后端） */
  monthlySalesText: '月销量0'
}

/** 首页底部结算条的费用说明前缀（与 SHOP_INFO 里的数值配合使用） */
export const CART_FEE_HINT_PREFIX = '另需配送费'
