// Chinese wording for the API's explanations. Built from the same ledger values as the English, by template,
// so the two languages always say the same thing and no model is involved.
import { exitCost } from '../engine/amm'
import { DEFAULT_POLICY, type BuyRequest, type Check, type Snapshot } from '../engine/policy'
import { evidence, num, pct } from '../exit/words'
import { currencyName } from '../xrpl/token'

export const INTENT_ZH: Record<string, string> = { check: '检查', buy: '买入', what_if: '硬买会怎样' }
export const ACTION_ZH: Record<string, string> = { human: '转人工', continue: '继续买', abort: '放弃' }

export function ruleZh(c: Check, s: Snapshot, req: BuyRequest): string {
  const trusted = DEFAULT_POLICY.trustedIssuers.includes(s.token.issuer)
  switch (c.id) {
    case 'R1':
      if (c.status === 'pass') return '现在没有冻结。'
      return s.globalFreeze ? '发币方冻结了全部交易，谁都卖不出。' : '发币方冻结了这个钱包里的币，你卖不出。'
    case 'R2':
      if (s.noFreeze) return '发币方已永久放弃冻结权。'
      return trusted ? '发币方能冻结，但在你的可信名单上。' : '发币方保留了冻结权，多数合规稳定币也会保留。'
    case 'R3':
      if (!s.clawback) return '发币方不能收回你的币。'
      return trusted ? '开了收回功能。发币方是你可信名单上的受监管稳定币。' : '发币方能从你的钱包里收走币。'
    case 'R4':
      if (s.top1Share === null) return '其他持有人太少，无法判断。'
      return c.status === 'warn' ? `一个钱包持有 ${pct(s.top1Share)} 的供应量。` : `最大持有人占 ${pct(s.top1Share)}。`
    case 'R5': {
      if (!s.pool) return '没有 AMM 池可以卖。订单簿暂未检查。'
      const { cost } = exitCost(s.pool, req.amountXrp)
      if (!Number.isFinite(cost) || !(req.amountXrp > 0)) return '算不出退出成本（池子是空的，或金额不对）。'
      return `把买到的币卖回池子，比市价少 ${pct(cost)}（池子 ${num(s.pool.xrp)} XRP）。`
    }
    case 'R6':
      if (s.issuerLpShare === null) return '没有池子可以抽走。'
      return c.status === 'warn' ? `发币方占池子 ${pct(s.issuerLpShare)}，随时能撤走。` : `发币方占池子 ${pct(s.issuerLpShare)}。`
    case 'R7':
      return s.transferFee > 0 ? `发币方从每笔卖出抽 ${pct(s.transferFee)}。` : '没有转账费。'
    case 'R8':
      return c.status === 'warn'
        ? `${num(req.amountXrp)} XRP 超过自动买入上限 ${DEFAULT_POLICY.autoLimitXrp} XRP。`
        : `${num(req.amountXrp)} XRP 在自动买入上限 ${DEFAULT_POLICY.autoLimitXrp} XRP 以内。`
    default:
      return c.detail
  }
}

// The ledger values column: field names stay as the ledger spells them; the words around them are Chinese.
export function evidenceZh(id: string, s: Snapshot): string {
  switch (id) {
    case 'R4':
      return s.top1Share === null ? '前 400 条信任线里没有其他持有人' : `最大的其他持有人：${pct(s.top1Share)}（只看前 400 条信任线）`
    case 'R5':
      return s.pool
        ? `AMM 池 ${num(s.pool.token)} ${currencyName(s.token.currency)} / ${num(s.pool.xrp)} XRP · 手续费 ${pct(s.pool.fee)}`
        : '没有 AMM 池 · 未计订单簿'
    case 'R6':
      return s.issuerLpShare === null ? '没有 AMM 池' : `发币方持有 ${pct(s.issuerLpShare)} 的 LP 代币`
    case 'R7':
      return s.transferFee > 0 ? evidence(id, s, false) : 'TransferRate：未设置'
    case 'R8':
      return `自动买入上限：${DEFAULT_POLICY.autoLimitXrp} XRP`
    default:
      return evidence(id, s, false)
  }
}
