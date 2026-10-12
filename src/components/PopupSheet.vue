<script setup>
/**
 * 底部弹层基座（规格 / 送达时间 / 餐具 / 购物车共用）。
 *
 * 基于 Vant 的 Popup（position: bottom）封装，统一圆角、标题栏、安全区与内边距。
 * 用法：<PopupSheet v-model:show="visible" title="选择规格"> ... </PopupSheet>
 *
 * 弹层挂载：teleport 到「手机屏容器」内的 #app-overlay-layer（constants/layout.js）。
 * 因 .app-phone 的 transform 使其成为包含块，弹层自动与手机等宽、贴手机底，
 * 不会铺满整个浏览器窗口。
 */
import { computed } from 'vue'
import { Popup as VanPopup, Icon as VanIcon } from 'vant'
import { OVERLAY_TARGET } from '@/constants/layout'

const props = defineProps({
  /** 是否显示；配合 v-model:show 使用 */
  show: { type: Boolean, default: false },
  /** 标题文案 */
  title: { type: String, default: '' },
  /** 是否显示右上角关闭按钮 */
  closeable: { type: Boolean, default: true },
  /** 是否圆角 */
  round: { type: Boolean, default: true },
  /** 是否适配底部安全区 */
  safeAreaInsetBottom: { type: Boolean, default: true },
  /**
   * 内容区最大高度（超出滚动）。
   * 默认用百分比：百分比按包含块（= 手机）解析，不能用 vh —— 桌面窗口可能远高于手机，
   * 60vh 会算出比手机还高的值，导致弹层顶部被裁掉。
   */
  maxHeight: { type: [String, Number], default: '80%' },
  /** 点击遮罩是否关闭 */
  closeOnClickOverlay: { type: Boolean, default: true }
})

const emit = defineEmits(['update:show', 'open', 'close', 'click-close'])

/**
 * 弹层根样式：
 *   - max-height 挂在弹层根上（挂到 __body 会因父级高度 auto 导致百分比失效）；
 *   - 显式设为 flex 纵向布局并 overflow:hidden，覆盖 Vant .van-popup 默认的 overflow-y:auto，
 *     从而让 __body 承担滚动（而不是整个弹层连标题一起滚）。
 */
const popupStyle = computed(() => ({
  maxHeight: typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : props.maxHeight,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  ...(props.round ? null : { borderRadius: '0' })
}))

function onShowChange(val) {
  emit('update:show', val)
}

function onCloseClick() {
  emit('click-close')
  emit('update:show', false)
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    :round="round"
    :style="popupStyle"
    :safe-area-inset-bottom="safeAreaInsetBottom"
    :close-on-click-overlay="closeOnClickOverlay"
    :teleport="OVERLAY_TARGET"
    class="popup-sheet"
    @update:show="onShowChange"
    @open="emit('open')"
    @close="emit('close')"
  >
    <div class="popup-sheet__inner">
      <header v-if="title || $slots.header" class="popup-sheet__header">
        <slot name="header">
          <span class="popup-sheet__title">{{ title }}</span>
        </slot>
        <van-icon
          v-if="closeable"
          class="popup-sheet__close"
          name="cross"
          @click="onCloseClick"
        />
      </header>

      <div class="popup-sheet__body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="popup-sheet__footer">
        <slot name="footer" />
      </footer>
    </div>
  </van-popup>
</template>

<style scoped>
/* 根节点由 Vant 渲染为 .van-popup.popup-sheet，尺寸约束走上面的 popupStyle */
.popup-sheet__inner {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0; /* 允许子项收缩，__body 才能滚动 */
}

.popup-sheet__header {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 44px;
  border-bottom: 1px solid var(--color-border);
}

.popup-sheet__title {
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
}

.popup-sheet__close {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  padding: 6px;
  color: var(--color-text-placeholder);
  font-size: 18px;
}

.popup-sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.popup-sheet__footer {
  flex: none;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border);
  background-color: var(--color-bg-card);
}
</style>
