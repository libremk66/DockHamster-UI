import React, { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, HardDrive, Network, ChevronDown, ChevronUp } from 'lucide-react'
import { resourcesAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

// 「资源清理」页：未使用卷 / 网络的查看与清理。
//
// 安全口径（与后端一致）：
// - 匿名卷（64 位哈希）：常规清理对象
// - 项目卷（有名/带 compose 标签）：单独列出、显式确认（可能有旧项目数据）
// - 网络：仅非系统网络；系统网络（bridge/host/none/ingress）不出现
// - 卷清理有 24 小时时间窗（刚创建的不动），删除前后端还会二次校验引用

function fmtSize(bytes) {
  if (!bytes) return '0 MB'
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

// 卷的 size 常为 0（daemon 未启用 volume 用量统计）→ 不显示，避免"0 MB"误导
function volSizeText(v) {
  return v.size > 0 ? fmtSize(v.size) : ''
}

// 匿名卷名 = 64 位哈希 → 显示前 12 位
function shortVolName(name) {
  return name && name.length === 64 ? `${name.slice(0, 12)}…` : name
}

const EmptyTip = ({ text }) => (
  <div className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{text}</div>
)

export function Resources({ onClose, onDone }) {
  const [stat, setStat] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })
  const [showVolumes, setShowVolumes] = useState(false)
  const [showProject, setShowProject] = useState(false)
  const [showNets, setShowNets] = useState(false)
  const [pruneModal, setPruneModal] = useState({ isOpen: false, kind: null, title: '', desc: '', payload: null, loading: false })

  const fetchStat = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const r = await resourcesAPI.getUnused()
      if (r.data?.code === 200) {
        setStat(r.data.data || null)
      } else {
        setError(r.data?.msg || '获取资源统计失败')
      }
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '网络错误')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchStat() }, [])

  const doPrune = async () => {
    const p = pruneModal.payload
    if (!p) return
    try {
      setPruneModal(m => ({ ...m, loading: true }))
      const r = await resourcesAPI.prune(p)
      setPruneModal({ isOpen: false, kind: null, title: '', desc: '', payload: null, loading: false })
      if (r.data?.code === 200) {
        setSuccessModal({ isOpen: true, message: r.data.msg || '清理完成' })
        fetchStat()
        onDone && onDone()
        setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 5000)
      } else {
        setError(r.data?.msg || '清理失败')
      }
    } catch (e) {
      setPruneModal(m => ({ ...m, loading: false }))
      setError(e.response?.data?.msg || e.message || '清理失败')
    }
  }

  const anonymousVols = stat?.anonymousVolumes || []
  const projectVols = stat?.projectVolumes || []
  const networks = stat?.networks || []
  const unused = anonymousVols.length + projectVols.length + networks.length

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">资源清理</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              清理 docker 遗留的未使用卷与网络（容器更新/删除后积累的"看不见的垃圾"）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStat}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg border text-sm text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
              刷新
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border text-sm text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="返回镜像列表"
              >
                返回
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {!isLoading && stat && unused === 0 && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-300">
            ✓ 很干净：没有未使用的卷或网络
          </div>
        )}
      </div>

      {/* 未使用的卷 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">
                未使用的卷
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  {anonymousVols.length + projectVols.length} 个
                  {stat?.sizeUnavailable ? ' · 大小未统计' : ` · 约 ${stat?.unusedVolumeSizeText || '0 MB'}`}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                匿名残留 {anonymousVols.length} · 停用项目卷 {projectVols.length}
              </div>
            </div>
          </div>
          {anonymousVols.length > 0 && (
            <button
              onClick={() => setPruneModal({
                isOpen: true, kind: 'volumes', loading: false,
                title: '清理匿名卷',
                desc: `将删除 ${anonymousVols.length} 个容器重建遗留的匿名卷（创建超过 24 小时、无容器引用的）。`,
                payload: { volumes: true, projectVolumes: false, networks: false },
              })}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              清理匿名卷
            </button>
          )}
        </div>

        {anonymousVols.length === 0 && projectVols.length === 0 ? (
          <EmptyTip text="没有未使用的卷" />
        ) : (
          <div className="mt-3 space-y-2">
            {anonymousVols.length > 0 && (
              <div>
                <button
                  onClick={() => setShowVolumes(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span>匿名卷（可安全清理）</span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    {showVolumes ? '收起' : `查看 ${anonymousVols.length} 个`}
                    {showVolumes ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {showVolumes && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {anonymousVols.map(v => (
                      <div key={v.Name} className="flex items-center justify-between px-3 py-1.5 bg-gray-50/60 dark:bg-gray-700/20 rounded-lg text-xs">
                        <span className="font-mono text-gray-600 dark:text-gray-300" title={v.Name}>{shortVolName(v.Name)}</span>
                        <span className="text-gray-400">{volSizeText(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {projectVols.length > 0 && (
              <div>
                <button
                  onClick={() => setShowProject(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                >
                  <span>停用项目的卷（⚠️ 可能包含旧项目数据，请逐一确认）</span>
                  <span className="flex items-center gap-1 text-xs">
                    {showProject ? '收起' : `查看 ${projectVols.length} 个`}
                    {showProject ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {showProject && (
                  <div className="mt-2 space-y-1.5">
                    {projectVols.map(v => (
                      <div key={v.Name} className="flex items-center justify-between px-3 py-1.5 bg-gray-50/60 dark:bg-gray-700/20 rounded-lg text-xs">
                        <span className="truncate">
                          <span className="font-mono text-gray-700 dark:text-gray-300">{v.Name}</span>
                          {v.Project && <span className="ml-2 text-amber-600 dark:text-amber-500">项目 {v.Project}（已停用）</span>}
                          {!v.Project && <span className="ml-2 text-gray-400">有名卷</span>}
                        </span>
                        <span className="text-gray-400 flex-shrink-0 ml-2">{volSizeText(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 未使用的网络 */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
              <Network className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">
                未使用的网络
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{networks.length} 个</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                compose 项目删除/重建后遗留；系统网络（bridge/host/none）不会被列出或删除
              </div>
            </div>
          </div>
          {networks.length > 0 && (
            <button
              onClick={() => setPruneModal({
                isOpen: true, kind: 'networks', loading: false,
                title: '清理未使用网络',
                desc: `将删除 ${networks.length} 个无容器使用的网络。正在被使用的网络 daemon 会拒绝删除。`,
                payload: { volumes: false, projectVolumes: false, networks: true },
              })}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
            >
              清理网络
            </button>
          )}
        </div>

        {networks.length === 0 ? (
          <EmptyTip text="没有未使用的网络" />
        ) : (
          <div className="mt-3">
            <button
              onClick={() => setShowNets(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <span>未使用网络列表</span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                {showNets ? '收起' : `查看 ${networks.length} 个`}
                {showNets ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
            {showNets && (
              <div className="mt-2 space-y-1.5">
                {networks.map(n => (
                  <div key={n.ID} className="flex items-center justify-between px-3 py-1.5 bg-gray-50/60 dark:bg-gray-700/20 rounded-lg text-xs">
                    <span className="truncate">
                      <span className="font-mono text-gray-700 dark:text-gray-300">{n.Name}</span>
                      <span className="ml-2 text-gray-400">{n.Driver}</span>
                      {n.Project && <span className="ml-2 text-gray-400">项目 {n.Project}</span>}
                    </span>
                    {n.CreatedAt && <span className="text-gray-400 flex-shrink-0 ml-2">{n.CreatedAt}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 确认弹窗 */}
      {pruneModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{pruneModal.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{pruneModal.desc}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-700/20">
              <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1.5 list-disc pl-4">
                <li>删除操作不可恢复；无容器引用的才会被删除（daemon 会拒绝在用的）</li>
                <li>卷创建不足 24 小时的会被跳过（避免误删刚创建的）</li>
                <li>正在被容器使用的卷/网络不会被删除</li>
              </ul>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setPruneModal({ isOpen: false, kind: null, title: '', desc: '', payload: null, loading: false })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={doPrune}
                disabled={pruneModal.loading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl transition-colors disabled:opacity-50"
              >
                {pruneModal.loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    清理中...
                  </span>
                ) : '确认清理'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 成功提示 */}
      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="mx-auto h-12 w-12 bg-green-50 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">清理完成</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{successModal.message}</p>
            <button
              onClick={() => setSuccessModal({ isOpen: false, message: '' })}
              className="mt-4 w-full px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition-colors"
            >
              好的
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
