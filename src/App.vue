<script setup>
// 应用根组件：仅承载路由出口。
// 全局弹层（Vant Dialog/Toast 等）由各自触发点通过 Teleport 挂到 body，无需在此宿主。
</script>

<template>
  <RouterView />
</template>
