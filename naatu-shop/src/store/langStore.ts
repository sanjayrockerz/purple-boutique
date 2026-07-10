import { create } from 'zustand'

type LangState = {
  lang: 'en'
  setLang: () => void
}

export const useLangStore = create<LangState>(() => ({
  lang: 'en',
  setLang: () => {},
}))
