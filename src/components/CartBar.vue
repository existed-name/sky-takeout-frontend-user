<script setup>
/**
 * 首页底部结算条（合计 + 件数 + 去结算 + 费用说明行）。
 *
 * 红线：配送费 / 打包费属业务常量，组件不得自行读取 src/constants/business.js，
 * 一律由父组件通过 props（deliveryFee / packingFeePerItem）传入；
 * 若父组件已拼好整段费用说明，可直接传 feeText 覆盖。
 *
 * 金额显示统一走 MoneyText（内部为 src/utils/money.js 的分为单位整数运算）。
 */
import { computed } from 'vue'
import { Icon as VanIcon, Badge as VanBadge } from 'vant'
import MoneyText from '@/components/MoneyText.vue'
import { yuanToFen, fenToYuanString } from '@/utils/money'

const props = defineProps({
  /** 购物车件数（总份数） */
  count: { type: Number, default: 0 },
  /** 商品合计（元，不含配送费/打包费） */
  amount: { type: [Number, String], default: 0 },
  /** 配送费（元），由父组件传入；不传则不显示在费用说明中 */
  deliveryFee: { type: [Number, String], default: null },
  /** 打包费单价（元/份），由父组件传入；不传则不显示在费用说明中 */
  packingFeePerItem: { type: [Number, String], default: null },
  /** 完整费用说明文案；传入则优先于上面两个数值自行拼接 */
  feeText: { type: String, default: '' },
  /** 是否禁用「去结算」 */
  disabled: { type: Boolean, default: false },
  /** 「去结算」按钮文案 */
  checkoutText: { type: String, default: '去结算' },
  /** 去结算按钮 loading 态（防重复提交） */
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['click-cart', 'checkout'])

/** 费用数字展示：去掉多余的 .00，与小程序「￥6 / ￥1」的观感一致 */
function feeNumber(value) {
  const fen = yuanToFen(value)
  if (fen === 0) return ''
  const yuan = fenToYuanString(fen).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  return `￥${yuan}`
}

/** 费用说明行：有商品才显示；优先用父组件传入的整段文案 */
const feeLine = computed(() => {
  if (props.count <= 0) return ''
  if (props.feeText) return props.feeText

  const parts = []
  const delivery = feeNumber(props.deliveryFee)
  const packing = feeNumber(props.packingFeePerItem)
  if (delivery) parts.push(`配送费${delivery}`)
  if (packing) parts.push(`打包费${packing}/份`)
  return parts.length ? `另需${parts.join('、')}` : ''
})
</script>

<template>
  <div class="cart-bar">
    <div v-if="feeLine" class="cart-bar__fee">{{ feeLine }}</div>

    <div class="cart-bar__main">
      <div class="cart-bar__left" @click="emit('click-cart')">
        <van-badge
          :content="count > 0 ? count : ''"
          :max="99"
          :show-zero="false"
          offset="[-2, 4]"
        >
          <van-icon
            name="shopping-cart-o"
            class="cart-bar__cart"
            :class="{ 'cart-bar__cart--active': count > 0 }"
          />
        </van-badge>
      </div>

      <div class="cart-bar__total">
        <MoneyText :value="amount" size="18px" color="var(--color-primary, #e95f3c)" bold />
        <span class="cart-bar__count" v-if="count > 0">共 {{ count }} 件</span>
      </div>

      <van-button
        class="cart-bar__checkout"
        type="primary"
        round
        size="small"
        :disabled="disabled"
        :loading="loading"
        @click="emit('checkout')"
      >
        {{ checkoutText }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.cart-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  z-index: 90;
  width: 100%;
  max-width: var(--app-max-width, 480px);
  transform: translateX(-50%);
  background-color: var(--color-bg-card, #ffffff);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.cart-bar__fee {
  padding: 6px 12px;
  background-color: var(--color-primary-light, #fdeee9);
  color: var(--color-primary-dark, #cf4a29);
  font-size: 12px;
}

.cart-bar__main {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 12px;
}

.cart-bar__left {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  cursor: pointer;
}

.cart-bar__cart {
  color: var(--color-text-placeholder, #999999);
  font-size: 28px;
  transition: color 0.2s ease;
}

.cart-bar__cart--active {
  color: var(--color-primary, #e95f3c);
}

.cart-bar__total {
  flex: 1 1 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-left: 8px;
}

.cart-bar__count {
  color: var(--color-text-secondary, #666666);
  font-size: 12px;
}

.cart-bar__checkout {
  flex: none;
  min-width: 96px;
  background-color: var(--color-primary, #e95f3c);
  border-color: var(--color-primary, #e95f3c);
}
</style>
