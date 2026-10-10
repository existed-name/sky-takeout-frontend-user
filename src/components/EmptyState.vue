<script setup>
/**
 * 空态：用于「该分类下暂无菜品 / 暂无订单 / 暂无地址」等场景。
 *
 * 默认渲染一段居中灰色文案；可通过 icon 显示一个 Vant 图标，或用默认插槽完全自绘。
 */
import { Icon as VanIcon } from 'vant'

defineProps({
  /** 主文案，默认为通用空态文案 */
  text: { type: String, default: '暂无数据' },
  /** 次要说明文案（可选） */
  description: { type: String, default: '' },
  /** Vant 图标名（可选），如 'search'；不传则不显示图标 */
  icon: { type: String, default: '' },
  /** 上下留白，如 '60px 0' */
  padding: { type: String, default: '' }
})
</script>

<template>
  <div class="empty-state" :style="padding ? { padding } : null">
    <slot>
      <van-icon v-if="icon" class="empty-state__icon" :name="icon" />
      <p class="empty-state__text">{{ text }}</p>
      <p v-if="description" class="empty-state__desc">{{ description }}</p>
    </slot>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 16px;
  text-align: center;
}

.empty-state__icon {
  margin-bottom: 12px;
  color: var(--color-text-placeholder, #999999);
  font-size: 48px;
}

.empty-state__text {
  color: var(--color-text-secondary, #666666);
  font-size: 14px;
}

.empty-state__desc {
  margin-top: 6px;
  color: var(--color-text-placeholder, #999999);
  font-size: 12px;
}
</style>
