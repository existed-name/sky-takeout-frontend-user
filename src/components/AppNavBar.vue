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
  /** 导航栏背景色：默认留空，由 CSS 回退到 --color-bg-card（颜色只能来自 variables.css） */
  background: { type: String, default: '' },
  /** 文字/图标颜色 */
  color: { type: String, default: '' }
})

const emit = defineEmits(['click-left', 'click-mine'])

/** 导航栏高度（与全局变量 --navbar-height 同值：改一处必须改两处） */
const NAVBAR_HEIGHT = '44px'
</script>

<template>
  <div class="app-navbar" :class="{ 'app-navbar--fixed': fixed }">
    <div
      class="app-navbar__bar"
      :style="{ height: NAVBAR_HEIGHT, background: background || undefined, color: color || undefined }"
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
/* 固定定位的参照系是「手机屏容器」而非浏览器视口：
   .app-phone 上的 transform 使其成为 position:fixed 后代的包含块，
   因此这里只需 left:0 / right:0，无需再写 left:50% + translateX(-50%) 的居中 hack。 */
.app-navbar--fixed .app-navbar__bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding-top: env(safe-area-inset-top, 0px);
  box-sizing: content-box;
  border-bottom: 1px solid var(--color-border);
}

.app-navbar__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  /* 背景默认值：不写字面量，颜色一律取自变量；调用方传了 background 时被内联样式覆盖 */
  background-color: var(--color-bg-card);
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
  transition: color var(--duration-fast) var(--ease-out);
}

.app-navbar__title {
  flex: 1 1 auto;
  overflow: hidden;
  color: inherit;
  font-size: var(--font-title);
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧入口文字：黄色在白底不可读，用琥珀橙 */
.app-navbar__mine {
  color: var(--color-accent);
  font-size: var(--font-base);
}
</style>
