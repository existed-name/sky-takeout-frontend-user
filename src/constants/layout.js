/**
 * 布局契约常量（唯一真源，禁止在别处硬编码同样的字符串）。
 */

/**
 * 弹层挂载点选择器。
 *
 * 必须与 components/AppShell.vue 里该元素的 id 逐字一致（#app-overlay-layer）。
 *
 * ⚠ 该挂载点随 AppShell 常驻挂载，**禁止**把它改成按需渲染（v-if）：
 *   目标不存在时 Vue 只会打印 "Invalid Teleport target on mount" 警告，
 *   弹层**什么都不渲染**（界面上完全不出现），属最难排查的一类故障。
 *
 * 用法：
 *   - 组件式弹层（PopupSheet）显式传 :teleport="OVERLAY_TARGET"；
 *   - 函数式弹层（Vant Dialog / Toast）由 main.js 顶层调用
 *     setDialogDefaultOptions / setToastDefaultOptions 统一设置。
 */
export const OVERLAY_TARGET = '#app-overlay-layer'
