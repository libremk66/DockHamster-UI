import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { autoUpdateAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

/**
 * 「检查更新」控件组（容器页 / 镜像页 / 自动更新页共用）
 * - 运行状态由服务端持有（/api/autoUpdate/check/status），切页面回来依然显示进度
 * - 运行中显示 已检查/总数 + 预计剩余；空闲显示上次/下次检查时间
 * - manageCron=true 时（容器页）额外带"检查频率"输入，回车/失焦保存
 * - 完成后回调 onDone(status)，各页面用它刷新列表并展示结果
 */
export function CheckUpdateButton({ onDone, className, manageCron = false }) {
  const [st, setSt] = useState(null)
  const [starting, setStarting] = useState(false)
  const [cronText, setCronText] = useState('')
  const [cronErr, setCronErr] = useState(null)
  const prevRunning = useRef(false)

  const load = async () => {
    try {
      const [r, s] = await Promise.all([autoUpdateAPI.checkStatus(), autoUpdateAPI.getSettings()])
      if (r.data?.code === 200) setSt(r.data.data)
      if (manageCron && (s.data?.code === 200 || s.data?.code === 0) && s.data?.data) {
        // 只在未编辑（或值未变）时同步，避免打断输入
        setCronText(prev => (prev === '' || prev === s.data.data.checkCron) ? (s.data.data.checkCron || '30 * * * *') : prev)
      }
    } catch (e) { /* 忽略瞬时失败 */ }
  }

  // 保存检查频率
  const saveCron = async () => {
    const val = (cronText || '').trim()
    if (!val) { setCronErr('不能为空'); return }
    if (val.split(/\s+/).length !== 5) { setCronErr('需要 5 段：分 时 日 月 周'); return }
    try {
      const cur = await autoUpdateAPI.getSettings()
      const base = cur.data?.data || {}
      const r = await autoUpdateAPI.saveSettings({ ...base, checkCron: val })
      if (r.data?.code === 200 || r.data?.code === 0) {
        setCronErr(null)
        await load()
      } else {
        setCronErr(r.data?.msg || '保存失败')
      }
    } catch (e) {
      setCronErr(e.response?.data?.msg || e.message || '保存失败')
    }
  }

  useEffect(() => { load() }, [])

  // 运行中：2 秒轮询；空闲：15 秒轮询（cron 触发的检查也能被界面发现）；结束瞬间回调一次
  useEffect(() => {
    if (!st) return
    if (st.running) {
      prevRunning.current = true
      const t = setTimeout(load, 2000)
      return () => clearTimeout(t)
    }
    if (prevRunning.current) {
      prevRunning.current = false
      onDone && onDone(st)
    }
    const idle = setTimeout(load, 15000)
    return () => clearTimeout(idle)
  }, [st])

  const start = async (e) => {
    e?.stopPropagation()
    setStarting(true)
    try {
      const r = await autoUpdateAPI.checkNow()
      if (r.data?.code === 200 || r.data?.code === 409) {
        if (r.data?.data) setSt(r.data.data)
        else await load()
      }
    } catch (err) { /* 忽略，靠轮询兜底 */ }
    finally { setStarting(false) }
  }

  const running = st?.running
  const total = st?.total || 0
  const checked = st?.checked || 0
  const est = st?.estimatedSeconds || 0
  const remain = total > 0 ? Math.max(1, Math.round(est * (total - checked) / total)) : est

  const prefix = st?.trigger === 'cron' ? '定时检查中' : '检查中'
  const label = running
    ? (total > 0 ? `${prefix} ${checked}/${total} · 约剩 ${remain}s` : `${prefix}…`)
    : '检查更新'

  const tip = running
    ? '正在探测全部镜像的最新版本'
    : (total > 0
      ? `立即探测全部 ${total} 个镜像的更新（预计约 ${est} 秒）`
      : '立即探测全部镜像的更新')

  return (
    <span
      className={cn(
        'inline-flex items-stretch rounded-lg border overflow-hidden bg-white dark:bg-gray-800',
        running ? 'border-primary-200 dark:border-primary-800' : 'border-gray-200 dark:border-gray-700',
        className
      )}
    >
      {/* 触发按钮 */}
      <button
        onClick={start}
        disabled={running || starting}
        title={tip}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
          running
            ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40',
          (running || starting) && 'cursor-not-allowed'
        )}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', (running || starting) && 'animate-spin')} />
        {label}
      </button>

      {/* 上次 / 下次 时间（运行中隐藏，避免占位过长） */}
      {!running && (st?.lastCheckAt || st?.nextCheckAt) && (
        <>
          <span className="w-px bg-gray-200 dark:bg-gray-700" />
          <span className="flex items-center px-2.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {st?.lastCheckAt && <span title={`上次检查：${st.lastCheckAt}`}>上次 {st.lastCheckAt.slice(5)}</span>}
            {st?.lastCheckAt && st?.nextCheckAt && <span className="mx-1">·</span>}
            {st?.nextCheckAt && <span title="按检查频率自动检查的下次时间">下次 {st.nextCheckAt.slice(5)}</span>}
          </span>
        </>
      )}

      {/* 检查频率（仅容器页） */}
      {manageCron && !running && (
        <>
          <span className="w-px bg-gray-200 dark:bg-gray-700" />
          <span className="flex items-center gap-1 pl-2 pr-1.5 bg-gray-50 dark:bg-gray-900/40">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">频率</span>
            <input
              type="text"
              value={cronText}
              onChange={(e) => { setCronText(e.target.value); setCronErr(null) }}
              onBlur={saveCron}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              title="检查更新频率（cron，5 段）——回车或点别处保存"
              className={cn(
                'w-[74px] px-1 py-1.5 border-0 bg-transparent font-mono text-xs text-gray-700 dark:text-gray-200 outline-none text-center',
                cronErr && 'text-red-500'
              )}
            />
          </span>
          {cronErr && (
            <span className="flex items-center px-2 text-xs text-red-500 whitespace-nowrap">{cronErr}</span>
          )}
        </>
      )}
    </span>
  )
}
