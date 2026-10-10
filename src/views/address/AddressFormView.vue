<script setup>
/**
 * 新增 / 编辑收货地址（路由 addressNew 与 addressEdit 共用本组件，两种模式）。
 *
 * 对齐小程序 pages/addOrEditAddress/addOrEditAddress：
 *   - 字段：联系人、手机号、性别（先生=1 / 女士=2）、标签（公司=1 / 家=2 / 学校=3）、
 *     省市区三级联动、详细地址；
 *   - 校验沿用小程序口径：姓名 2–12 位（中文/字母/数字）、手机号正则、省市区与详细地址非空；
 *   - 编辑模式：先 GET /user/address-books/{id} 回显（含 provinceCode/cityCode/districtCode）；
 *   - 提交前剔除 id（AddressBookDTO 无 id，id 只走路径）；新增 POST、编辑 PUT；
 *   - 编辑模式可删除（二次确认）。
 *
 * 省市区数据复用 src/utils/addressData.js（与小程序同源，码制一致）。
 * 请求与失败提示一律走 @/api 与请求层：本页只做状态复位，不自己判 code、不自己弹失败提示。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Button as VanButton,
  Cascader as VanCascader,
  CellGroup as VanCellGroup,
  Field as VanField,
  Icon as VanIcon,
  Radio as VanRadio,
  RadioGroup as VanRadioGroup,
  showConfirmDialog
} from 'vant'

import AppNavBar from '@/components/AppNavBar.vue'
import LoadingMask from '@/components/LoadingMask.vue'
import PopupSheet from '@/components/PopupSheet.vue'
import { addAddress, deleteAddress, getAddressById, updateAddress } from '@/api/address'
import { areaOptions } from '@/utils/addressData'
import { notifyToast } from '@/utils/notify'

const route = useRoute()
const router = useRouter()

/** 姓名合法字符：中文 / 字母 / 数字，长度 2–12（沿用小程序正则 Α-￥） */
const NAME_PATTERN = /^[Α-￥A-Za-z0-9]{2,12}$/
/** 手机号正则（沿用小程序口径） */
const PHONE_PATTERN =
  /^(13[0-9]|14[01456879]|15[0-35-9]|16[2567]|17[0-8]|18[0-9]|19[0-35-9])\d{8}$/

/** 标签选项（值与后端一致） */
const LABELS = [
  { value: '1', text: '公司' },
  { value: '2', text: '家' },
  { value: '3', text: '学校' }
]

/** 是否编辑模式（路由名为 addressEdit 即编辑） */
const isEdit = computed(() => route.name === 'addressEdit')
/** 编辑模式下的地址 id */
const editId = computed(() => (isEdit.value ? route.params.id : ''))

const loading = ref(false)
const submitting = ref(false)
const errorMsg = ref('')

/** 表单：与 AddressBookDTO 字段对齐（不含 id） */
const form = ref({
  consignee: '',
  phone: '',
  sex: '1',
  label: '1',
  provinceCode: '',
  provinceName: '',
  cityCode: '',
  cityName: '',
  districtCode: '',
  districtName: '',
  detail: ''
})

/** 三级联动：Cascader 的 v-model（叶子节点 code）与展示文案 */
const regionCode = ref('')
const regionText = ref('')
/** 省市区选择弹层是否显示 */
const regionVisible = ref(false)

/** 来源查询串：从结算页进入时透传，保存/删除后回到同来源的列表页 */
const fromQuery = computed(() => (route.query.from ? { from: route.query.from } : {}))

/** 三级联动选择回调：选满三级才写入表单 */
function onRegionChange({ selectedOptions }) {
  const options = selectedOptions || []
  if (options.length < 3) return
  const [province, city, district] = options
  form.value.provinceCode = province.value
  form.value.provinceName = province.text
  form.value.cityCode = city.value
  form.value.cityName = city.text
  form.value.districtCode = district.value
  form.value.districtName = district.text
  regionCode.value = district.value
  regionText.value = `${province.text}/${city.text}/${district.text}`
}

/** 三级联动选满三级（finish）后收起弹层 */
function onRegionFinish() {
  regionVisible.value = false
}

/** 编辑回显：拉详情并填充表单（含区划 code 与名称） */
async function loadDetail() {
  loading.value = true
  try {
    const data = await getAddressById(editId.value)
    if (!data) return
    // 性别归一：后端为 "1"(男) / "2"(女)；历史脏数据 "0" 或空按「男」回显（与当前小程序一致）
    const sex = String(data.sex) === '2' ? '2' : '1'
    // 标签：仅接受 1/2/3，否则回落「公司」
    const label = ['1', '2', '3'].includes(String(data.label)) ? String(data.label) : '1'
    form.value = {
      consignee: data.consignee || '',
      phone: data.phone == null ? '' : String(data.phone),
      sex,
      label,
      provinceCode: data.provinceCode || '',
      provinceName: data.provinceName || '',
      cityCode: data.cityCode || '',
      cityName: data.cityName || '',
      districtCode: data.districtCode || '',
      districtName: data.districtName || '',
      detail: data.detail || ''
    }
    // 回显区划：有 code 时用 code 驱动选择器定位，名称用于展示
    regionCode.value = data.districtCode || ''
    if (data.provinceName && data.cityName && data.districtName) {
      regionText.value = `${data.provinceName}/${data.cityName}/${data.districtName}`
    }
  } catch (e) {
    // 失败原因由请求层统一提示
    errorMsg.value = '地址信息加载失败，请返回重试'
  } finally {
    loading.value = false
  }
}

/** 表单校验：返回错误文案，通过时返回空串 */
function validate() {
  const value = form.value
  if (!value.consignee.trim()) return '联系人不能为空'
  if (!NAME_PATTERN.test(value.consignee.trim())) return '请输入合法的2-12个字符'
  if (!value.phone.trim()) return '手机号不能为空'
  if (!PHONE_PATTERN.test(value.phone.trim())) return '手机号输入有误'
  if (!value.provinceCode || !value.cityCode || !value.districtCode) return '所在地区不能为空'
  if (!value.detail.trim()) return '详细地址不能为空'
  return ''
}

/** 组装提交体：显式剔除 id（后端 DTO 无 id，id 只走路径），sex/label 按后端字符串取值域 */
function buildPayload() {
  const value = form.value
  return {
    consignee: value.consignee.trim(),
    phone: value.phone.trim(),
    sex: String(value.sex),
    label: String(value.label),
    provinceCode: value.provinceCode,
    provinceName: value.provinceName,
    cityCode: value.cityCode,
    cityName: value.cityName,
    districtCode: value.districtCode,
    districtName: value.districtName,
    detail: value.detail.trim()
  }
}

/** 保存 */
async function onSubmit() {
  if (submitting.value) return
  const message = validate()
  if (message) {
    errorMsg.value = message
    return
  }
  errorMsg.value = ''
  submitting.value = true
  const payload = buildPayload()
  try {
    if (isEdit.value) {
      await updateAddress(editId.value, payload)
    } else {
      await addAddress(payload)
    }
    notifyToast('保存成功')
    router.replace({ name: 'addressList', query: fromQuery.value })
  } catch (e) {
    // 失败原因由请求层统一提示；补页内可见提示，避免只有弹窗
    errorMsg.value = (e && e.msg) || '保存失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

/** 删除（仅编辑模式）：二次确认后删除并返回列表 */
async function onDelete() {
  if (submitting.value) return
  try {
    await showConfirmDialog({
      title: '提示',
      message: '确认删除该收货地址吗？',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch (e) {
    return // 用户取消
  }
  submitting.value = true
  try {
    await deleteAddress(editId.value)
    notifyToast('地址删除成功')
    router.replace({ name: 'addressList', query: fromQuery.value })
  } catch (e) {
    // 失败原因由请求层统一提示
  } finally {
    submitting.value = false
  }
}

function goBack() {
  router.back()
}

onMounted(() => {
  if (isEdit.value) loadDetail()
})
</script>

<template>
  <div class="addr-form">
    <AppNavBar :title="isEdit ? '编辑收货地址' : '新增收货地址'" show-back @click-left="goBack" />

    <div class="addr-form__body">
      <LoadingMask :loading="loading" />

      <van-cell-group inset class="addr-form__group">
        <van-field
          v-model="form.consignee"
          label="联系人"
          placeholder="请输入收货人姓名"
          maxlength="12"
          clearable
        />
        <van-field
          v-model="form.phone"
          label="手机号"
          type="tel"
          placeholder="请输入手机号"
          maxlength="11"
          clearable
        />

        <div class="addr-form__row">
          <span class="addr-form__row-label">性别</span>
          <van-radio-group v-model="form.sex" direction="horizontal" class="addr-form__radios">
            <van-radio name="1">先生</van-radio>
            <van-radio name="2">女士</van-radio>
          </van-radio-group>
        </div>

        <div class="addr-form__row">
          <span class="addr-form__row-label">标签</span>
          <div class="addr-form__tags">
            <span
              v-for="item in LABELS"
              :key="item.value"
              class="addr-form__tag"
              :class="{ 'is-on': form.label === item.value }"
              @click="form.label = item.value"
            >
              {{ item.text }}
            </span>
          </div>
        </div>

        <van-field
          v-model="regionText"
          label="所在地区"
          placeholder="请选择省 / 市 / 区"
          readonly
          is-link
          @click="regionVisible = true"
        />
        <van-field
          v-model="form.detail"
          label="详细地址"
          type="textarea"
          rows="2"
          autosize
          maxlength="120"
          placeholder="街道、门牌号等，如 XX街道XX号"
        />
      </van-cell-group>

      <PopupSheet v-model:show="regionVisible" :closeable="false">
        <van-cascader
          v-model="regionCode"
          :options="areaOptions"
          title="选择所在地区"
          active-color="#e95f3c"
          @change="onRegionChange"
          @finish="onRegionFinish"
          @close="regionVisible = false"
        />
      </PopupSheet>

      <p v-if="errorMsg" class="addr-form__error">{{ errorMsg }}</p>

      <div class="addr-form__actions">
        <van-button
          type="primary"
          round
          block
          :loading="submitting"
          loading-text="保存中..."
          @click="onSubmit"
        >
          保存
        </van-button>
        <van-button
          v-if="isEdit"
          class="addr-form__delete"
          type="danger"
          plain
          round
          block
          :disabled="submitting"
          @click="onDelete"
        >
          <van-icon name="delete-o" /> 删除地址
        </van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.addr-form {
  position: relative;
  min-height: 100vh;
  box-sizing: border-box;
}

.addr-form__body {
  position: relative;
  padding: 12px 0 24px;
}

.addr-form__group {
  margin-bottom: 20px;
}

.addr-form__row {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  font-size: 14px;
}

.addr-form__row-label {
  flex: none;
  width: 92px;
  color: var(--color-text, #333333);
}

.addr-form__radios {
  flex: 1 1 auto;
}

.addr-form__tags {
  display: flex;
  gap: 10px;
}

.addr-form__tag {
  padding: 3px 14px;
  color: var(--color-text-secondary, #666666);
  font-size: 13px;
  background-color: var(--color-bg, #f8f8f8);
  border: 1px solid var(--color-border, #eeeeee);
  border-radius: 14px;
}

.addr-form__tag.is-on {
  color: var(--color-primary, #e95f3c);
  background-color: var(--color-primary-light, #fdeee9);
  border-color: var(--color-primary, #e95f3c);
}

.addr-form__error {
  margin: 0 16px 8px;
  color: var(--color-danger, #ee0a24);
  font-size: 13px;
}

.addr-form__actions {
  padding: 8px 16px 0;
}

.addr-form__delete {
  margin-top: 12px;
}
</style>
