// 容器 Web 界面 favicon 解析与缓存
// 后端 /api/favicon/resolve 会抓取容器页面解析 <link rel=icon>，结果存 localStorage（7 天）
import { faviconAPI } from '../api/client.js'

const CACHE_KEY = 'docker_copilot_container_favicons'
const TTL = 7 * 24 * 60 * 60 * 1000

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function cacheKey(containerName, port) {
  return `${containerName}:${port}`
}

export function getCachedFavicon(containerName, port) {
  const rec = loadCache()[cacheKey(containerName, port)]
  if (rec && rec.url && Date.now() - (rec.ts || 0) < TTL) {
    return rec.url
  }
  return null
}

// 容器的 Web 入口地址：面板从哪台机器打开的，链接就指到哪台机器 + 容器端口
export function containerWebUrl(port) {
  return `http://${window.location.hostname}:${port}`
}

export async function resolveFavicon(containerName, port) {
  const cached = getCachedFavicon(containerName, port)
  if (cached) return cached
  try {
    const resp = await faviconAPI.resolve(containerWebUrl(port))
    const url = resp?.data?.data?.url
    if (url) {
      const all = loadCache()
      all[cacheKey(containerName, port)] = { url, ts: Date.now() }
      localStorage.setItem(CACHE_KEY, JSON.stringify(all))
      return url
    }
  } catch {
    // 解析失败静默降级为默认图标
  }
  return null
}
