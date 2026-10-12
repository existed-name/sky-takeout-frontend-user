<script setup>
/**
 * 应用根组件：路由出口整体放进「手机屏容器」（AppShell）。
 * 弹层统一挂到容器内的覆盖层（#app-overlay-layer），不再挂到 document.body。
 */
import AppShell from '@/components/AppShell.vue'
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
