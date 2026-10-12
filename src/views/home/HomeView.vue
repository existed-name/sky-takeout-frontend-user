<script setup>
/**
 * 首页点餐（路由 home，路径 /）。
 *
 * 对齐小程序 pages/index/index，是全站最复杂的一页。组成：
 *   1) 店铺信息区：名称 / 描述 / 地址 / 距离 / 配送费 / 预计时长 —— 均为本地常量（后端只有营业状态一个接口）；
 *   2) 营业状态 + 打烊遮罩（吃掉页面全部点击，仅放行「重新加载」，且只重查营业状态）；
 *   3) 左边分类、右边菜品/套餐列表（切换分类按需拉取 + 页面内缓存，不做预取）；
 *   4) 菜品详情弹层 / 规格弹层（flavors[].value 是 JSON 数组字符串，需 JSON.parse）/ 购物车弹层（按商品分组）；
 *   5) 底部结算条（合计只算 Σ 份数×单价，另有一行费用说明）；
 *   6) 拨打门店电话（移动端 tel:，桌面端退化为展示 + 复制）；
 *   7) 断网跳 /offline；回到前台刷新营业状态。
 *
 * 约束：请求一律走 src/api/**；金额一律走 utils/money.js（经 MoneyText / cart store）；
 *       不在此文件里判 code、不自己弹失败提示（请求层已统一处理）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import CartBar from '@/components/CartBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import MoneyText from '@/components/MoneyText.vue'
import PopupSheet from '@/components/PopupSheet.vue'

import { getCategories } from '@/api/category'
import { getDishesByCategory } from '@/api/dish'
import { getSetmealsByCategory, getSetmealDishes } from '@/api/setmeal'

import { useCartStore } from '@/stores/cart'
import { useShopStore } from '@/stores/shop'
import {
  DELIVERY_FEE_YUAN,
  PACK_FEE_PER_ITEM_YUAN,
  SHOP_INFO,
  SHOP_PHONE
} from '@/constants/business'
import { notifyToast } from '@/utils/notify'

/** 分类类型：1 = 菜品，2 = 套餐 */
const TYPE_DISH = 1
const TYPE_SETMEAL = 2

const router = useRouter()
const shop = useShopStore()
const cart = useCartStore()

/* ------------------------------ 分类 / 列表 ------------------------------ */

/** 分类列表（菜品与套餐混合） */
const categories = ref([])
/** 当前选中分类下标 */
const categoryIndex = ref(0)
/** 分类项按需缓存：{ [categoryId]: { loaded: boolean, type: number, items: Array } } */
const categoryCache = reactive({})
/** 分类/列表加载中（覆盖右侧面板） */
const listLoading = ref(false)

const currentCategory = computed(() => categories.value[categoryIndex.value] || null)

/** 当前分类下的条目（未加载过则为空数组） */
const currentItems = computed(() => {
  const cat = currentCategory.value
  if (!cat) return []
  const cached = categoryCache[cat.id]
  return cached ? cached.items : []
})

/** 给列表条目补一个 __type 字段，便于区分菜品/套餐（不改后端返回对象，用浅拷贝） */
function normalizeItems(items, type) {
  return (items || []).map((it) => ({ ...it, __type: type }))
}

/**
 * 按需加载某分类的条目并写入缓存。
 * @param {{id:number, type:number}} cat
 */
async function ensureCategoryLoaded(cat) {
  if (!cat) return
  const cached = categoryCache[cat.id]
  if (cached && cached.loaded) return

  const items =
    cat.type === TYPE_SETMEAL
      ? await getSetmealsByCategory(cat.id)
      : await getDishesByCategory(cat.id)

  categoryCache[cat.id] = { loaded: true, type: cat.type, items: normalizeItems(items, cat.type) }
}

/** 首屏：拉分类 + 拉第一个分类的条目 */
async function initCategories() {
  listLoading.value = true
  try {
    const list = await getCategories()
    categories.value = Array.isArray(list) ? list : []
    if (categories.value.length > 0) {
      categoryIndex.value = 0
      try {
        await ensureCategoryLoaded(categories.value[0])
      } catch (e) {
        // 加载失败：请求层已弹提示，这里保持空态
      }
    }
  } catch (e) {
    // 分类拉取失败：请求层已弹提示
  } finally {
    listLoading.value = false
  }
}

/** 切换分类：命中缓存则直接展示，否则按需拉取 */
async function onCategoryClick(index) {
  if (index === categoryIndex.value) return
  categoryIndex.value = index
  const cat = categories.value[index]
  if (!cat) return
  const cached = categoryCache[cat.id]
  if (cached && cached.loaded) return

  listLoading.value = true
  try {
    await ensureCategoryLoaded(cat)
  } catch (e) {
    // 请求层已弹提示
  } finally {
    listLoading.value = false
  }
}

/* ------------------------------ 购物车数量映射 ------------------------------ */

/** 菜品/套餐 id → 已购份数（用于列表与详情里的加减按钮） */
const itemCountMap = computed(() => {
  const map = {}
  for (const it of cart.items) {
    if (it.dishId !== null && it.dishId !== undefined) {
      const key = `d${it.dishId}`
      map[key] = (map[key] || 0) + (Number(it.number) || 0)
    }
    if (it.setmealId !== null && it.setmealId !== undefined) {
      const key = `s${it.setmealId}`
      map[key] = (map[key] || 0) + (Number(it.number) || 0)
    }
  }
  return map
})

/** 某条目的已购份数 */
function countOf(item) {
  const key = item.__type === TYPE_SETMEAL ? `s${item.id}` : `d${item.id}`
  return itemCountMap.value[key] || 0
}

/** 是否有规格（套餐无规格） */
function hasFlavors(item) {
  return item.__type !== TYPE_SETMEAL && Array.isArray(item.flavors) && item.flavors.length > 0
}

/** 找无规格条目的购物车行（无规格时同菜品/套餐只有一行） */
function findRowOfUnflavored(item) {
  if (item.__type === TYPE_SETMEAL) {
    return cart.items.find((it) => it.setmealId === item.id)
  }
  return cart.items.find((it) => it.dishId === item.id)
}

/* ------------------------------ 加减购物车 ------------------------------ */

async function addItem(item, dishFlavor = null) {
  try {
    if (item.__type === TYPE_SETMEAL) {
      await cart.add({ setmealId: item.id })
    } else {
      await cart.add({ dishId: item.id, dishFlavor })
    }
  } catch (e) {
    // 加购请求本身失败（非静默端点）由请求层弹提示；
    // 仅当加购成功、回灌失败（静默的 GET）时，才在这里补一次轻提示
    if (e && e.stage === 'refresh') notifyToast('购物车刷新失败，请稍后重试')
  }
}

async function decrementItem(item) {
  const row = findRowOfUnflavored(item)
  if (!row) return
  try {
    await cart.decrement(row.id)
  } catch (e) {
    // 减购请求本身失败（非静默端点）由请求层弹提示；
    // 仅当减购成功、回灌失败（静默的 GET）时，才在这里补一次轻提示
    if (e && e.stage === 'refresh') notifyToast('购物车刷新失败，请稍后重试')
  }
}

async function addRow(row) {
  try {
    if (row.setmealId !== null && row.setmealId !== undefined) {
      await cart.add({ setmealId: row.setmealId })
    } else {
      await cart.add({ dishId: row.dishId, dishFlavor: row.dishFlavor || null })
    }
  } catch (e) {
    // 加购请求本身失败（非静默端点）由请求层弹提示；
    // 仅当加购成功、回灌失败（静默的 GET）时，才在这里补一次轻提示
    if (e && e.stage === 'refresh') notifyToast('购物车刷新失败，请稍后重试')
  }
}

async function decrementRow(row) {
  try {
    await cart.decrement(row.id)
  } catch (e) {
    // 减购请求本身失败（非静默端点）由请求层弹提示；
    // 仅当减购成功、回灌失败（静默的 GET）时，才在这里补一次轻提示
    if (e && e.stage === 'refresh') notifyToast('购物车刷新失败，请稍后重试')
  }
}

/** 购物车弹层：按商品名分组 */
const cartGroups = computed(() => {
  const groups = []
  const byName = new Map()
  for (const it of cart.items) {
    const key = it.name || '其他'
    let group = byName.get(key)
    if (!group) {
      group = { name: key, rows: [] }
      byName.set(key, group)
      groups.push(group)
    }
    group.rows.push(it)
  }
  return groups
})

/** 清空购物车（先确认，避免误触） */
async function onClearCart() {
  try {
    await showConfirmDialog({ title: '清空购物车', message: '确定要清空购物车吗？' })
  } catch (e) {
    return // 用户取消
  }
  try {
    await cart.clear()
  } catch (e) {
    // 请求层已弹提示
  }
}

/* ------------------------------ 弹层：规格 / 详情 / 购物车 ------------------------------ */

const specVisible = ref(false)
const specDish = ref(null)
/** 规格解析结果：Array<{ name, options: string[] }> */
const specFlavors = ref([])
/** 每个规格行选中的值（单选） */
const specSelections = ref([])

const detailVisible = ref(false)
const detailItem = ref(null)
const detailSetmealDishes = ref([])
const detailLoading = ref(false)

const cartVisible = ref(false)

/**
 * 解析 flavors[].value。后端返回的是「JSON 数组字符串」，例如 '["无糖","少糖"]'。
 * 容错：已是数组则直接用；解析失败则退回按逗号切分。
 */
function parseFlavorValue(value) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string' || value.trim() === '') return []
  try {
    const arr = JSON.parse(value)
    return Array.isArray(arr) ? arr.map(String) : []
  } catch (e) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
}

function openSpec(item) {
  specDish.value = item
  const flavors = Array.isArray(item.flavors) ? item.flavors : []
  specFlavors.value = flavors.map((f) => ({ name: f.name, options: parseFlavorValue(f.value) }))
  specSelections.value = specFlavors.value.map(() => '')
  specVisible.value = true
}

/** 规格行内单选：再次点击同一项取消选择 */
function selectFlavor(flavorIndex, option) {
  const next = specSelections.value.slice()
  next[flavorIndex] = next[flavorIndex] === option ? '' : option
  specSelections.value = next
}

async function confirmSpec() {
  if (specSelections.value.some((v) => !v)) {
    notifyToast('请选择规格')
    return
  }
  const item = specDish.value
  const dishFlavor = specSelections.value.join(',')
  specVisible.value = false
  await addItem(item, dishFlavor)
}

async function openDetail(item) {
  detailItem.value = item
  detailVisible.value = true
  detailSetmealDishes.value = []
  if (item.__type === TYPE_SETMEAL) {
    detailLoading.value = true
    try {
      const list = await getSetmealDishes(item.id)
      detailSetmealDishes.value = Array.isArray(list) ? list : []
    } catch (e) {
      // 请求层已弹提示
    } finally {
      detailLoading.value = false
    }
  }
}

function openCart() {
  cartVisible.value = true
}

// 详情里点「选择规格」：先关详情，再开规格
function openSpecFromDetail() {
  const item = detailItem.value
  if (!item) return
  detailVisible.value = false
  openSpec(item)
}

/* ------------------------------ 营业状态 / 打烊遮罩 ------------------------------ */

const reloading = ref(false)

/** 营业状态徽标文案：status 为 null（尚未查询/查询失败）时不能误报「休息中」 */
const shopStatusText = computed(() => {
  if (shop.status === null) return '状态未知'
  return shop.isOpen ? '营业中' : '休息中'
})

/** 营业状态徽标样式类：null 走第三态（灰底），避免与「休息中」混同 */
const shopStatusClass = computed(() => {
  if (shop.status === null) return 'shop__status--unknown'
  return shop.isOpen ? 'shop__status--open' : 'shop__status--closed'
})

/** 「重新加载」：只重查营业状态；不放宽遮罩对其它区域的拦截 */
async function reloadShopStatus() {
  if (reloading.value) return
  reloading.value = true
  const ok = await shop.refresh()
  reloading.value = false

  if (!ok) {
    // 查询失败：给出可见反馈（店铺状态端点是静默的，不会自动弹）
    notifyToast(shop.error || '暂时无法获取店铺状态，请检查网络后重试')
  } else if (shop.isClosed) {
    // 查询成功但仍是打烊：停留提示，避免用户以为按钮没生效
    notifyToast('店铺仍在休息中')
  }
  // 查询成功且已营业：isClosed 变 false，遮罩自动消失，无需额外提示
}

/** 回到前台（可见性变化）时刷新营业状态 */
function onVisibilityChange() {
  if (!document.hidden) {
    shop.refresh()
  }
}

/* ------------------------------ 电话 ------------------------------ */

const phoneVisible = ref(false)

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPod|iPad|HarmonyOS|Mobile/i.test(navigator.userAgent)
}

/** 移动端用 tel: 直接拨号；桌面端浏览器多半无法处理 tel:，退化为弹层展示 + 复制 */
function onCallPhone() {
  if (isMobileDevice()) {
    window.location.href = `tel:${SHOP_PHONE}`
  } else {
    phoneVisible.value = true
  }
}

async function copyPhone() {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(SHOP_PHONE)
    } else {
      const ta = document.createElement('textarea')
      ta.value = SHOP_PHONE
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    notifyToast('号码已复制')
  } catch (e) {
    notifyToast(`号码：${SHOP_PHONE}（复制失败，请手动复制）`)
  }
}

/* ------------------------------ 断网 / 结算 ------------------------------ */

function goOffline() {
  router.replace('/offline')
}

function goCheckout() {
  if (cart.count <= 0) {
    notifyToast('请先选择商品')
    return
  }
  router.push('/checkout')
}

function goMine() {
  router.push('/mine')
}

/* ------------------------------ 生命周期 ------------------------------ */

onMounted(() => {
  shop.refresh().then((ok) => {
    // 首屏首次查营业状态失败：端点是静默的，不会自动弹，这里补一次可见反馈
    if (!ok) notifyToast(shop.error || '暂时无法获取店铺状态，请检查网络后重试')
  })
  cart.refresh().catch(() => {
    // 静默端点，失败由空态体现
  })
  initCategories()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('offline', goOffline)

  // 首屏即处于断网状态时直接跳转
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    goOffline()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('offline', goOffline)
})
</script>

<template>
  <div class="home">
    <AppNavBar title="苍穹外卖" show-mine @click-mine="goMine" />

    <!-- 店铺信息区（除营业状态外，全部为本地常量） -->
    <section class="shop">
      <div class="shop__top">
        <div class="shop__name-row">
          <span class="shop__name">{{ SHOP_INFO.name }}</span>
          <span class="shop__status" :class="shopStatusClass">
            {{ shopStatusText }}
          </span>
        </div>
        <div class="shop__meta">
          <span class="shop__meta-item">距离{{ SHOP_INFO.distance }}</span>
          <span class="shop__meta-item">{{ SHOP_INFO.deliveryFeeText }}</span>
          <span class="shop__meta-item">预计时长{{ SHOP_INFO.estimatedDuration }}</span>
        </div>
      </div>

      <div class="shop__bottom">
        <div class="shop__bottom-left">
          <p class="shop__desc">{{ SHOP_INFO.description }}</p>
          <p class="shop__address">{{ SHOP_INFO.address }}</p>
        </div>
        <button class="shop__phone" type="button" @click="onCallPhone">
          <van-icon name="phone-o" />
        </button>
      </div>
    </section>

    <!-- 分类 + 条目列表 -->
    <div class="home__body">
      <aside class="menu-types">
        <div
          v-for="(cat, index) in categories"
          :key="cat.id"
          class="menu-types__item"
          :class="{ 'menu-types__item--active': index === categoryIndex }"
          @click="onCategoryClick(index)"
        >
          <span class="menu-types__text">{{ cat.name }}</span>
        </div>
      </aside>

      <main class="menu-list">
        <LoadingMask :loading="listLoading" text="加载中..." />

        <div v-for="item in currentItems" :key="`${item.__type}-${item.id}`" class="dish">
          <div class="dish__img" @click="openDetail(item)">
            <img :src="item.image" :alt="item.name" loading="lazy" />
          </div>

          <div class="dish__main">
            <div class="dish__name" @click="openDetail(item)">{{ item.name }}</div>
            <div class="dish__desc" @click="openDetail(item)">
              {{ item.description || item.name }}
            </div>
            <div class="dish__sales">月销量0</div>

            <div class="dish__bottom">
              <MoneyText :value="item.price" size="var(--font-heading)" color="var(--color-price)" bold />

              <div class="dish__actions">
                <template v-if="hasFlavors(item)">
                  <button class="spec-btn" type="button" @click="openSpec(item)">选择规格</button>
                </template>
                <template v-else>
                  <span v-if="countOf(item) > 0" class="dish__count">{{ countOf(item) }}</span>
                  <button
                    v-if="countOf(item) > 0"
                    class="round-btn round-btn--minus"
                    type="button"
                    @click="decrementItem(item)"
                  >
                    <van-icon name="minus" />
                  </button>
                  <button class="round-btn round-btn--plus" type="button" @click="addItem(item)">
                    <van-icon name="plus" />
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!listLoading && categories.length > 0 && currentItems.length === 0"
          text="该分类下暂无菜品"
          icon="records"
        />
        <EmptyState
          v-if="!listLoading && categories.length === 0"
          text="暂无可选分类"
          description="请稍后重试或重新加载店铺状态"
          icon="records"
        />
      </main>
    </div>

    <!-- 底部结算条 -->
    <CartBar
      :count="cart.count"
      :amount="cart.goodsSubtotal"
      :delivery-fee="DELIVERY_FEE_YUAN"
      :packing-fee-per-item="PACK_FEE_PER_ITEM_YUAN"
      :disabled="cart.count <= 0"
      @click-cart="openCart"
      @checkout="goCheckout"
    />

    <!-- 规格弹层 -->
    <PopupSheet v-model:show="specVisible" title="选择规格">
      <div v-if="specDish" class="spec">
        <div class="spec__dish">{{ specDish.name }}</div>
        <div v-for="(flavor, fi) in specFlavors" :key="fi" class="spec__row">
          <div class="spec__label">{{ flavor.name }}</div>
          <div class="spec__options">
            <button
              v-for="(opt, oi) in flavor.options"
              :key="oi"
              type="button"
              class="spec__option"
              :class="{ 'spec__option--active': specSelections[fi] === opt }"
              @click="selectFlavor(fi, opt)"
            >
              {{ opt }}
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <div v-if="specDish" class="spec__footer">
          <MoneyText :value="specDish.price" size="var(--font-heading)" color="var(--color-price)" bold />
          <van-button type="primary" round size="small" @click="confirmSpec">
            加入购物车
          </van-button>
        </div>
      </template>
    </PopupSheet>

    <!-- 菜品 / 套餐详情弹层 -->
    <PopupSheet v-model:show="detailVisible" title="商品详情" max-height="80%">
      <div v-if="detailItem" class="detail">
        <template v-if="detailItem.__type === 1">
          <img class="detail__image" :src="detailItem.image" :alt="detailItem.name" />
          <div class="detail__name">{{ detailItem.name }}</div>
          <div class="detail__desc">{{ detailItem.description }}</div>
        </template>

        <template v-else>
          <div class="detail__name detail__name--center">{{ detailItem.name }}</div>
          <LoadingMask :loading="detailLoading" text="加载中..." />
          <div v-for="(sd, si) in detailSetmealDishes" :key="si" class="detail__setmeal-item">
            <img class="detail__setmeal-img" :src="sd.image" :alt="sd.name" loading="lazy" />
            <div class="detail__setmeal-info">
              <div class="detail__setmeal-name">{{ sd.name }} <span>×{{ sd.copies }}</span></div>
              <div class="detail__setmeal-desc">{{ sd.description }}</div>
            </div>
          </div>
        </template>
      </div>

      <template #footer>
        <div v-if="detailItem" class="detail__footer">
          <MoneyText :value="detailItem.price" size="var(--font-heading)" color="var(--color-price)" bold />
          <button
            v-if="hasFlavors(detailItem)"
            class="spec-btn"
            type="button"
            @click="openSpecFromDetail"
          >
            选择规格
          </button>
          <div v-else class="detail__actions">
            <span v-if="countOf(detailItem) > 0" class="dish__count">{{ countOf(detailItem) }}</span>
            <button
              v-if="countOf(detailItem) > 0"
              class="round-btn round-btn--minus"
              type="button"
              @click="decrementItem(detailItem)"
            >
              <van-icon name="minus" />
            </button>
            <button class="round-btn round-btn--plus" type="button" @click="addItem(detailItem)">
              <van-icon name="plus" />
            </button>
          </div>
        </div>
      </template>
    </PopupSheet>

    <!-- 购物车弹层（按商品分组） -->
    <PopupSheet v-model:show="cartVisible" title="购物车" max-height="60%">
      <div class="cart-pop">
        <div class="cart-pop__toolbar">
          <button class="cart-pop__clear" type="button" @click="onClearCart">
            <van-icon name="delete-o" />
            <span>清空</span>
          </button>
        </div>

        <EmptyState v-if="cart.items.length === 0" text="购物车还是空的" icon="shopping-cart-o" />

        <div v-for="(group, gi) in cartGroups" :key="gi" class="cart-pop__group">
          <div class="cart-pop__group-name">{{ group.name }}</div>
          <div v-for="row in group.rows" :key="row.id" class="cart-row">
            <img class="cart-row__img" :src="row.image" :alt="row.name" loading="lazy" />
            <div class="cart-row__info">
              <div class="cart-row__name">{{ row.name }}</div>
              <div v-if="row.dishFlavor" class="cart-row__flavor">{{ row.dishFlavor }}</div>
              <div class="cart-row__bottom">
                <MoneyText :value="row.amount" size="var(--font-base)" color="var(--color-price)" />
                <div class="cart-row__actions">
                  <button
                    class="round-btn round-btn--minus"
                    type="button"
                    @click="decrementRow(row)"
                  >
                    <van-icon name="minus" />
                  </button>
                  <span class="dish__count">{{ row.number }}</span>
                  <button class="round-btn round-btn--plus" type="button" @click="addRow(row)">
                    <van-icon name="plus" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PopupSheet>

    <!-- 电话弹层（桌面端退化） -->
    <PopupSheet v-model:show="phoneVisible" title="联系商家">
      <div class="phone">
        <p class="phone__label">门店电话</p>
        <p class="phone__number">{{ SHOP_PHONE }}</p>
        <p class="phone__hint">桌面端浏览器通常无法直接拨号，可复制号码后再拨打。</p>
      </div>
      <template #footer>
        <van-button type="primary" block round @click="copyPhone">复制号码</van-button>
      </template>
    </PopupSheet>

    <!-- 打烊遮罩：吃掉页面全部点击，仅放行「重新加载」 -->
    <div v-if="shop.isClosed" class="closed" @click.stop>
      <div class="closed__card">
        <van-icon class="closed__icon" name="closed-eye" />
        <p class="closed__title">本店已打烊</p>
        <van-button
          class="closed__reload"
          type="primary"
          round
          :loading="reloading"
          loading-text="加载中..."
          @click="reloadShopStatus"
        >
          重新加载
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: var(--color-bg);
}

/* ---------- 店铺信息区 ---------- */
/* 悬浮信息卡：全站唯一允许带阴影的卡（圆角 8px + --shadow-card） */
.shop {
  flex: none;
  margin: 8px 10px 0;
  padding: 12px;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

.shop__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shop__name {
  color: var(--color-text);
  font-size: var(--font-heading);
  font-weight: 700;
}

.shop__status {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  font-size: var(--font-sm);
}

/* 营业中：绿底白字（绿底对比度足够，白字可读；黄底才必须配深字） */
.shop__status--open {
  background-color: var(--color-success);
  color: var(--color-text-inverse);
}

.shop__status--closed {
  background-color: var(--color-bg-muted);
  color: var(--color-text-secondary);
}

/* 第三态：尚未查到 / 查询失败，灰底灰字，避免误显示成「休息中」 */
.shop__status--unknown {
  background-color: var(--color-bg-muted);
  color: var(--color-text-placeholder);
}

.shop__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.shop__bottom {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}

.shop__bottom-left {
  flex: 1 1 auto;
  min-width: 0;
}

.shop__desc {
  color: var(--color-text-secondary);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.shop__address {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.shop__phone {
  flex: none;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--font-sheet);
  cursor: pointer;
}

/* ---------- 主体：左分类 + 右列表 ---------- */
.home__body {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
  margin-top: 8px;
  /* 为底部 CartBar 预留：52(视觉高) + 12(悬浮偏移) + 12(间距) + 安全区 */
  padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.menu-types {
  flex: none;
  width: 88px;
  overflow-y: auto;
  background-color: var(--color-bg-side);
}

.menu-types__item {
  padding: 14px 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  text-align: center;
  cursor: pointer;
  /* 分类选中：底色与字色 0.2s 过渡 */
  transition: background-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

.menu-types__item--active {
  background-color: var(--color-bg-card);
  color: var(--color-primary);
  font-weight: 600;
}

.menu-types__text {
  display: inline-block;
  word-break: break-all;
}

.menu-list {
  position: relative;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px 10px 12px;
  background-color: var(--color-bg-card);
}

/* ---------- 条目卡片 ---------- */
.dish {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.dish__img {
  flex: none;
  width: 84px;
  height: 84px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
  cursor: pointer;
}

.dish__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dish__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dish__name {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
  cursor: pointer;
}

.dish__desc {
  margin-top: 3px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  cursor: pointer;
}

.dish__sales {
  margin-top: 3px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.dish__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.dish__actions,
.detail__actions,
.cart-row__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dish__count {
  min-width: 16px;
  color: var(--color-text);
  font-size: var(--font-base);
  text-align: center;
  /* 份数变化：0.2s 颜色过渡（数量反馈保持克制，不做位移动画） */
  transition: color var(--duration-fast) var(--ease-out);
}

/* ---------- 按钮 ---------- */
.round-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: var(--font-base);
  cursor: pointer;
  /* 按压/选中态只改底色与描边色，不做位移或缩放（与小程序一致） */
  transition: background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

/* 加购圆钮：黄底必须配深字 */
.round-btn--plus {
  background-color: var(--color-primary);
  color: var(--color-primary-text);
}

/* 减号圆钮：透明底 + 琥珀描边 + 主色图标 */
.round-btn--minus {
  background-color: transparent;
  border: 1px solid var(--color-primary-border);
  color: var(--color-primary);
}

/* 选择规格：小胶囊按钮，黄底深字 */
.spec-btn {
  padding: 4px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background-color: var(--color-primary);
  color: var(--color-primary-text);
  font-size: var(--font-sm);
  cursor: pointer;
}

/* 弹层内容左右留白：PopupSheet 的 __body 自身不带内边距，页面需自行补，
   否则弹层内容会贴着手机屏幕左右边缘 */
.spec,
.detail,
.cart-pop {
  padding-right: var(--gap-page);
  padding-left: var(--gap-page);
}

/* ---------- 规格弹层 ---------- */
.spec__dish {
  color: var(--color-text);
  font-size: var(--font-lg);
  font-weight: 600;
}

.spec__row {
  margin-top: 14px;
}

.spec__label {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.spec__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.spec__option {
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-muted);
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  cursor: pointer;
  /* 选中态：底色/描边/字色 0.2s 过渡 */
  transition: background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    color var(--duration-fast) var(--ease-out);
}

/* 选中态：浅黄底 + 琥珀描边 + 橙字（黄底不可配白字，这里也不用纯黄字） */
.spec__option--active {
  border-color: var(--color-primary-border);
  background-color: var(--color-primary-light);
  color: var(--color-accent);
}

.spec__footer,
.detail__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ---------- 详情弹层 ---------- */
.detail__image {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  display: block;
}

.detail__name {
  margin-top: 10px;
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
}

.detail__name--center {
  text-align: center;
}

.detail__desc {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  line-height: 1.6;
}

.detail__setmeal-item {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.detail__setmeal-img {
  flex: none;
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
}

.detail__setmeal-info {
  flex: 1 1 auto;
  min-width: 0;
}

.detail__setmeal-name {
  color: var(--color-text);
  font-size: var(--font-base);
}

.detail__setmeal-name span {
  color: var(--color-primary);
}

.detail__setmeal-desc {
  margin-top: 4px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

/* ---------- 购物车弹层 ---------- */
.cart-pop__toolbar {
  display: flex;
  justify-content: flex-end;
  padding-bottom: 6px;
}

.cart-pop__clear {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: transparent;
  color: var(--color-text-placeholder);
  font-size: var(--font-md);
  cursor: pointer;
}

.cart-pop__group {
  margin-bottom: 8px;
}

.cart-pop__group-name {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
  font-weight: 600;
}

.cart-row {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
}

.cart-row__img {
  flex: none;
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg);
}

.cart-row__info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cart-row__name {
  color: var(--color-text);
  font-size: var(--font-base);
}

.cart-row__flavor {
  margin-top: 3px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
}

.cart-row__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

/* ---------- 电话弹层 ---------- */
.phone {
  text-align: center;
  padding: 8px var(--gap-page);
}

.phone__label {
  color: var(--color-text-secondary);
  font-size: var(--font-md);
}

.phone__number {
  margin-top: 6px;
  color: var(--color-text);
  font-size: var(--font-sheet);
  font-weight: 700;
  letter-spacing: 1px;
}

.phone__hint {
  margin-top: 10px;
  color: var(--color-text-placeholder);
  font-size: var(--font-sm);
  line-height: 1.5;
}

/* ---------- 打烊遮罩 ---------- */
/* inset: 0 会随包含块（手机屏容器）自动铺满，无需相对视口居中的 hack */
.closed {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-mask);
}

.closed__card {
  width: 240px;
  padding: 24px 20px;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-sheet);
  text-align: center;
}

.closed__icon {
  color: var(--color-text-placeholder);
  font-size: 40px;
}

.closed__title {
  margin-top: 10px;
  color: var(--color-text);
  font-size: var(--font-title);
  font-weight: 600;
}

.closed__reload {
  margin-top: 18px;
  min-width: 140px;
}
</style>
