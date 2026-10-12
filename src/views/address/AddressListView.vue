<script setup>
/**
 * 地址管理（路由 addressList，路径 /addresses）。
 *
 * 对齐小程序 pages/address/address：
 *   - 列表展示：标签（公司/家/学校）、省市区 + 详细地址、联系人 + 性别、手机号（分段显示）；
 *   - 「设为默认地址」→ PUT /user/address-books/{id}/default，成功后刷新列表；
 *   - 点击整块地址：来自结算页（?from=checkout）时 = 选中该地址并回结算页；
 *     其余来源（?from=mine 或空）点击不产生选中副作用，直接进入编辑；
 *   - 右上角铅笔 → 进入编辑；底部「+ 新增收货地址」→ 新增。
 *
 * 请求与失败提示一律走 @/api 与请求层：本页只做状态复位，不自己判 code、不自己弹失败提示。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button as VanButton, Icon as VanIcon } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import { getAddressList, setDefaultAddress } from '@/api/address'
import { useOrderDraftStore } from '@/stores/orderDraft'
import { formatPhone } from '@/utils/format'
import { notifyToast } from '@/utils/notify'

const route = useRoute()
const router = useRouter()
const orderDraft = useOrderDraftStore()

const list = ref([])
const loading = ref(false)
/** 正在提交「设为默认」的地址 id（用于单条按钮防重） */
const defaultPendingId = ref(null)

/** 是否「从结算页进入」——决定点击地址的行为 */
const isCheckoutPick = computed(() => route.query.from === 'checkout')

/** 当前来源查询串，供跳转/返回时透传，保证结算页来回不丢来源 */
const fromQuery = computed(() => (route.query.from ? { from: route.query.from } : {}))

/** 标签 code → 文案（后端 1 公司 / 2 家 / 3 学校） */
function labelText(label) {
  switch (String(label)) {
    case '1':
      return '公司'
    case '2':
      return '家'
    case '3':
      return '学校'
    default:
      return ''
  }
}

/** 性别 code → 文案（后端 1 男 / 2 女；历史脏数据 "0" 按男处理） */
function sexText(sex) {
  return String(sex) === '2' ? '女士' : '男士'
}

/** 省市区名称拼接（列表 VO 不含 code，只有名称） */
function regionName(item) {
  return `${item.provinceName || ''}${item.cityName || ''}${item.districtName || ''}`
}

/** 拉取地址列表 */
async function loadList() {
  loading.value = true
  try {
    const data = await getAddressList()
    list.value = Array.isArray(data) ? data : []
  } catch (e) {
    // 失败原因由请求层统一提示；这里仅保证不白屏
    list.value = []
  } finally {
    loading.value = false
  }
}

/** 点击地址主体：来自结算页 → 选中并返回；否则 → 进入编辑 */
function onCardClick(item) {
  if (isCheckoutPick.value) {
    orderDraft.setAddress(item)
    router.replace({ name: 'checkout' })
    return
  }
  goEdit(item.id)
}

/** 进入编辑页 */
function goEdit(id) {
  router.push({ name: 'addressEdit', params: { id: String(id) }, query: fromQuery.value })
}

/** 进入新增页 */
function goNew() {
  router.push({ name: 'addressNew', query: fromQuery.value })
}

/** 设为默认：成功刷新列表，失败由请求层提示、本地不改动（无假成功） */
async function onSetDefault(item) {
  if (item.isDefault === 1 || defaultPendingId.value !== null) return
  defaultPendingId.value = item.id
  try {
    await setDefaultAddress(item.id)
    notifyToast('默认地址设置成功')
    await loadList()
  } catch (e) {
    // 失败提示由请求层负责，无需本地回滚（本地未先行改动）
  } finally {
    defaultPendingId.value = null
  }
}

function goBack() {
  router.back()
}

onMounted(loadList)
</script>

<template>
  <div class="addr-list">
    <AppNavBar title="地址管理" show-back @click-left="goBack" />

    <div class="addr-list__body">
      <LoadingMask :loading="loading" />

      <template v-if="list.length > 0">
        <div v-for="item in list" :key="item.id" class="addr-card">
          <div class="addr-card__main" @click="onCardClick(item)">
            <div class="addr-card__line addr-card__line--addr">
              <span v-if="labelText(item.label)" class="addr-card__tag">
                {{ labelText(item.label) }}
              </span>
              <span class="addr-card__addr">{{ regionName(item) }}{{ item.detail }}</span>
            </div>
            <div class="addr-card__line addr-card__line--who">
              <span class="addr-card__name">{{ item.consignee }} {{ sexText(item.sex) }}</span>
              <span class="addr-card__phone">{{ formatPhone(item.phone) }}</span>
            </div>
          </div>

          <van-icon class="addr-card__edit" name="edit" @click.stop="goEdit(item.id)" />

          <div
            class="addr-card__footer"
            :class="{ 'is-pending': defaultPendingId === item.id }"
            @click="onSetDefault(item)"
          >
            <span class="addr-card__radio" :class="{ 'is-on': item.isDefault === 1 }">
              <van-icon :name="item.isDefault === 1 ? 'checked' : 'circle'" />
            </span>
            <span class="addr-card__default-text">设为默认地址</span>
          </div>
        </div>
      </template>

      <EmptyState
        v-else-if="!loading"
        icon="location-o"
        text="一个地址都没有哦"
        description="点击下方按钮新增收货地址"
      />
    </div>

    <div class="addr-list__bar">
      <van-button class="addr-list__add" type="primary" plain round block @click="goNew">
        <span class="addr-list__add-icon">+</span>新增收货地址
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.addr-list {
  position: relative;
  min-height: 100%;
  box-sizing: border-box;
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}

.addr-list__body {
  position: relative;
  padding: var(--gap-block) var(--gap-page) 0;
}

.addr-card {
  position: relative;
  margin-bottom: var(--gap-block);
  padding: 14px var(--gap-page) 0;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-md);
}

.addr-card__main {
  padding-right: 28px;
}

.addr-card__line {
  display: flex;
  align-items: center;
}

.addr-card__line--addr {
  align-items: flex-start;
}

.addr-card__tag {
  flex: none;
  margin-right: 8px;
  padding: 1px 6px;
  color: var(--color-accent);
  font-size: var(--font-sm);
  line-height: 18px;
  background-color: var(--color-primary-light);
  border-radius: var(--radius-xs);
}

.addr-card__addr {
  color: var(--color-text);
  font-size: var(--font-lg);
  line-height: 22px;
  word-break: break-all;
}

.addr-card__line--who {
  justify-content: space-between;
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.addr-card__edit {
  position: absolute;
  top: 14px;
  right: 10px;
  padding: 4px;
  color: var(--color-text-placeholder);
  font-size: var(--font-heading);
}

.addr-card__footer {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border);
}

.addr-card__footer.is-pending {
  opacity: 0.6;
}

.addr-card__radio {
  display: inline-flex;
  margin-right: 6px;
  color: var(--color-text-placeholder);
  font-size: var(--font-heading);
}

.addr-card__radio.is-on {
  color: var(--color-primary);
}

.addr-card__default-text {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.addr-list__bar {
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 50;
  width: 100%;
  box-sizing: border-box;
  padding: 14px var(--gap-page);
  padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  background-color: var(--color-bg);
}

.addr-list__add-icon {
  margin-right: 2px;
  font-size: var(--font-title);
  font-weight: 700;
}
</style>
