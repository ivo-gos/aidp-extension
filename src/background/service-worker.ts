// Northr Identity — Background Service Worker (v2 + Session Tracking)

import { supabase } from '../lib/supabase'

const SUPABASE_URL = 'https://ogymhddaeetmxmbtbxne.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9neW1oZGRhZWV0bXhtYnRieG5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTUxMzUsImV4cCI6MjA4Nzk3MTEzNX0.sZEMegD6VROBNJqkPAnSEgbSYSit1Yx_ZcQ_35nisug'

// ── Identity block sync (Pro users) ──

chrome.alarms.create('refresh-identity', { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'refresh-identity') return
  // Only sync for Pro users
  const { subscriptionStatus } = await chrome.storage.local.get('subscriptionStatus')
  if (!subscriptionStatus || (subscriptionStatus.status !== 'active' && subscriptionStatus.status !== 'trialing')) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }
    const resp = await fetch(SUPABASE_URL + '/rest/v1/identity_blocks?order=sort_order&select=profile_key,label,emoji,content,sort_order,last_edited_at', { headers })
    if (resp.ok) {
      const blocks = await resp.json()
      if (blocks && blocks.length > 0) {
        await chrome.storage.local.set({ identity_blocks: blocks, last_synced_at: Date.now() })
        console.log('[Northr] Cloud sync:', blocks.length, 'blocks')
      }
    }
  } catch (err) { console.error('[Northr] Sync failed:', err) }
})

// ── On install ──

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://identity.northr.ai/signup?source=extension' })
  }
})

// ── Session tracking for save banner ──

interface TabSession {
  startTime: number
  lastMessageCount: number
  bannerDismissed: boolean
  bannerShown: boolean
}

const tabSessions = new Map<number, TabSession>()

function isAIToolUrl(url?: string): boolean {
  if (!url) return false
  return url.includes('chat.openai.com') || url.includes('chatgpt.com') || url.includes('claude.ai') || url.includes('gemini.google.com')
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isAIToolUrl(tab.url)) {
    tabSessions.set(tabId, { startTime: Date.now(), lastMessageCount: 0, bannerDismissed: false, bannerShown: false })
  }
})

chrome.tabs.onRemoved.addListener((tabId) => { tabSessions.delete(tabId) })

// ── Message handler ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MESSAGE_COUNT_UPDATE' && sender.tab?.id) {
    const session = tabSessions.get(sender.tab.id)
    if (session) session.lastMessageCount = message.count
    sendResponse(true)
    return true
  }

  if (message.type === 'CHECK_SHOW_BANNER' && sender.tab?.id) {
    const session = tabSessions.get(sender.tab.id)
    if (!session || session.bannerDismissed || session.bannerShown) {
      sendResponse(false)
      return true
    }
    // Check: logged in?
    chrome.storage.local.get(null, (all) => {
      let hasAuth = false
      for (const key of Object.keys(all)) {
        if (key.includes('auth-token')) { hasAuth = true; break }
      }
      if (!hasAuth) { sendResponse(false); return }

      const elapsed = Date.now() - session.startTime
      const shouldShow = elapsed > 120000 && session.lastMessageCount >= 4 // 2 min + 4 messages
      if (shouldShow) session.bannerShown = true
      sendResponse(shouldShow)
    })
    return true // Keep channel open for async response
  }

  if (message.type === 'REFRESH_IDENTITY') {
    sendResponse({ success: true })
    return true
  }
})
