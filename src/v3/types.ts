// The shape /api/agent returns, shared by the server and the page.
import type { CheckStatus, Outcome } from '../engine/policy'

export type Actor = 'parser' | 'claude' | 'jev' | 'rules'

// One stage of "Claude reads, Jev decides, the rules have the last word".
export type Step = {
  actor: Actor
  task: string // what this stage was asked, in plain words
  result: string // what it answered
  confidence?: number // Jev only, 0..1
  note?: string // e.g. "Jev unavailable: Claude answered instead"
  // Chinese versions from the server, so the page can switch language without asking the models again.
  taskZh?: string
  resultZh?: string
  noteZh?: string
}

export type RuleCheck = { id: string; label: string; status: CheckStatus; detail: string; detailZh?: string; ledger: string; ledgerZh?: string }

export type Candidate = { currency: string; issuer: string; name: string; issuerName?: string; domain?: string; holders?: number; trustLevel?: number; probability?: number }

export type AgentAction = { choice: 'continue' | 'human' | 'abort'; by: 'rules' | 'jev' | 'claude'; confidence?: number; jevChoice?: 'continue' | 'human' | 'abort' }

export type AgentResult = {
  input: string
  steps: Step[]
  net: 'mainnet' | 'testnet'
  amountXrp: number
  intent?: 'check' | 'buy' | 'what_if' // "check": nobody asked to buy, so there is nothing to approve
  token?: { name: string; currency: string; issuer: string }
  candidates?: Candidate[] // set when the token is ambiguous and a person must pick
  outcome?: Outcome
  checks: RuleCheck[]
  maxSafeXrp: number | null // largest buy that keeps exit cost under the approval line; null if no pool
  action?: AgentAction
  ledger?: { index?: number; time: string }
  directory?: { holders?: number; domain?: string; trustLevel?: number }
  // The freeze re-score: what changed on the ledger, and the verdict before it.
  event?: { label: string; type: string; hash?: string; result: string; ledger?: number }
  before?: { outcome: Outcome; time: string }
  source?: string // where the data came from, said on screen
  sourceZh?: string
}
