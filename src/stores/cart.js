/**
 * 购物车（服务端为真相源，本地只做缓存）。
 *
 * 关键原则（与小程序端一致）：
 *   - 真相源是后端：所有加减都是「发请求 → 重新 GET 回灌」，**不做乐观更新**；
 *     这样不会出现前后端数量不一致（代价是每次点击多一次往返）。
 *   - 清空点：payment/success 成功后由支付页显式调用 takeOutAfterPaySuccess()（后端此时已清空），
 *     不要依赖「首页会自己刷新」。
 *   - 金额一律走 utils/money.js（以「分」为单位的整数运算），禁止浮点累加。
 *   - 请求失败时动作会 reject（非静默端点由请求层弹提示）；调用方自行 try/catch 复位 UI。
 *     其中 GET /user/shopping-carts 在静默清单内（失败不弹提示），由页面渲染空态/占位。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { addToCart, clearCart, decrementCartItem, getCart } from '@/api/cart'
import { addFen, fenToYuan, multiplyYuan } from '@/utils/money'

export const useCartStore = defineStore('cart', () => {
  /** 购物车行数组：{ id, dishId, setmealId, name, number, image, amount(单价), dishFlavor } */
  const items = ref([])
  /** 后端返回的商品合计（元，Σ 份数×单价；不含配送费/打包费） */
  const totalAmount = ref(0)
  /** 回灌进行中 */
  const loading = ref(false)

  /** 件数（总份数） */
  const count = computed(() =>
    items.value.reduce((acc, item) => acc + (Number(item.number) || 0), 0)
  )

  /**
   * 商品小计（单位：分）——权威值，供 CartBar 的 :fen 或结算页金额运算使用。
   * Σ(份数 × 单价)，不含配送费与打包费；全程整数累加，无浮点误差。
   */
  const goodsSubtotalFen = computed(() =>
    addFen(...items.value.map((item) => multiplyYuan(item.amount, item.number)))
  )

  /** 商品小计（单位：元，Number）——由 goodsSubtotalFen 精确换算，便于直接展示 */
  const goodsSubtotal = computed(() => fenToYuan(goodsSubtotalFen.value))

  /**
   * 从后端回灌购物车（真相源）。
   * 失败会 reject（该端点静默、无全局提示，调用方决定空态/占位）。
   * @returns {Promise<void>}
   */
  async function refresh() {
    loading.value = true
    try {
      const data = await getCart()
      items.value = (data && data.items) || []
      totalAmount.value = Number((data && data.totalAmount) || 0)
    } finally {
      loading.value = false
    }
  }

  /**
   * 加菜 / 加套餐（每调用一次 +1 份），成功后回灌。
   * 回灌（GET，静默端点）失败时抛出的错误带 stage:'refresh' 标记，交由调用方补一次轻提示。
   * @param {{dishId?:number, setmealId?:number, dishFlavor?:string|null}} payload
   */
  async function add(payload) {
    await addToCart(payload)
    try {
      await refresh()
    } catch (e) {
      // 回灌失败：GET 在静默清单内，不会自动弹；打标记交给调用方补一次轻提示
      throw { ...e, stage: 'refresh' }
    }
  }

  /**
   * 某行数量减一（PUT，无 body），成功后回灌。
   * 回灌失败时同样带 stage:'refresh' 标记。
   * @param {number} id 购物车行 id
   */
  async function decrement(id) {
    await decrementCartItem(id)
    try {
      await refresh()
    } catch (e) {
      // 回灌失败：GET 在静默清单内，不会自动弹；打标记交给调用方补一次轻提示
      throw { ...e, stage: 'refresh' }
    }
  }

  /**
   * 清空购物车（DELETE），成功后清本地缓存。
   */
  async function clear() {
    await clearCart()
    items.value = []
    totalAmount.value = 0
  }

  /**
   * 支付成功（payment/success 已推进并清空后端购物车）后，清本地缓存。
   * 命名为「送走」语义，提醒调用方：这不是普通的清空，而是「后端已清、本地同步」。
   */
  function takeOutAfterPaySuccess() {
    items.value = []
    totalAmount.value = 0
  }

  return {
    items,
    totalAmount,
    loading,
    count,
    goodsSubtotalFen,
    goodsSubtotal,
    refresh,
    add,
    decrement,
    clear,
    takeOutAfterPaySuccess
  }
})
