<script setup>
/**
 * 订单详情（路由 orderDetail，路径 /orders/:orderId）。
 *
 * 对齐小程序 pages/details/index：
 *   - 展示订单状态文案、菜品明细（单价 × 份数）、打包费、配送费、合计、期望时间、
 *     配送地址、订单号码/时间、支付方式、餐具数量；联系商家电话。
 *   - 待付款倒计时：基准是订单的 orderTime（不是页面加载时间），15 分钟；
 *     到 0 自动调「取消订单」接口并刷新详情。
 *   - 催单：仅「待接单」（status=2）可见，成功提示「您的催单信息已发出！」。
 *   - 取消订单：按钮在 status ∈ {1,2,3,4} 时可见；点击时仅 1/2 真正可取消，
 *     其余状态提示「请联系商家进行取消！」。
 *   - 再来一单：走 api/reorder.js 的统一编排函数（含购物车快照/恢复保护），
 *     成功后刷新购物车并跳首页；失败用编排返回的 userTip 提示（本页不自行判 code）。
 *   - 去支付：待付款（且未超时）时可见 → /pay/:orderId。
 *
 * 金额口径：一律使用后端返回的 amount（实收金额，含配送费与打包费）；订单明细里的
 *          amount 是「单价」，用于逐项展示，不做合计。
 * 状态文案：统一由公共组件 OrderStatusText 渲染（单一来源 constants/orderStatus.js）。
 * 请求一律走 src/api/**；失败提示由请求层统一弹出，本页只做状态复位与成功提示。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showDialog } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import MoneyText from '@/components/MoneyText.vue'
import OrderStatusText from '@/components/OrderStatusText.vue'

import { cancelOrder, getOrderDetail, urgeOrder } from '@/api/order'
import { reorderWithCartProtection } from '@/api/reorder'
import { useCartStore } from '@/stores/cart'
import { DELIVERY_FEE_YUAN, SHOP_PHONE } from '@/constants/business'
import { ORDER_STATUS } from '@/constants/orderStatus'
import { formatDateTime, toTimestamp } from '@/utils/format'
import { notifyToast } from '@/utils/notify'

const route = useRoute()
const router = useRouter()
const cart = useCartStore()

/** 待付款时限：15 分钟（与小程序一致，基准为 orderTime） */
const PAY_TIMEOUT_MS = 15 * 60 * 1000

const orderId = computed(() => route.params.orderId)

/** 详情加载中 */
const loading = ref(true)
/** 拉不到订单（接口失败/订单不存在）时展示空态 */
const notFound = ref(false)
/** 订单详情数据（UserOrderInfoVO） */
const order = ref(null)

/** 各操作进行中（用于禁用按钮，防重复提交） */
const canceling = ref(false)
const urging = ref(false)
const reordering = ref(false)
/** 超时自动取消只触发一次 */
const autoCancelled = ref(false)

/** 每秒推进的「当前时间」，驱动倒计时与状态文案刷新 */
const now = ref(Date.now())
let tickTimer = null

const status = computed(() => (order.value ? Number(order.value.status) : null))

/** 剩余毫秒（以 orderTime 为基准）；无订单时为 null */
const remainMs = computed(() => {
  if (!order.value) return null
  const ts = toTimestamp(order.value.orderTime)
  if (Number.isNaN(ts)) return null
  return PAY_TIMEOUT_MS - (now.value - ts)
})

/** 倒计时文案 mm:ss */
const countdownText = computed(() => {
  const seconds = Math.max(0, Math.floor((remainMs.value || 0) / 1000))
  const min = String(Math.floor(seconds / 60)).padStart(2, '0')
  const sec = String(seconds % 60).padStart(2, '0')
  return `${min}:${sec}`
})

/** 菜品明细（amount 为单价） */
const items = computed(() => (order.value && order.value.orderDetailList) || [])
/** 总份数 */
const totalCount = computed(() =>
  items.value.reduce((acc, it) => acc + (Number(it.number) || 0), 0)
)

/** 待付款且未超时：显示倒计时与「立即支付」 */
const isUnpaid = computed(() => status.value === ORDER_STATUS.UNPAID && remainMs.value > 0)
/** 取消订单按钮可见：待付款 / 待接单 / 待派送 / 派送中 */
const canCancel = computed(() => [1, 2, 3, 4].includes(status.value))
/** 催单按钮可见：待接单 */
const canUrge = computed(() => status.value === ORDER_STATUS.PENDING_ACCEPT)
/** 再来一单按钮可见：非「已退款」 */
const canReorder = computed(() => order.value !== null && status.value !== ORDER_STATUS.REFUNDED)
/** 已退款订单提示条 */
const showRefunded = computed(
  () => status.value === ORDER_STATUS.CANCELED && Number(order.value && order.value.payStatus) === 2
)

/** 期望时间展示：立即送出 / 具体时间 */
const expectedTimeText = computed(() => {
  if (!order.value) return ''
  if (Number(order.value.deliveryStatus) === 1) return '立即送出'
  return formatDateTime(order.value.estimatedDeliveryTime) || '—'
})

/** 支付方式文案 */
const payMethodText = computed(() =>
  Number(order.value && order.value.payMethod) === 1 ? '微信' : '支付宝'
)

/** 拉取订单详情 */
async function load() {
  loading.value = true
  notFound.value = false
  try {
    const data = await getOrderDetail(orderId.value)
    if (!data) {
      order.value = null
      notFound.value = true
      return
    }
    order.value = data
  } catch (e) {
    // 失败原因由请求层统一弹出，这里只落空态
    order.value = null
    notFound.value = true
  } finally {
    loading.value = false
  }
}

/**
 * 执行取消订单。
 * @param {boolean} auto 是否由超时自动触发（影响提示文案）
 */
async function performCancel(auto) {
  if (canceling.value) return
  canceling.value = true
  try {
    await cancelOrder(orderId.value, '')
    notifyToast(auto ? '订单已超时，已自动取消' : '您的订单已取消！')
    await load()
  } catch (e) {
    // 失败提示由请求层统一弹出
  } finally {
    canceling.value = false
  }
}

/** 点击「取消订单」：仅待付款/待接单可真正取消，其余状态提示联系商家 */
async function onCancelClick() {
  if (canceling.value) return
  if (status.value === ORDER_STATUS.UNPAID || status.value === ORDER_STATUS.PENDING_ACCEPT) {
    try {
      await showConfirmDialog({
        title: '取消订单',
        message: '确定要取消该订单吗？',
        confirmButtonText: '确定取消',
        cancelButtonText: '再想想'
      })
    } catch (e) {
      return
    }
    await performCancel(false)
  } else {
    notifyToast('请联系商家进行取消！')
  }
}

/** 催单 */
async function onUrge() {
  if (urging.value) return
  urging.value = true
  try {
    await urgeOrder(orderId.value)
    notifyToast('您的催单信息已发出！')
  } catch (e) {
    // 失败提示由请求层统一弹出
  } finally {
    urging.value = false
  }
}

/** 再来一单：统一走编排函数（永不 reject），成功后刷新购物车并跳首页 */
async function onReorder() {
  if (reordering.value) return
  reordering.value = true
  try {
    const result = await reorderWithCartProtection(orderId.value)
    if (result && result.ok) {
      try {
        await cart.refresh()
      } catch (e) {
        // 购物车读取失败为静默端点，忽略即可；首页会再拉一次
      }
      router.replace('/')
      return
    }
    if (result && result.userTip) {
      showDialog({
        title: '提示',
        message: result.userTip,
        showCancelButton: false,
        confirmButtonText: '我知道了'
      })
    }
  } catch (e) {
    // 编排函数设计为永不 reject，这里仅兜底
  } finally {
    reordering.value = false
  }
}

/** 去支付 */
function onPay() {
  router.push(`/pay/${orderId.value}`)
}

/** 联系商家 */
function onContact() {
  window.location.href = `tel:${SHOP_PHONE}`
}

/** 返回：优先回上一页，深链进入时退回历史订单 */
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/orders')
}

// 超时（remainMs 跨过 0）时对「仍待付款」的订单自动发取消
watch(remainMs, (ms) => {
  if (
    ms !== null &&
    ms <= 0 &&
    status.value === ORDER_STATUS.UNPAID &&
    !autoCancelled.value &&
    !canceling.value
  ) {
    autoCancelled.value = true
    performCancel(true)
  }
})

onMounted(() => {
  load()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  tickTimer = null
})
</script>

<template>
  <div class="order-detail">
    <AppNavBar title="订单详情" show-back @click-left="goBack" />

    <div class="order-detail__body">
      <LoadingMask :loading="loading" />

      <EmptyState
        v-if="!loading && notFound"
        icon="warning-o"
        text="订单信息加载失败"
        description="请稍后重试或返回历史订单"
      />

      <template v-else-if="order">
        <!-- 状态卡 -->
        <section class="card status-card">
          <div class="status-card__head">
            <OrderStatusText
              class="status-card__title"
              :status="order.status"
              :remain-ms="remainMs"
              size="18px"
              :color="isUnpaid ? 'var(--color-primary)' : 'var(--color-text)'"
            />
            <span v-if="isUnpaid" class="status-card__countdown">
              <van-icon name="clock-o" />
              等待支付：{{ countdownText }}
            </span>
          </div>
          <p v-if="isUnpaid" class="status-card__hint">
            请在 15 分钟内完成支付，超时将自动取消。
          </p>
          <p v-else-if="showRefunded" class="status-card__hint">
            您的订单退款成功。
          </p>

          <div class="status-card__actions">
            <van-button
              v-if="canCancel"
              class="status-card__btn"
              size="small"
              round
              plain
              type="default"
              :loading="canceling"
              @click="onCancelClick"
            >
              取消订单
            </van-button>
            <van-button
              v-if="isUnpaid"
              class="status-card__btn"
              size="small"
              round
              type="primary"
              @click="onPay"
            >
              立即支付
            </van-button>
            <van-button
              v-if="canUrge"
              class="status-card__btn"
              size="small"
              round
              plain
              type="default"
              :loading="urging"
              @click="onUrge"
            >
              催单
            </van-button>
            <van-button
              v-if="canReorder"
              class="status-card__btn"
              size="small"
              round
              plain
              type="default"
              :loading="reordering"
              @click="onReorder"
            >
              再来一单
            </van-button>
          </div>
        </section>

        <!-- 菜品明细 -->
        <section class="card">
          <h3 class="card__title">苍穹餐厅</h3>
          <ul class="dish-list">
            <li v-for="it in items" :key="it.id" class="dish">
              <img class="dish__img" :src="it.image" :alt="it.name" />
              <div class="dish__info">
                <p class="dish__name">{{ it.name }}</p>
                <p v-if="it.dishFlavor" class="dish__flavor">{{ it.dishFlavor }}</p>
                <p class="dish__number">×{{ it.number }}</p>
              </div>
              <MoneyText class="dish__price" :value="it.amount" />
            </li>
          </ul>

          <div class="fee">
            <div class="fee__row">
              <span class="fee__label">打包费</span>
              <MoneyText :value="order.packAmount" />
            </div>
            <div class="fee__row">
              <span class="fee__label">配送费</span>
              <MoneyText :value="DELIVERY_FEE_YUAN" />
            </div>
            <div class="fee__row fee__row--total">
              <span class="fee__label">合计</span>
              <MoneyText :value="order.amount" size="16px" bold color="var(--color-primary)" />
            </div>
          </div>
        </section>

        <!-- 联系商家 -->
        <section class="card contact" @click="onContact">
          <van-icon class="contact__icon" name="service-o" />
          <span class="contact__text">联系商家</span>
          <span class="contact__phone">{{ SHOP_PHONE }}</span>
          <van-icon class="contact__arrow" name="phone-o" />
        </section>

        <!-- 订单信息 -->
        <section class="card">
          <div class="info">
            <div class="info__row">
              <span class="info__label">期望时间</span>
              <span class="info__value">{{ expectedTimeText }}</span>
            </div>
            <div class="info__row">
              <span class="info__label">配送地址</span>
              <span class="info__value">
                <span class="info__line">
                  {{ order.consignee }} {{ order.phone }}
                </span>
                <span class="info__line">{{ order.address }}</span>
              </span>
            </div>
            <div class="info__row">
              <span class="info__label">订单号码</span>
              <span class="info__value">{{ order.number }}</span>
            </div>
            <div class="info__row">
              <span class="info__label">订单时间</span>
              <span class="info__value">{{ formatDateTime(order.orderTime) }}</span>
            </div>
            <div class="info__row">
              <span class="info__label">支付方式</span>
              <span class="info__value">{{ payMethodText }}</span>
            </div>
            <div class="info__row">
              <span class="info__label">餐具数量</span>
              <span class="info__value">
                {{ Number(order.tablewareStatus) === 0 ? '无需餐具' : `${order.tablewareNumber} 份` }}
              </span>
            </div>
            <div v-if="order.remark" class="info__row">
              <span class="info__label">备注</span>
              <span class="info__value">{{ order.remark }}</span>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.order-detail {
  position: relative;
  min-height: 100vh;
  background-color: var(--color-bg);
}

.order-detail__body {
  position: relative;
  padding: 12px 12px calc(24px + env(safe-area-inset-bottom, 0px));
}

.card {
  margin-bottom: 12px;
  padding: 14px 16px;
  background-color: var(--color-bg-card);
  border-radius: 12px;
}

.card__title {
  margin-bottom: 12px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
}

/* 状态卡 */
.status-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.status-card__countdown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-primary);
  font-size: 13px;
}

.status-card__hint {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.status-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.status-card__btn {
  min-width: 78px;
}

/* 菜品明细 */
.dish-list {
  list-style: none;
}

.dish {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.dish__img {
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  object-fit: cover;
  background-color: var(--color-bg);
}

.dish__info {
  flex: 1 1 auto;
  overflow: hidden;
}

.dish__name {
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dish__flavor {
  margin-top: 2px;
  color: var(--color-text-placeholder);
  font-size: 12px;
}

.dish__number {
  margin-top: 2px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.dish__price {
  flex: none;
  color: var(--color-text);
  font-size: 14px;
}

/* 费用 */
.fee {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.fee__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.fee__row--total {
  color: var(--color-text);
  font-size: 14px;
}

/* 联系商家 */
.contact {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.contact__icon {
  color: var(--color-primary);
  font-size: 18px;
}

.contact__text {
  flex: 1 1 auto;
  color: var(--color-text);
  font-size: 14px;
}

.contact__phone {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.contact__arrow {
  color: var(--color-text-placeholder);
  font-size: 16px;
}

/* 订单信息 */
.info__row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}

.info__label {
  flex: none;
  width: 68px;
  color: var(--color-text-placeholder);
}

.info__value {
  flex: 1 1 auto;
  color: var(--color-text);
  word-break: break-all;
}

.info__line {
  display: block;
}
</style>
