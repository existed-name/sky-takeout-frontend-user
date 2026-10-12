<script setup>
/**
 * 手机屏容器（壳层）。
 *
 * DOM 结构：.app-stage > .app-phone > (.app-phone__scroll + #app-overlay-layer)
 *   - .app-phone__scroll：路由页面的滚动容器（页面内所有 100% 高度都相对它解析）；
 *   - #app-overlay-layer：所有弹层的挂载点（Vant 组件式 / 函数式 + 自绘 fixed 元素）。
 *
 * ★ 关键原理（不许改）★
 *   .app-phone 上有一条 `transform: translateZ(0)`。当元素的 transform 非 none 时，
 *   它的 padding box 会成为**所有 position: fixed 后代的包含块** —— 于是弹层、吸底条、
 *   遮罩全部以「手机」为参照系，天然与手机等宽、贴手机底，不会铺满整个浏览器窗口。
 *   删掉它 = 整套「弹层等宽」方案失效。
 *
 *   ⚠ 头号红线：页面里**不得**再给任何祖先元素加 transform / filter /
 *     will-change: transform / opacity<1，否则它会成为更近的包含块，弹层会跑偏或被裁。
 *
 * 容器相关样式统一放在 styles/index.css（.app-stage / .app-phone / .app-phone__scroll /
 * .app-phone__layer），此处不写 scoped 样式。
 */
</script>

<template>
  <div class="app-stage">
    <div class="app-phone">
      <div class="app-phone__scroll">
        <slot />
      </div>
      <!-- 弹层挂载点：0×0、不拦点击、不裁子元素；随应用常驻，不得做成按需渲染（v-if） -->
      <div id="app-overlay-layer" class="app-phone__layer" />
    </div>
  </div>
</template>
