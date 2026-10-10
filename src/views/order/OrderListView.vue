<script setup>
/**
 * 历史订单列表（路由 orderList，路径 /orders）。
 *
 * 对齐小程序 pages/historyOrder/historyOrder：
 *   - 三个 Tab：全部 / 待付款 / 已取消，分别对应 status 不传 / 1 / 6
 *     （「全部」不传该参数，避免出现空的 status= 查询串）。
 *   - 下拉刷新 + 触底加载更多（Vant PullRefresh + List），每个 Tab 各自维护分页游标。
 *   - 列表项：时间、状态文案、金额（后端 amount）、共 N 件；
 *     操作按钮：再来一单（始终）/ 去支付（待付款且未超时）/ 催单（待接单）。
 *
 * 金额口径：一律使用后端返回的 amount（实收金额，含配送费与打包费），
 *          禁止用「Σ(单价×份数)」自算（旧版小程序那样会恒少配送费与打包费）。
 * 状态文案：统一由公共组件 OrderStatusText 渲染（单一来源 constants/orderStatus.js）。
 * 再来一单：走 api/reorder.js 的统一编排函数，本页不自己清空购物车。
 * 请求失败由请求层统一提示，本页不自行弹失败提示。
 */
import { computed, onBeforeUnmount, onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { showDialog } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import MoneyText from '@/components/MoneyText.vue'
import OrderStatusText from '@/components/OrderStatusText.vue'

import { getOrderHistory, urgeOrder } from '@/api/order'
import { reorderWithCartProtection } from '@/api/reorder'
import { useCartStore } from '@/stores/cart'
import { ORDER_LIST_TABS } from '@/constants/orderStatus'
import { formatDateTime, toTimestamp } from '@/utils/format'
import { notifyToast } from '@/utils/notify'

const router = useRouter()
const cart = useCartStore()

/** 每页条数 */
const PAGE_SIZE = 10
/** 待付款时限：15 分钟（用于判断「去支付」是否仍可见、状态是否已超时） */
const PAY_TIMEOUT_MS = 15 * 60 * 1000

const tabs = ORDER_LIST_TABS
const activeIndex = ref(0)
const activeTab = computed(() => tabs[activeIndex.value])

/** 每个 Tab 独立的分页状态 */
function createTabState() {
  return {
    list: [],
    page: 0,
    total: 0,
    loading: false,
    finished: false,
    refreshing: false,
    error: false
  }
}
const tabState = reactive({
  all: createTabState(),
  unpaid: createTabState(),
  canceled: createTabState()
})
const cur = computed(() => tabState[activeTab.value.name])

/** 操作按钮进行中的订单 id（禁用该行按钮，防重复点击） */
const urgingId = ref(null)
const reorderingId = ref(null)

/** 每秒推进的当前时间，驱动「待付款 → 已取消」的状态文案刷新 */
const now = ref(Date.now())
let tickTimer = null

/** 某订单剩余毫秒（以 orderTime 为基准，15 分钟）；时间非法返回 null */
function remainMsOf(orderTime) {
  const ts = toTimestamp(orderTime)
  if (Number.isNaN(ts)) return null
  return PAY_TIMEOUT_MS - (now.value - ts)
}

/** 待付款且未超时：显示「去支付」 */
function canPay(order) {
  return Number(order.status) === 1 && remainMsOf(order.orderTime) > 0
}

/** 待接单：显示「催单」 */
function canUrge(order) {
  return Number(order.status) === 2
}

/** 总份数（明细可能为 null，需守卫） */
function itemCount(order) {
  const list = order.orderDetailList
  if (!Array.isArray(list)) return 0
  return list.reduce((acc, it) => acc + (Number(it.number) || 0), 0)
}

/** 拉取当前 Tab 的下一页 */
async function onLoad() {
  const st = cur.value
  // 注意：Vant List 在 emit('load') 之前会先把 loading 置为 true 并 emit('update:loading')，
  // 配合 v-model:loading 会让 st.loading 在 onLoad 里恒为 true。若用它当「正在请求」判据，
  // 首次加载会被直接 return 掉、列表永远为空。故此处只以 finished 作为终止判据。
  if (st.finished) {
    st.loading = false
    return
  }
  const nextPage = st.page + 1
  st.loading = true
  try {
    const data = await getOrderHistory({
      page: nextPage,
      pageSize: PAGE_SIZE,
      status: activeTab.value.status
    })
    const records = (data && data.records) || []
    st.list = st.list.concat(records)
    st.total = Number((data && data.total) || 0)
    st.page = nextPage
    st.error = false
    st.finished = st.list.length >= st.total || records.length === 0
  } catch (e) {
    // 失败原因由请求层统一弹出；停止自动加载并展示重试入口，避免无限重试
    st.error = true
    st.finished = true
  } finally {
    st.loading = false
  }
}

/** 下拉刷新：清空当前 Tab 并重拉第一页 */
async function onRefresh() {
  const st = cur.value
  st.page = 0
  st.total = 0
  st.list = []
  st.error = false
  st.finished = false
  st.loading = false
  await onLoad()
  st.refreshing = false
}

/** 失败后重试 */
function retry() {
  const st = cur.value
  st.page = 0
  st.total = 0
  st.list = []
  st.error = false
  st.finished = false
  st.loading = false
  onLoad()
}

/** 切换 Tab */
function switchTab(index) {
  if (index === activeIndex.value) return
  activeIndex.value = index
}

/** 去详情 */
function goDetail(id) {
  router.push(`/orders/${id}`)
}

/** 去支付 */
function goPay(id) {
  router.push(`/pay/${id}`)
}

/** 催单 */
async function onUrge(id) {
  if (urgingId.value !== null) return
  urgingId.value = id
  try {
    await urgeOrder(id)
    notifyToast('您的催单信息已发出！')
  } catch (e) {
    // 失败提示由请求层统一弹出
  } finally {
    urgingId.value = null
  }
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

/** 返回：优先回上一页，深链进入时退回个人中心 */
function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/mine')
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
  <div class="order-list">
    <AppNavBar title="历史订单" show-back @click-left="goBack" />

    <!-- Tab 栏 -->
    <div class="tabs">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.name"
        class="tabs__item"
        :class="{ 'tabs__item--active': index === activeIndex }"
        type="button"
        @click="switchTab(index)"
      >
        {{ tab.title }}
      </button>
    </div>

    <div class="order-list__body">
      <van-pull-refresh v-model="cur.refreshing" @refresh="onRefresh">
        <van-list
          :key="activeTab.name"
          v-model:loading="cur.loading"
          :finished="cur.finished"
          :immediate-check="true"
          finished-text="没有更多了"
          loading-text="加载中..."
          @load="onLoad"
        >
          <div v-for="order in cur.list" :key="order.id" class="order-card">
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
                <div
                  v-for="(it, i) in (order.orderDetailList || [])"
                  :key="i"
                  class="thumb"
                >
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
              <van-button
                v-if="canUrge(order)"
                size="small"
                round
                plain
                type="default"
                :loading="urgingId === order.id"
                @click="onUrge(order.id)"
              >
                催单
              </van-button>
            </div>
          </div>
        </van-list>

        <EmptyState
          v-if="cur.error"
          icon="warning-o"
          text="订单加载失败"
          description="请检查网络后重试"
        />
        <van-button v-if="cur.error" class="order-list__retry" size="small" round @click="retry">
          重新加载
        </van-button>

        <EmptyState
          v-else-if="cur.finished && cur.list.length === 0"
          icon="orders-o"
          text="暂无订单"
        />
      </van-pull-refresh>
    </div>
  </div>
</template>

<style scoped>
.order-list {
  position: relative;
  min-height: 100vh;
  background-color: var(--color-bg);
}

/* Tab 栏 */
.tabs {
  position: sticky;
  top: calc(var(--navbar-height) + env(safe-area-inset-top, 0px));
  z-index: 10;
  display: flex;
  background-color: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
}

.tabs__item {
  position: relative;
  flex: 1 1 0;
  padding: 12px 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
}

.tabs__item--active {
  color: var(--color-primary);
  font-weight: 600;
}

.tabs__item--active::after {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 28px;
  height: 2px;
  border-radius: 2px;
  background-color: var(--color-primary);
  transform: translateX(-50%);
  content: '';
}

.order-list__body {
  padding: 12px;
}

.order-list__retry {
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
