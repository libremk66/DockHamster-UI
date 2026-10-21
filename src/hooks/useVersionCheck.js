import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { versionAPI } from '../api/client.js'

/**
 * 检查版本是否需要更新
 * @param {string} currentVersion 当前版本
 * @param {string} latestVersion 最新版本
 * @returns {boolean} 是否需要更新
 */
function shouldUpdate(currentVersion, latestVersion) {
  if (currentVersion === 'unknown' || latestVersion === 'unknown') {
    return false
  }
  
  const current = parseVersion(currentVersion)
  const latest = parseVersion(latestVersion)
  
  if (current === null || latest === null) {
    return false
  }
  
  // 比较 major.minor.patch
  if (latest.major > current.major) return true
  if (latest.major === current.major && latest.minor > current.minor) return true
  if (latest.major === current.major && latest.minor === current.minor && latest.patch > current.patch) return true
  
  return false
}

/**
 * 解析版本号
 * @param {string} version 版本号字符串 (e.g., "1.0.0")
 * @returns {Object|null} 解析后的版本对象或 null
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') return null

  // 兼容 "v1.2.3" / "V1.2.3" 前缀（本项目的版本号带 v，不处理的话更新提示永远不触发）
  const normalized = version.trim().replace(/^[vV]/, '')
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/)
  if (!match) return null
  
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: version,
  }
}

/**
 * 版本检查 Hook
 * 用于检查后端版本，并提示用户是否有更新
 *
 * 本地版本与远端检查拆成两个独立查询（2026-10-21）：
 *   之前两者串行放在同一个 queryFn 里，远端要访问 GitHub/CDN（可能超时数秒），
 *   导致页面进来后本地版本号被拖住、迟迟不显示。现在本地查询毫秒级返回并立即渲染，
 *   远端检查单独在后台跑，只用于「有新版本」提示。
 */
export function useVersionCheck() {
  // 本地版本：只读后端内存，立即显示
  const localQuery = useQuery({
    queryKey: ['version', 'local'],
    queryFn: async () => {
      try {
        const localResponse = await versionAPI.getVersion('local')

        if (localResponse.data.code === 200 || localResponse.data.code === 0) {
          const localData = localResponse.data.data
          if (localData && typeof localData === 'object') {
            return {
              backendVersion: localData.version || 'unknown',
              buildDate: localData.buildDate || '',
            }
          }
          if (typeof localData === 'string') {
            return { backendVersion: localData, buildDate: '' }
          }
        }
        return { backendVersion: 'unknown', buildDate: '' }
      } catch (error) {
        console.error('获取本地版本失败:', error)
        return { backendVersion: 'unknown', buildDate: '' }
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  })

  // 远端版本：需要访问外网，可能较慢；后台加载，不阻塞版本号显示
  const remoteQuery = useQuery({
    queryKey: ['version', 'remote'],
    queryFn: async () => {
      try {
        const remoteResponse = await versionAPI.getVersion('remote')

        if (remoteResponse.data.code === 200 || remoteResponse.data.code === 0) {
          const remoteData = remoteResponse.data.data
          if (remoteData && typeof remoteData === 'object') {
            return {
              remoteVersion: remoteData.remoteVersion || 'unknown',
              imageUpdate: !!remoteData.imageUpdate,
            }
          }
          if (typeof remoteData === 'string') {
            return { remoteVersion: remoteData, imageUpdate: false }
          }
        }
        return { remoteVersion: 'unknown', imageUpdate: false }
      } catch (error) {
        console.warn('获取远端版本信息失败:', error)
        return { remoteVersion: 'unknown', imageUpdate: false }
      }
    },
    refetchInterval: 60000, // 每分钟自动刷新
    refetchOnWindowFocus: false,
    staleTime: 30000, // 30秒内不重新请求
    enabled: !!localQuery.data?.backendVersion,
  })

  const backendVersion = localQuery.data?.backendVersion
  const remoteVersion = remoteQuery.data?.remoteVersion ?? 'unknown'
  const versionUpdate = shouldUpdate(backendVersion, remoteVersion)
  // 双保险：版本号更新 或 镜像 digest 变化，都算"有新版本"
  const imageUpdate = remoteQuery.data?.imageUpdate ?? false

  // 手动检查更新：两个查询都刷新
  const checkForUpdates = useCallback(async () => {
    await Promise.all([localQuery.refetch(), remoteQuery.refetch()])
  }, [localQuery.refetch, remoteQuery.refetch])

  return {
    // 版本数据
    backendVersion,
    remoteVersion,
    buildDate: localQuery.data?.buildDate,
    hasBackendUpdate: versionUpdate || imageUpdate,
    imageUpdate,
    versionUpdate,

    // 方法
    checkForUpdates
  }
}
