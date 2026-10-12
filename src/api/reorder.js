/**
 * 「再来一单」统一前端编排（订单详情页 / 历史订单页 / 个人中心三处共用，全仓唯一一份实现）。
 *
 * 为什么需要编排（而不是直接调后端 repetition）：
 *   后端 POST /user/orders/{id}/repetition 只做「校验 + 插入」——把源订单明细复制进购物车，
 *   不清空原购物车、失败也不回滚。若原购物车里有东西，直接复制会让两份商品混在一起；
 *   若复制失败，用户原有购物车可能已被我们清掉。因此前端必须做「快照 → 清空 → 复制 →
 *   失败按快照尽力恢复」的保护。
 *
 * 语义（对齐小程序端的 reorderOrderWithCartProtection）：
 *   1. 重入锁：编排进行中再次触发，直接返回「正在处理上一次『再来一单』，请稍候」。
 *   2. 快照 → 清空 → 复制：先 GET 购物车取快照；
 *        · 快照非空 → DELETE 清空 → POST repetition；
 *        · 快照为空 → 跳过清空，直接复制（空车没有可丢的东西）。
 *   3. 失败恢复：复制失败时按快照逐项 POST 加回。
 *        · 加购接口一次只加 1 份，一行为 n 份要「串行」发 n 次（禁止并发，避免同一行数量竞态）；
 *        · 单行部分成功记为「未完整恢复」；
 *        · 连续 2 次失败即中止（避免整网不可用时反复请求），跳过失败项继续后续；
 *        · 恢复加购按次静默（per-call silent）：本次失败不弹全局提示，结果只汇总成
 *          一次提示（见 userTip），本模块自身不弹提示。
 *   4. 快照失败 = fail-closed：完全不碰购物车。
 *   5. 清空失败：购物车未改动，不额外弹提示（请求层已为 DELETE 弹过）。
 *   6. 永远不 reject：结果统一收敛成
 *      { ok, stage, err, restored, restoredCount, failedCount, userTip }。
 *
 * 调用方（页面）职责：拿到结果后，成功则刷新 cart store 并跳首页；失败则用 userTip 展示
 * （若 userTip 为空串表示无需额外提示，请求层已处理），并解除按钮 loading。
 */
import { getCart, clearCart } from '@/api/cart'
import { reorderOrder } from '@/api/order'
import request from '@/utils/request'
import { SILENT_FLAG } from '@/constants/request'

/** 重入锁：同一时刻只允许一次编排进行 */
let inProgress = false

/** 连续失败达到该次数即中止恢复，避免整网不可用时反复请求 */
const MAX_CONSECUTIVE_FAILURES = 2

/**
 * 恢复阶段专用加购：请求体与 api/cart.js 的 addToCart 一致（dishId/setmealId/dishFlavor），
 * 但带「按次静默」选项——本次失败不弹全局提示，由本编排统一汇总成一次提示（见 userTip）。
 * 不复用 addToCart 是因为需要额外传入 per-call 的 silent 选项。
 * @param {{dishId?:number, setmealId?:number, dishFlavor?:string}} payload
 */
function addToCartSilent(payload) {
  return request({
    url: '/user/shopping-carts',
    method: 'post',
    data: payload,
    [SILENT_FLAG]: true
  })
}

/** 提示文案（集中一处，便于核对与调整） */
const TIP = {
  locked: '正在处理上一次『再来一单』，请稍候',
  snapshotFail: '暂时无法读取购物车内容，已取消『再来一单』，购物车未改动，请稍后重试',
  keptAll: '『再来一单』未成功，原购物车已保留',
  partial: (restored, failed) =>
    `『再来一单』未成功，原购物车已恢复 ${restored} 项，${failed} 项未能恢复（相关商品可能已下架），请到购物车核对`,
  abortedSuffix: '（恢复已中断）'
}

/** 组装单次加购请求体：dishId / setmealId 二选一，按快照原样回填 */
function restorePayloadOf(item) {
  const payload = {}
  if (item.dishId !== undefined && item.dishId !== null) payload.dishId = item.dishId
  if (item.setmealId !== undefined && item.setmealId !== null) payload.setmealId = item.setmealId
  if (item.dishFlavor !== undefined && item.dishFlavor !== null) payload.dishFlavor = item.dishFlavor
  return payload
}

/**
 * 按快照「尽力恢复」购物车：逐行、每行串行加 n 次。
 * @param {Array<object>} items 快照 items（ShoppingCartItemVO 数组）
 * @returns {Promise<{restoredCount:number, failedCount:number, aborted:boolean}>}
 *   restoredCount：完整恢复的行数；failedCount：未完整恢复的行数（含部分成功）；aborted：是否因连续失败而中断
 */
async function restoreCart(items) {
  let restoredCount = 0
  let failedCount = 0
  let consecutiveFailures = 0
  let aborted = false

  for (const item of items) {
    if (aborted) {
      // 已中断：剩余行全部记为未恢复，不再发请求
      failedCount += 1
      continue
    }

    const payload = restorePayloadOf(item)
    const copies = Math.max(0, Number(item.number) || 0)
    let rowComplete = true

    for (let i = 0; i < copies; i += 1) {
      try {
        await addToCartSilent(payload)
        consecutiveFailures = 0
      } catch (e) {
        rowComplete = false
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          aborted = true
        }
        // 跳过该行剩余份数，继续后续行（符合「跳过失败项继续后续」）
        break
      }
    }

    if (rowComplete) {
      restoredCount += 1
    } else {
      failedCount += 1
    }
  }

  return { restoredCount, failedCount, aborted }
}

/**
 * 「再来一单」编排入口（页面唯一应调用的函数，永不 reject）。
 *
 * @param {number} orderId 源订单 id
 * @returns {Promise<{ok:boolean, stage:string, err:*, restored:boolean, restoredCount:number, failedCount:number, userTip:string}>}
 *   - ok：整条编排是否成功（购物车已变为「再来一单」的商品）
 *   - stage：'locked' | 'snapshot' | 'clear' | 'reorder' | 'done'（出错定位用）
 *   - err：异常对象（无错为 null）
 *   - restored：原购物车是否完整保留（复制成功时为 true；快照/清空失败时购物车未改动，也为 true）
 *   - restoredCount / failedCount：恢复阶段的完整恢复行数 / 未完整恢复行数
 *   - userTip：需要页面展示的一次性提示；空串表示无需额外提示
 */
export async function reorderWithCartProtection(orderId) {
  // 1. 重入锁
  if (inProgress) {
    return {
      ok: false,
      stage: 'locked',
      err: null,
      restored: true,
      restoredCount: 0,
      failedCount: 0,
      userTip: TIP.locked
    }
  }

  inProgress = true
  try {
    // 2. 快照（fail-closed：读不到就完全不碰购物车）
    let snapshot
    try {
      const cart = await getCart()
      snapshot = (cart && cart.items) || []
    } catch (e) {
      return {
        ok: false,
        stage: 'snapshot',
        err: e,
        restored: true,
        restoredCount: 0,
        failedCount: 0,
        userTip: TIP.snapshotFail
      }
    }

    // 3. 快照非空才清空（空车跳过清空）
    if (snapshot.length > 0) {
      try {
        await clearCart()
      } catch (e) {
        // 清空失败：购物车未改动，不额外弹提示（请求层已为 DELETE 弹过）
        return {
          ok: false,
          stage: 'clear',
          err: e,
          restored: true,
          restoredCount: 0,
          failedCount: 0,
          userTip: ''
        }
      }
    }

    // 4. 复制
    try {
      await reorderOrder(orderId)
      return {
        ok: true,
        stage: 'done',
        err: null,
        restored: true,
        restoredCount: 0,
        failedCount: 0,
        userTip: ''
      }
    } catch (e) {
      // 5. 失败恢复：按快照尽力加回
      const { restoredCount, failedCount, aborted } = await restoreCart(snapshot)
      const fullyRestored = failedCount === 0
      let userTip = fullyRestored ? TIP.keptAll : TIP.partial(restoredCount, failedCount)
      if (aborted && !fullyRestored) userTip += TIP.abortedSuffix

      return {
        ok: false,
        stage: 'reorder',
        err: e,
        restored: fullyRestored,
        restoredCount,
        failedCount,
        userTip
      }
    }
  } finally {
    inProgress = false
  }
}
