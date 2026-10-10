/**
 * 金额运算：内部一律以「分」为单位的整数运算，仅在展示与提交时转成两位小数。
 *
 * 为什么必须这样做：后端把前端传来的 amount 原样落库、不重算，浮点误差一旦发出
 * 会被永久写进数据库（例如 19.99 * 3 用浮点累加会得到 59.97000000000001）。
 * 因此禁止浮点累加，所有加减乘除都先转成整数「分」再算。
 */

/** 元 → 分（字符串解析，第 3 位小数四舍五入到分；非法输入返回 0） */
export function yuanToFen(yuan) {
  if (yuan === null || yuan === undefined || yuan === '') return 0
  if (typeof yuan === 'number' && !Number.isFinite(yuan)) return 0

  const s = String(yuan).trim()
  if (s === '') return 0

  const negative = s.charAt(0) === '-'
  const body = negative ? s.slice(1) : s
  // 只接受形如 "123" / "1.2" / ".5" / "12." 的十进制写法
  if (!/^\d*\.?\d*$/.test(body) || body === '' || body === '.') return 0

  const [intPart = '0', decPart = ''] = body.split('.')
  const cents = (decPart + '000').slice(0, 3)
  let fen = Number(intPart || '0') * 100 + Number(cents.slice(0, 2) || '0')
  if (Number(cents.charAt(2) || '0') >= 5) fen += 1

  return negative ? -fen : fen
}

/** 分 → 两位小数字符串（如 6897 → "68.97"） */
export function fenToYuanString(fen) {
  const n = Math.round(Number(fen) || 0)
  const negative = n < 0
  const abs = Math.abs(n)
  const intPart = Math.floor(abs / 100)
  const decPart = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${intPart}.${decPart}`
}

/** 分 → 元（Number，用于 JSON 提交；保留两位小数的精确值） */
export function fenToYuan(fen) {
  return Number(fenToYuanString(fen))
}

/** 多个「分」求和（整数累加） */
export function sumFen(fens) {
  if (!Array.isArray(fens)) return 0
  return fens.reduce((acc, cur) => acc + Math.round(Number(cur) || 0), 0)
}

/** 多个「分」求和（可变参数形式） */
export function addFen(...fens) {
  return sumFen(fens)
}

/**
 * 单价（元） × 份数 → 「分」。
 * @param {number|string} priceYuan 单价，单位元
 * @param {number} count 份数
 */
export function multiplyYuan(priceYuan, count) {
  const unitFen = yuanToFen(priceYuan)
  const n = Number(count) || 0
  return unitFen * n
}

/** 「分」 → 展示文案（￥ + 两位小数） */
export function formatFen(fen) {
  return `￥${fenToYuanString(fen)}`
}

/** 元 → 展示文案（￥ + 两位小数） */
export function formatYuan(yuan) {
  return formatFen(yuanToFen(yuan))
}
