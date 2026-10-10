<script setup>
/**
 * 体验登录页（替代微信授权登录）。
 *
 * 行为要点（方案 §5.1）：
 *   - 用户名 = 账号：后端按 openid = tourist_{name} 派生身份，同名即同账号；
 *     因此文案必须讲清「请使用自己的用户名」。
 *   - 必须预填上次用过的用户名（本地持久化）；从未登录过时随机生成一个「同学XXXX」开箱即用。
 *   - 输入长度限制 1–20 字符。
 *   - 提交期间禁用按钮（防重复提交）。
 *   - 登录失败时明确显示原因：请求层会弹出后端 msg / 网络异常文案，这里再补一条页内可见提示，
 *     不允许白屏或静默无反应。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button as VanButton, Field as VanField } from 'vant'

import { useAuthStore } from '@/stores/auth'
import { getLastLoginName } from '@/utils/storage'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 用户名长度上限（后端文档未给上限，这里是宽松兜底） */
const MAX_NAME_LENGTH = 20

const name = ref('')
const submitting = ref(false)
const errorMsg = ref('')

/** 随机生成一个默认用户名，保证开箱即用且多人不易撞名 */
function generateDefaultName() {
  const suffix = String(Math.floor(1000 + Math.random() * 9000))
  return `同学${suffix}`
}

onMounted(() => {
  // 预填上次用过的用户名；否则给随机默认值
  name.value = getLastLoginName() || generateDefaultName()
})

const trimmedName = computed(() => name.value.trim())
const canSubmit = computed(
  () =>
    !submitting.value &&
    trimmedName.value.length >= 1 &&
    trimmedName.value.length <= MAX_NAME_LENGTH
)

/** 从 query.redirect 解析安全的内站路径（拒绝 // 与登录页自身，防止开放重定向/打转） */
function resolveRedirect() {
  const raw = route.query.redirect
  const target = typeof raw === 'string' ? raw : ''
  if (target.startsWith('/') && !target.startsWith('//') && target !== '/login') {
    return target
  }
  return '/'
}

async function onSubmit() {
  if (submitting.value) return

  const value = trimmedName.value
  if (value.length < 1) {
    errorMsg.value = '请输入用户名'
    return
  }
  if (value.length > MAX_NAME_LENGTH) {
    errorMsg.value = `用户名请控制在 ${MAX_NAME_LENGTH} 个字符以内`
    return
  }

  errorMsg.value = ''
  submitting.value = true
  try {
    await auth.login(value)
    router.replace(resolveRedirect())
  } catch (e) {
    // 请求层已按契约弹过后端 msg（或网络异常文案），这里补页内可见提示，避免只有弹窗
    errorMsg.value = (e && e.msg) || '登录失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <h1 class="login__title">苍穹外卖</h1>
      <p class="login__subtitle">Web 用户端 · 体验登录</p>

      <p class="login__desc">
        输入一个用户名即可进入。用户名用于区分同学之间的购物车与订单——
        <strong>同一个用户名即同一个账号</strong>，请使用自己的用户名，不要填写他人的名字。
      </p>

      <form class="login__form" @submit.prevent="onSubmit">
        <van-field
          v-model="name"
          class="login__field"
          label="用户名"
          placeholder="请输入用户名（1-20 个字符）"
          :maxlength="MAX_NAME_LENGTH"
          clearable
          autocomplete="off"
        />

        <p v-if="errorMsg" class="login__error">{{ errorMsg }}</p>

        <van-button
          class="login__submit"
          type="primary"
          native-type="submit"
          block
          round
          :loading="submitting"
          :disabled="!canSubmit"
          loading-text="登录中..."
        >
          进入
        </van-button>
      </form>

      <p class="login__hint">已记住上次使用的用户名，下次进入会自动填好。</p>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px 20px;
  box-sizing: border-box;
}

.login__card {
  width: 100%;
  max-width: 400px;
  padding: 32px 24px;
  background-color: var(--color-bg-card);
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
}

.login__title {
  color: var(--color-primary);
  font-size: 26px;
  font-weight: 700;
  text-align: center;
}

.login__subtitle {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 14px;
  text-align: center;
}

.login__desc {
  margin-top: 20px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.login__desc strong {
  color: var(--color-primary);
}

.login__form {
  margin-top: 20px;
}

.login__field {
  padding: 10px 0;
}

.login__error {
  margin-top: 8px;
  color: var(--color-danger);
  font-size: 13px;
}

.login__submit {
  margin-top: 16px;
}

.login__hint {
  margin-top: 16px;
  color: var(--color-text-placeholder);
  font-size: 12px;
  text-align: center;
}
</style>
