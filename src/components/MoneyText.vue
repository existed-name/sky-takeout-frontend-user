<script setup>
/**
 * 金额显示：统一「￥ + 两位小数」。
 *
 * 颜色口径：金额一律用 var(--color-price)（橙红 #E94E3C），**不得用主色黄**
 *   （黄在浅色底上不可读，且「价格色」与「品牌主色」是两套语义）。
 *   调用方需显式指定颜色时传 color="var(--color-price)"；不传则继承父级。
 *
 * 内部一律走 src/utils/money.js（分为单位的整数运算），禁止浮点运算。
 * 两种入参方式，二选一：
 *   - fen：直接给「分」（整数），最精确，推荐用于渲染后端返回的金额字段；
 *   - value：给「元」（数字或字符串），内部会先转「分」再格式化。
 * 若两者都传，以 fen 为准。
 */
import { computed } from 'vue'
import { fenToYuanString, yuanToFen } from '@/utils/money'

const props = defineProps({
  /** 金额（元）。可为数字或字符串 */
  value: { type: [Number, String], default: null },
  /** 金额（分，整数）。与 value 二选一，优先 */
  fen: { type: [Number, String], default: null },
  /** 是否显示「￥」符号 */
  showSymbol: { type: Boolean, default: true },
  /** 字号，如 '12px' / '16px'；不传则继承父级 */
  size: { type: String, default: '' },
  /** 颜色，任意合法 CSS 颜色；不传则继承父级。金额应传 var(--color-price) */
  color: { type: String, default: '' },
  /** 是否加粗 */
  bold: { type: Boolean, default: false },
  /** 渲染标签，默认 span */
  tag: { type: String, default: 'span' }
})

/** 取「分」值：优先 fen，其次由 value 换算 */
const fenValue = computed(() => {
  if (props.fen !== null && props.fen !== undefined && props.fen !== '') {
    return Math.round(Number(props.fen) || 0)
  }
  return yuanToFen(props.value)
})

/** 两位小数字符串（不含符号） */
const text = computed(() => {
  const yuan = fenToYuanString(fenValue.value)
  return props.showSymbol ? `￥${yuan}` : yuan
})

const style = computed(() => {
  const s = {}
  if (props.size) s.fontSize = props.size
  if (props.color) s.color = props.color
  if (props.bold) s.fontWeight = 600
  return s
})
</script>

<template>
  <component :is="tag" class="money-text" :style="style">{{ text }}</component>
</template>

<style scoped>
.money-text {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
