import { Client, type SubmittableTransaction, type Wallet } from 'xrpl'

export type Net = 'testnet' | 'mainnet'

// Set VITE_XRPL_WS in .env to use a QuickNode testnet endpoint.
export const NETWORK: string = import.meta.env.VITE_XRPL_WS ?? 'wss://s.altnet.rippletest.net:51233'
// Mainnet is read-only here: we check tokens there, we never send transactions.
export const MAINNET = 'wss://xrplcluster.com'
export const EXPLORER = 'https://testnet.xrpl.org/transactions/'
export const EXPLORER_HOST: Record<Net, string> = { testnet: 'https://testnet.xrpl.org', mainnet: 'https://livenet.xrpl.org' }

const readOptions = { connectionTimeout: 10_000, timeout: 15_000 }
const clients: Record<Net, Client> = { testnet: new Client(NETWORK, readOptions), mainnet: new Client(MAINNET, readOptions) }
const connecting: Partial<Record<Net, Promise<void>>> = {}

export async function getClient(net: Net = 'testnet'): Promise<Client> {
  const client = clients[net]
  if (!client.isConnected()) {
    connecting[net] ??= client.connect().finally(() => delete connecting[net])
    await connecting[net]
  }
  return client
}

export type TxRecord = {
  label: string
  type: string
  hash?: string
  ledger?: number
  result: string
  validated: boolean
}

type TxInput = { TransactionType: string } & Record<string, unknown>

export async function send(label: string, wallet: Wallet, tx: TxInput): Promise<TxRecord> {
  const c = await getClient()
  try {
    const full = { ...tx, Account: wallet.address } as unknown as SubmittableTransaction
    const r = await c.submitAndWait(full, { wallet, autofill: true })
    const meta = r.result.meta
    return {
      label,
      type: tx.TransactionType,
      hash: r.result.hash,
      ledger: r.result.ledger_index,
      result: typeof meta === 'object' && meta ? meta.TransactionResult : 'unknown',
      validated: !!r.result.validated,
    }
  } catch (e) {
    const err = e as { data?: { engine_result?: string }; message?: string }
    return { label, type: tx.TransactionType, result: `ERROR ${err.data?.engine_result ?? err.message}`, validated: false }
  }
}

// For setup steps: anything but success is a bug, so stop.
export async function mustSend(label: string, wallet: Wallet, tx: TxInput): Promise<TxRecord> {
  const r = await send(label, wallet, tx)
  if (r.result !== 'tesSUCCESS') throw new Error(`${label} failed: ${r.result}`)
  return r
}
