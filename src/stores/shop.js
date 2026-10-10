/**
 * 店铺状态（营业状态 / 门店电话 / 刷新动作）。
 *
 * 说明：后端只有 GET /user/shop/status 一个店铺接口（返回裸数字：1 营业中 / 0 打烊），
 * 店铺名、地址、配送费文案等都是本地常量（见 constants/business.js）。
 * 该端点在请求层静默清单内（失败不弹全局提示），因此刷新失败时由本 store 暴露的
 * error 文案供首页自行渲染提示。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getShopStatus } from '@/api/shop'
import { SHOP_PHONE } from '@/constants/business'

/** 刷新失败时的兜底提示（首页「重新加载」失败时展示） */
const REFRESH_FAIL_MSG = '暂时无法获取店铺状态，请检查网络后重试'

export const useShopStore = defineStore('shop', () => {
  /** 营业状态：null = 尚未查询，1 = 营业中，0 = 打烊 */
  const status = ref(null)
  /** 查询进行中 */
  const loading = ref(false)
  /** 最近一次刷新的失败文案（成功时清空） */
  const error = ref('')
  /** 门店电话（联系商家用） */
  const phone = ref(SHOP_PHONE)

  /** 是否营业中 */
  const isOpen = computed(() => status.value === 1)
  /** 是否已打烊（首页据此显示打烊遮罩） */
  const isClosed = computed(() => status.value === 0)

  /**
   * 刷新营业状态。
   * 失败时**不 reject**（该端点静默，无全局提示），返回 false 并把失败文案写入 error，
   * 供首页区分「查询失败」与「查询成功但仍在休息」两种反馈。
   *
   * @returns {Promise<boolean>} 是否查询成功
   */
  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const value = await getShopStatus()
      if (value !== null && value !== undefined) {
        status.value = Number(value)
      }
      return true
    } catch (e) {
      error.value = (e && e.msg) || REFRESH_FAIL_MSG
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    status,
    loading,
    error,
    phone,
    isOpen,
    isClosed,
    refresh
  }
})
