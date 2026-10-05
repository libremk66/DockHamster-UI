import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HardDrive, Trash2, RefreshCw, Link, BrushCleaning, X, AlertCircle, CheckCircle, Search, History, ShieldCheck, Zap } from 'lucide-react'
import { imageAPI, autoUpdateAPI, containerAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'
import { CheckUpdateButton } from './CheckUpdateButton.jsx'
import { AcceleratorPanel, AcceleratorPullModal } from './Accelerator.jsx'
import { getImageLogo } from '../config/imageLogos.js'

// 是否是 Docker Hub 镜像（无 registry 前缀；加速拉取仅支持这类）
function isDockerHubImage(name) {
  if (!name || name === 'None' || name === '<none>') return false
  if (name.startsWith('dh-snap/')) return false // 本地快照命名空间
  const first = name.split('/')[0]
  return !first.includes('.') && !first.includes(':') && first !== 'localhost'
}

// 安全的图片组件
function SafeImage({ src, alt, className, fallback }) {
  const [hasError, setHasError] = React.useState(false)

  if (hasError || !src) {
    return fallback
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export function Images() {
  const [images, setImages] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, image: null })
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部
  const [searchQuery, setSearchQuery] = useState('')
  const [pruneModal, setPruneModal] = useState({ isOpen: false, type: null, images: [] })
  const [successModal, setSuccessModal] = useState({ isOpen: false, message: '' })
  // 快照（旧镜像回滚）
  const [snapshots, setSnapshots] = useState([])
  const [containers, setContainers] = useState([])
  const [rollbackTarget, setRollbackTarget] = useState(null)
  // 加速源面板 / 加速拉取
  const [accelPanelOpen, setAccelPanelOpen] = useState(false)
  const [pullModal, setPullModal] = useState({ isOpen: false, image: null })
  const [checkingUpdates, setCheckingUpdates] = useState(false) // {containerName, ref, candidates}

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      try {
        const response = await imageAPI.getIcons()
        if (response.data.code === 200 || response.data.code === 0) {
          const icons = response.data.data || {}
          // update localStorage
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
          return icons
        }
      } catch (err) {
        console.error('获取图标失败:', err)
      }
      return {}
    },
    // 初始数据尝试从localStorage获取
    initialData: () => {
      const saved = localStorage.getItem('docker_copilot_image_logos')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {
          console.error('解析本地图标配置失败:', e)
        }
      }
      return undefined
    }
  })

  const fetchImages = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await imageAPI.getImages()

      if (response.data && (response.data.code === 0 || response.data.code === 200)) {
        setImages(response.data.data || [])
      } else {
        const errorMsg = response.data?.msg || '获取镜像列表失败'
        setError(errorMsg)
        setImages([])
      }
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '网络错误，请检查后端服务'
      setError(errorMsg)
      setImages([])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchSnapshots = async () => {
    try {
      const [snap, c] = await Promise.all([autoUpdateAPI.getSnapshots(), containerAPI.getContainers()])
      if (snap.data?.data) setSnapshots(snap.data.data.snapshots || [])
      if (c.data && (c.data.code === 200 || c.data.code === 0)) setContainers(c.data.data || [])
    } catch (e) { /* 老后端忽略 */ }
  }

  useEffect(() => {
    fetchImages()
    fetchSnapshots()
  }, [])

  // 快照对应的候选容器（按快照名匹配容器名或镜像短名）
  const containersForSnapshot = (sn) => {
    const base = (sn.baseName || '').toLowerCase()
    if (!base) return []
    return containers.filter(c => {
      const imageRef = c.usingImage || ''
      const repoNoTag = imageRef.lastIndexOf(':') > imageRef.lastIndexOf('/') ? imageRef.slice(0, imageRef.lastIndexOf(':')) : imageRef
      const shortName = repoNoTag.includes('/') ? repoNoTag.slice(repoNoTag.lastIndexOf('/') + 1) : repoNoTag
      return c.name?.toLowerCase() === base || shortName?.toLowerCase() === base
    })
  }

  const deleteSnapshot = async (ref) => {
    try {
      const r = await autoUpdateAPI.deleteSnapshots([ref])
      if (r.data?.code === 200) {
        const failed = r.data.data?.failed || {}
        if (failed[ref]) {
          setError(`删除失败：${failed[ref]}`)
        } else {
          setSuccessModal({ isOpen: true, message: '快照已删除' })
        }
        fetchSnapshots()
      } else {
        setError(r.data?.msg || '删除失败')
      }
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '删除失败')
    }
  }

  const onCheckDone = (st) => {
    fetchImages()
    if (st && !st.running) {
      setSuccessModal({ isOpen: true, message: `已检查 ${st.checked || 0} 个镜像，发现 ${st.needUpdate || 0} 个有新版本` })
    }
  }

  const pruneSnapshots = async () => {
    try {
      const r = await autoUpdateAPI.pruneSnapshots()
      if (r.data?.code === 200) {
        setSuccessModal({ isOpen: true, message: r.data.msg || '已清理' })
        fetchSnapshots()
      } else {
        setError(r.data?.msg || '清理失败')
      }
    } catch (e) {
      setError(e.response?.data?.msg || e.message || '清理失败')
    }
  }

  const handleDeleteImage = async (imageId, force = false) => {
    try {
      setIsLoading(true)
      setDeleteModal({ isOpen: false, image: null })

      await imageAPI.deleteImage(imageId, force)

      setSuccessModal({ isOpen: true, message: '镜像删除成功' })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '删除镜像失败'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const handlePrune = async (type) => {
    try {
      setIsLoading(true)
      setError(null)

      let imagesToDelete = []
      if (type === 'dangling') {
        imagesToDelete = images.filter(img => img.tag === 'None' || img.tag === '<none>')
      } else if (type === 'unused') {
        imagesToDelete = images.filter(img => !img.inUsed)
      }

      if (imagesToDelete.length === 0) {
        setError('没有找到需要清理的镜像')
        setIsLoading(false)
        return
      }

      // 批量删除
      const deletePromises = imagesToDelete.map(image =>
        imageAPI.deleteImage(image.id, false)
      )

      await Promise.all(deletePromises)

      const message = type === 'dangling'
        ? `成功清理 ${imagesToDelete.length} 个无Tag镜像`
        : `成功清理 ${imagesToDelete.length} 个未使用的镜像`

      setSuccessModal({ isOpen: true, message })
      fetchImages()
      setTimeout(() => setSuccessModal({ isOpen: false, message: '' }), 3000)
    } catch (error) {
      const errorMsg = error.response?.data?.msg || error.message || '清理镜像失败'
      setError(errorMsg)
      setIsLoading(false)
    }
  }

  const formatImageSize = (sizeStr) => {
    if (!sizeStr) return '0 MB'
    return sizeStr.replace(/mb/gi, 'MB')
      .replace(/gb/gi, 'GB')
      .replace(/kb/gi, 'KB')
  }

  const getSizeColor = (size) => {
    const sizeInMB = parseInt(size)
    if (sizeInMB < 100) return 'text-green-600 dark:text-green-400'
    if (sizeInMB < 300) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  // 悬空（无 tag）镜像判断
  const isDanglingImage = (image) => {
    const noName = !image.name || image.name === 'None' || image.name === '<none>'
    const noTag = !image.tag || image.tag === 'None' || image.tag === '<none>'
    return noName || noTag
  }

  const formatImageRef = (image) => (isDanglingImage(image) ? '<none>:<none>' : `${image.name}:${image.tag}`)

  const shortImageId = (id) => (id || '').replace(/^sha256:/, '').slice(0, 12)

  // 列表筛选：状态 + 关键字（镜像名 / tag / ID）
  const matchImage = (image) => {
    if (filterStatus === 'used' && !image.inUsed) return false
    if (filterStatus === 'unused' && image.inUsed) return false
    if (filterStatus === 'dangling' && !isDanglingImage(image)) return false
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const haystack = `${image.name || ''} ${image.tag || ''} ${image.id || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }

  const visibleImages = images.filter(matchImage)

  if (isLoading && images.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="card p-6 h-48 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* 页面头部 */}
      <div className="px-2 sm:px-6 py-4 pt-4 sm:pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">镜像管理</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">查看和管理Docker镜像</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAccelPanelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200 rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors text-sm font-medium"
              title="管理镜像加速源 / 测速"
            >
              <Zap className="h-4 w-4" />
              <span>加速源</span>
            </button>
            <button
              onClick={() => {
                const imagesToDelete = images.filter(img => img.tag === 'None' || img.tag === '<none>')
                setPruneModal({ isOpen: true, type: 'dangling', images: imagesToDelete })
              }}
              disabled={isLoading || images.filter(img => img.tag === 'None' || img.tag === '<none>').length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <BrushCleaning className="h-4 w-4" />
              <span>无Tag</span>
            </button>
            <button
              onClick={() => {
                const imagesToDelete = images.filter(img => !img.inUsed)
                setPruneModal({ isOpen: true, type: 'unused', images: imagesToDelete })
              }}
              disabled={isLoading || images.filter(img => !img.inUsed).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <BrushCleaning className="h-4 w-4" />
              <span>未使用</span>
            </button>
            <button
              onClick={fetchImages}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>
      </div>

      {/* 状态消息 */}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <span className="text-red-800 dark:text-red-200 text-sm flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-lg flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <span className="text-green-800 dark:text-green-200 text-sm flex-1">{success}</span>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 成功弹窗 */}
      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100 hover:scale-105">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-green-600"></div>

            <div className="p-8 flex flex-col items-center text-center">
              {/* 成功图标容器 - 带脉冲动画 */}
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-green-400/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative h-16 w-16 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-full flex items-center justify-center border border-green-200 dark:border-green-700">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 animate-bounceIn" />
                </div>
              </div>

              {/* 标题 */}
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                操作成功
              </h3>

              {/* 分隔线 */}
              <div className="w-12 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent rounded-full mb-4"></div>

              {/* 消息内容 */}
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {successModal.message}
              </p>

              {/* 按钮 */}
              <button
                onClick={() => setSuccessModal({ isOpen: false, message: '' })}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 shadow-lg"
              >
                完成
              </button>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-green-200 dark:via-green-800 to-transparent"></div>
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="px-2 sm:px-6 py-4">
        <div className="grid grid-cols-5 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* 总镜像数 */}
          <button
            onClick={() => setFilterStatus(null)}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === null ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400 transition-transform duration-300 group-hover:scale-110">
                {images.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">总镜像</div>
            </div>
          </button>

          {/* 使用中 */}
          <button
            onClick={() => setFilterStatus('used')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'used' ? "bg-green-50 dark:bg-green-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => img.inUsed).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">使用中</div>
            </div>
          </button>

          {/* 未使用 */}
          <button
            onClick={() => setFilterStatus('unused')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'unused' ? "bg-yellow-50 dark:bg-yellow-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => !img.inUsed).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">未使用</div>
            </div>
          </button>

          {/* 快照 */}
          <button
            onClick={() => setFilterStatus('snapshot')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'snapshot' ? "bg-amber-50 dark:bg-amber-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 transition-transform duration-300 group-hover:scale-110">
                {snapshots.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">快照</div>
            </div>
          </button>

          {/* 无Tag */}
          <button
            onClick={() => setFilterStatus('dangling')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center",
              filterStatus === 'dangling' ? "bg-orange-50 dark:bg-orange-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400 transition-transform duration-300 group-hover:scale-110">
                {images.filter(img => img.tag === 'None' || img.tag === '<none>').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">无Tag</div>
            </div>
          </button>
        </div>
      </div>

      {/* 筛选提示 */}
      {filterStatus && (
        <div className="px-4 sm:px-6 pt-2 pb-0">
          <div className="mb-0 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-700 dark:text-blue-300">
                筛选中：
                {filterStatus === 'used' && '使用中的镜像'}
                {filterStatus === 'unused' && '未使用的镜像'}
                {filterStatus === 'snapshot' && '镜像快照（更新前旧版本，可回滚）'}
                {filterStatus === 'dangling' && '无Tag的镜像'}
              </span>
              <button
                onClick={() => setFilterStatus(null)}
                className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
              >
                清除筛选
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 镜像列表 */}
      <div className="px-2 sm:px-6 py-4">
        {images.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {filterStatus === 'snapshot'
                ? `共 ${snapshots.length} 个快照`
                : visibleImages.length === images.length
                  ? `共 ${images.length} 个镜像`
                  : `筛选出 ${visibleImages.length} / ${images.length} 个镜像`}
            </span>
            <CheckUpdateButton onDone={onCheckDone} />
            {filterStatus === 'snapshot' && snapshots.length > 0 && (
              <button
                onClick={pruneSnapshots}
                className="px-2.5 py-1.5 rounded-lg border text-xs font-medium text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors ml-2"
                title="按保留数量清理过期快照"
              >
                清理过期快照
              </button>
            )}
            <div className="relative w-56 max-w-[60%]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索镜像…"
                className="w-full pl-8 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="清空搜索"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
        {filterStatus === 'snapshot' ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_110px_150px_170px_220px] gap-3 px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-b border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10">
              <span>快照</span>
              <span>大小</span>
              <span>状态</span>
              <span>时间</span>
              <span className="text-right">操作</span>
            </div>
            {snapshots.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                还没有快照。开启「更新完成后打快照保留」后，更新前的旧镜像会自动留下快照。
              </div>
            )}
            {snapshots.map(sn => {
              const cands = containersForSnapshot(sn)
              return (
                <div
                  key={sn.ref}
                  className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_110px_150px_170px_220px] gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <History className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white font-mono truncate">{sn.ref}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
                        sha256:{sn.shortId}{sn.usedBy?.length ? ` · 被 ${sn.usedBy.join('、')} 使用` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {(sn.size / 1024 / 1024).toFixed(0)} MB
                    </div>
                    <div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium whitespace-nowrap inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />受保护
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {sn.timeLabel || '—'}
                    </div>
                  </div>
                  <div className="flex gap-1.5 justify-end items-center">
                    {cands.length > 0 && (
                      <button
                        onClick={() => setRollbackTarget({ containerName: cands[0].name, ref: sn.ref, candidates: cands })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        title={`回滚容器 ${cands.map(c => c.name).join('、')} 到此快照`}
                      >
                        <History className="h-3.5 w-3.5" />回滚
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, image: { id: sn.ref, name: sn.ref, force: true }, snapshotRef: sn.ref })}
                      disabled={sn.inUse}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={sn.inUse ? '仍被容器使用，无法删除' : '删除此快照'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />删除
                    </button>
                  </div>
                </div>
              )
            })}
            <div className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 bg-amber-50/40 dark:bg-amber-900/5">
              快照是本地标签（独立命名空间），不参与「更新检测」，也不会被「自动清理旧镜像」删除；点击「回滚」可把容器恢复到该版本。
            </div>
          </div>
        ) : images.length === 0 ? (
          <div className="card p-12 text-center rounded-2xl">
            <HardDrive className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">暂无镜像</h3>
            <p className="text-gray-500 dark:text-gray-400">您还没有任何Docker镜像</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            {/* 表头（桌面端） */}
            <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_110px_130px_170px_220px] gap-3 px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-900/20">
              <span>镜像</span>
              <span>大小</span>
              <span>使用情况</span>
              <span>创建时间</span>
              <span className="text-right">操作</span>
            </div>
            {visibleImages.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                没有匹配的镜像（试试调整筛选条件或搜索关键字）
              </div>
            )}
            {visibleImages.map((image) => {
              const dangling = isDanglingImage(image)
              return (
                <div
                  key={image.id}
                  className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_110px_130px_170px_260px] gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors"
                >
                  {/* ① 镜像 */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(image.name, customIcons)}
                        alt={image.name}
                        className="h-10 w-10 object-cover"
                        fallback={<HardDrive className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn(
                        "text-sm font-semibold truncate",
                        dangling ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
                      )}>
                        {formatImageRef(image)}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
                        sha256:{shortImageId(image.id)}{dangling ? ' · 无标签（悬空）' : ''}
                      </div>
                    </div>
                  </div>

                  {/* 移动端横排；桌面端展开为三列 */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
                    {/* ② 大小 */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatImageSize(image.size)}
                    </div>
                    {/* ③ 使用情况 */}
                    <div>
                      {image.inUsed
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium whitespace-nowrap">使用中</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 font-medium whitespace-nowrap">未使用</span>}
                    </div>
                    {/* ④ 创建时间 */}
                    <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {image.createTime || '—'}
                    </div>
                  </div>

                  {/* ⑤ 操作 */}
                  <div className="flex gap-1.5 justify-end items-center">
                    {!dangling && isDockerHubImage(image.name) && (
                      <button
                        onClick={() => setPullModal({ isOpen: true, image })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-amber-600 dark:text-amber-400 border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        title="通过加速源重新拉取（更新此镜像）"
                      >
                        <Zap className="h-3.5 w-3.5" />加速拉取
                      </button>
                    )}
                    <a
                      href={`https://hub.docker.com/r/${image.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-200 dark:hover:border-primary-800 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                      title="在Docker Hub查看"
                    >
                      <Link className="h-3.5 w-3.5" />Hub
                    </a>
                    <button
                      onClick={() => setDeleteModal({ isOpen: true, image, force: false })}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />删除
                    </button>
                    {image.inUsed && (
                      <button
                        onClick={() => setDeleteModal({ isOpen: true, image, force: true })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-orange-600 dark:text-orange-400 border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                        title="强制删除正在使用的镜像"
                      >
                        <Trash2 className="h-3.5 w-3.5" />强删
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 批量删除确认弹窗 */}
      {pruneModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-96 flex flex-col overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            <div className="h-1 bg-gradient-to-r from-orange-400 via-red-500 to-orange-600"></div>

            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start gap-4">
                <div className="relative h-12 w-12 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-orange-200 dark:border-orange-700 flex-shrink-0">
                  <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {pruneModal.type === 'dangling' ? '删除无Tag镜像' : '删除未使用的镜像'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    将永久删除 <span className="font-semibold text-orange-600 dark:text-orange-400">{pruneModal.images.length} 个</span> 镜像，此操作不可恢复
                  </p>
                </div>
              </div>
            </div>

            {/* 镜像列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50/50 dark:bg-gray-700/20">
              <div className="space-y-2">
                {pruneModal.images.map((img) => (
                  <div key={img.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-xl hover:shadow-md transition-all duration-200">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                      <SafeImage
                        src={getImageLogo(img.name, customIcons)}
                        alt={img.name}
                        className="h-8 w-8 object-cover"
                        fallback={<HardDrive className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {img.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {img.tag}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex-shrink-0 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-lg">
                      {formatImageSize(img.size)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700/50 flex gap-3">
              <button
                onClick={() => setPruneModal({ isOpen: false, type: null, images: [] })}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handlePrune(pruneModal.type)
                  setPruneModal({ isOpen: false, type: null, images: [] })
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    删除中...
                  </span>
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 回滚确认弹窗 */}
      {rollbackTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex-1">回滚容器到快照</h3>
              <button onClick={() => setRollbackTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">
              <p>
                将把容器 <b className="text-gray-900 dark:text-white">{rollbackTarget.containerName}</b> 恢复为快照版本：
              </p>
              <p className="font-mono text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-lg px-3 py-2 break-all">
                {rollbackTarget.ref}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                回滚前会自动给当前版本也打一份快照，随时可以再回滚回来；回滚过程会短暂重启该容器。
              </p>
              {rollbackTarget.candidates.length > 1 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  该快照匹配多个容器（{rollbackTarget.candidates.map(c => c.name).join('、')}），将回滚第一个：{rollbackTarget.candidates[0].name}
                </p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => setRollbackTarget(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const t = rollbackTarget
                  setRollbackTarget(null)
                  try {
                    const r = await autoUpdateAPI.rollbackSnapshot(t.containerName, t.ref)
                    if (r.data?.code === 200) {
                      setSuccessModal({ isOpen: true, message: `已开始回滚 ${t.containerName}，可在容器页查看进度` })
                    } else {
                      setError(r.data?.msg || '回滚失败')
                    }
                  } catch (e) {
                    setError(e.response?.data?.msg || e.message || '回滚失败')
                  }
                }}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors"
              >
                确认回滚
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all duration-300 scale-100">
            {/* 顶部装饰条 */}
            {/*<div className="h-1 bg-gradient-to-r from-red-400 via-rose-500 to-red-600"></div>*/}

            <div className="p-8 flex flex-col">
              {/* 图标和标题 */}
              <div className="flex items-start gap-4 mb-6">
                <div className="relative h-12 w-12 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30 rounded-full flex items-center justify-center flex-shrink-0 border border-red-200 dark:border-red-700">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {deleteModal.snapshotRef ? '删除快照' : deleteModal.force ? '强制删除镜像' : '删除镜像'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">此操作不可恢复</p>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="w-full h-px bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent mb-6"></div>

              {/* 消息内容 */}
              <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-8">
                {deleteModal.snapshotRef ? (
                  <>
                    确定要删除快照{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400 font-mono">"{deleteModal.snapshotRef}"</span>
                    {' '}吗？删除后将无法回滚到该版本。
                  </>
                ) : deleteModal.force ? (
                  <>
                    确定要强制删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗？这将删除正在使用的镜像！
                  </>
                ) : (
                  <>
                    确定要删除镜像{' '}
                    <span className="font-semibold text-red-600 dark:text-red-400">"{deleteModal.image?.name}"</span>
                    {' '}吗？
                  </>
                )}
              </div>

              {/* 按钮组 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteModal({ isOpen: false, image: null })}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 transform hover:shadow-md active:scale-95 border border-gray-200 dark:border-gray-600"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    if (deleteModal.snapshotRef) {
                      deleteSnapshot(deleteModal.snapshotRef)
                      setDeleteModal({ isOpen: false, image: null })
                    } else if (deleteModal.image) {
                      handleDeleteImage(deleteModal.image.id, deleteModal.force)
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white rounded-xl transition-all duration-300 transform hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      删除中
                    </span>
                  ) : (
                    '确认删除'
                  )}
                </button>
              </div>
            </div>

            {/* 底部装饰 */}
            <div className="h-0.5 bg-gradient-to-r from-transparent via-red-200 dark:via-red-800 to-transparent"></div>
          </div>
        </div>
      )}

      {/* 加速源管理面板 */}
      <AcceleratorPanel isOpen={accelPanelOpen} onClose={() => setAccelPanelOpen(false)} />

      {/* 加速拉取弹窗 */}
      <AcceleratorPullModal
        isOpen={pullModal.isOpen}
        image={pullModal.image}
        onClose={() => setPullModal({ isOpen: false, image: null })}
        onDone={fetchImages}
      />
    </div>
  )
}
