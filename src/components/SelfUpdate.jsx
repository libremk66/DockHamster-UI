import React, { useRef, useState } from 'react'
import { AlertCircle, CheckCircle, RefreshCw, RotateCw } from 'lucide-react'
import { selfUpdateAPI, progressAPI } from '../api/client.js'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'

// 面板自更新：一键触发接力更新 → 展示进度 → 等待面板重启恢复 → 展示结果
export function SelfUpdateSection() {
  const [phase, setPhase] = useState('idle') // idle | running | restarting | done | error
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const timers = useRef([])

  const clearTimers = () => {
    timers.current.forEach(clearInterval)
    timers.current = []
  }

  // 面板重启期间轮询首页，恢复后拉取上次更新结果
  const waitRecover = () => {
    setPhase('restarting')
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${window.location.origin}/manager`, { cache: 'no-store' })
        if (!r.ok && r.status !== 301) return
        clearInterval(t)
        // 结果文件可能比面板启动晚几秒写好，多试几次
        let last = null
        for (let i = 0; i < 8; i++) {
          try {
            const s = await selfUpdateAPI.status()
            last = s.data?.data?.lastResult || null
            if (last) break
          } catch {
            // 忽略：结果拿不到也必须把状态置为完成
          }
          await new Promise((resolve) => setTimeout(resolve, 2500))
        }
        setResult(last)
        setPhase('done')
      } catch {
        // 面板还没起来，继续等
      }
    }, 3000)
    timers.current.push(t)
  }

  const start = async () => {
    clearTimers()
    setErrMsg('')
    setResult(null)
    setProgress({ percentage: 0, message: '提交任务…' })
    setPhase('running')
    let taskID
    try {
      const r = await selfUpdateAPI.run()
      taskID = r.data?.data?.taskID
      if (!taskID) throw new Error(r.data?.msg || '任务创建失败')
    } catch (e) {
      setErrMsg(e?.response?.data?.msg || e.message || '发起失败')
      setPhase('error')
      return
    }
    let fails = 0
    const t = setInterval(async () => {
      try {
        const p = await progressAPI.getProgress(taskID)
        fails = 0
        const d = p.data?.data || {}
        setProgress({ percentage: d.percentage || 0, message: d.message || '' })
        if (d.isDone) {
          clearInterval(t)
          if ((d.message || '').includes('无需更新')) {
            setResult({ status: 'noop' })
            setPhase('done')
          } else if ((d.message || '').includes('失败')) {
            setErrMsg(d.detailMsg || d.message || '更新失败')
            setPhase('error')
          } else {
            // 接力容器已启动，面板即将被替换
            waitRecover()
          }
        }
      } catch {
        // 面板正在被停掉时会连不上，连续 3 次失败就认为进入重启阶段
        fails++
        if (fails >= 3) {
          clearInterval(t)
          waitRecover()
        }
      }
    }, 800)
    timers.current.push(t)
  }

  if (phase === 'idle') {
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <b className="text-gray-700 dark:text-gray-300">① 面板内一键自更新（推荐）</b>：拉取新镜像后由接力容器完成替换，<b>启动失败自动回滚</b>，面板重启约 20 秒。
        </div>
        <button
          onClick={start}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          立即更新面板
        </button>
      </div>
    )
  }

  if (phase === 'running') {
    return (
      <div className="space-y-2">
        <ProgressBar percent={progress?.percentage || 0} message={progress?.message} showPercent />
        <div className="text-[11px] text-gray-400 dark:text-gray-500">更新过程中面板会短暂重启，请不要关闭页面。</div>
      </div>
    )
  }

  if (phase === 'restarting') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
        <RotateCw className="h-4 w-4 animate-spin flex-shrink-0" />
        接力容器已接管，面板正在重启，等待恢复中…
      </div>
    )
  }

  if (phase === 'done') {
    const noop = result?.status === 'noop'
    const failed = result && result.status && result.status !== 'success' && !noop
    return (
      <div className={cn(
        'flex items-start gap-2 text-xs rounded-xl px-3 py-2',
        noop ? 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300'
          : failed ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      )}>
        {noop ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
          : failed ? <AlertCircle className="h-4 w-4 flex-shrink-0" /> : <CheckCircle className="h-4 w-4 flex-shrink-0" />}
        <span>
          {noop && '已是最新镜像，无需更新。'}
          {!noop && !failed && `更新成功${result?.image ? '：' + result.image : ''}${result?.at ? ' · ' + result.at : ''}`}
          {failed && `更新失败（已回滚）：${result?.error || '未知原因'}`}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 text-xs rounded-xl px-3 py-2 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{errMsg || '更新失败'}</span>
    </div>
  )
}
