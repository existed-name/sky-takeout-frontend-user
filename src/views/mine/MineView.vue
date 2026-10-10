<script setup>
/**
 * 个人中心（路由 mine，路径 /mine）。
 *
 * 对齐小程序 pages/my/my：
 *   - 用户信息区：昵称（体验登录时用户自填的名字）；头像用占位图
 *     （微信头像/昵称已随微信登录一并去掉）。
 *   - 两个入口：地址管理 → /addresses?from=mine；历史订单 → /orders。
 *   - 「最近订单」分页列表（pageSize=10，不传 status），触底加载更多；
 *     每行：时间、状态文案、金额（后端 amount）、共 N 件、再来一单、去支付（待付款）。
 *
 * 金额口径：一律使用后端返回的 amount（实收金额，含配送费与打包费），禁止自算。
 * 状态文案：统一由公共组件 OrderStatusText 渲染（单一来源 constants/orderStatus.js）。
 * 再来一单：走 api/reorder.js 的统一编排函数，本页不自己清空购物车。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showDialog } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import MoneyText from '@/components/MoneyText.vue'
import OrderStatusText from '@/components/OrderStatusText.vue'

import { getOrderHistory } from '@/api/order'
import { reorderWithCartProtection } from '@/api/reorder'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { formatDateTime, toTimestamp } from '@/utils/format'

const router = useRouter()
const auth = useAuthStore()
const cart = useCartStore()

/** 每页条数 */
const PAGE_SIZE = 10
/** 待付款时限：15 分钟（判断「去支付」是否仍可见 / 状态是否已超时） */
const PAY_TIMEOUT_MS = 15 * 60 * 1000

/** 昵称：未登录时兜底展示 */
const displayName = computed(() => auth.displayName || '未登录')

/** 最近订单分页状态 */
const list = ref([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const finished = ref(false)
const error = ref(false)
const refreshing = ref(false)

/** 再来一单进行中的订单 id */
const reorderingId = ref(null)

/** 每秒推进的当前时间，驱动「待付款 → 已取消」的状态文案刷新 */
const now = ref(Date.now())
let tickTimer = null

/** 某订单剩余毫秒（以 orderTime 为基准）；时间非法返回 null */
function remainMsOf(orderTime) {
  const ts = toTimestamp(orderTime)
  if (Number.isNaN(ts)) return null
  return PAY_TIMEOUT_MS - (now.value - ts)
}

/** 待付款且未超时：显示「去支付」 */
function canPay(order) {
  return Number(order.status) === 1 && remainMsOf(order.orderTime) > 0
}

/** 总份数（明细可能为 null，需守卫） */
function itemCount(order) {
  const data = order.orderDetailList
  if (!Array.isArray(data)) return 0
  return data.reduce((acc, it) => acc + (Number(it.number) || 0), 0)
}

/** 拉取下一页「最近订单」 */
async function onLoad() {
  // 注意：Vant List 在 emit('load') 之前会先把 loading 置为 true 并 emit('update:loading')，
  // 配合 v-model:loading 会让 loading 在 onLoad 里恒为 true。若用它当「正在请求」判据，
  // 首次加载会被直接 return 掉、列表永远为空。故此处只以 finished 作为终止判据。
  if (finished.value) {
    loading.value = false
    return
  }
  const nextPage = page.value + 1
  loading.value = true
  try {
    const data = await getOrderHistory({ page: nextPage, pageSize: PAGE_SIZE })
    const records = (data && data.records) || []
    list.value = list.value.concat(records)
    total.value = Number((data && data.total) || 0)
    page.value = nextPage
    error.value = false
    finished.value = list.value.length >= total.value || records.length === 0
  } catch (e) {
    // 失败原因由请求层统一弹出；停止自动加载并展示重试入口
    error.value = true
    finished.value = true
  } finally {
    loading.value = false
  }
}

/** 下拉刷新 */
async function onRefresh() {
  page.value = 0
  total.value = 0
  list.value = []
  error.value = false
  finished.value = false
  loading.value = false
  await onLoad()
  refreshing.value = false
}

/** 失败后重试 */
function retry() {
  page.value = 0
  total.value = 0
  list.value = []
  error.value = false
  finished.value = false
  loading.value = false
  onLoad()
}

/** 去地址管理 */
function goAddress() {
  router.push('/addresses?from=mine')
}

/** 去历史订单 */
function goOrders() {
  router.push('/orders')
}

/** 去订单详情 */
function goDetail(id) {
  router.push(`/orders/${id}`)
}

/** 去支付 */
function goPay(id) {
  router.push(`/pay/${id}`)
}

/** 再来一单：统一走编排函数，成功后刷新购物车并跳首页 */
async function onReorder(id) {
  if (reorderingId.value !== null) return
  reorderingId.value = id
  try {
    const result = await reorderWithCartProtection(id)
    if (result && result.ok) {
      try {
        await cart.refresh()
      } catch (e) {
        // 购物车读取是静默端点，忽略；首页会再拉一次
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
    reorderingId.value = null
  }
}

/** 返回首页 */
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}

onMounted(() => {
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
  <div class="mine">
    <AppNavBar title="个人中心" show-back @click-left="goBack" />

    <!-- 用户信息 -->
    <section class="profile">
      <div class="profile__avatar">
        <van-icon name="user-o" />
      </div>
      <div class="profile__info">
        <p class="profile__name">{{ displayName }}</p>
        <p class="profile__hint">欢迎光临苍穹外卖</p>
      </div>
    </section>

    <!-- 入口 -->
    <section class="entries">
      <div class="entry" @click="goAddress">
        <van-icon class="entry__icon" name="location-o" />
        <span class="entry__text">地址管理</span>
        <van-icon class="entry__arrow" name="arrow" />
      </div>
      <div class="entry" @click="goOrders">
        <van-icon class="entry__icon" name="orders-o" />
        <span class="entry__text">历史订单</span>
        <van-icon class="entry__arrow" name="arrow" />
      </div>
    </section>

    <!-- 最近订单 -->
    <section class="recent">
      <h3 class="recent__title">最近订单</h3>

      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list
          v-model:loading="loading"
          :finished="finished"
          :immediate-check="true"
          finished-text="没有更多了"
          loading-text="加载中..."
          @load="onLoad"
        >
          <div v-for="order in list" :key="order.id" class="order-card">
            <div class="order-card__head">
              <span class="order-card__time">{{ formatDateTime(order.orderTime) }}</span>
              <OrderStatusText
                class="order-card__status"
                :status="order.status"
                :remain-ms="remainMsOf(order.orderTime)"
              />
            </div>

            <div class="order-card__main" @click="goDetail(order.id)">
              <div class="order-card__thumbs">
                <div v-for="(it, i) in (order.orderDetailList || [])" :key="i" class="thumb">
                  <img class="thumb__img" :src="it.image" :alt="it.name" />
                  <span class="thumb__name">{{ it.name }}</span>
                </div>
              </div>
              <div class="order-card__sum">
                <MoneyText class="order-card__amount" :value="order.amount" size="16px" bold />
                <span class="order-card__count">共 {{ itemCount(order) }} 件</span>
              </div>
            </div>

            <div class="order-card__actions">
              <van-button
                size="small"
                round
                plain
                type="default"
                :loading="reorderingId === order.id"
                @click="onReorder(order.id)"
              >
                再来一单
              </van-button>
              <van-button
                v-if="canPay(order)"
                size="small"
                round
                type="primary"
                @click="goPay(order.id)"
              >
                去支付
              </van-button>
            </div>
          </div>
        </van-list>

        <EmptyState
          v-if="error"
          icon="warning-o"
          text="订单加载失败"
          description="请检查网络后重试"
        />
        <van-button v-if="error" class="recent__retry" size="small" round @click="retry">
          重新加载
        </van-button>

        <EmptyState v-else-if="finished && list.length === 0" icon="orders-o" text="暂无订单" />
      </van-pull-refresh>
    </section>
  </div>
</template>

<style scoped>
.mine {
  position: relative;
  min-height: 100vh;
  background-color: var(--color-bg);
}

/* 用户信息 */
.profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 16px;
  background-color: var(--color-bg-card);
}

.profile__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 30px;
}

.profile__name {
  color: var(--color-text);
  font-size: 18px;
  font-weight: 600;
}

.profile__hint {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 12px;
}

/* 入口 */
.entries {
  margin-top: 12px;
  padding: 0 16px;
  background-color: var(--color-bg-card);
}

.entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 0;
  cursor: pointer;
}

.entry + .entry {
  border-top: 1px solid var(--color-border);
}

.entry__icon {
  color: var(--color-primary);
  font-size: 20px;
}

.entry__text {
  flex: 1 1 auto;
  color: var(--color-text);
  font-size: 15px;
}

.entry__arrow {
  color: var(--color-text-placeholder);
  font-size: 16px;
}

/* 最近订单 */
.recent {
  margin-top: 12px;
  padding: 0 12px 24px;
}

.recent__title {
  padding: 4px 4px 10px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 600;
}

.recent__retry {
  display: flex;
  margin: 0 auto 12px;
}

/* 订单卡片 */
.order-card {
  margin-bottom: 12px;
  padding: 12px 14px;
  background-color: var(--color-bg-card);
  border-radius: 12px;
}

.order-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.order-card__time {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.order-card__status {
  color: var(--color-primary);
  font-size: 13px;
}

.order-card__main {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  cursor: pointer;
}

.order-card__thumbs {
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  overflow-x: auto;
}

.thumb {
  flex: none;
  width: 56px;
  text-align: center;
}

.thumb__img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  background-color: var(--color-bg);
}

.thumb__name {
  display: block;
  overflow: hidden;
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-card__sum {
  flex: none;
  text-align: right;
}

.order-card__amount {
  display: block;
  color: var(--color-text);
}

.order-card__count {
  display: block;
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: 12px;
}

.order-card__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
