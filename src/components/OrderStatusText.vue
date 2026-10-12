<script setup>
/**
 * 订单状态文案（含「待付款超时显示为已取消」的判定）。
 *
 * 状态取值与文案映射统一取自 src/constants/orderStatus.js，禁止在页面里自行写死。
 *
 * 颜色口径（由调用页面通过 color 显式传入，不传则继承父级）：
 *   - 待付款 / 待接单：var(--color-accent)（琥珀橙；黄色在白底不可读，故不用主色黄）；
 *   - 其余进行态：var(--color-text)；
 *   - 超时已取消：var(--color-text-placeholder)。
 */
import { computed } from 'vue'
import { resolveOrderStatusText } from '@/constants/orderStatus'

const props = defineProps({
  /** 订单状态（1–7），必填 */
  status: { type: [Number, String], required: true },
  /** 待付款倒计时剩余毫秒；不传时 status=1 按「待付款」展示 */
  remainMs: { type: Number, default: null },
  /** 字号；不传则继承父级 */
  size: { type: String, default: '' },
  /** 颜色；不传则继承父级 */
  color: { type: String, default: '' }
})

const text = computed(() => resolveOrderStatusText(props.status, props.remainMs))

const style = computed(() => {
  const s = {}
  if (props.size) s.fontSize = props.size
  if (props.color) s.color = props.color
  return s
})
</script>

<template>
  <span class="order-status-text" :style="style">{{ text }}</span>
</template>

<style scoped>
.order-status-text {
  white-space: nowrap;
}
</style>
