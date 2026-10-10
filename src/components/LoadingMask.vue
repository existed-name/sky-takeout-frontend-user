<script setup>
/**
 * 局部加载遮罩（替代小程序的 loading 状态）。
 *
 * 默认覆盖父容器（父元素需为 position: relative 之类可定位元素）；
 * fullscreen 时改为固定定位覆盖整屏。
 */
import { Loading as VanLoading } from 'vant'

defineProps({
  /** 是否显示（建议命名传参，避免与原生 show 混淆） */
  loading: { type: Boolean, default: false },
  /** 提示文案 */
  text: { type: String, default: '加载中...' },
  /** 是否整屏覆盖 */
  fullscreen: { type: Boolean, default: false },
  /** 遮罩背景色 */
  background: { type: String, default: 'rgba(255, 255, 255, 0.7)' }
})
</script>

<template>
  <Transition name="loading-mask-fade">
    <div
      v-if="loading"
      class="loading-mask"
      :class="{ 'loading-mask--fullscreen': fullscreen }"
      :style="{ background }"
    >
      <div class="loading-mask__inner">
        <van-loading :size="22" :color="'var(--color-primary, #e95f3c)'" vertical>{{ text }}</van-loading>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.loading-mask {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-mask--fullscreen {
  position: fixed;
}

.loading-mask__inner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-mask-fade-enter-active,
.loading-mask-fade-leave-active {
  transition: opacity 0.2s ease;
}

.loading-mask-fade-enter-from,
.loading-mask-fade-leave-to {
  opacity: 0;
}
</style>
