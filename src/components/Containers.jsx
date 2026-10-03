import React, { useState, useEffect } from 'react'
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Upload,
  Zap,
  Clock,
  Calendar,
  Package,
  X,
  Info,
  Search
} from 'lucide-react'
import { containerAPI, progressAPI, imageAPI, autoUpdateAPI } from '../api/client.js'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getImageLogo } from '../config/imageLogos.js'
import icons8Img from '../assets/icons8.png'

// 格式化运行时间为中文
function formatRunningTime(runningTime) {
  if (!runningTime) return '未知'

  // 如果已经是中文格式，直接返回
  if (runningTime.includes('小时') || runningTime.includes('分钟') || runningTime.includes('秒')) {
    return runningTime
  }

  // 尝试解析英文格式
  // 支持格式: "2h 30m", "2 hours 30 minutes", "30m", "30 minutes", "1 day 2h 30m" 等
  let hours = 0
  let minutes = 0
  let days = 0

  // 提取天数
  const dayMatch = runningTime.match(/(\d+)\s*(?:day|d)/)
  if (dayMatch) {
    days = parseInt(dayMatch[1])
  }

  // 提取小时
  const hourMatch = runningTime.match(/(\d+)\s*(?:hour|h)/)
  if (hourMatch) {
    hours = parseInt(hourMatch[1])
  }

  // 提取分钟
  const minMatch = runningTime.match(/(\d+)\s*(?:minute|min|m)/)
  if (minMatch) {
    minutes = parseInt(minMatch[1])
  }

  // 构建中文输出
  let result = ''
  if (days > 0) {
    result += `${days}天 `
  }
  if (hours > 0) {
    result += `${hours}小时 `
  }
  if (minutes > 0 || (days === 0 && hours === 0)) {
    result += `${minutes}分钟`
  }

  return result.trim()
}

// 自动更新状态徽标（上次自动更新结果，显示在运行时间后面）
function AutoUpdateBadge({ info }) {
  if (!info) return null
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 flex-shrink-0", info.ok ? "text-emerald-500" : "text-red-500")}
      title={`上次自动更新：${info.time} ${info.message || ''}`}
    >
      · <Zap className="h-3 w-3" />{info.time ? info.time.slice(5, 16) : ''}{info.ok ? '✓' : '✕'}
    </span>
  )
}

export function Containers() {
  const queryClient = useQueryClient()
  const [selectedContainer, setSelectedContainer] = useState(null)
  // 添加批量操作相关的状态
  const [selectedContainers, setSelectedContainers] = useState([])
  const [isBatchMode, setIsBatchMode] = useState(false)
  // 添加操作状态跟踪
  const [containerActions, setContainerActions] = useState({}) // 跟踪每个容器的操作状态
  const [updateTasks, setUpdateTasks] = useState({}) // 跟踪更新任务
  // 添加筛选状态
  const [filterStatus, setFilterStatus] = useState(null) // null 表示显示全部
  // 搜索关键字（名称 / 镜像）
  const [searchQuery, setSearchQuery] = useState('')

  // 自定义确认弹窗状态
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    type: 'info' // info, warning, danger
  })

  // 自动更新（定制功能）：配置、运行状态、共用镜像弹窗
  const [autoSettings, setAutoSettings] = useState(null)
  const [autoStatus, setAutoStatus] = useState(null)
  const [groupModal, setGroupModal] = useState({ isOpen: false, container: null, siblings: [] })



  // 使用React Query获取容器列表
  const { data: containers = [], isLoading, refetch } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await containerAPI.getContainers()
      if (response.data.code === 200 || response.data.code === 0) {
        console.log('容器数据:', response.data.data)
        return response.data.data || []
      } else {
        throw new Error(response.data.msg)
      }
    },
    refetchInterval: 10000, // 每10秒自动刷新一次
  })

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      console.log('[Debug] 开始从服务器获取图标配置...')
      try {
        const response = await imageAPI.getIcons()
        console.log('[Debug] 图标API响应:', response.data)
        if (response.data.code === 200 || response.data.code === 0) {
          const icons = response.data.data || {}
          console.log('[Debug] 获取到的图标数据:', icons)
          // update localStorage
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(icons))
          return icons
        }
      } catch (err) {
        console.error('[Debug] 获取图标失败:', err)
      }
      return {}
    },
    // 初始数据尝试从localStorage获取，避免闪烁
    initialData: () => {
      const saved = localStorage.getItem('docker_copilot_image_logos')
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          // 只有当有实际数据时才作为初始数据
          if (Object.keys(parsed).length > 0) {
            return parsed
          }
        } catch (e) {
          console.error('解析本地图标配置失败:', e)
        }
      }
      return undefined
    },
    // 即使有初始数据，也立即在后台刷新
    refetchOnMount: true,
  })

  // 自动更新配置与状态（定制版接口；老后端无此接口时静默忽略）
  useEffect(() => {
    let mounted = true
    const loadAuto = async () => {
      try {
        const [s, st] = await Promise.all([autoUpdateAPI.getSettings(), autoUpdateAPI.getStatus()])
        if (!mounted) return
        if (s.data.code === 200) setAutoSettings(s.data.data)
        if (st.data.code === 200) setAutoStatus(st.data.data)
      } catch (e) {
        // 老后端 / 接口不可用时忽略
      }
    }
    loadAuto()
    const timer = setInterval(loadAuto, 15000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  // 容器卡片上的「自动」开关：即时写入白名单
  const toggleAutoUpdate = async (container, e) => {
    if (e) e.stopPropagation()
    if (!autoSettings) return
    const current = autoSettings.containers || []
    if (current.includes('*')) return // 全部容器模式下不单独切换
    const next = current.includes(container.name)
      ? current.filter(n => n !== container.name)
      : [...current, container.name]
    try {
      const r = await autoUpdateAPI.saveSettings({ ...autoSettings, containers: next })
      if (r.data.code === 200 || r.data.code === 0) {
        setAutoSettings(r.data.data)
      } else {
        setConfirmModal({
          isOpen: true,
          title: '自动更新设置保存失败',
          message: r.data.msg || '未知错误',
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        })
      }
    } catch (err) {
      console.error('保存自动更新设置失败:', err)
      setConfirmModal({
        isOpen: true,
        title: '自动更新设置保存失败',
        message: err.response?.data?.msg || err.message || '未知错误',
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
    }
  }

  const isAutoEnabled = (name) => {
    if (!autoSettings) return false
    const list = autoSettings.containers || []
    return list.includes('*') || list.includes(name)
  }

  const handleContainerAction = async (containerId, action) => {
    try {
      // 设置操作状态为加载中
      setContainerActions(prev => ({
        ...prev,
        [containerId]: { action, loading: true }
      }))

      switch (action) {
        case 'start':
          await containerAPI.startContainer(containerId)
          break
        case 'stop':
          await containerAPI.stopContainer(containerId)
          break
        case 'restart':
          await containerAPI.restartContainer(containerId)
          break
        default:
          break
      }

      // 立即更新本地状态，提供即时反馈
      queryClient.setQueryData(['containers'], (oldData) => {
        if (!oldData) return oldData

        return oldData.map(container => {
          if (container.id === containerId) {
            let newStatus = container.status
            switch (action) {
              case 'start':
                newStatus = 'running'
                break
              case 'stop':
                newStatus = 'stopped'
                break
              case 'restart':
                newStatus = 'running'
                break
              default:
                break
            }
            return { ...container, status: newStatus }
          }
          return container
        })
      })

      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 延迟刷新以获取最新数据
      setTimeout(() => {
        refetch()
      }, 1500)

    } catch (error) {
      console.error('操作失败:', error)
      // 清除操作状态
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`操作超时，请稍后手动刷新页面查看操作结果`)
      } else {
        console.error(`操作失败: ${error.response?.data?.msg || error.message}`)
      }
    }
  }

  // 批量操作处理函数
  const handleBatchAction = async (action) => {
    try {
      // 为所有选中的容器设置加载状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => ({
          ...prev,
          [containerId]: { action, loading: true }
        }))
      })

      // 立即更新本地状态提供即时反馈
      if (action === 'start' || action === 'stop' || action === 'restart') {
        queryClient.setQueryData(['containers'], (oldData) => {
          if (!oldData) return oldData

          return oldData.map(container => {
            if (selectedContainers.includes(container.id)) {
              let newStatus = container.status
              switch (action) {
                case 'start':
                  newStatus = 'running'
                  break
                case 'stop':
                  newStatus = 'stopped'
                  break
                case 'restart':
                  newStatus = 'running'
                  break
                default:
                  break
              }
              return { ...container, status: newStatus }
            }
            return container
          })
        })
      }

      // 对每个选中的容器执行操作
      for (const containerId of selectedContainers) {
        try {
          const container = containers.find(c => c.id === containerId)

          switch (action) {
            case 'start':
              await containerAPI.startContainer(containerId)
              break
            case 'stop':
              await containerAPI.stopContainer(containerId)
              break
            case 'restart':
              await containerAPI.restartContainer(containerId)
              break
            case 'update':
              if (container) {
                const response = await containerAPI.updateContainer(
                  containerId,
                  container.name,
                  container.usingImage,
                  true
                )

                if (response.data.code === 200 || response.data.code === 0) {
                  const taskID = response.data.data?.taskID
                  if (taskID) {
                    // 保存任务ID并开始轮询进度
                    setUpdateTasks(prev => ({
                      ...prev,
                      [containerId]: taskID
                    }))
                    // 调用轮询进度函数
                    pollProgress(containerId, taskID)
                  }
                }
              }
              break
            default:
              break
          }
        } finally {
          // 对于非更新操作，立即清除操作状态
          if (action !== 'update') {
            setContainerActions(prev => {
              const newState = { ...prev }
              delete newState[containerId]
              return newState
            })
          }
        }
      }

      // 如果不是更新操作，延迟刷新以获取最新数据
      if (action !== 'update') {
        setTimeout(() => {
          refetch()
        }, 1500)
      }

      // 清除选中状态
      setSelectedContainers([])
      setIsBatchMode(false)
    } catch (error) {
      console.error('批量操作失败:', error)
      // 清除所有操作状态
      selectedContainers.forEach(containerId => {
        setContainerActions(prev => {
          const newState = { ...prev }
          delete newState[containerId]
          return newState
        })
      })

      // 使用自定义弹窗显示错误信息
      setConfirmModal({
        isOpen: true,
        title: '操作失败',
        message: '批量操作失败: ' + (error.response?.data?.msg || error.message || '未知错误'),
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      });
    }
  }

  const handleRenameContainer = async (containerId, newName) => {
    try {
      const response = await containerAPI.renameContainer(containerId, newName)
      if (response.data.code === 200 || response.data.code === 0) {
        await refetch()
        console.log('重命名成功')
      }
    } catch (error) {
      console.error('重命名容器失败:', error)
      console.error(`重命名失败: ${error.response?.data?.msg || error.message}`)
    }
  }

  // 更新入口：若该镜像被多个容器共用，先弹窗确认（方案 A：全部更新 / 仅此容器）
  const handleUpdateContainer = async (containerId, existingTaskID = null) => {
    if (!existingTaskID) {
      const container = containers.find(c => c.id === containerId)
      if (container && container.imageId) {
        const siblings = containers.filter(c => c.imageId === container.imageId && c.id !== containerId)
        if (siblings.length > 0) {
          setGroupModal({ isOpen: true, container, siblings })
          return
        }
      }
    }
    return doUpdateContainer(containerId, existingTaskID)
  }

  // 整组更新：后端统一拉取一次，逐个更新共用该镜像的所有容器
  const handleGroupUpdate = async () => {
    const target = groupModal.container
    setGroupModal({ isOpen: false, container: null, siblings: [] })
    if (!target) return
    try {
      const response = await autoUpdateAPI.updateGroup(target.id)
      if (response.data.code === 200) {
        const tasks = response.data.data?.tasks || []
        tasks.forEach(t => {
          setContainerActions(prev => ({
            ...prev,
            [t.id]: { action: 'update', loading: true, progress: '整组更新中...', percentage: 0 }
          }))
          setUpdateTasks(prev => ({ ...prev, [t.id]: t.taskID }))
          pollProgress(t.id, t.taskID)
        })
      } else {
        setConfirmModal({
          isOpen: true,
          title: '整组更新失败',
          message: response.data.msg || '未知错误',
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        })
      }
    } catch (error) {
      console.error('整组更新失败:', error)
      setConfirmModal({
        isOpen: true,
        title: '整组更新失败',
        message: error.response?.data?.msg || error.message || '未知错误',
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
    }
  }

  const doUpdateContainer = async (containerId, existingTaskID = null) => {
    try {
      const container = containers.find(c => c.id === containerId)
      if (!container) {
        console.error('容器未找到')
        return
      }

      console.log(`开始更新容器 "${container.name}"，使用镜像: ${container.usingImage}`)

      setContainerActions(prev => ({
        ...prev,
        [containerId]: { action: 'update', loading: true, progress: '正在准备更新...', percentage: 0 }
      }))

      if (existingTaskID) {
        console.log('复用已有更新任务, taskID:', existingTaskID)
        setUpdateTasks(prev => ({
          ...prev,
          [containerId]: existingTaskID
        }))
        pollProgress(containerId, existingTaskID)
        return
      }

      // 注意参数顺序: id, containerName, imageNameAndTag, delOldContainer
      const response = await containerAPI.updateContainer(
        containerId,
        container.name,
        container.usingImage,
        true
      )

      console.log('更新容器响应:', response.data)

      if (response.data.code === 200 || response.data.code === 0) {
        const taskID = response.data.data?.taskID

        if (taskID) {
          console.log('开始轮询进度, taskID:', taskID)
          // 保存任务ID并开始轮询进度
          setUpdateTasks(prev => ({
            ...prev,
            [containerId]: taskID
          }))

          pollProgress(containerId, taskID)
        } else {
          // 如果没有返回taskID,说明更新可能立即完成
          setContainerActions(prev => {
            const newState = { ...prev }
            delete newState[containerId]
            return newState
          })
          await refetch()

        }
      } else {
        throw new Error(response.data.msg || '更新失败')
      }
    } catch (error) {
      console.error('更新容器失败:', error)
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })

      // 增加超时错误的处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
        // 即使超时也触发轮询，因为操作可能仍在进行中
        // 这里我们不知道taskID，所以无法启动轮询，只能提示用户稍后查看
      } else {
        // 针对名称冲突提供特定的解决方案
        let errorMessage = error.response?.data?.msg || error.message;
        if (errorMessage.includes('重命名') || errorMessage.includes('name conflict') || errorMessage.includes('名称冲突')) {
          errorMessage += '\n\n检测到容器名称冲突问题，建议解决方案：\n' +
            '1. 手动删除或重命名冲突的容器\n' +
            '2. 使用不同的容器名称进行更新\n' +
            '3. 先停止并重命名当前容器，再进行更新操作';
        }

        // 使用自定义弹窗显示错误信息
        setConfirmModal({
          isOpen: true,
          title: '更新失败',
          message: errorMessage,
          onConfirm: () => setConfirmModal({ isOpen: false }),
          onCancel: null,
          type: 'danger'
        });
      }
    }
  }

  // 轮询进度
  const pollProgress = async (containerId, taskID) => {
    const maxAttempts = 450 // 最多约 15 分钟（大镜像拉取较久，仅作兜底）
    let attempts = 0
    let pollTimer = null
    let stallCount = 0
    let lastKey = ''

    const clearPollState = () => {
      if (pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      setContainerActions(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
      setUpdateTasks(prev => {
        const newState = { ...prev }
        delete newState[containerId]
        return newState
      })
    }

    const poll = async () => {
      try {
        attempts++
        const response = await progressAPI.getProgress(taskID)
        console.log(`进度查询[${attempts}/${maxAttempts}]:`, response.data)

        const data = response.data

        // 提取进度信息
        let progressMsg = '处理中...'
        let percentage = 0

        if (data.data?.progress) {
          progressMsg = data.data.progress
        } else if (data.data?.message) {
          progressMsg = data.data.message
        } else if (data.msg) {
          progressMsg = data.msg
        }

        // 提取百分比
        if (data.data?.percentage !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percentage)))
        } else if (data.data?.percent !== undefined) {
          percentage = Math.min(100, Math.max(0, parseFloat(data.data.percent)))
        } else {
          // 尝试从进度消息中提取百分比
          const percentMatch = progressMsg.match(/(\d+(?:\.\d+)?)\s*%/)
          if (percentMatch) {
            percentage = Math.min(100, Math.max(0, parseFloat(percentMatch[1])))
          } else {
            // 根据轮询次数估算进度（按约 4 分钟的典型时长估）
            percentage = Math.min(95, (attempts / 120) * 100)
          }
        }
        const detailMsg = data.data?.detailMsg || ''

        // 检查是否完成 - 兼容多种响应格式
        const status = data.data?.status || data.status
        const isDone = data.data?.isDone === true ||
          status === 'completed' ||
          status === 'success' ||
          status === 'done' ||
          status === 'finish' ||
          status === 'finished'

        // 检查是否失败
        const isFailed = status === 'failed' ||
          status === 'error' ||
          progressMsg.includes('失败') ||
          progressMsg.includes('错误') ||
          data.code === 500 ||
          data.code === 400

        const isCompleted = isDone && !isFailed

        if (isCompleted) {
          // 任务完成 - 立即停止轮询
          console.log('容器更新完成，停止轮询')
          clearPollState()
          await refetch()
          console.log('✅ 容器更新完成!')
          return // 确保不再继续执行
        }

        if (isFailed) {
          // 任务失败 - 立即停止轮询
          console.log('容器更新失败，停止轮询')
          clearPollState()
          // 添加更详细的错误信息
          const errorMsg = data.data?.error || data.data?.message || data.msg || '更新失败'
          console.error(`❌ 更新失败: ${errorMsg}`)

          return // 确保不再继续执行
        }

        // 长时间无任何变化检测（正常慢拉取会有 detail 变化，真卡住才触发）
        const key = `${percentage}|${progressMsg}|${detailMsg}`
        if (key === lastKey) {
          stallCount++
        } else {
          stallCount = 0
          lastKey = key
        }
        if (stallCount >= 90) {
          // 约 3 分钟无变化：停止自动刷新，但不断言失败
          if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
          setUpdateTasks(prev => {
            const n = { ...prev }
            delete n[containerId]
            return n
          })
          setContainerActions(prev => ({
            ...prev,
            [containerId]: {
              action: 'update',
              loading: true,
              progress: '长时间无进度变化，已暂停自动刷新（刷新页面可查看最新状态）',
              percentage: percentage
            }
          }))
          return
        }

        // 更新容器操作状态，显示进度
        setContainerActions(prev => ({
          ...prev,
          [containerId]: {
            action: 'update',
            loading: true,
            progress: progressMsg,
            detail: detailMsg,
            percentage: percentage
          }
        }))

        // 继续轮询
        if (attempts < maxAttempts) {
          pollTimer = setTimeout(poll, 2000) // 2秒后再次查询
        } else {
          clearPollState()
          console.error('⏱️ 长时间未确认完成，请刷新页面查看')

        }
      } catch (error) {
        console.error('查询进度失败:', error)
        clearPollState()
        console.error(`❌ 更新失败: ${error.response?.data?.msg || error.message}`)
        // 显示网络错误或其他异常情况的友好提示

      }
    }

    // 开始轮询
    poll()
  }

  // 容器选择处理函数
  const toggleContainerSelection = (containerId) => {
    if (selectedContainers.includes(containerId)) {
      setSelectedContainers(selectedContainers.filter(id => id !== containerId))
    } else {
      setSelectedContainers([...selectedContainers, containerId])
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedContainers.length === containers.length) {
      setSelectedContainers([])
    } else {
      setSelectedContainers(containers.map(container => container.id))
    }
  }

  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取状态颜色（用于小圆点）
  const getStatusColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 列表筛选：状态 + 关键字（名称 / 镜像）
  const matchContainer = (container) => {
    if (filterStatus === 'running' && !(container.status && container.status.toLowerCase() === 'running')) return false
    if (filterStatus === 'stopped' && !(container.status && container.status.toLowerCase() !== 'running')) return false
    if (filterStatus === 'update' && !container.haveUpdate) return false
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const haystack = `${container.name || ''} ${container.usingImage || ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }

  const visibleContainers = containers.filter(matchContainer)

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bounceArrow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      {/* 自定义确认弹窗 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {confirmModal.title}
              </h3>
              <button
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              <p className="text-gray-600 dark:text-gray-400">
                {confirmModal.message}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-end space-x-3">
              <button
                onClick={() => {
                  if (confirmModal.onCancel) confirmModal.onCancel();
                  setConfirmModal({ isOpen: false });
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                }}
                className={cn(
                  "btn-primary",
                  confirmModal.type === 'danger' && "bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                )}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 共用镜像整组更新弹窗（方案 A） */}
      {groupModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                共用镜像提示
              </h3>
              <button
                onClick={() => setGroupModal({ isOpen: false, container: null, siblings: [] })}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                容器 <span className="font-medium text-gray-900 dark:text-white">{groupModal.container?.name}</span> 使用的镜像
                <span className="font-mono text-xs mx-1 break-all">{groupModal.container?.usingImage}</span>
                还被以下 {groupModal.siblings.length} 个容器共用：
              </p>
              <ul className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                {groupModal.siblings.map(s => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", s.status === 'running' ? 'bg-emerald-500' : 'bg-gray-400')} />
                    <span className="truncate">{s.name}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                「全部更新」将依次更新所有共用该镜像的容器（同一镜像只拉取一次；各自保持原有运行/停止状态）。
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex justify-end space-x-3">
              <button
                onClick={() => setGroupModal({ isOpen: false, container: null, siblings: [] })}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => {
                  const target = groupModal.container
                  setGroupModal({ isOpen: false, container: null, siblings: [] })
                  if (target) doUpdateContainer(target.id)
                }}
                className="btn-secondary"
              >
                仅此容器
              </button>
              <button onClick={handleGroupUpdate} className="btn-primary">
                全部更新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 页面标题和操作 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 space-y-4 sm:space-y-0 pt-4 sm:pt-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">容器管理</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            管理您的Docker容器，包括启动、停止、重启等操作
          </p>
        </div>

        {/* 批量操作按钮区域 */}
        {!isBatchMode ? (
          <div className="flex items-center space-x-3">
            <button
              className="btn-secondary"
              onClick={() => setIsBatchMode(true)}
            >
              批量操作
            </button>

            <button
              className="btn-primary"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              className="btn-secondary px-3 sm:px-4 py-2"
              onClick={toggleSelectAll}
              title={selectedContainers.length === containers.length ? '取消全选' : '全选'}
            >
              <span className="hidden sm:inline">
                {selectedContainers.length === containers.length ? '取消全选' : '全选'}
              </span>
              <span className="sm:hidden text-sm font-semibold">
                {selectedContainers.length}/{containers.length}
              </span>
            </button>
            <button
              className={`btn-primary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('start')}
              title="启动"
            >
              <Play className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">启动</span>
            </button>
            <button
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('stop')}
              title="停止"
            >
              <Square className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">停止</span>
            </button>
            <button
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('restart')}
              title="重启"
            >
              <RotateCcw className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">重启</span>
            </button>
            <button
              className={`btn-secondary flex items-center justify-center px-3 sm:px-4 py-2 gap-1 sm:gap-2 ${selectedContainers.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={selectedContainers.length === 0}
              onClick={() => handleBatchAction('update')}
              title="更新"
            >
              <Upload className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">更新</span>
            </button>
            <button
              className="btn-danger px-3 sm:px-4 py-2"
              onClick={() => {
                setSelectedContainers([])
                setIsBatchMode(false)
              }}
            >
              <span className="hidden sm:inline">取消</span>
              <span className="sm:hidden">✕</span>
            </button>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="px-2 sm:px-6 py-4">
        <div className="grid grid-cols-4 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {/* 总容器数 */}
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
                {containers.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">总容器</div>
            </div>
          </button>

          {/* 运行中 */}
          <button
            onClick={() => setFilterStatus('running')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'running' ? "bg-green-50 dark:bg-green-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => c.status === 'running').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">运行中</div>
            </div>
          </button>

          {/* 已停止 */}
          <button
            onClick={() => setFilterStatus('stopped')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center",
              filterStatus === 'stopped' ? "bg-red-50 dark:bg-red-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => c.status && c.status.toLowerCase() !== 'running').length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">已停止</div>
            </div>
          </button>

          {/* 有更新 */}
          <button
            onClick={() => setFilterStatus('update')}
            className={cn(
              "p-3 sm:p-5 text-center transition-all duration-300 relative overflow-hidden group flex flex-col items-center justify-center",
              filterStatus === 'update' ? "bg-yellow-50 dark:bg-yellow-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 transition-transform duration-300 group-hover:scale-110">
                {containers.filter(c => c.haveUpdate).length}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">有更新</div>
            </div>
          </button>
        </div>
      </div>

      {/* 容器列表 */}
      <div className="px-2 sm:px-6 py-4">
        {containers.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {visibleContainers.length === containers.length
                ? `共 ${containers.length} 个容器`
                : `筛选出 ${visibleContainers.length} / ${containers.length} 个容器`}
            </span>
            <div className="relative w-56 max-w-[60%]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称 / 镜像…"
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
        {(filterStatus || selectedContainers.length > 0) && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  {filterStatus && (
                    <>
                      筛选中：
                      {filterStatus === 'running' && '运行中容器 '}
                      {filterStatus === 'stopped' && '已停止容器 '}
                      {filterStatus === 'update' && '有更新容器 '}
                    </>
                  )}
                  {!filterStatus && selectedContainers.length > 0 && (
                    <>
                      已选中 {selectedContainers.length} 个容器（使用 Ctrl/Cmd+点击 来切换选择，或直接点击卡片打开详情）
                    </>
                  )}
                  {filterStatus && selectedContainers.length > 0 && (
                    <>
                      &nbsp;·&nbsp;已选中 {selectedContainers.length} 个容器
                    </>
                  )}
                </span>
                {filterStatus && (
                  <>
                    <button
                      onClick={() => {
                        setFilterStatus(null)
                        setSelectedContainers([])
                        setIsBatchMode(false)
                      }}
                      className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                    >
                      清除筛选
                    </button>
                    <button
                      onClick={() => {
                        setSelectedContainers(visibleContainers.map(c => c.id))
                        setIsBatchMode(true)
                      }}
                      className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                    >
                      全选结果
                    </button>
                  </>
                )}
              </div>
              {selectedContainers.length > 0 && !filterStatus && (
                <button
                  onClick={() => setSelectedContainers([])}
                  className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100 bg-blue-100 dark:bg-blue-800/50 rounded transition-colors"
                >
                  取消选择
                </button>
              )}
            </div>
          </div>
        )}

        {containers.length > 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            {/* 表头（桌面端） */}
            <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_120px_200px_90px_280px] gap-3 px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-900/20">
              <span>名称 / 镜像</span>
              <span>状态</span>
              <span>自动更新</span>
              <span>可升级</span>
              <span className="text-right">操作</span>
            </div>
            {visibleContainers.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                没有匹配的容器（试试调整筛选条件或搜索关键字）
              </div>
            )}
            {visibleContainers.map((container) => {
                const isSelected = selectedContainers.includes(container.id)
                const act = containerActions[container.id]
                const autoOn = isAutoEnabled(container.name)
                const autoInfo = autoStatus?.lastStatus?.[container.name]
                const isRunning = container.status === 'running'
                return (
                  <div
                    key={container.id}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || isBatchMode) {
                        e.stopPropagation()
                        toggleContainerSelection(container.id)
                      } else {
                        setSelectedContainer(container)
                      }
                    }}
                    className={cn(
                      "border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 cursor-pointer transition-colors",
                      isSelected ? "bg-primary-50/70 dark:bg-primary-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/20"
                    )}
                  >
                    {/* 主行 */}
                    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_120px_200px_90px_280px] gap-x-3 gap-y-2 px-4 py-3 lg:items-center">
                      {/* ① 名称 / 镜像 */}
                      <div className="flex items-center gap-3 min-w-0">
                        {isBatchMode && (
                          <span className={cn(
                            "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] font-bold",
                            isSelected ? "bg-primary-600 border-primary-600 text-white" : "border-gray-300 dark:border-gray-600"
                          )}>
                            {isSelected && '✓'}
                          </span>
                        )}
                        <div className="flex-shrink-0">
                          {(() => {
                            let iconUrl = container.iconUrl;
                            if (!iconUrl && container.usingImage) {
                              const builtInLogo = getImageLogo(container.usingImage);
                              if (builtInLogo) {
                                iconUrl = builtInLogo;
                              } else {
                                const imageLogos = customIcons;
                                for (const [imageName, logoUrl] of Object.entries(imageLogos)) {
                                  if (container.usingImage.startsWith(imageName) ||
                                    container.usingImage.includes(`${imageName}:`)) {
                                    iconUrl = logoUrl;
                                    break;
                                  }
                                }
                              }
                            }
                            if (iconUrl) {
                              return (
                                <img
                                  src={iconUrl}
                                  alt={container.name}
                                  className="h-10 w-10 rounded-lg object-cover shadow-sm flex-shrink-0"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = `
                                    <div class="h-10 w-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-sm">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 text-white">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                      </svg>
                                    </div>
                                  `;
                                  }}
                                />
                              );
                            } else {
                              return (
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0">
                                  <Package className="h-5 w-5 text-white" />
                                </div>
                              );
                            }
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{container.name}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">{container.usingImage}</div>
                        </div>
                      </div>

                      {/* 移动端横排；桌面端展开为三列 */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:contents">
                        {/* ② 状态 */}
                        <div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full", getStatusColor(container.status))} />
                            {isRunning ? '运行中' : '已停止'}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {isRunning ? `已运行 ${formatRunningTime(container.runningTime)}` : '—'}
                          </div>
                        </div>
                        {/* ③ 自动更新 */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAutoUpdate(container, e) }}
                            disabled={!autoSettings}
                            className={cn(
                              "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
                              !autoSettings ? "opacity-40 cursor-not-allowed bg-gray-300 dark:bg-gray-600"
                                : autoOn ? "bg-emerald-500 cursor-pointer" : "bg-gray-300 dark:bg-gray-600 cursor-pointer"
                            )}
                            title={!autoSettings ? '自动更新不可用（需要定制版后端）' : (autoOn ? '自动更新：已开启（点击关闭）' : '自动更新：已关闭（点击开启）')}
                          >
                            <span className={cn(
                              "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                              autoOn ? "right-0.5" : "left-0.5"
                            )} />
                          </button>
                          {autoOn && autoInfo && (
                            <span
                              className={cn("text-xs whitespace-nowrap", autoInfo.ok ? "text-emerald-500" : "text-red-500")}
                              title={`上次自动更新：${autoInfo.time} ${autoInfo.message || ''}`}
                            >
                              {autoInfo.ok ? '✓' : '✕'} {autoInfo.time ? autoInfo.time.slice(5, 16) : ''}
                            </span>
                          )}
                          {!autoOn && <span className="text-xs text-gray-400 dark:text-gray-500">未开启</span>}
                        </div>
                        {/* ④ 可升级 */}
                        <div>
                          {container.haveUpdate
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium whitespace-nowrap">有新版本</span>
                            : <span className="text-xs text-gray-300 dark:text-gray-600 whitespace-nowrap">已是最新</span>}
                        </div>
                      </div>

                      {/* ⑤ 操作 */}
                      <div className="flex gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        {act?.loading ? (
                          <span className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1.5 px-2 py-1.5">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            {act.action === 'update' ? '更新中' : act.action === 'start' ? '启动中' : act.action === 'stop' ? '停止中' : '重启中'}
                          </span>
                        ) : (
                          <>
                            {isRunning ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'stop') }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  title="停止"
                                >
                                  <Square className="h-3.5 w-3.5" />停止
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'restart') }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-blue-600 dark:text-blue-400 border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                  title="重启"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />重启
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleContainerAction(container.id, 'start') }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap text-green-600 dark:text-green-400 border-gray-200 dark:border-gray-700 hover:border-green-200 dark:hover:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
                                title="启动"
                              >
                                <Play className="h-3.5 w-3.5" />启动
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateContainer(container.id) }}
                              className={cn(
                                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all active:scale-95 whitespace-nowrap",
                                container.haveUpdate
                                  ? "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                  : "text-purple-600 dark:text-purple-400 border-gray-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                              )}
                              title="更新"
                            >
                              <Upload className="h-3.5 w-3.5" />更新
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 进度子行（整行展开，信息全宽可见） */}
                    {act?.loading && act.action === 'update' && (
                      <div className="px-4 pb-3 -mt-1 lg:pl-[74px]">
                        <ProgressBar percent={act.percentage || 0} message={act.progress} detail={act.detail} showPercent />
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">暂无容器</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              当前没有运行中的Docker容器
            </p>
          </div>
        )}
      </div>

      {/* 容器详情弹窗 */}
      {
        selectedContainer && (
          <ContainerDetailModal
            container={selectedContainer}
            onClose={() => setSelectedContainer(null)}
            onRename={handleRenameContainer}
            onUpdate={handleUpdateContainer}
            onAction={handleContainerAction}
          />
        )
      }
    </div >
  )
}

// 容器详情弹窗组件
function ContainerDetailModal({ container, onClose, onRename, onUpdate, onAction }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(container.name)
  const [imageNameAndTag, setImageNameAndTag] = useState(container.usingImage)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isActionProcessing, setIsActionProcessing] = useState(false)
  const [currentAction, setCurrentAction] = useState('')
  const [currentContainer, setCurrentContainer] = useState(container)
  const fileInputRef = React.useRef(null)
  const [isUploadingIcon, setIsUploadingIcon] = useState(false)

  // 获取自定义图标配置
  const { data: customIcons = {} } = useQuery({
    queryKey: ['customIcons'],
    queryFn: async () => {
      const response = await imageAPI.getIcons()
      if (response.data.code === 200 || response.data.code === 0) {
        return response.data.data || {}
      }
      return {}
    },
    initialData: () => JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}'),
  })

  // 当容器切换时，更新表单字段的值
  React.useEffect(() => {
    setName(container.name)
    setImageNameAndTag(container.usingImage)
    setCurrentContainer(container)
  }, [container])

  // 实时更新容器状态
  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await containerAPI.getContainers();
        if (response.data.code === 0) {
          const containers = response.data.data;
          const updatedContainer = containers.find(c => c.id === container.id);
          if (updatedContainer) {
            // 检查是否有镜像图标
            const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');

            // 如果容器没有自定义图标，则查找镜像图标
            if (!updatedContainer.iconUrl) {
              // 使用完整的镜像名称和标签进行匹配
              const imageFullName = updatedContainer.usingImage;

              // 首先尝试精确匹配（包含tag）
              if (imageLogos[imageFullName]) {
                updatedContainer.iconUrl = imageLogos[imageFullName];
              } else {
                // 如果精确匹配失败，尝试镜像名称匹配（不包含tag部分）
                const imageName = updatedContainer.usingImage.split(':')[0];

                // 遍历所有镜像图标，查找匹配的镜像名称
                for (const [imageId, logoUrl] of Object.entries(imageLogos)) {
                  // 检查镜像名称是否匹配（不包含tag部分）
                  const logoImageName = imageId.split(':')[0];
                  if (imageName === logoImageName) {
                    updatedContainer.iconUrl = logoUrl;
                    break;
                  }
                }
              }
            }

            setCurrentContainer(updatedContainer);
          }
        }
      } catch (error) {
        console.error('获取容器状态失败:', error);
      }
    }, 3000); // 每3秒获取一次最新状态

    return () => clearInterval(interval);
  }, [container.id]);

  const handleIconUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 限制文件大小 (例如 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setConfirmModal({
        isOpen: true,
        title: '上传失败',
        message: '图标文件大小不能超过 2MB',
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
      event.target.value = '' // 重置 input
      return
    }

    try {
      setIsUploadingIcon(true)
      // 使用容器当前的镜像名作为 Key
      // 如果有自定义镜像名配置(容器更新时可能改变)，优先使用新的
      const targetImageName = imageNameAndTag || currentContainer.usingImage

      const response = await imageAPI.uploadIcon(file, targetImageName, currentContainer.name)

      if (response.data.code === 200 || response.data.code === 0) {
        // 上传成功，更新 localStorage
        const filename = response.data.data // 后端返回的文件名
        if (filename) {
          const newPath = `/src/config/image/${filename}`
          const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}')

          // 更新映射: 镜像名 -> 新路径
          imageLogos[targetImageName] = newPath
          localStorage.setItem('docker_copilot_image_logos', JSON.stringify(imageLogos))

          // 强制更新当前容器视图
          setCurrentContainer(prev => ({
            ...prev,
            iconUrl: newPath
          }))

          // 触发全局事件以便其他组件（如列表）更新
          window.dispatchEvent(new Event('storage'))

          // 无效化查询以刷新列表和图标
          await queryClient.invalidateQueries(['containers'])
          await queryClient.invalidateQueries(['customIcons'])

          console.log('✅ 图标上传成功并已应用')
        }
      } else {
        throw new Error(response.data.msg || '上传失败')
      }
    } catch (error) {
      console.error('图标上传失败:', error)
      setConfirmModal({
        isOpen: true,
        title: '上传失败',
        message: '图标上传失败: ' + (error.response?.data?.msg || error.message),
        onConfirm: () => setConfirmModal({ isOpen: false }),
        onCancel: null,
        type: 'danger'
      })
    } finally {
      setIsUploadingIcon(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleContainerAction = async (action) => {
    try {
      setIsActionProcessing(true);
      setCurrentAction(action);

      // 调用传入的onAction函数执行实际操作
      if (action === 'update') {
        await onUpdate(container.id);
      } else {
        await onAction(container.id, action);
      }

      // 无效化查询以触发重新获取数据
      await queryClient.invalidateQueries(['containers'])

      setIsActionProcessing(false);
      setCurrentAction('');
    } catch (error) {
      console.error('操作失败:', error);
      setIsActionProcessing(false);
      setCurrentAction('');
    }
  };

  const handleRename = async () => {
    if (name !== currentContainer.name) {
      try {
        setIsRenaming(true)
        console.log(`重命名容器: ${currentContainer.name} -> ${name}`)

        await onRename(container.id, name)

        // 无效化查询以触发重新获取数据
        await queryClient.invalidateQueries(['containers'])

        // 更新当前容器状态
        setCurrentContainer({ ...currentContainer, name: name })
        // 同时更新表单中的名称
        setName(name);

        console.log('✅ 容器重命名成功')
        setIsRenaming(false)
      } catch (error) {
        console.error('重命名失败:', error)
        setIsRenaming(false)
      }
    }
  }

  const handleSave = async () => {
    // 如果镜像tag发生变化，则更新容器
    if (imageNameAndTag !== currentContainer.usingImage) {
      try {
        setIsUpdating(true)

        console.log(`开始更新容器镜像: ${currentContainer.name}`)
        console.log(`原镜像: ${currentContainer.usingImage}`)
        console.log(`新镜像: ${imageNameAndTag}`)

        // 直接调用API更新容器
        const response = await containerAPI.updateContainer(
          container.id,
          container.name,
          imageNameAndTag,
          true // 删除旧容器
        )

        console.log('更新容器响应:', response.data)

        if (response.data.code === 200 || response.data.code === 0) {
          const taskID = response.data.data?.taskID

          if (taskID) {
            // 如果返回了taskID，我们需要触发进度轮询
            console.log('更新任务已创建，taskID:', taskID)

            // 关闭弹窗
            onClose()

            // 触发父组件中的进度轮询
            onUpdate(container.id, taskID)

            console.log('✅ 容器更新任务已启动，请在列表中查看进度')
          } else {
            // 没有taskID，更新完成
            await queryClient.invalidateQueries(['containers'])
            setImageNameAndTag(imageNameAndTag) // 更新本地状态
            console.log('✅ 容器镜像更新完成')
          }
        } else {
          throw new Error(response.data.msg || '更新失败')
        }

        setIsUpdating(false)
      } catch (error) {
        console.error('更新容器镜像失败:', error)
        // 增加超时错误的处理
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          console.error(`更新操作已提交，但连接超时。请稍后手动刷新页面查看操作结果`)
          // 即使超时也关闭弹窗并触发轮询，因为操作可能仍在进行中
          onClose()
          onUpdate(container.id)
        }
        setIsUpdating(false)
      }
    }
  }





  // 获取状态指示器颜色
  const getStatusIndicatorColor = (status) => {
    const statusConfig = {
      running: 'bg-green-500',
      stopped: 'bg-red-500',
      restarting: 'bg-yellow-500',
      paused: 'bg-blue-500'
    }

    return statusConfig[status?.toLowerCase()] || 'bg-gray-500'
  }

  // 获取容器图标 - 与列表显示逻辑一致
  const getContainerIcon = () => {
    let iconUrl = currentContainer.iconUrl;

    // 如果容器没有自定义图标，则查找镜像图标
    if (!iconUrl && currentContainer.usingImage) {
      // 优先使用内置logo配置（不依赖localStorage）
      const builtInLogo = getImageLogo(currentContainer.usingImage);
      if (builtInLogo) {
        iconUrl = builtInLogo;
      } else {
        // 如果没有内置logo，则尝试从用户自定义中查找
        // const imageLogos = JSON.parse(localStorage.getItem('docker_copilot_image_logos') || '{}');
        const imageLogos = customIcons;
        const imageFullName = currentContainer.usingImage;

        if (imageLogos[imageFullName]) {
          iconUrl = imageLogos[imageFullName];
        } else {
          // 降级匹配逻辑
          const imageName = imageFullName.split(':')[0];
          for (const [imageId, logoUrl] of Object.entries(imageLogos)) {
            if (imageId === imageName || imageFullName.startsWith(imageId)) {
              iconUrl = logoUrl;
              break;
            }
          }
        }
      }
    }

    const IconContent = () => {
      if (iconUrl) {
        return (
          <img
            src={iconUrl}
            alt={currentContainer.name}
            className="h-12 w-12 rounded-xl object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        );
      }
      return null;
    };

    const FallbackIcon = () => (
      <div className="h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white" style={{ display: iconUrl ? 'none' : 'flex' }}>
        <Package className="h-6 w-6" />
      </div>
    );

    return (
      <div
        className="relative group cursor-pointer"
        onClick={() => !isUploadingIcon && fileInputRef.current?.click()}
        title="点击上传自定义图标"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleIconUpload}
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
        />

        <IconContent />
        <FallbackIcon />

        {/* 悬停覆盖层 */}
        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isUploadingIcon ? (
            <RefreshCw className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Upload className="h-5 w-5 text-white" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* 弹窗头部 */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">容器详情</h3>
              <div className="flex items-center mt-1">
                {getContainerIcon()}
                {/* 状态指示器竖线 */}
                <div className="flex flex-col items-center justify-center h-full ml-3">
                  <div className={cn(
                    "w-1 h-8 rounded-full",
                    getStatusIndicatorColor(currentContainer.status)
                  )}></div>
                </div>
                <div className="ml-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {currentContainer.name}
                  </span>
                  <div className="flex items-center mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {currentContainer.id.substring(0, 12)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 弹窗内容 */}
        <div className="px-6 py-4 space-y-4">
          {/* 容器名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              容器名称
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input flex-1"
                placeholder="输入容器名称"
              />
              <button
                onClick={handleRename}
                disabled={isRenaming || (name === currentContainer.name) || isActionProcessing || isUpdating}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${isRenaming || (name === currentContainer.name)
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                  }`}
              >
                {isRenaming ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    重命名中
                  </>
                ) : '重命名'}
              </button>
            </div>
          </div>

          {/* 镜像信息 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              镜像名称和标签
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={imageNameAndTag}
                onChange={(e) => setImageNameAndTag(e.target.value)}
                className="input flex-1"
                placeholder="例如: nginx:latest"
                disabled={isActionProcessing || isUpdating}
              />
              <button
                onClick={handleSave}
                disabled={isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()}
                className={`px-3 py-2 text-sm rounded-lg transition-colors flex items-center ${isUpdating || (imageNameAndTag === currentContainer.usingImage) || !imageNameAndTag.trim()
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600'
                  }`}
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    更新中
                  </>
                ) : (
                  '更换镜像'
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              修改镜像后点击"更换镜像"按钮将重新创建容器
            </p>
          </div>
        </div>

        {/* 弹窗底部操作按钮 */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-700/30">
          <div className="flex justify-end gap-2">

            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => onUpdate(container.id)}
                disabled={isActionProcessing || isUpdating}
                className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'update'
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                  : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
                  }`}
                title="更新"
              >
                {isActionProcessing && currentAction === 'update' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>更新中</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 flex-shrink-0" />
                    <span>更新</span>
                  </>
                )}
              </button>

              {currentContainer.status === 'running' ? (
                <>
                  <button
                    onClick={() => handleContainerAction('stop')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'stop'
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                      }`}
                    title="停止"
                  >
                    {isActionProcessing && currentAction === 'stop' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span>停止中</span>
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 flex-shrink-0" />
                        <span>停止</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleContainerAction('restart')}
                    disabled={isActionProcessing || isUpdating}
                    className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'restart'
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-yellow-500 text-white hover:bg-yellow-600 dark:bg-yellow-500 dark:hover:bg-yellow-600'
                      }`}
                    title="重启"
                  >
                    {isActionProcessing && currentAction === 'restart' ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                        <span>重启中</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 flex-shrink-0" />
                        <span>重启</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleContainerAction('start')}
                  disabled={isActionProcessing || isUpdating}
                  className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 text-sm rounded-lg transition-colors flex items-center justify-center sm:justify-start gap-1 sm:gap-2 ${isActionProcessing && currentAction === 'start'
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400'
                    : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600'
                    }`}
                  title="启动"
                >
                  {isActionProcessing && currentAction === 'start' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                      <span>启动中</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 flex-shrink-0" />
                      <span>启动</span>
                    </>
                  )}
                </button>
              )}
            </div>


          </div>
        </div>
      </div>
    </div>
  )
}
