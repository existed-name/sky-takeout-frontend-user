<script setup>
/**
 * 底部弹层基座（规格 / 送达时间 / 餐具 / 购物车共用）。
 *
 * 基于 Vant 的 Popup（position: bottom）封装，统一圆角、标题栏、安全区与内边距。
 * 用法：<PopupSheet v-model:show="visible" title="选择规格"> ... </PopupSheet>
 */
import { Popup as VanPopup, Icon as VanIcon } from 'vant'

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
  /** 内容区最大高度（超出滚动） */
  maxHeight: { type: [String, Number], default: '75vh' },
  /** 点击遮罩是否关闭 */
  closeOnClickOverlay: { type: Boolean, default: true }
})

const emit = defineEmits(['update:show', 'open', 'close', 'click-close'])

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
    :safe-area-inset-bottom="safeAreaInsetBottom"
    :close-on-click-overlay="closeOnClickOverlay"
    :style="round ? null : 'border-radius: 0'"
    class="popup-sheet"
    teleport="body"
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

      <div class="popup-sheet__body" :style="{ maxHeight: typeof maxHeight === 'number' ? maxHeight + 'px' : maxHeight }">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="popup-sheet__footer">
        <slot name="footer" />
      </footer>
    </div>
  </van-popup>
</template>

<style scoped>
.popup-sheet__inner {
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.popup-sheet__header {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 44px;
  border-bottom: 1px solid var(--color-border, #eeeeee);
}

.popup-sheet__title {
  color: var(--color-text, #333333);
  font-size: 16px;
  font-weight: 600;
}

.popup-sheet__close {
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  padding: 6px;
  color: var(--color-text-placeholder, #999999);
  font-size: 18px;
}

.popup-sheet__body {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.popup-sheet__footer {
  flex: none;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border, #eeeeee);
  background-color: var(--color-bg-card, #ffffff);
}
</style>
