/// <reference types="vite/client" />
import type { Api } from '../preload'

declare global {
  interface Window {
    api: Api
  }
}

declare module '*.mjs?url' {
  const url: string
  export default url
}
