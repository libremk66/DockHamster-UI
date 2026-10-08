import React, { useEffect, useState } from 'react'
import { ListChecks, RefreshCw, CheckCircle2, XCircle, Clock, Info } from 'lucide-react'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'
import { autoUpdateAPI } from '../api/client.js'

// 任务类型与触发来源的中文标签（后端 kind/source 字段）
const KIND_LABEL = { update: '更新', pull: '拉取', selfupdate: '面板自更新', migrate: '迁移导入' }
const SOURCE_LABEL = {
  container: '容器页', autoupdate: '自动更新', group: '整组更新',
  accelerator: '加速源', selfupdate: '面板自更新', migrate: '迁移', rollback: '快照回滚',
}

function KindBadge({ kind, source }) {
  const k = KIND_LABEL[kind] || kind || '任务'
  const s = SOURCE_LABEL[source] || source
  const color = kind === 'update' ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
    : kind === 'pull' ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
      : 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300'
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={cn('tag', color)}>{k}</span>
      {s && <span className="text-gray-400 dark:text-gray-500">来自{s}</span>}
    </span>
  )
}

function fmtDuration(sec) {
  if (!sec || sec < 0) return ''
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m${s}s`
}

export function Tasks() {
  const [tasks, setTasks] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState(0)

  // 进行中 2 秒轮询，空闲 15 秒
  useEffect(() => {
    let mounted = true
    let timer = null
    const poll = async () => {
      let next = 15000
      try {
        const r = await autoUpdateAPI.tasks()
        if (mounted && (r.data.code === 200 || r.data.code === 0)) {
          const list = r.data.data?.tasks || []
          setTasks(list)
          setErr('')
          if (list.some((t) => !t.isDone)) next = 2000
        }
      } catch (e) {
        if (mounted) setErr(e?.response?.data?.msg || e?.message || '加载失败')
      } finally {
        if (mounted) setLoading(false)
      }
      if (mounted) timer = setTimeout(poll, next)
    }
    poll()
    return () => { mounted = false; if (timer) clearTimeout(timer) }
  }, [key])

  const running = tasks.filter((t) => !t.isDone)
  const finished = tasks.filter((t) => t.isDone)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary-500" />
            任务
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            所有镜像拉取 / 容器更新任务的统一进度视图——不论从哪个页面触发，都汇总在这里；完成后保留一段时间可回看。
          </p>
        </div>
        <button className="btn-ghost" onClick={() => setKey((k) => k + 1)}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
      </div>

      {err && (
        <div className="rounded-lg px-4 py-2.5 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* 进行中 */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-800 shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
          <RefreshCw className={cn('h-4 w-4 text-primary-500 dark:text-primary-400', running.length > 0 && 'animate-spin')} />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            进行中（{running.length}）
          </h3>
        </div>
        <div className="px-5 py-3 space-y-3">
          {running.length === 0 && (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-2">
              当前没有进行中的任务。触发位置：容器页「更新」/「全部更新」、自动更新页「立即运行」、加速源页「拉取镜像」、面板自更新。
            </div>
          )}
          {running.map((t) => (
            <div key={t.taskID}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{t.name || '任务'}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{t.percentage || 0}%</span>
              </div>
              <ProgressBar percent={t.percentage} message={t.message} detail={t.detailMsg} failed={t.failed} />
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <KindBadge kind={t.kind} source={t.source} />
                {t.startedAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.startedAt.slice(11)} 开始</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 最近完成 */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">最近完成（{finished.length}）</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {loading && finished.length === 0 && <div className="px-5 py-3 text-sm text-gray-400">加载中…</div>}
          {!loading && finished.length === 0 && (
            <div className="px-5 py-3 text-sm text-gray-400 dark:text-gray-500">还没有完成的任务（完成后保留约 2 小时）。</div>
          )}
          {finished.map((t) => (
            <div key={t.taskID} className="px-5 py-2.5 flex items-center gap-3 text-sm">
              {t.failed
                ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                : <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
              <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[220px]">{t.name || '任务'}</span>
              <KindBadge kind={t.kind} source={t.source} />
              <span className={cn('truncate flex-1', t.failed ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
                {t.failed ? (t.detailMsg || t.message || '失败') : (t.message || '完成')}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {t.updatedAt?.slice(11)} · {fmtDuration(t.durationSec)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
