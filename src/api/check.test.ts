import { describe, expect, it } from 'vitest'
import { checkFromQuery, searchFromQuery } from './check'

// Input checks only: every case below is answered before any network call.
const ask = (query: string) => checkFromQuery(new URLSearchParams(query))
const RLUSD = 'currency=RLUSD&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'

describe('/api/check input', () => {
  it('rejects an unknown network', async () => {
    expect(await ask(`${RLUSD}&net=devnet`)).toMatchObject({ status: 400 })
  })

  it('rejects a bad issuer or code', async () => {
    expect(await ask('currency=RLUSD&issuer=bad')).toMatchObject({ status: 400 })
    expect(await ask('currency=XRP&issuer=rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De')).toMatchObject({ status: 400 })
  })

  it('rejects amounts that are not a positive number', async () => {
    for (const amount of ['0', '-2', 'abc', 'Infinity']) expect(await ask(`${RLUSD}&amount=${amount}`)).toMatchObject({ status: 400 })
  })
})

describe('/api/search input', () => {
  it('asks for a name', async () => {
    expect(await searchFromQuery(new URLSearchParams(''))).toMatchObject({ status: 400 })
  })
})
