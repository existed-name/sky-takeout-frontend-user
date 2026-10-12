<script setup>
/**
 * 提交订单页（对应小程序 pages/order/index，路由 checkout）。
 *
 * 功能对齐：
 *   - 收货地址块（默认地址自动带入；加载中显示「正在获取收货地址…」；无地址显示空态，点击去地址页）。
 *   - 商品清单 + 费用区（合计 = Σ(份数×单价) + 配送费 6 元 + 打包费 1 元/份）。
 *   - 送达时间弹层（今天/明天 + 「立即派送」/ 09:00–23:00 每 30 分钟一档）。
 *   - 餐具弹层（依据餐量提供 / 无需餐具 + 1–10 份）。
 *   - 备注弹层（独立页面在小程序里，Web 按方案 §3.1 合并为页内弹层；50 字加权计数、占位文案、确定/取消）。
 *   - 提交下单（按钮 in-flight 锁，防重复提交；未选地址时提示且不发请求）。
 *   - 联系商家（Web 端统一用门店电话，不照搬小程序的占位号 114）。
 *
 * 对小程序的有意偏离（方案 §4.2）：进入本页时按需重拉购物车与默认地址 ——
 *   小程序结算页不重拉、依赖首页写入的内存态，Web 刷新或深链会变成空单。
 *
 * 金额红线：合计一律用 utils/money.js 以「分」为整数运算，提交时再转元，
 *   因为后端把 amount / packAmount 原样落库、不重算，浮点误差会被永久写进数据库。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button as VanButton, Icon as VanIcon } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import MoneyText from '@/components/MoneyText.vue'
import PopupSheet from '@/components/PopupSheet.vue'
import { getDefaultAddress } from '@/api/address'
import { submitOrder } from '@/api/order'
import { DELIVERY_FEE_YUAN, PACK_FEE_PER_ITEM_YUAN, SHOP_PHONE } from '@/constants/business'
import { useCartStore } from '@/stores/cart'
import { useOrderDraftStore } from '@/stores/orderDraft'
import {
  addFen,
  fenToYuan,
  multiplyYuan,
  yuanToFen
} from '@/utils/money'
import {
  REMARK_MAX_WEIGHT,
  countRemarkWeight,
  formatDateTime,
  formatPhone
} from '@/utils/format'
import { notifyToast } from '@/utils/notify'

const router = useRouter()
const cartStore = useCartStore()
const draft = useOrderDraftStore()

/** 备注占位文案（照抄小程序备注页） */
const REMARK_PLACEHOLDER = '无接触配送，将商品挂家门口或放前台，地址封闭管理时请电话联系'
/** 立即派送选项文案 */
const IMMEDIATE_LABEL = '立即派送'

/** 页面初始化中（重拉购物车 / 默认地址期间） */
const initializing = ref(false)
/** 地址加载中（显示「正在获取收货地址…」占位） */
const addressLoading = ref(false)
/** 提交中（in-flight 锁，防重复提交） */
const submitting = ref(false)

// —— 弹层开关 ——
const arrivalVisible = ref(false)
const tablewareVisible = ref(false)
const remarkVisible = ref(false)
const contactVisible = ref(false)

// —— 送达时间弹层草稿 ——
const dayTab = ref(0) // 0 = 今天，1 = 明天
const selectedSlot = ref(IMMEDIATE_LABEL)

// —— 餐具弹层草稿 ——
const tablewareStatus = ref(1) // 1 = 依据餐量提供，0 = 无需餐具
const tablewareNumber = ref(1)

// —— 备注弹层草稿 ——
const remarkDraft = ref('')

const cartItems = computed(() => cartStore.items)
const itemCount = computed(() => cartStore.count)

/** 商品小计（分）：Σ(份数×单价)，权威值取自 store */
const goodsSubtotalFen = computed(() => cartStore.goodsSubtotalFen)
/** 配送费（分）：常量 6 元 */
const deliveryFeeFen = computed(() => yuanToFen(DELIVERY_FEE_YUAN))
/** 打包费（分）：总份数 × 1 元/份 */
const packFeeFen = computed(() => multiplyYuan(PACK_FEE_PER_ITEM_YUAN, itemCount.value))
/** 合计（分）：商品小计 + 配送费 + 打包费，全程整数累加 */
const totalFen = computed(() =>
  addFen(goodsSubtotalFen.value, deliveryFeeFen.value, packFeeFen.value)
)

const address = computed(() => draft.address)
const hasAddress = computed(() => draft.hasAddress)

/** 完整地址文本（省 + 市 + 区 + 详细） */
const addressFullText = computed(() => {
  const a = address.value
  if (!a) return ''
  return `${a.provinceName || ''}${a.cityName || ''}${a.districtName || ''}${a.detail || ''}`
})

/** 送达时间展示文案 */
const arrivalLabel = computed(() => draft.arrivalTime.label || IMMEDIATE_LABEL)

/** 餐具展示文案 */
const tablewareLabel = computed(() => {
  if (draft.tableware.status === 0) return '无需餐具'
  return `依据餐量提供 ${draft.tableware.number} 份`
})

/** 备注展示文案 */
const remarkLabel = computed(() => draft.remark || '口味、偏好等要求')

/** 时段列表：09:00–23:00 每 30 分钟一档 */
const timeSlots = computed(() => {
  const slots = []
  for (let minutes = 9 * 60; minutes <= 23 * 60; minutes += 30) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0')
    const m = String(minutes % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
  }
  return slots
})

/** 备注加权计数 */
const remarkWeight = computed(() => countRemarkWeight(remarkDraft.value))
const remarkOver = computed(() => remarkWeight.value > REMARK_MAX_WEIGHT)

/** 今天页签下才显示「立即派送」 */
const slotOptions = computed(() =>
  dayTab.value === 0 ? [IMMEDIATE_LABEL, ...timeSlots.value] : timeSlots.value
)

/**
 * 进入本页：按需重拉购物车与默认地址（对小程序的有意偏离）。
 * 购物车为空 → 重拉；仍为空 → 提示并跳回首页。
 * 草稿无地址 → 回退到默认地址接口（无默认地址属正常业务失败，失败提示由请求层统一弹出）。
 */
onMounted(async () => {
  initializing.value = true
  try {
    if (cartItems.value.length === 0) {
      await cartStore.refresh().catch(() => {})
    }
    if (cartItems.value.length === 0) {
      notifyToast('购物车是空的，请先选购商品')
      router.replace('/')
      return
    }
    await ensureAddress()
  } finally {
    initializing.value = false
  }
})

/** 草稿无地址时回退到默认地址 */
async function ensureAddress() {
  if (draft.hasAddress) return
  addressLoading.value = true
  try {
    const def = await getDefaultAddress()
    if (def) draft.setAddress(def)
  } catch (e) {
    // 失败（含「您还没有设置默认地址~」）已由请求层统一弹出后端原话；
    // 这里不重复弹窗，只保持空态，等用户点地址块去选择。
  } finally {
    addressLoading.value = false
  }
}

/** 返回上一页；无历史则回首页 */
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/')
  }
}

/** 去地址页选择（带 from=checkout，供地址页决定回跳） */
function goAddress() {
  router.push({ path: '/addresses', query: { from: 'checkout' } })
}

// —— 送达时间 ——
function openArrival() {
  const current = draft.arrivalTime
  if (current.deliveryStatus === 1) {
    dayTab.value = 0
    selectedSlot.value = IMMEDIATE_LABEL
  } else {
    dayTab.value = current.label && current.label.startsWith('明天') ? 1 : 0
    const parts = String(current.label || '').split(' ')
    selectedSlot.value = parts[1] || timeSlots.value[0]
  }
  arrivalVisible.value = true
}

function pickDay(index) {
  dayTab.value = index
  // 切到明天时「立即派送」不可用，回落第一个时段
  if (index === 1 && selectedSlot.value === IMMEDIATE_LABEL) {
    selectedSlot.value = timeSlots.value[0]
  }
}

function confirmArrival() {
  if (selectedSlot.value === IMMEDIATE_LABEL) {
    draft.setArrivalTime({ deliveryStatus: 1, estimatedDeliveryTime: '', label: IMMEDIATE_LABEL })
  } else {
    const dayLabel = dayTab.value === 0 ? '今天' : '明天'
    const value = buildArrivalDateTime(dayTab.value, selectedSlot.value)
    draft.setArrivalTime({
      deliveryStatus: 0,
      estimatedDeliveryTime: value,
      label: `${dayLabel} ${selectedSlot.value}`
    })
  }
  arrivalVisible.value = false
}

/** 生成 "yyyy-MM-dd HH:mm:ss"（dayOffset：0 今天 / 1 明天） */
function buildArrivalDateTime(dayOffset, hhmm) {
  const base = new Date()
  base.setDate(base.getDate() + dayOffset)
  const [h, m] = String(hhmm).split(':').map((n) => Number(n) || 0)
  base.setHours(h, m, 0, 0)
  return formatDateTime(base, 'yyyy-MM-dd HH:mm:ss')
}

// —— 餐具 ——
function openTableware() {
  tablewareStatus.value = draft.tableware.status
  tablewareNumber.value = draft.tableware.number
  tablewareVisible.value = true
}

function pickTablewareStatus(status) {
  tablewareStatus.value = status
}

function stepTableware(delta) {
  const next = tablewareNumber.value + delta
  if (next < 1) return
  if (next > 10) return
  tablewareNumber.value = next
}

function confirmTableware() {
  draft.setTableware({ status: tablewareStatus.value, number: tablewareNumber.value })
  tablewareVisible.value = false
}

// —— 备注 ——
function openRemark() {
  remarkDraft.value = draft.remark
  remarkVisible.value = true
  document.addEventListener('keydown', onRemarkKeydown)
}

function closeRemark() {
  remarkVisible.value = false
  document.removeEventListener('keydown', onRemarkKeydown)
}

function onRemarkKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeRemark()
  }
}

function confirmRemark() {
  if (remarkOver.value) {
    notifyToast(`备注请控制在 ${REMARK_MAX_WEIGHT} 字以内`)
    return
  }
  draft.setRemark(remarkDraft.value.trim())
  closeRemark()
}

// —— 联系商家 ——
async function copyPhone() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(SHOP_PHONE)
      notifyToast('号码已复制')
    } else {
      notifyToast(SHOP_PHONE)
    }
  } catch (e) {
    notifyToast(SHOP_PHONE)
  }
}

// —— 提交订单 ——
async function onSubmit() {
  if (submitting.value) return

  // 未选地址：就地提示，且不发请求
  if (!hasAddress.value) {
    notifyToast('请选择收货地址')
    return
  }

  const arrivalTime = draft.arrivalTime
  const tableware = draft.tableware

  const payload = {
    addressBookId: address.value.id,
    // Web 端固定微信支付
    payMethod: 1,
    remark: draft.remark || '',
    deliveryStatus: arrivalTime.deliveryStatus,
    // 打包费口径 = 商品总份数（后端原样入库）
    packAmount: itemCount.value,
    tablewareStatus: tableware.status,
    tablewareNumber: tableware.status === 0 ? 0 : tableware.number,
    // 合计（元）：由「分」精确换算，禁止浮点
    amount: fenToYuan(totalFen.value)
  }
  // 选时间时才带预计送达时间（立即送出时后端不依赖它）
  if (arrivalTime.deliveryStatus === 0 && arrivalTime.estimatedDeliveryTime) {
    payload.estimatedDeliveryTime = arrivalTime.estimatedDeliveryTime
  }

  submitting.value = true
  try {
    const result = await submitOrder(payload)
    const orderId = result && result.id
    // 下单成功：清空结算草稿，replace 到支付页（不可回退到已提交的结算页）
    draft.reset()
    router.replace(`/pay/${orderId}`)
  } catch (e) {
    // 失败（如后端「配送距离限制 5000 米」等业务规则）由请求层统一弹提示，这里只复位按钮锁
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onRemarkKeydown)
})
</script>

<template>
  <div class="checkout">
    <AppNavBar title="提交订单" show-back @click-left="goBack" />

    <LoadingMask :loading="initializing" text="加载中..." />

    <div class="checkout__body">
      <!-- 收货地址 -->
      <section class="checkout__address card" @click="goAddress">
        <div v-if="addressLoading && !hasAddress" class="checkout__address-loading">
          <van-icon name="location-o" class="checkout__address-icon" />
          <span>正在获取收货地址…</span>
        </div>

        <template v-else-if="hasAddress">
          <van-icon name="location-o" class="checkout__address-icon" />
          <div class="checkout__address-main">
            <div class="checkout__address-line">
              <span class="checkout__address-name">{{ address.consignee }}</span>
              <span class="checkout__address-phone">{{ formatPhone(address.phone) }}</span>
            </div>
            <div class="checkout__address-detail">{{ addressFullText }}</div>
          </div>
          <van-icon name="arrow" class="checkout__arrow" />
        </template>

        <template v-else>
          <van-icon name="location-o" class="checkout__address-icon" />
          <div class="checkout__address-main">
            <div class="checkout__address-empty">请选择收货地址</div>
          </div>
          <van-icon name="arrow" class="checkout__arrow" />
        </template>
      </section>

      <!-- 商品清单 -->
      <section class="card">
        <h2 class="card__title">商品清单</h2>
        <ul class="goods">
          <li v-for="item in cartItems" :key="item.id" class="goods__row">
            <img v-if="item.image" class="goods__img" :src="item.image" :alt="item.name" loading="lazy" />
            <div class="goods__info">
              <div class="goods__name">{{ item.name }}</div>
              <div v-if="item.dishFlavor" class="goods__flavor">{{ item.dishFlavor }}</div>
            </div>
            <div class="goods__right">
              <div class="goods__count">×{{ item.number }}</div>
              <MoneyText
                class="goods__amount"
                :fen="multiplyYuan(item.amount, item.number)"
                bold
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- 费用明细 -->
      <section class="card">
        <h2 class="card__title">费用明细</h2>
        <div class="fee">
          <span class="fee__label">商品小计</span>
          <MoneyText class="fee__value" :fen="goodsSubtotalFen" />
        </div>
        <div class="fee">
          <span class="fee__label">打包费（￥{{ PACK_FEE_PER_ITEM_YUAN }}/份 × {{ itemCount }} 份）</span>
          <MoneyText class="fee__value" :fen="packFeeFen" />
        </div>
        <div class="fee">
          <span class="fee__label">配送费</span>
          <MoneyText class="fee__value" :fen="deliveryFeeFen" />
        </div>
        <div class="fee fee--total">
          <span class="fee__label">合计</span>
          <MoneyText class="fee__value fee__value--total" :fen="totalFen" bold />
        </div>
      </section>

      <!-- 其他信息 -->
      <section class="card card--rows">
        <div class="row" @click="openArrival">
          <span class="row__label">送达时间</span>
          <span class="row__value">{{ arrivalLabel }}</span>
          <van-icon name="arrow" class="row__arrow" />
        </div>
        <div class="row" @click="openTableware">
          <span class="row__label">餐具份数</span>
          <span class="row__value">{{ tablewareLabel }}</span>
          <van-icon name="arrow" class="row__arrow" />
        </div>
        <div class="row" @click="openRemark">
          <span class="row__label">订单备注</span>
          <span class="row__value row__value--ellipsis">{{ remarkLabel }}</span>
          <van-icon name="arrow" class="row__arrow" />
        </div>
        <div class="row" @click="contactVisible = true">
          <span class="row__label">联系商家</span>
          <span class="row__value">{{ SHOP_PHONE }}</span>
          <van-icon name="arrow" class="row__arrow" />
        </div>
      </section>
    </div>

    <!-- 底部提交条 -->
    <div class="checkout__bar">
      <div class="checkout__bar-total">
        <span class="checkout__bar-label">合计</span>
        <MoneyText class="checkout__bar-amount" :fen="totalFen" bold />
      </div>
      <van-button
        class="checkout__bar-btn"
        type="primary"
        round
        :loading="submitting"
        loading-text="提交中..."
        @click="onSubmit"
      >
        提交订单
      </van-button>
    </div>

    <!-- 送达时间弹层 -->
    <PopupSheet v-model:show="arrivalVisible" title="送达时间">
      <div class="arrival">
        <div class="arrival__days">
          <button
            type="button"
            class="arrival__day"
            :class="{ 'arrival__day--active': dayTab === 0 }"
            @click="pickDay(0)"
          >
            今天
          </button>
          <button
            type="button"
            class="arrival__day"
            :class="{ 'arrival__day--active': dayTab === 1 }"
            @click="pickDay(1)"
          >
            明天
          </button>
        </div>
        <div class="arrival__slots">
          <button
            v-for="slot in slotOptions"
            :key="slot"
            type="button"
            class="arrival__slot"
            :class="{ 'arrival__slot--active': selectedSlot === slot }"
            @click="selectedSlot = slot"
          >
            {{ slot }}
          </button>
        </div>
      </div>
      <template #footer>
        <van-button type="primary" block round @click="confirmArrival">确定</van-button>
      </template>
    </PopupSheet>

    <!-- 餐具弹层 -->
    <PopupSheet v-model:show="tablewareVisible" title="餐具份数">
      <div class="tableware">
        <div class="tableware__options">
          <button
            type="button"
            class="tableware__option"
            :class="{ 'tableware__option--active': tablewareStatus === 1 }"
            @click="pickTablewareStatus(1)"
          >
            依据餐量提供
          </button>
          <button
            type="button"
            class="tableware__option"
            :class="{ 'tableware__option--active': tablewareStatus === 0 }"
            @click="pickTablewareStatus(0)"
          >
            无需餐具
          </button>
        </div>
        <div v-if="tablewareStatus === 1" class="tableware__stepper">
          <span class="tableware__stepper-label">餐具份数</span>
          <button
            type="button"
            class="tableware__stepper-btn"
            :disabled="tablewareNumber <= 1"
            @click="stepTableware(-1)"
          >
            −
          </button>
          <span class="tableware__stepper-value">{{ tablewareNumber }}</span>
          <button
            type="button"
            class="tableware__stepper-btn"
            :disabled="tablewareNumber >= 10"
            @click="stepTableware(1)"
          >
            ＋
          </button>
        </div>
      </div>
      <template #footer>
        <van-button type="primary" block round @click="confirmTableware">确定</van-button>
      </template>
    </PopupSheet>

    <!-- 备注弹层 -->
    <PopupSheet v-model:show="remarkVisible" title="订单备注" @close="closeRemark">
      <div class="remark">
        <textarea
          v-model="remarkDraft"
          class="remark__input"
          :placeholder="REMARK_PLACEHOLDER"
          rows="4"
        />
        <div class="remark__count" :class="{ 'remark__count--over': remarkOver }">
          {{ remarkWeight }}/{{ REMARK_MAX_WEIGHT }}
        </div>
      </div>
      <template #footer>
        <div class="remark__actions">
          <van-button plain block round @click="closeRemark">取消</van-button>
          <van-button type="primary" block round :disabled="remarkOver" @click="confirmRemark">
            确定
          </van-button>
        </div>
      </template>
    </PopupSheet>

    <!-- 联系商家弹层（桌面端 tel: 无效时的兜底） -->
    <PopupSheet v-model:show="contactVisible" title="联系商家">
      <div class="contact">
        <p class="contact__phone">{{ SHOP_PHONE }}</p>
        <p class="contact__hint">手机端可直接拨打，桌面端可复制号码后拨打。</p>
      </div>
      <template #footer>
        <div class="contact__actions">
          <a class="contact__call" :href="`tel:${SHOP_PHONE}`">
            <van-button type="primary" block round>拨打</van-button>
          </a>
          <van-button plain block round @click="copyPhone">复制号码</van-button>
        </div>
      </template>
    </PopupSheet>
  </div>
</template>

<style scoped>
.checkout {
  min-height: 100%;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  background-color: var(--color-bg);
}

.checkout__body {
  padding: var(--gap-page);
}

.card {
  margin-bottom: var(--gap-block);
  padding: 14px;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-sm);
}

.card--rows {
  padding: 0;
}

.card__title {
  margin-bottom: 10px;
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
}

/* 地址块 */
.checkout__address {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.checkout__address-icon {
  flex: none;
  color: var(--color-accent);
  font-size: 22px;
}

.checkout__address-main {
  flex: 1 1 auto;
  min-width: 0;
}

.checkout__address-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.checkout__address-name {
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
}

.checkout__address-phone {
  color: var(--color-text-secondary);
  font-size: var(--font-base);
}

.checkout__address-detail {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  line-height: 1.5;
}

.checkout__address-empty {
  color: var(--color-text-placeholder);
  font-size: var(--font-lg);
}

.checkout__address-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-placeholder);
  font-size: var(--font-lg);
}

.checkout__arrow {
  flex: none;
  color: var(--color-text-placeholder);
}

/* 商品清单 */
.goods {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.goods__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.goods__img {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background-color: var(--color-bg);
}

.goods__info {
  flex: 1 1 auto;
  min-width: 0;
}

.goods__name {
  color: var(--color-text);
  font-size: var(--font-lg);
  line-height: 1.4;
}

.goods__flavor {
  margin-top: 2px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.goods__right {
  flex: none;
  text-align: right;
}

.goods__count {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.goods__amount {
  display: block;
  margin-top: 2px;
  color: var(--color-text);
  font-size: var(--font-lg);
}

/* 费用明细 */
.fee {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: var(--font-base);
}

.fee__label {
  color: var(--color-text-secondary);
}

.fee__value {
  color: var(--color-price);
}

.fee--total {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.fee--total .fee__label {
  color: var(--color-text-secondary);
  font-weight: 600;
}

.fee__value--total {
  color: var(--color-price);
  font-size: var(--font-heading);
}

/* 信息行 */
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  cursor: pointer;
}

.row + .row {
  border-top: 1px solid var(--color-border);
}

.row__label {
  flex: none;
  color: var(--color-text);
  font-size: var(--font-lg);
}

.row__value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-base);
  text-align: right;
}

.row__value--ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__arrow {
  flex: none;
  color: var(--color-text-placeholder);
}

/* 底部提交条 */
.checkout__bar {
  position: fixed;
  bottom: 0;
  left: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  background-color: var(--color-bg-card);
  border-top: 1px solid var(--color-border);
}

.checkout__bar-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.checkout__bar-label {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.checkout__bar-amount {
  color: var(--color-price);
  font-size: var(--font-heading);
}

.checkout__bar-btn {
  min-width: 128px;
}

/* 送达时间弹层 */
.arrival__days {
  display: flex;
  gap: 10px;
  padding: 4px 0 12px;
}

.arrival__day {
  flex: 1;
  padding: 8px 0;
  color: var(--color-text-secondary);
  font-size: var(--font-lg);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.arrival__day--active {
  color: var(--color-accent);
  border-color: var(--color-primary-border);
  background-color: var(--color-primary-light);
}

.arrival__slots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding-bottom: 8px;
}

.arrival__slot {
  padding: 10px 0;
  color: var(--color-text);
  font-size: var(--font-base);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.arrival__slot--active {
  color: var(--color-accent);
  border-color: var(--color-primary-border);
  background-color: var(--color-primary-light);
}

/* 餐具弹层 */
.tableware__options {
  display: flex;
  gap: 10px;
  padding: 4px 0 14px;
}

.tableware__option {
  flex: 1;
  padding: 10px 0;
  color: var(--color-text-secondary);
  font-size: var(--font-base);
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.tableware__option--active {
  color: var(--color-accent);
  border-color: var(--color-primary-border);
  background-color: var(--color-primary-light);
}

.tableware__stepper {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 6px;
}

.tableware__stepper-label {
  flex: 1 1 auto;
  color: var(--color-text);
  font-size: var(--font-lg);
}

.tableware__stepper-btn {
  width: 32px;
  height: 32px;
  color: var(--color-text);
  font-size: var(--font-heading);
  line-height: 1;
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 50%;
}

.tableware__stepper-btn:disabled {
  color: var(--color-text-placeholder);
}

.tableware__stepper-value {
  min-width: 24px;
  color: var(--color-text);
  font-size: var(--font-title);
  text-align: center;
}

/* 备注弹层 */
.remark__input {
  width: 100%;
  padding: 10px;
  color: var(--color-text);
  font-size: var(--font-base);
  line-height: 1.6;
  background-color: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  resize: none;
}

.remark__count {
  margin-top: 6px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
  text-align: right;
}

.remark__count--over {
  color: var(--color-danger);
}

.remark__actions,
.contact__actions {
  display: flex;
  gap: 12px;
}

.remark__actions > *,
.contact__actions > * {
  flex: 1;
}

/* 联系商家弹层 */
.contact {
  padding: 8px 0 4px;
  text-align: center;
}

.contact__phone {
  color: var(--color-text);
  font-size: 22px;
  font-weight: 600;
}

.contact__hint {
  margin-top: 8px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.contact__call {
  display: block;
  flex: 1;
  text-decoration: none;
}
</style>
