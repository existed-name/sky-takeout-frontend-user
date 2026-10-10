/**
 * 结算草稿（选中地址 / 备注 / 送达时间 / 餐具）。
 *
 * 说明（方案 §7.3）：这些字段只存活在内存里，刷新页面即回到默认值（「立即派送」等），
 * 属可接受的降级——方案刻意不引入 sessionStorage 持久化（避免过度设计）。
 * 它跨「结算页 ↔ 地址页 ↔ 备注弹层」共享，因此必须进 store。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 送达时间默认值：立即送出 */
function createArrivalTime() {
  return {
    /** 1 = 立即送出，0 = 选择时间（对应后端 deliveryStatus） */
    deliveryStatus: 1,
    /** 选择时间时的期望送达时间，"yyyy-MM-dd HH:mm:ss"；立即送出时为空串 */
    estimatedDeliveryTime: '',
    /** 展示文案，如「立即派送」「今天 12:30」 */
    label: '立即派送'
  }
}

/** 餐具默认值：依据餐量提供 1 份 */
function createTableware() {
  return {
    /** 1 = 依据餐量提供，0 = 无需餐具（对应后端 tablewareStatus） */
    status: 1,
    /** 餐具份数（1–10） */
    number: 1
  }
}

export const useOrderDraftStore = defineStore('orderDraft', () => {
  /** 选中的收货地址对象（来自地址簿；未选为 null） */
  const address = ref(null)
  /** 订单备注 */
  const remark = ref('')
  /** 送达时间草稿 */
  const arrivalTime = ref(createArrivalTime())
  /** 餐具草稿 */
  const tableware = ref(createTableware())

  /** 是否已选收货地址（结算页据此判断能否提交） */
  const hasAddress = computed(() => !!address.value)
  /** 是否「立即派送」 */
  const isImmediate = computed(() => arrivalTime.value.deliveryStatus === 1)
  /** 是否「无需餐具」 */
  const noTableware = computed(() => tableware.value.status === 0)

  /** 设置选中地址（传 null 视为清空） */
  function setAddress(next) {
    address.value = next || null
  }

  /** 设置备注 */
  function setRemark(text) {
    remark.value = text == null ? '' : String(text)
  }

  /** 设置送达时间（局部覆盖，未传字段沿用默认值） */
  function setArrivalTime(next) {
    arrivalTime.value = { ...createArrivalTime(), ...(next || {}) }
  }

  /** 设置餐具（局部覆盖） */
  function setTableware(next) {
    tableware.value = { ...createTableware(), ...(next || {}) }
  }

  /** 重置全部草稿（下单成功后或需要重新开始时调用） */
  function reset() {
    address.value = null
    remark.value = ''
    arrivalTime.value = createArrivalTime()
    tableware.value = createTableware()
  }

  return {
    address,
    remark,
    arrivalTime,
    tableware,
    hasAddress,
    isImmediate,
    noTableware,
    setAddress,
    setRemark,
    setArrivalTime,
    setTableware,
    reset
  }
})
