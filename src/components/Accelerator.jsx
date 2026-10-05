import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, Gauge, Plus, Trash2, X, Zap } from 'lucide-react'
import { acceleratorAPI, progressAPI } from '../api/client.js'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'

// 延迟徽标配色：越快越绿
function latencyClass(ms) {
  if (ms == null) return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
  if (ms < 300) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (ms < 800) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
}

function LatencyBadge({ result, testing }) {
  if (testing) {
    return <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', latencyClass(null))}>测速中…</span>
  }
  if (!result) return null
  if (!result.ok) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title={result.status}>
        不可用
      </span>
    )
  }
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-mono font-medium whitespace-nowrap', latencyClass(result.latencyMs))} title={`HTTP ${result.status}`}>
      {result.latencyMs} ms
    </span>
  )
}

// 加速源管理面板：列表 + 测速 + 选默认
export function AcceleratorPanel({ isOpen, onClose }) {
  const [sources, setSources] = useState([])
  const [def, setDef] = useState('')
  const [useForUpdates, setUseForUpdates] = useState(false)
  const [results, setResults] = useState({})
  const [testingAll, setTestingAll] = useState(false)
  const [testingOne, setTestingOne] = useState('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setMsg('')
    acceleratorAPI.getSettings().then((r) => {
      const d = r.data?.data || {}
      setSources(d.sources || [])
      setDef(d.default || '')
      setUseForUpdates(!!d.useForUpdates)
    }).catch(() => setMsg('读取配置失败'))
  }, [isOpen])

  if (!isOpen) return null

  const runTest = async (list) => {
    if (!list.length) return
    if (list.length === 1) setTestingOne(list[0]); else setTestingAll(true)
    try {
      const r = await acceleratorAPI.test(list)
      const arr = r.data?.data || []
      setResults((prev) => {
        const next = { ...prev }
        arr.forEach((item) => { next[item.source] = item })
        return next
      })
    } catch {
      setMsg('测速失败，请检查网络或稍后重试')
    } finally {
      setTestingAll(false)
      setTestingOne('')
    }
  }

  const addSource = () => {
    const raw = draft.trim()
    if (!raw) return
    let h = raw.replace(/^https?:\/\//, '').split(/[/?# ]/)[0].replace(/\/+$/, '').toLowerCase()
    if (!h) return
    if (sources.includes(h)) { setMsg(`${h} 已在列表中`); return }
    setSources([...sources, h])
    if (!def) setDef(h)
    setDraft('')
    setMsg('')
  }

  const removeSource = (h) => {
    setSources(sources.filter((s) => s !== h))
    if (def === h) setDef('')
    setResults((prev) => { const n = { ...prev }; delete n[h]; return n })
  }

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      const r = await acceleratorAPI.saveSettings({ sources, default: def, useForUpdates })
      const d = r.data?.data || {}
      setSources(d.sources || [])
      setDef(d.default || '')
      setMsg('已保存 ✓')
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  // 排序：默认源置顶，其余按测速结果（可用在前、延迟升序），未测速的按原顺序
  const sorted = [...sources].sort((a, b) => {
    if (a === def) return -1
    if (b === def) return 1
    const ra = results[a]
    const rb = results[b]
    const oka = ra ? (ra.ok ? 0 : 2) : 1
    const okb = rb ? (rb.ok ? 0 : 2) : 1
    if (oka !== okb) return oka - okb
    if (oka === 0) return (ra.latencyMs || 0) - (rb.latencyMs || 0)
    return 0
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Zap className="h-5 w-5 text-sky-500" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex-1">镜像加速源</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-3 overflow-y-auto flex-1">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            对 Docker Hub 镜像生效：拉取时把 <span className="font-mono">nginx</span> 换成 <span className="font-mono">源/library/nginx</span>，完成后自动打回原名。测速为各源 <span className="font-mono">/v2/</span> 探针。
          </p>

          {/* 工具条 */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => runTest(sources)}
              disabled={testingAll || !sources.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-sm font-medium hover:bg-sky-200 dark:hover:bg-sky-900/60 disabled:opacity-50 transition-colors"
            >
              <Gauge className={cn('h-4 w-4', testingAll && 'animate-pulse')} />
              {testingAll ? '测速中…' : '一键测速'}
            </button>
            {msg && <span className="text-xs text-gray-500 dark:text-gray-400">{msg}</span>}
          </div>

          {/* 源列表 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/60">
            {sorted.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">还没有加速源，添加一个吧</div>
            )}
            {sorted.map((h) => (
              <div key={h} className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" title="设为默认加速源">
                  <input
                    type="radio"
                    name="accelerator-default"
                    checked={def === h}
                    onChange={() => setDef(h)}
                    className="accent-sky-600 flex-shrink-0"
                  />
                  <span className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">{h}</span>
                  {def === h && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 flex-shrink-0">默认</span>}
                </label>
                <LatencyBadge result={results[h]} testing={testingOne === h} />
                <button
                  onClick={() => runTest([h])}
                  disabled={!!testingOne || testingAll}
                  className="px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                  title="单独测速"
                >
                  测速
                </button>
                <button
                  onClick={() => removeSource(h)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="删除该源"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* 添加 */}
          <div className="flex items-center gap-2 mt-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
              placeholder="添加加速源，如 docker.m.daocloud.io"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <button onClick={addSource} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600">
              <Plus className="h-4 w-4" />添加
            </button>
          </div>

          {/* 自动加速开关 */}
          <label className="flex items-start gap-3 mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 cursor-pointer">
            <button
              type="button"
              onClick={() => setUseForUpdates(!useForUpdates)}
              className={cn('relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5', useForUpdates ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', useForUpdates ? 'right-0.5' : 'left-0.5')} />
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              <b className="text-gray-800 dark:text-gray-100">更新容器时自动走加速源</b>（仅 Docker Hub 镜像；拉取失败自动回退直连）
            </span>
          </label>
        </div>

        {/* 底部 */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">关闭</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 加速拉取弹窗：选源 → 拉取 → 进度
export function AcceleratorPullModal({ isOpen, onClose, image, onDone }) {
  const [sources, setSources] = useState([])
  const [source, setSource] = useState('')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null) // {ok, message}
  const pollRef = useRef(null)

  const imageRef = image ? `${image.name}:${image.tag}` : ''

  useEffect(() => {
    if (!isOpen) return
    setProgress(null)
    setResult(null)
    setRunning(false)
    acceleratorAPI.getSettings().then((r) => {
      const d = r.data?.data || {}
      const list = d.sources || []
      setSources(list)
      setSource(d.default && list.includes(d.default) ? d.default : (list[0] || ''))
    }).catch(() => {})
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [isOpen])

  if (!isOpen) return null

  const start = async () => {
    setRunning(true)
    setResult(null)
    setProgress({ percentage: 0, message: '提交任务…', detailMsg: '' })
    try {
      const r = await acceleratorAPI.pull(source, imageRef)
      const taskID = r.data?.data?.taskID
      if (!taskID) throw new Error(r.data?.msg || '任务创建失败')
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        try {
          const p = await progressAPI.getProgress(taskID)
          const d = p.data?.data || {}
          setProgress({ percentage: d.percentage || 0, message: d.message || '', detailMsg: d.detailMsg || '' })
          if (d.isDone) {
            clearInterval(pollRef.current)
            pollRef.current = null
            setRunning(false)
            const ok = (d.message || '').includes('完成')
            setResult({ ok, message: d.message || '', detail: d.detailMsg || '' })
            if (ok && onDone) onDone()
          }
        } catch {
          // 任务未就绪等：忽略继续轮询
        }
      }, 800)
    } catch (e) {
      setRunning(false)
      setResult({ ok: false, message: e?.response?.data?.msg || e.message || '发起失败' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={running ? undefined : onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white flex-1">加速拉取</h3>
          {!running && <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>}
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            镜像：<span className="font-mono text-gray-900 dark:text-white">{imageRef}</span>
          </div>

          <div className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={running}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              {sources.length === 0 && <option value="">（没有可用加速源，先到「加速源」里添加）</option>}
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {progress && (
            <div className="pt-1">
              <ProgressBar percent={progress.percentage} message={progress.message} done={result?.ok} showPercent />
              {progress.detailMsg && (
                <div className="mt-2 text-[11px] font-mono text-gray-400 dark:text-gray-500 whitespace-pre-wrap max-h-32 overflow-y-auto break-all">{progress.detailMsg}</div>
              )}
            </div>
          )}

          {result && (
            <div className={cn('px-3 py-2 rounded-xl text-sm', result.ok
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300')}>
              {result.ok ? '✅ ' : '❌ '}{result.message}
              {!result.ok && result.detail && <div className="mt-1 text-xs font-mono break-all">{result.detail}</div>}
            </div>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500">
            仅支持 Docker Hub 镜像；拉取完成后会自动打回原镜像名（临时加速源标签会被清理）。
          </p>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {result ? '关闭' : '取消'}
          </button>
          <button
            onClick={start}
            disabled={running || !source || !image}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Zap className={cn('h-4 w-4', running && 'animate-pulse')} />
            {running ? '拉取中…' : result ? '重新拉取' : '开始拉取'}
          </button>
        </div>
      </div>
    </div>
  )
}
