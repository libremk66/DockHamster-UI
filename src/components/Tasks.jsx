import React, { useEffect, useState } from 'react'
import { ListChecks, RefreshCw, CheckCircle2, XCircle, Clock, Info, Trash2, History, Loader2 } from 'lucide-react'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'
import { autoUpdateAPI } from '../api/client.js'

// 任务类型的中文标签（后端 kind 字段）
const KIND_LABEL = { update: '更新', pull: '拉取', selfupdate: '面板自更新', migrate: '迁移' }
// 触发方式中文标签 + 配色（后端 source / run trigger 字段）
const TRIGGER_META = {
  auto: { label: '定时', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  manual: { label: '手动', cls: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  group: { label: '整组', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  container: { label: '容器页', cls: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300' },
  accelerator: { label: '加速源', cls: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
  selfupdate: { label: '面板自更新', cls: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
  migrate: { label: '迁移', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  rollback: { label: '快照回滚', cls: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300' },
}
// 批次运行记录的标题（run.trigger）
const RUN_TITLE = { auto: '自动更新', manual: '手动更新', group: '整组更新' }

function TriggerBadge({ trigger }) {
  const meta = TRIGGER_META[trigger]
  if (!meta) return trigger ? <span className="tag bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">{trigger}</span> : null
  return <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', meta.cls)}>{meta.label}</span>
}

function KindBadge({ kind, source }) {
  const k = KIND_LABEL[kind] || kind || '任务'
  const s = TRIGGER_META[source]?.label || source
  const color = kind === 'pull' ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300'
    : kind === 'migrate' || kind === 'selfupdate' ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300'
      : 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300'
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

// 历史条目时间：完整时间戳 "2026-10-09 04:00:01" → 显示 "10-09 04:00"
function fmtTime(t) {
  return t ? t.slice(5, 16) : ''
}

// 历史条目行（批次运行 / 单任务两种形态）
function HistoryRow({ e, checked, onToggle }) {
  const isRun = e.type === 'run'
  const failures = e.failures || []
  const updated = e.updated || []
  const snapshots = e.snapshots || []
  const hasDetail = isRun
    ? updated.length > 0 || failures.length > 0 || snapshots.length > 0 || !!e.note
    : !!e.detailMsg
  return (
    <div
      onClick={onToggle}
      className={cn(
        'px-4 py-2.5 cursor-pointer transition-colors',
        checked ? 'bg-primary-50/70 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
      )}
    >
      <div className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(ev) => ev.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 flex-shrink-0"
        />
        {e.failed
          ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
        <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]">
          {isRun ? (RUN_TITLE[e.trigger] || '更新批次') : (e.name || KIND_LABEL[e.kind] || '任务')}
        </span>
        <TriggerBadge trigger={e.trigger} />
        {!isRun && e.kind && <span className="tag bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">{KIND_LABEL[e.kind] || e.kind}</span>}
        <span className={cn('truncate flex-1', e.failed ? 'text-red-500' : 'text-gray-400 dark:text-gray-500')}>
          {isRun
            ? <>
              {updated.length > 0 && <span className="text-emerald-600 dark:text-emerald-400">更新 {updated.length} 个</span>}
              {updated.length > 0 && failures.length > 0 && <span className="text-gray-300 dark:text-gray-600"> · </span>}
              {failures.length > 0 && <span className="text-red-500 dark:text-red-400">失败 {failures.length} 个</span>}
              {e.note && <span>（{e.note}）</span>}
            </>
            : (e.failed ? (e.detailMsg || e.message || '失败') : (e.message || '完成'))}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {fmtTime(e.time)}{e.durationSec > 0 && <span className="ml-1.5">{fmtDuration(e.durationSec)}</span>}
        </span>
      </div>
      {hasDetail && (
        <div className="mt-1 ml-[52px] text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
          {isRun ? (
            <>
              {updated.length > 0 && <div className="truncate">已更新：{updated.join('、')}</div>}
              {snapshots.length > 0 && <div className="text-amber-600 dark:text-amber-400 truncate">🏷️ 已打快照：{snapshots.join('、')}</div>}
              {failures.map((f, j) => (
                <div key={j} className="text-red-500 dark:text-red-400 truncate">失败：{f.name}（{f.error}）</div>
              ))}
            </>
          ) : (
            <div className={cn('truncate', e.failed && 'text-red-400 dark:text-red-400/80')}>{e.detailMsg}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function Tasks() {
  const [tasks, setTasks] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [key, setKey] = useState(0)
  // 标签页：null = 未定（首次加载后按有无进行中任务自动选）
  const [tab, setTab] = useState(null)

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selected, setSelected] = useState([])
  const [deleting, setDeleting] = useState(false)
  const [showAll, setShowAll] = useState(false)

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

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const r = await autoUpdateAPI.taskHistory()
      if (r.data.code === 200 || r.data.code === 0) {
        setHistory(r.data.data?.entries || [])
        setErr('')
      } else {
        setErr(r.data.msg || '历史记录加载失败')
      }
    } catch (e) {
      setErr(e?.response?.data?.msg || e?.message || '历史记录加载失败')
    } finally {
      setHistoryLoading(false)
    }
  }

  // 首次加载完成后决定默认标签：有进行中 → 进行中，否则 → 历史记录
  useEffect(() => {
    if (tab !== null || loading) return
    setTab(running.length > 0 ? 'running' : 'history')
  }, [loading, running.length, tab])

  // 挂载时先取一次（历史标签的条数徽标要用）；切到历史标签时再刷新
  useEffect(() => { loadHistory() }, [])
  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  const toggleOne = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  const allSelected = history.length > 0 && selected.length === history.length
  const toggleAll = () => setSelected(allSelected ? [] : history.map((e) => e.id))

  const doDelete = async () => {
    if (selected.length === 0) return
    if (!window.confirm(`删除选中的 ${selected.length} 条历史记录？删除后不可恢复。`)) return
    setDeleting(true)
    try {
      const r = await autoUpdateAPI.deleteTaskHistory(selected)
      if (r.data.code === 200) {
        setHistory((h) => h.filter((e) => !selected.includes(e.id)))
        setSelected([])
        setErr('')
      } else {
        setErr(r.data.msg || '删除失败')
      }
    } catch (e) {
      setErr(e?.response?.data?.msg || e?.message || '删除失败')
    } finally {
      setDeleting(false)
    }
  }

  const LIMIT = 100
  const shown = showAll ? history : history.slice(0, LIMIT)

  const TabBtn = ({ id, icon: Icon, label, count, accent }) => (
    <button
      onClick={() => setTab(id)}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors',
        tab === id
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
      )}
    >
      <Icon className={cn('h-4 w-4', accent)} />
      {label}
      <span className={cn(
        'text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center',
        tab === id ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
      )}>{count}</span>
    </button>
  )

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
            所有镜像拉取 / 容器更新任务的统一视图——不论从哪个页面、哪种方式触发，都汇总在这里；完成后进入历史记录长期保留。
          </p>
        </div>
        <button className="btn-ghost" onClick={() => { setKey((k) => k + 1); if (tab === 'history') loadHistory() }}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
      </div>

      {err && (
        <div className="rounded-lg px-4 py-2.5 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* 横向标签 */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
        <TabBtn id="running" icon={RefreshCw} label="进行中" count={running.length} accent={running.length > 0 ? 'animate-spin' : ''} />
        <TabBtn id="history" icon={History} label="历史记录" count={history.length} />
      </div>

      {tab === 'running' && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-800 shadow-sm">
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
      )}

      {tab === 'history' && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {/* 工具条 */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center gap-3 bg-gray-50/60 dark:bg-gray-900/20">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={history.length === 0}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              全选
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {history.length === 0 ? '暂无记录' : selected.length > 0 ? `已选 ${selected.length} / ${history.length} 条` : `共 ${history.length} 条`}
            </span>
            <button
              onClick={doDelete}
              disabled={selected.length === 0 || deleting}
              className={cn(
                'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                selected.length === 0 || deleting
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              )}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? '删除中…' : '删除选中'}
            </button>
          </div>

          {/* 记录列表 */}
          {historyLoading && history.length === 0 && (
            <div className="px-5 py-6 text-sm text-gray-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 加载中…</div>
          )}
          {!historyLoading && history.length === 0 && (
            <div className="px-5 py-6 text-sm text-gray-400 dark:text-gray-500">
              还没有历史记录。完成一次更新（容器页手动更新 / 自动更新 / 整组更新 / 拉取镜像…）后就会出现在这里。
            </div>
          )}
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {shown.map((e) => (
              <HistoryRow key={e.id} e={e} checked={selected.includes(e.id)} onToggle={() => toggleOne(e.id)} />
            ))}
          </div>
          {!showAll && history.length > LIMIT && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/60 text-center">
              <button onClick={() => setShowAll(true)} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                显示全部 {history.length} 条
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
