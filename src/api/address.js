/**
 * 地址簿端点。
 */
import request from '@/utils/request'

/**
 * 查询当前用户的全部收货地址。
 *
 * 入参字段：无（用户身份取自 JWT）。
 * 出参字段（后端 Result<List<AddressBookListItemVO>>）：
 *   - 数组，每项：
 *     { id:number, consignee:string, phone:string, sex:string("1" 男/"2" 女),
 *       provinceName:string, cityName:string, districtName:string,
 *       detail:string, label:string("1" 公司/"2" 家/"3" 学校), isDefault:number(0/1) }
 *   - 注意：列表 VO 不含 provinceCode/cityCode/districtCode（需要用详情端点取回显码）。
 *   - sex / label 后端为字符串类型（DDL 是 varchar）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4（AddressBookListItemVO）；后端 AddressBookDTO.java 字段类型复核。
 * 实测：GET /user/address-books → data:[{id:11,consignee:"TestUser",phone:"13800000000",sex:"1",
 *       provinceName:"Beijing",cityName:"Beijing",districtName:"Dongcheng",detail:"...",
 *       label:"1",isDefault:1}]（字段名一致）。
 *
 * @returns {Promise<Array<object>>}
 */
export function getAddressList() {
  return request({
    url: '/user/address-books',
    method: 'get'
  })
}

/**
 * 查询默认收货地址。
 *
 * 入参字段：无。
 * 出参字段（后端 Result<AddressBookDefaultVO>）：与列表项同构
 *   { id, consignee, phone, sex, provinceName, cityName, districtName, detail, label, isDefault }。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4（AddressBookDefaultVO）。
 * 特别注意（正常业务失败，不是异常）：
 *   - 用户「没有默认地址」时后端返回 HTTP 200 + code:0 + msg「您还没有设置默认地址~」，
 *     因此 request 层会 reject 而不是 resolve。
 *   - 本端点已加入请求层静默清单（不弹全局提示），调用方需要自行 catch 并把空态当作「请选择收货地址」处理。
 * 实测：无默认地址时 → {"code":0,"msg":"您还没有设置默认地址~","data":null}（确认）。
 *
 * @returns {Promise<object>} 有默认地址时 resolve 地址对象；无默认地址时 reject（{code, msg}）
 */
export function getDefaultAddress() {
  return request({
    url: '/user/address-books/default',
    method: 'get'
  })
}

/**
 * 按 id 查询地址详情（编辑回显用）。
 *
 * 入参字段：
 *   - id: number，必填（后端 @Positive）。地址簿 id，拼进路径。
 * 出参字段（后端 Result<AddressBookInfoVO>）：
 *   - 列表项字段 + 额外含 provinceCode / cityCode / districtCode（用于省市区三级联动回显）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4（AddressBookInfoVO）。
 * 实测：GET /user/address-books/11 → data 含 provinceCode:"11",cityCode:"1101",districtCode:"110101"（确认）。
 * 注意：访问不属于当前用户的 id 会返回 code:0（「该地址簿数据不属于当前用户」）。
 *
 * @param {number} id 地址簿 id
 * @returns {Promise<object>}
 */
export function getAddressById(id) {
  return request({
    url: `/user/address-books/${id}`,
    method: 'get'
  })
}

/**
 * 组装「新增 / 修改」地址的请求体（剔除 id 与所有 undefined）。
 * 后端 AddressBookDTO 无 id 字段（id 只走路径），因此发送前必须剔除。
 * @param {object} form 表单对象
 * @returns {object}
 */
function buildAddressBody(form = {}) {
  const fields = [
    'consignee',
    'phone',
    'sex',
    'provinceCode',
    'provinceName',
    'cityCode',
    'cityName',
    'districtCode',
    'districtName',
    'detail',
    'label',
    'isDefault'
  ]
  const data = {}
  fields.forEach((key) => {
    if (form[key] !== undefined) data[key] = form[key]
  })
  return data
}

/**
 * 新增收货地址。
 *
 * 入参字段（后端 AddressBookDTO，Create 校验组）：
 *   - consignee: string  必填（@NotBlank）
 *   - phone: string      必填（@NotBlank）
 *   - sex: string        必填（@NotBlank）；只接受 "1"(男) / "2"(女)，发 "0" 会被后端业务校验拒绝
 *   - provinceName: string 必填（@NotBlank）
 *   - cityName: string     必填（@NotBlank）
 *   - districtName: string 必填（@NotBlank）
 *   - detail: string       必填（@NotBlank）
 *   - provinceCode / cityCode / districtCode: string，后端未标必填（建议完整传，便于回显）
 *   - label: string       可选；"1" 公司 / "2" 家 / "3" 学校
 *   - isDefault: number   可选；0 否 / 1 是（后端未标必填）
 *   - 禁止携带 id（后端 DTO 无该字段，路由参数里才有）。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4；后端 AddressBookDTO.java 的校验注解复核。
 * 实测：完整字段 POST → {"code":1,"msg":null,"data":null}（成功）；缺字段/空 body → code:0。
 *
 * @param {object} form 地址表单（见上）
 * @returns {Promise<null>}
 */
export function addAddress(form) {
  return request({
    url: '/user/address-books',
    method: 'post',
    data: buildAddressBody(form)
  })
}

/**
 * 修改收货地址。
 *
 * 入参字段：
 *   - id: number，必填。地址簿 id，拼进路径（不要放进 body）。
 *   - form: 与「新增」相同的 AddressBookDTO 字段（Update 校验组）。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4。
 * 备注：buildAddressBody 会剔除 form.id，避免把 id 混进请求体。
 *
 * @param {number} id 地址簿 id
 * @param {object} form 地址表单
 * @returns {Promise<null>}
 */
export function updateAddress(id, form) {
  return request({
    url: `/user/address-books/${id}`,
    method: 'put',
    data: buildAddressBody(form)
  })
}

/**
 * 按 id 删除地址。
 *
 * 入参字段：
 *   - id: number，必填。地址簿 id，拼进路径。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4。
 *
 * @param {number} id 地址簿 id
 * @returns {Promise<null>}
 */
export function deleteAddress(id) {
  return request({
    url: `/user/address-books/${id}`,
    method: 'delete'
  })
}

/**
 * 设置默认地址。
 *
 * 入参字段：
 *   - id: number，必填。地址簿 id，拼进路径；不带请求体。
 * 出参字段：无（Void）。
 * 是否需要 token：是。
 * 字段来源依据：调查报告 §2.7 与 §4。
 * 易错点：路径是 /{id}/default，方法 PUT。
 *
 * @param {number} id 地址簿 id
 * @returns {Promise<null>}
 */
export function setDefaultAddress(id) {
  return request({
    url: `/user/address-books/${id}/default`,
    method: 'put'
  })
}
