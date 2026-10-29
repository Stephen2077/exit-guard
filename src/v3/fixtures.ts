// Design preview data (?state=...). Ledger values are copied from real runs, and each one says which run.
import type { AgentResult } from './types'

const SOLO = { name: 'SOLO', currency: '534F4C4F00000000000000000000000000000000', issuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz' }

export const APPROVAL: AgentResult = {
  input: 'buy 50 XRP of SOLO',
  net: 'mainnet',
  amountXrp: 50,
  token: SOLO,
  steps: [
    { actor: 'claude', task: 'Reads the words', result: 'buy · "SOLO" · 50 XRP' },
    { actor: 'jev', task: 'What does the user want?', result: 'buy', confidence: 1 },
    { actor: 'jev', task: 'Which SOLO? (149 match)', result: 'SOLO by Sologenic · 214,722 holders', confidence: 0.97 },
    { actor: 'rules', task: 'Can the agent sell it again?', result: 'REQUIRE_APPROVAL' },
    { actor: 'jev', task: 'Approval needed: what should the agent do?', result: 'Ask a human', confidence: 0.64 },
  ],
  outcome: 'REQUIRE_APPROVAL',
  checks: [
    { id: 'R1', label: 'Frozen now', status: 'pass', detail: 'Not frozen.', ledger: 'globalFreeze: false' },
    { id: 'R2', label: 'Can freeze later', status: 'pass', detail: 'Issuer gave up freezing forever.', ledger: 'noFreeze: true' },
    { id: 'R3', label: 'Can take tokens back', status: 'pass', detail: 'Issuer cannot claw back.', ledger: 'allowTrustLineClawback: false' },
    { id: 'R4', label: 'Holder concentration', status: 'warn', detail: 'One wallet holds 78.3% of supply.', ledger: 'largest other holder: 78.3% (first 400 trust lines)' },
    { id: 'R5', label: 'Exit cost', status: 'pass', detail: 'Selling what you buy costs 0.99% vs market.', ledger: 'AMM 2,443,359.57 SOLO / 21,500.38 XRP · fee 0.77%' },
    { id: 'R6', label: 'Can pull the pool', status: 'pass', detail: 'Issuer owns 0% of the pool.', ledger: 'issuer LP share: 0%' },
    { id: 'R7', label: 'Transfer fee', status: 'pass', detail: 'Issuer takes 0.01% of every sale.', ledger: 'TransferRate: 1000100000' },
    { id: 'R8', label: 'Amount', status: 'warn', detail: '50 XRP is above the 5 XRP limit for automatic buys.', ledger: 'automatic buy limit: 5 XRP' },
  ],
  maxSafeXrp: 1017.9, // maxSafeBuy on the pool above, 5% line
  action: { choice: 'human', by: 'jev', confidence: 0.64 },
  ledger: { time: '2026-10-25T14:18:43Z' },
  directory: { holders: 214722, domain: 'sologenic.com', trustLevel: 3 },
  source: 'Ledger values: mainnet check at 14:18:43 UTC. Preview: the Claude and Jev lines show the layout and go live in the build.',
}

const SCM = { name: 'SCM', currency: 'SCM', issuer: 'rJcHsG7xN2t9wD4bQe1LmKpRfVuW5js' }

export const DENY: AgentResult = {
  input: 'buy 2 XRP of SCM',
  net: 'testnet',
  amountXrp: 2,
  token: SCM,
  steps: [
    { actor: 'claude', task: 'Reads the words', result: 'buy · "SCM" · 2 XRP' },
    { actor: 'jev', task: 'What does the user want?', result: 'buy', confidence: 0.99 },
    { actor: 'rules', task: 'Can the agent sell it again?', result: 'DENY' },
  ],
  outcome: 'DENY',
  checks: [
    { id: 'R1', label: 'Frozen now', status: 'pass', detail: 'Not frozen.', ledger: 'globalFreeze: false' },
    { id: 'R2', label: 'Can freeze later', status: 'warn', detail: 'Issuer kept the power to freeze. Most regulated stablecoins keep it too.', ledger: 'noFreeze: false' },
    { id: 'R3', label: 'Can take tokens back', status: 'fail', detail: 'Issuer can pull tokens out of your wallet.', ledger: 'allowTrustLineClawback: true' },
    { id: 'R4', label: 'Holder concentration', status: 'warn', detail: 'One wallet holds 100% of supply.', ledger: 'largest other holder: 100%' },
    { id: 'R5', label: 'Exit cost', status: 'fail', detail: 'Selling what you buy costs 22.5% vs market.', ledger: 'AMM 5,000 SCM / 5 XRP · fee 0.5%' },
    { id: 'R6', label: 'Can pull the pool', status: 'warn', detail: 'Issuer owns 100% of the pool.', ledger: 'issuer LP share: 100%' },
    { id: 'R7', label: 'Transfer fee', status: 'fail', detail: 'Issuer takes 25% of every sale.', ledger: 'TransferRate: 1250000000' },
    { id: 'R8', label: 'Amount', status: 'pass', detail: '2 XRP is within the 5 XRP limit for automatic buys.', ledger: 'automatic buy limit: 5 XRP' },
  ],
  maxSafeXrp: 0.25, // maxSafeBuy on the pool above; not shown for a DENY
  action: { choice: 'abort', by: 'rules' },
  ledger: { time: '2026-10-25T05:17:46Z' },
  source: 'Ledger values: testnet demo run at 01:17 ET. Preview: the Claude and Jev lines show the layout and go live in the build.',
}

const GOD = { name: 'GOD', currency: 'GOD', issuer: 'rBCqNxV8hT3kPq7WmZ2yJdF6sLuE9D8tV' }

export const ALLOW: AgentResult = {
  input: 'buy 2 XRP of GOD',
  net: 'testnet',
  amountXrp: 2,
  token: GOD,
  steps: [
    { actor: 'claude', task: 'Reads the words', result: 'buy · "GOD" · 2 XRP' },
    { actor: 'jev', task: 'What does the user want?', result: 'buy', confidence: 1 },
    { actor: 'rules', task: 'Can the agent sell it again?', result: 'ALLOW' },
  ],
  outcome: 'ALLOW',
  checks: [
    { id: 'R1', label: 'Frozen now', status: 'pass', detail: 'Not frozen.', ledger: 'globalFreeze: false' },
    { id: 'R2', label: 'Can freeze later', status: 'pass', detail: 'Issuer gave up freezing forever.', ledger: 'noFreeze: true' },
    { id: 'R3', label: 'Can take tokens back', status: 'pass', detail: 'Issuer cannot claw back.', ledger: 'allowTrustLineClawback: false' },
    { id: 'R4', label: 'Holder concentration', status: 'pass', detail: 'Not enough other holders to judge.', ledger: 'no other holders' },
    { id: 'R5', label: 'Exit cost', status: 'pass', detail: 'Selling what you buy costs 4.2% vs market.', ledger: 'AMM 50,000 GOD / 50 XRP · fee 0.5%' },
    { id: 'R6', label: 'Can pull the pool', status: 'pass', detail: 'Issuer owns 0% of the pool.', ledger: 'issuer LP share: 0%' },
    { id: 'R7', label: 'Transfer fee', status: 'pass', detail: 'No transfer fee.', ledger: 'TransferRate: not set' },
    { id: 'R8', label: 'Amount', status: 'pass', detail: '2 XRP is within the 5 XRP limit for automatic buys.', ledger: 'automatic buy limit: 5 XRP' },
  ],
  maxSafeXrp: 2.51, // maxSafeBuy on the pool above
  action: { choice: 'continue', by: 'rules' },
  event: { label: 'Agent buys GOD (2 XRP)', type: 'OfferCreate', hash: 'E8D3F4872D579FC7D1D2A7F536C32A1AF155553583D5129A0C3AD6C0B6C8E808', result: 'tesSUCCESS', ledger: 21805326 },
  ledger: { time: '2026-10-25T05:17:21Z' },
  source: 'Testnet demo run at 01:17 ET (hash is from that run). Preview: the Claude and Jev lines show the layout and go live in the build.',
}

export const CHOOSE: AgentResult = {
  input: 'is USD safe?',
  net: 'mainnet',
  amountXrp: 2,
  steps: [
    { actor: 'claude', task: 'Reads the words', result: 'check · "USD" · no amount (2 XRP default)' },
    { actor: 'jev', task: 'What does the user want?', result: 'check', confidence: 0.98 },
    { actor: 'jev', task: 'Which USD?', result: 'Not sure enough: you pick', confidence: 0.41 },
  ],
  candidates: [
    { currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', name: 'USD', issuerName: 'GateHub', domain: 'gatehub.net', holders: 31204, trustLevel: 3, probability: 0.41 },
    { currency: 'USD', issuer: 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', name: 'USD', issuerName: 'Bitstamp', domain: 'bitstamp.net', holders: 28977, trustLevel: 3, probability: 0.39 },
    { currency: 'USD', issuer: 'rEn9eRkX25wfGPLysUMAvZ84jAzFNpT5fL', name: 'USD', domain: 'usd-xrpl.io', holders: 112, trustLevel: 0, probability: 0.2 },
  ],
  checks: [],
  maxSafeXrp: null,
  source: 'Design sample. Holder counts are placeholders shaped like the directory.',
}
