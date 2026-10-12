<script setup>
/**
 * 支付页（路由 pay，路径 /pay/:orderId）。
 *
 * 对齐小程序 pages/pay/index，并按 Web 场景加固：
 *   - 倒计时以订单的 orderTime 为基准（15 分钟），刷新页面后仍正确（基准不是页面加载时间）；
 *   - 超时自动取消订单：取消前先判断当前状态，仅当仍是「待付款」才发取消请求（已是取消态/已推进则不再发）；
 *   - 支付顺序严格照抄小程序：先 POST /user/orders/{id}/payment，再 POST /user/orders/{id}/payment/success；
 *     真实微信支付在 Web 上不可用（后端支付参数为空桩），因此不存在 ENABLE_REAL_WX_PAY 开关，直接走这条链路；
 *   - 支付成功后清本地购物车缓存（后端也会清，但本地不清会短暂显示旧数据），再跳成功页；
 *   - 直接访问或刷新本页时凭 orderId 自行拉取订单详情，不依赖从结算页传入的内存态。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button as VanButton, showToast } from 'vant'

import { cancelOrder, createPayment, getOrderDetail, notifyPaymentSuccess } from '@/api/order'
import { useCartStore } from '@/stores/cart'
import { ORDER_STATUS } from '@/constants/orderStatus'
import { formatDateTime, toTimestamp } from '@/utils/format'
import AppNavBar from '@/components/AppNavBar.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import MoneyText from '@/components/MoneyText.vue'

/** 支付时限：15 分钟（与小程序一致） */
const PAY_TIMEOUT_MS = 15 * 60 * 1000

const route = useRoute()
const router = useRouter()
const cart = useCartStore()

/** 订单 id（来自路径参数，字符串态即可用于拼 URL） */
const orderId = route.params.orderId

const order = ref(null)
const loading = ref(true)
const loadError = ref('')

/** 倒计时剩余毫秒；>0 表示仍待付款 */
const remainMs = ref(PAY_TIMEOUT_MS)
/** 是否已进入超时流程（避免重复取消 / 重复跳转） */
const timedOut = ref(false)
/** 支付请求进行中（按钮防重复提交） */
const paying = ref(false)

let timer = null
/** 超时流程重入锁（无论取消成功与否都只执行一次） */
let timeoutHandled = false

/** 倒计时文案 mm:ss */
const countdownText = computed(() => {
  const remain = Math.max(0, remainMs.value)
  const totalSec = Math.floor(remain / 1000)
  const min = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const sec = String(totalSec % 60).padStart(2, '0')
  return `${min}:${sec}`
})

/** 是否仍在待付款且未超时（决定「确认支付」是否可用） */
const payable = computed(
  () =>
    !paying.value &&
    !timedOut.value &&
    order.value != null &&
    Number(order.value.status) === ORDER_STATUS.UNPAID
)

/** 停止倒计时 */
function stopCountdown() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

/** 跳订单详情页（超时/失败/状态不匹配时的统一落点） */
function goDetail() {
  router.replace({ name: 'orderDetail', params: { orderId } })
}

/** 每秒推进倒计时；到 0 转入超时流程 */
function tick() {
  // 基准取订单的 orderTime（不是页面加载时间），因此刷新后仍准确
  const start = toTimestamp(order.value && order.value.orderTime)
  if (Number.isNaN(start)) {
    // 时间无法解析时不启动倒计时，避免误触发自动取消
    return
  }

  const remain = PAY_TIMEOUT_MS - (Date.now() - start)
  remainMs.value = remain

  if (remain <= 0) {
    handleTimeout()
    return
  }
  timer = setTimeout(tick, 1000)
}

/** 启动倒计时（先算一次，再每秒推进） */
function startCountdown() {
  stopCountdown()
  tick()
}

/**
 * 超时处理：先判断当前状态，仅当仍是「待付款」才发取消请求；
 * 无论取消成功与否都落到订单详情页（验收要求「超时路径落到订单详情页」）。
 */
async function handleTimeout() {
  if (timeoutHandled) return
  timeoutHandled = true
  timedOut.value = true
  stopCountdown()

  const current = order.value
  const isUnpaid = current != null && Number(current.status) === ORDER_STATUS.UNPAID

  if (isUnpaid) {
    try {
      await cancelOrder(orderId)
    } catch (e) {
      // 失败原因由请求层统一提示（展示后端真实 msg），页面不再自行弹提示；
      // 仍跳详情页，让用户看到订单的真实状态。
    }
  }

  goDetail()
}

/** 拉取订单详情（直接访问 / 刷新本页时也走这里） */
async function loadOrder() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await getOrderDetail(orderId)
    order.value = data

    if (Number(data.status) !== ORDER_STATUS.UNPAID) {
      // 订单不是「待付款」（已取消 / 已支付等）：提示后跳订单详情
      const label = Number(data.status) === ORDER_STATUS.CANCELED ? '订单已取消' : '订单状态已变更'
      showToast(label)
      goDetail()
      return
    }

    startCountdown()
  } catch (e) {
    loadError.value = (e && e.msg) || '订单加载失败'
  } finally {
    loading.value = false
  }
}

/** 确认支付：先 payment，再 payment/success（顺序不可颠倒） */
async function onPay() {
  if (paying.value) return

  // 已超时：走取消 → 详情；与小程序「超时点确认支付即取消」的行为一致
  if (timedOut.value || remainMs.value <= 0) {
    handleTimeout()
    return
  }
  if (!payable.value) return

  paying.value = true
  stopCountdown()

  try {
    // 步骤一：创建支付单（后端为空桩，不真正调起微信支付）
    await createPayment(orderId)
    // 步骤二：支付成功通知（后端在此清空购物车并推进订单状态）
    await notifyPaymentSuccess(orderId)
  } catch (e) {
    // 失败原因由请求层统一提示；复位按钮并恢复倒计时
    paying.value = false
    startCountdown()
    return
  }

  // 成功：同步清本地购物车缓存（后端已清，本地不清首页会短暂显示旧数据）
  cart.takeOutAfterPaySuccess()
  showToast({ message: '支付成功', duration: 1200 })
  // 保持 paying=true 直到离场，避免重复点击
  router.replace({ name: 'success', params: { orderId } })
}

/** 返回：有历史则回退，否则落到订单详情（兼容直接访问深链） */
function onBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    goDetail()
  }
}

onMounted(loadOrder)

onBeforeUnmount(stopCountdown)
</script>

<template>
  <div class="pay">
    <AppNavBar title="支付订单" show-back @click-left="onBack" />

    <div class="pay__body">
      <LoadingMask :loading="loading" fullscreen text="正在获取订单..." />

      <!-- 加载失败：给出可见的重试入口，避免白屏 -->
      <div v-if="!loading && loadError" class="pay__error">
        <van-icon name="warning-o" class="pay__error-icon" />
        <p class="pay__error-text">{{ loadError }}</p>
        <van-button type="primary" size="small" round @click="loadOrder">重新加载</van-button>
      </div>

      <template v-else-if="order">
        <!-- 订单信息 -->
        <div class="pay__card pay__head">
          <div class="pay__countdown">
            <template v-if="timedOut">
              <span class="pay__timeout">订单已超时</span>
            </template>
            <template v-else>
              <span class="pay__countdown-label">支付剩余时间</span>
              <span class="pay__countdown-time">{{ countdownText }}</span>
            </template>
          </div>
          <MoneyText class="pay__amount" :value="order.amount" size="28px" bold />
          <div class="pay__order-no">苍穹餐厅-{{ order.number }}</div>
        </div>

        <!-- 支付方式（Web 端仅微信支付一项，展示用） -->
        <div class="pay__card pay__method">
          <div class="pay__method-item">
            <van-icon name="wechat-pay" class="pay__method-icon" />
            <span class="pay__method-name">微信支付</span>
            <van-icon name="success" class="pay__method-check" />
          </div>
        </div>

        <p v-if="order.orderTime" class="pay__tip">
          下单时间：{{ formatDateTime(order.orderTime) }}
        </p>
      </template>
    </div>

    <!-- 吸底支付按钮 -->
    <div v-if="order && !loadError" class="pay__footer">
      <van-button
        class="pay__pay-btn"
        type="primary"
        block
        round
        :loading="paying"
        :disabled="!payable"
        loading-text="支付中..."
        @click="onPay"
      >
        确认支付
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.pay {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background-color: var(--color-bg);
}

.pay__body {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  margin: 0 auto;
  padding: var(--gap-page) var(--gap-page) 0;
  box-sizing: border-box;
}

.pay__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
}

.pay__error-icon {
  font-size: 40px;
  color: var(--color-text-placeholder);
}

.pay__error-text {
  color: var(--color-text-secondary);
  font-size: var(--font-base);
}

.pay__card {
  margin-bottom: var(--gap-block);
  padding: 20px 16px;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-sm);
}

.pay__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pay__countdown {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-base);
}

.pay__countdown-time {
  color: var(--color-accent);
  font-size: var(--font-heading);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pay__timeout {
  color: var(--color-danger);
  font-size: var(--font-lg);
  font-weight: 600;
}

.pay__amount {
  color: var(--color-price);
}

.pay__order-no {
  color: var(--color-text-placeholder);
  font-size: var(--font-md);
}

.pay__method-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pay__method-icon {
  font-size: 24px;
  color: var(--color-success);
}

.pay__method-name {
  flex: 1 1 auto;
  color: var(--color-text);
  font-size: var(--font-lg);
}

.pay__method-check {
  color: var(--color-success);
  font-size: var(--font-heading);
}

.pay__tip {
  margin: 4px 4px 0;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.pay__footer {
  position: sticky;
  bottom: 0;
  z-index: 10;
  width: 100%;
  margin: 0 auto;
  padding: 12px 16px calc(12px + var(--safe-area-bottom));
  background-color: var(--color-bg-card);
  box-shadow: var(--shadow-bar);
  box-sizing: border-box;
}

.pay__pay-btn {
  height: 44px;
  font-size: var(--font-lg);
}
</style>
