// Content script for Claude (claude.ai)
import { createNorthrProfileMenu, startSessionMonitoring, log } from './shared'

function findEditor(): HTMLElement | null {
  return document.querySelector('div.ProseMirror[contenteditable="true"]') as HTMLElement
    || document.querySelector('div[contenteditable="true"]') as HTMLElement
}

function init() {
  const check = setInterval(() => {
    const editor = findEditor()
    if (editor) {
      createNorthrProfileMenu(findEditor, 'claude')
      startSessionMonitoring('claude')
      clearInterval(check)
    }
  }, 1000)
}

init()
log('Claude content script loaded')
