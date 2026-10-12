<script setup>
/**
 * 无网络页（静态页）。
 *
 * 触发方式：全局监听 window 的 offline 事件（由首页等页面负责跳转过来）；
 * 本页监听 online 事件，网络恢复后自动回首页；也可点「点击刷新」手动回首页。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button as VanButton, Icon as VanIcon } from 'vant'

const router = useRouter()

function goHome() {
  router.replace('/')
}

function onOnline() {
  goHome()
}

onMounted(() => {
  window.addEventListener('online', onOnline)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <div class="offline">
    <van-icon class="offline__icon" name="warning-o" />
    <h1 class="offline__title">网络无法连接</h1>
    <p class="offline__desc">请检查您的网络设置后重试</p>

    <van-button class="offline__button" type="primary" round @click="goHome">
      点击刷新
    </van-button>

    <p class="offline__hint">网络恢复后会自动返回首页</p>
  </div>
</template>

<style scoped>
.offline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px 20px;
  box-sizing: border-box;
  text-align: center;
}

.offline__icon {
  color: var(--color-text-placeholder);
  font-size: 56px;
}

.offline__title {
  margin-top: 20px;
  color: var(--color-text);
  font-size: var(--font-heading);
  font-weight: 600;
}

.offline__desc {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: var(--font-base);
}

.offline__button {
  margin-top: 28px;
  min-width: 160px;
}

.offline__hint {
  margin-top: 16px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}
</style>
