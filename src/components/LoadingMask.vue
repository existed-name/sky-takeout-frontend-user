<script setup>
/**
 * 局部加载遮罩（替代小程序的 loading 状态）。
 *
 * 默认覆盖父容器（父元素需为 position: relative 之类可定位元素）；
 * fullscreen 时改为固定定位 —— 因 .app-phone 的 transform 使其成为包含块，
 * 「整屏」语义自动变为「覆盖整个手机屏」（不再盖住桌布），这正是期望行为。
 */
import { Loading as VanLoading } from 'vant'

defineProps({
  /** 是否显示（建议命名传参，避免与原生 show 混淆） */
  loading: { type: Boolean, default: false },
  /** 提示文案 */
  text: { type: String, default: '加载中...' },
  /** 是否整屏覆盖（整屏 = 整个手机屏容器） */
  fullscreen: { type: Boolean, default: false },
  /** 遮罩背景色（默认取页面底色 #EFEFF4 的半透明版） */
  background: { type: String, default: 'rgba(239, 239, 244, 0.72)' }
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
        <van-loading :size="22" :color="'var(--color-primary)'" vertical>{{ text }}</van-loading>
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

/* fullscreen 的包含块是「手机屏容器」，语义从「整屏」变为「整个手机」 */
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
  transition: opacity var(--duration-fast) var(--ease-out);
}

.loading-mask-fade-enter-from,
.loading-mask-fade-leave-to {
  opacity: 0;
}
</style>
