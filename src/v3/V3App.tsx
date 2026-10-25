// Exit Guard v3: a tool for agent developers. The page is one client of /api/agent and /mcp.
import { useEffect, useState } from 'react'
import { Ask, type Preview } from './Ask'
import { Connect } from './Connect'
import { initialLang, LangContext, saveLang, type Lang } from './lang'

type Page = 'ask' | 'connect'
const fromHash = (): Page => (location.hash === '#connect' ? 'connect' : 'ask')
const PREVIEWS: Preview[] = ['empty', 'checking', 'allow', 'approval', 'deny', 'choose']

export default function V3App() {
  const [page, setPage] = useState<Page>(fromHash)
  const [lang, setLang] = useState<Lang>(initialLang)
  useEffect(() => {
    const on = () => setPage(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])
  const choose = (l: Lang) => {
    setLang(l)
    saveLang(l)
  }
  const zh = lang === 'zh'
  // Design preview: ?state=deny shows that screen with sample data.
  const s = new URLSearchParams(location.search).get('state') as Preview | null
  const preview: Preview | null = s && PREVIEWS.includes(s) ? s : null
  // The network of what is on screen: the testnet samples must not read as mainnet.
  const testnetSample = preview === 'allow' || preview === 'deny'

  return (
    <LangContext.Provider value={lang}>
      <div className="v3">
        <header className="bar">
          <a className="brand" href="#ask">
            exit_guard
          </a>
          <span className="built">
            built on <img src="/brand/xrpl-tertiary-white.svg" alt="XRPL" />
          </span>
          <nav aria-label={zh ? '页面' : 'Pages'}>
            <a href="#ask" className={page === 'ask' ? 'on' : ''} aria-current={page === 'ask' ? 'page' : undefined}>
              {zh ? '检查代币' : 'Check a token'}
            </a>
            <a href="#connect" className={page === 'connect' ? 'on' : ''} aria-current={page === 'connect' ? 'page' : undefined}>
              {zh ? '接入你的代理' : 'Connect your agent'}
            </a>
          </nav>
          <span className="net">
            <span className="dot" /> {testnetSample ? (zh ? '测试网样例' : 'testnet sample') : zh ? '主网 · 只读' : 'mainnet · read only'}
          </span>
          <div className="lang" role="group" aria-label="Language / 语言">
            <button className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => choose('en')}>
              EN
            </button>
            <button className={lang === 'zh' ? 'on' : ''} aria-pressed={lang === 'zh'} onClick={() => choose('zh')} lang="zh">
              中
            </button>
          </div>
        </header>
        {page === 'ask' ? <Ask key={preview ?? 'live'} preview={preview} /> : <Connect />}
      </div>
    </LangContext.Provider>
  )
}
