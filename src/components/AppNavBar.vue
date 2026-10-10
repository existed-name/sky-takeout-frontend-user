<script setup>
/**
 * 自绘导航栏（替代小程序自定义导航栏）。
 *
 * 说明：小程序那套「胶囊高度计算」（uni.getMenuButtonBoundingClientRect）在 Web 上无对应物，
 * 此处直接丢弃，采用固定高度 + 顶部安全区（env(safe-area-inset-top)）。
 *
 * 用法：<AppNavBar title="个人中心" show-back @click-left="router.back()" />
 */
import { Icon as VanIcon } from 'vant'

defineProps({
  /** 标题文案 */
  title: { type: String, default: '' },
  /** 是否显示左侧返回箭头 */
  showBack: { type: Boolean, default: false },
  /** 是否显示右侧「我的」入口 */
  showMine: { type: Boolean, default: false },
  /** 右侧入口文案 */
  mineText: { type: String, default: '我的' },
  /** 是否固定在页面顶部 */
  fixed: { type: Boolean, default: true },
  /** 固定时是否用占位元素撑起同等高度（避免内容被遮挡） */
  placeholder: { type: Boolean, default: true },
  /** 导航栏背景色 */
  background: { type: String, default: '#ffffff' },
  /** 文字/图标颜色 */
  color: { type: String, default: '' }
})

const emit = defineEmits(['click-left', 'click-mine'])

/** 导航栏高度（与全局变量 --navbar-height 对齐） */
const NAVBAR_HEIGHT = '44px'
</script>

<template>
  <div class="app-navbar" :class="{ 'app-navbar--fixed': fixed }">
    <div
      class="app-navbar__bar"
      :style="{ height: NAVBAR_HEIGHT, background, color: color || undefined }"
    >
      <div class="app-navbar__left" @click="emit('click-left')">
        <slot name="left">
          <van-icon v-if="showBack" name="arrow-left" class="app-navbar__icon" />
        </slot>
      </div>

      <div class="app-navbar__title">
        <slot>{{ title }}</slot>
      </div>

      <div class="app-navbar__right" @click="emit('click-mine')">
        <slot name="right">
          <span v-if="showMine" class="app-navbar__mine">{{ mineText }}</span>
        </slot>
      </div>
    </div>

    <div
      v-if="fixed && placeholder"
      class="app-navbar__placeholder"
      :style="{ height: `calc(${NAVBAR_HEIGHT} + env(safe-area-inset-top, 0px))` }"
    />
  </div>
</template>

<style scoped>
.app-navbar--fixed .app-navbar__bar {
  position: fixed;
  top: 0;
  left: 50%;
  z-index: 100;
  width: 100%;
  max-width: var(--app-max-width, 480px);
  transform: translateX(-50%);
  padding-top: env(safe-area-inset-top, 0px);
  box-sizing: content-box;
  border-bottom: 1px solid var(--color-border, #eeeeee);
}

.app-navbar__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}

.app-navbar__left,
.app-navbar__right {
  display: flex;
  align-items: center;
  min-width: 44px;
  height: 100%;
  padding: 0 12px;
}

.app-navbar__right {
  justify-content: flex-end;
}

.app-navbar__icon {
  font-size: 20px;
}

.app-navbar__title {
  flex: 1 1 auto;
  overflow: hidden;
  color: inherit;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-navbar__mine {
  color: var(--color-primary, #e95f3c);
  font-size: 14px;
}
</style>
