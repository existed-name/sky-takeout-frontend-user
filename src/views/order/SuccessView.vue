<script setup>
/**
 * 提交成功页（路由 success，路径 /success/:orderId）。
 *
 * 对齐小程序 pages/success/index，并按 Web 场景加固：
 *   - 展示「预计 {时间} 送达」——优先取本地结算草稿里的预计送达时间；缺失（刷新 / 深链）时
 *     用 orderId 调 GET /user/orders/{id} 的 estimatedDeliveryTime 兜底。
 *     ⚠ 小程序的成功页只读内存态、刷新即空白，Web 端必须有兜底（这是有意偏离）。
 *   - 跳首页时【不】复刻小程序遗留的无用参数 `?status=不验证`（无后端语义）。
 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button as VanButton } from 'vant'

import { getOrderDetail } from '@/api/order'
import { useOrderDraftStore } from '@/stores/orderDraft'
import { formatDateTime, toTimestamp } from '@/utils/format'
import AppNavBar from '@/components/AppNavBar.vue'
import LoadingMask from '@/components/LoadingMask.vue'

const route = useRoute()
const router = useRouter()
const orderDraft = useOrderDraftStore()

/** 订单 id（路径参数） */
const orderId = route.params.orderId

/** 预计送达时间展示文案；空串表示尚未取到，模板给兜底提示 */
const arrivalText = ref('')
const loading = ref(false)

/** 展示格式：月-日 时:分 */
const ARRIVAL_PATTERN = 'MM月dd日 HH:mm'

/** 本地草稿里的预计送达时间（用户在下单时选定的时间；「立即派送」时为空串） */
function readDraftArrival() {
  const draft = orderDraft.arrivalTime
  const value = draft && draft.estimatedDeliveryTime
  return value ? formatDateTime(value, ARRIVAL_PATTERN) : ''
}

/**
 * 从订单详情兜底推算预计送达时间：
 *   - 优先用后端 estimatedDeliveryTime（立即派送时后端也会给出下单时间 + 1 小时）；
 *   - 都没有时退回「下单时间 + 1 小时」，最后退回空串（由模板给文案，不白屏）。
 */
function readOrderArrival(order) {
  if (order && order.estimatedDeliveryTime) {
    const text = formatDateTime(order.estimatedDeliveryTime, ARRIVAL_PATTERN)
    if (text) return text
  }
  const base = toTimestamp(order && order.orderTime)
  if (!Number.isNaN(base)) {
    return formatDateTime(new Date(base + 60 * 60 * 1000), ARRIVAL_PATTERN)
  }
  return ''
}

async function resolveArrival() {
  // 优先本地草稿（下单后仍存活于内存）；缺失时拉订单详情兜底
  const fromDraft = readDraftArrival()
  if (fromDraft) {
    arrivalText.value = fromDraft
    return
  }

  loading.value = true
  try {
    const order = await getOrderDetail(orderId)
    arrivalText.value = readOrderArrival(order)
  } catch (e) {
    // 失败原因由请求层统一提示；此处不阻塞页面，模板给兜底文案
  } finally {
    loading.value = false
  }
}

/** 返回首页（不下达小程序的 ?status=不验证 遗留参数） */
function goHome() {
  router.replace({ name: 'home' })
}

/** 查看订单 */
function goOrder() {
  router.replace({ name: 'orderDetail', params: { orderId } })
}

resolveArrival()
</script>

<template>
  <div class="success">
    <AppNavBar title="下单成功" show-back @click-left="goHome" />

    <div class="success__body">
      <LoadingMask :loading="loading" fullscreen text="正在获取订单..." />

      <div class="success__icon">
        <van-icon name="checked" />
      </div>
      <h2 class="success__title">下单成功</h2>

      <p class="success__arrival">
        <template v-if="arrivalText">
          预计 <span class="success__arrival-time">{{ arrivalText }}</span> 送达
        </template>
        <template v-else>预计送达时间以订单详情为准</template>
      </p>

      <p class="success__desc">后厨已开始疯狂备餐中, 请耐心等待~</p>

      <div class="success__btns">
        <van-button class="success__btn" plain type="primary" round @click="goHome">
          返回首页
        </van-button>
        <van-button class="success__btn" type="primary" round @click="goOrder">
          查看订单
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.success {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background-color: var(--color-bg);
}

.success__body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 auto;
  padding: 48px 24px;
  box-sizing: border-box;
}

.success__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  color: var(--color-primary-text);
  font-size: 44px;
  background-color: var(--color-primary);
  border-radius: 50%;
}

.success__title {
  margin-top: 20px;
  color: var(--color-text);
  font-size: 22px;
  font-weight: 700;
}

.success__arrival {
  margin-top: 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-lg);
}

.success__arrival-time {
  color: var(--color-accent);
  font-weight: 600;
}

.success__desc {
  margin-top: 10px;
  color: var(--color-text-placeholder);
  font-size: var(--font-md);
  text-align: center;
}

.success__btns {
  display: flex;
  gap: 12px;
  width: 100%;
  margin-top: 40px;
}

.success__btn {
  flex: 1 1 0;
  height: 44px;
}
</style>
