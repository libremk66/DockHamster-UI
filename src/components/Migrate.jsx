import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Package, Download, Upload, RefreshCw, AlertCircle, CheckCircle2, XCircle,
  HardDrive, Tag, Archive, FileDown, Trash2, Boxes, ShieldCheck, ArrowRight, X
} from 'lucide-react'
import { autoUpdateAPI, containerAPI } from '../api/client.js'
import { ProgressBar } from './ProgressBar.jsx'
import { cn } from '../utils/cn.js'

const okCode = (r) => r?.data?.code === 200 || r?.data?.code === 0
const fmtSize = (n) => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0, v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}

function Card({ title, icon: Icon, children, className }) {
  return (
    <div className={cn('card p-5', className)}>
      {title && (
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
          {Icon && <Icon className="h-4 w-4 text-primary-500 dark:text-primary-400" />}{title}
        </h3>
      )}
      {children}
    </div>
  )
}

const SOURCE_META = {
  registry: { label: '公共可得', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'local-build': { label: '本地构建', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  dangling: { label: '悬空', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}

export function Migrate() {
  const [tab, setTab] = useState('report')
  const [msg, setMsg] = useState(null)

  // ── 体检 ──
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [filterSource, setFilterSource] = useState(null)
  const [query, setQuery] = useState('')
  const [tagModal, setTagModal] = useState({ isOpen: false, image: null, ref: '' })

  // ── 导出 ──
  const [containers, setContainers] = useState([])
  const [selected, setSelected] = useState([])
  const [expOpts, setExpOpts] = useState({ includeImages: true, compress: true, redactEnv: true })
  const [packages, setPackages] = useState([])
  const [exportTask, setExportTask] = useState(null) // {taskID, percentage, message, detail, isDone}

  // ── 导入 ──
  const [uploaded, setUploaded] = useState(null) // {file, size}
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [plan, setPlan] = useState(null)
  const [applyOpts, setApplyOpts] = useState({ start: true, autoCreateDirs: false })
  const [importTask, setImportTask] = useState(null)
  const [results, setResults] = useState(null)
  const fileRef = useRef(null)

  const loadReport = useCallback(async () => {
    setLoadingReport(true)
    try {
      const r = await autoUpdateAPI.migrateImageReport()
      if (okCode(r)) setReport(r.data.data)
      else setMsg({ type: 'err', text: r.data?.msg || '扫描失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '扫描失败' })
    } finally { setLoadingReport(false) }
  }, [])

  const loadPackages = useCallback(async () => {
    try {
      const r = await autoUpdateAPI.migrateListExports()
      if (okCode(r)) setPackages(r.data.data?.packages || [])
    } catch (e) { /* 忽略 */ }
  }, [])

  useEffect(() => { loadReport() }, [loadReport])
  useEffect(() => { loadPackages() }, [loadPackages])
  useEffect(() => {
    (async () => {
      try {
        const r = await containerAPI.getContainers()
        if (okCode(r)) setContainers(r.data.data || [])
      } catch (e) { /* 忽略 */ }
    })()
  }, [])

  // 导出任务轮询
  useEffect(() => {
    if (!exportTask || exportTask.isDone) return
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/progress/${exportTask.taskID}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('docker_copilot_token')}` },
        })
        const j = await r.json()
        const d = j.data || {}
        setExportTask(t => ({ ...t, percentage: d.percentage, message: d.message, detail: d.detailMsg, isDone: d.isDone }))
        if (d.isDone) { loadPackages(); loadReport() }
      } catch (e) { /* 忽略 */ }
    }, 1500)
    return () => clearTimeout(timer)
  }, [exportTask, loadPackages, loadReport])

  // 导入任务轮询
  useEffect(() => {
    if (!importTask || importTask.isDone) return
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/progress/${importTask.taskID}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('docker_copilot_token')}` },
        })
        const j = await r.json()
        const d = j.data || {}
        setImportTask(t => ({ ...t, percentage: d.percentage, message: d.message, detail: d.detailMsg, isDone: d.isDone }))
        if (d.isDone) setResults(d.detailMsg || d.message)
      } catch (e) { /* 忽略 */ }
    }, 1500)
    return () => clearTimeout(timer)
  }, [importTask])

  // ── 动作 ──
  const doTag = async () => {
    const { image, ref } = tagModal
    if (!image || !ref) return
    try {
      const r = await autoUpdateAPI.migrateTagImage(image.id, ref)
      if (okCode(r)) {
        setMsg({ type: 'ok', text: `已打标签 ${r.data.data.ref}` })
        setTagModal({ isOpen: false, image: null, ref: '' })
        loadReport()
      } else setMsg({ type: 'err', text: r.data?.msg || '打标签失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '打标签失败' })
    }
  }

  const startExport = async () => {
    setMsg(null)
    setExportTask({ taskID: null, percentage: 0, message: '正在启动…', detail: '', isDone: false })
    try {
      const r = await autoUpdateAPI.migrateExport({
        containers: selected,
        includeImages: expOpts.includeImages,
        compress: expOpts.compress,
        redactEnv: expOpts.redactEnv,
      })
      if (okCode(r)) setExportTask({ taskID: r.data.data.taskID, percentage: 0, message: '已开始', detail: '', isDone: false })
      else { setExportTask(null); setMsg({ type: 'err', text: r.data?.msg || '导出失败' }) }
    } catch (e) {
      setExportTask(null)
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '导出失败' })
    }
  }

  const doUpload = async (file) => {
    if (!file) return
    setUploading(true); setUploadPct(0); setPlan(null); setResults(null); setMsg(null)
    try {
      const r = await autoUpdateAPI.migrateUpload(file, (ev) => {
        if (ev.total) setUploadPct(Math.round((ev.loaded / ev.total) * 100))
      })
      if (okCode(r)) {
        setUploaded({ file: r.data.data.file, size: r.data.data.size })
        setMsg({ type: 'ok', text: '上传完成，正在预检…' })
        const p = await autoUpdateAPI.migratePlan(r.data.data.file)
        if (okCode(p)) setPlan(p.data.data)
        else setMsg({ type: 'err', text: p.data?.msg || '预检失败' })
      } else setMsg({ type: 'err', text: r.data?.msg || '上传失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '上传失败' })
    } finally { setUploading(false) }
  }

  const updatePlanItem = (name, patch) => {
    setPlan(p => ({
      ...p,
      items: (p.items || []).map(it => it.name === name ? { ...it, ...patch } : it),
    }))
  }

  const startImport = async () => {
    if (!uploaded || !plan) return
    setMsg(null); setResults(null)
    setImportTask({ taskID: null, percentage: 0, message: '正在启动…', detail: '', isDone: false })
    try {
      const items = (plan.items || []).filter(it => !it._skip).map(it => ({
        name: it.name,
        skip: false,
        newName: it._newName || (it.nameConflict ? it.suggestedName : ''),
        portMap: it._portMap || {},
        mountMap: it._mountMap || {},
      }))
      const r = await autoUpdateAPI.migrateApply({
        file: uploaded.file,
        items,
        start: applyOpts.start,
        autoCreateDirs: applyOpts.autoCreateDirs,
      })
      if (okCode(r)) setImportTask({ taskID: r.data.data.taskID, percentage: 0, message: '已开始', detail: '', isDone: false })
      else { setImportTask(null); setMsg({ type: 'err', text: r.data?.msg || '导入失败' }) }
    } catch (e) {
      setImportTask(null)
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '导入失败' })
    }
  }

  const downloadPackage = (file) => {
    const url = autoUpdateAPI.migrateDownloadUrl(file)
    const token = localStorage.getItem('docker_copilot_token')
    // 走 fetch + blob，带上 JWT（直链没有鉴权）
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = file
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => setMsg({ type: 'err', text: '下载失败' }))
  }

  // ── 渲染 ──
  const filteredImages = (report?.images || []).filter(img => {
    if (filterSource && img.source !== filterSource) return false
    const q = query.trim().toLowerCase()
    if (q) {
      const hay = `${(img.refs || []).join(' ')} ${img.id}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">容器迁移</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">镜像体检 · 打包导出 · 上传导入（本包自带来无面板导入脚本）</p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {[
            { v: 'report', label: '镜像体检', icon: ShieldCheck },
            { v: 'export', label: '导出', icon: FileDown },
            { v: 'import', label: '导入', icon: Upload },
          ].map(t => (
            <button
              key={t.v}
              onClick={() => setTab(t.v)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 text-sm transition-colors',
                tab === t.v
                  ? 'bg-primary-600 text-white font-semibold'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              )}
            >
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className={cn(
          'rounded-lg px-4 py-2.5 text-sm flex items-center gap-2',
          msg.type === 'ok'
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        )}>
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} className="opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ① 镜像体检 */}
      {tab === 'report' && (
        <>
          <div className="grid grid-cols-4 gap-0 rounded-3xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {[
              { k: 'total', label: '总镜像', color: 'text-primary-600 dark:text-primary-400' },
              { k: 'registry', label: '公共可得', color: 'text-emerald-600 dark:text-emerald-400' },
              { k: 'localBuild', label: '本地构建', color: 'text-amber-600 dark:text-amber-400' },
              { k: 'dangling', label: '悬空无 tag', color: 'text-gray-500 dark:text-gray-400' },
            ].map((s, i) => (
              <button
                key={s.k}
                onClick={() => setFilterSource(s.k === 'localBuild' ? 'local-build' : s.k === 'dangling' ? 'dangling' : s.k === 'registry' ? 'registry' : null)}
                className={cn('p-4 text-center border-gray-200 dark:border-gray-700', i < 3 && 'border-r', 'hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors')}
              >
                <div className={cn('text-2xl font-bold', s.color)}>{report?.[s.k] ?? '—'}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{s.label}</div>
              </button>
            ))}
          </div>

          {(report?.atRisk ?? 0) > 0 && (
            <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>有 <b>{report.atRisk}</b> 个镜像没有可拉取的仓库来源：换主机 / 重装后会直接丢失，建议打标签后打包导出（磁盘剩余 {fmtSize(report.diskFree)}）</span>
            </div>
          )}

          <Card title="镜像清单" icon={Boxes}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => setFilterSource(null)} className={cn('text-xs px-3 py-1.5 rounded-full border', !filterSource ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}>
                全部 {report?.total ?? 0}
              </button>
              {['registry', 'local-build', 'dangling'].map(src => (
                <button key={src} onClick={() => setFilterSource(src)} className={cn('text-xs px-3 py-1.5 rounded-full border', filterSource === src ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}>
                  {SOURCE_META[src].label}
                </button>
              ))}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索镜像…"
                className="ml-auto w-52 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 outline-none"
              />
              <button onClick={loadReport} disabled={loadingReport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                <RefreshCw className={cn('h-3.5 w-3.5', loadingReport && 'animate-spin')} />重新体检
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_90px_110px_170px_120px] gap-3 px-4 py-2.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-900/20">
                <span>镜像</span><span>大小</span><span>分类</span><span>被谁使用</span><span className="text-right">操作</span>
              </div>
              {filteredImages.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  {loadingReport ? '正在扫描…' : '没有匹配的镜像'}
                </div>
              )}
              {filteredImages.map(img => {
                const meta = SOURCE_META[img.source] || SOURCE_META.registry
                const risky = img.source === 'dangling' || img.source === 'local-build'
                return (
                  <div key={img.id} className={cn(
                    'flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_90px_110px_170px_120px] gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0',
                    risky && 'bg-amber-50/40 dark:bg-amber-900/10'
                  )}>
                    <div className="min-w-0">
                      <div className={cn('text-sm font-semibold truncate', (img.refs || []).length ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>
                        {(img.refs || []).length ? img.refs.join('、') : '<none>（无标签）'}
                      </div>
                      <div className="text-xs text-gray-400 font-mono truncate mt-0.5">sha256:{img.shortId}{img.snapshotOf ? ` · 快照 ${img.snapshotOf}` : ''}</div>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{fmtSize(img.size)}</div>
                    <div><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', meta.cls)}>{meta.label}</span></div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{(img.usedBy || []).join('、') || '—'}</div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setTagModal({ isOpen: true, image: img, ref: `dh-local/${img.shortId}:latest` })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 whitespace-nowrap"
                        title="给它一个名字（悬空镜像必须有名字才能搬运）"
                      >
                        <Tag className="h-3.5 w-3.5" />打标签
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              分类规则：<b>公共可得</b>=从仓库拉取过（有 digest，目标机可直接 pull）；<b>本地构建</b>=有 tag 但无 digest（必须打包搬运）；<b>悬空</b>=无任何 tag（先打标签）。
            </p>
          </Card>
        </>
      )}

      {/* ② 导出 */}
      {tab === 'export' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={`选择容器（${selected.length}/${containers.length}）`} icon={Package}>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setSelected(containers.map(c => c.name))} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">全选</button>
                <button onClick={() => setSelected([])} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">清空</button>
                <button
                  onClick={() => {
                    const risky = new Set((report?.images || []).filter(i => i.source !== 'registry').flatMap(i => i.usedBy || []))
                    setSelected(containers.filter(c => risky.has(c.name)).map(c => c.name))
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20"
                >选中"有风险镜像"的容器</button>
              </div>
              <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {containers.map(c => {
                  const on = selected.includes(c.name)
                  return (
                    <label key={c.id} className={cn(
                      'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-sm',
                      on ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700'
                    )}>
                      <input type="checkbox" checked={on} className="h-3.5 w-3.5"
                        onChange={() => setSelected(s => on ? s.filter(n => n !== c.name) : [...s, c.name])} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">不勾选容器 = 只导出镜像；勾选容器 = 附带容器配方（可从零重建）</p>
            </Card>

            <Card title="导出选项" icon={Archive}>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={expOpts.includeImages} onChange={e => setExpOpts(o => ({ ...o, includeImages: e.target.checked }))} className="h-4 w-4 rounded" />
                  打包镜像文件（docker save；不勾选则只导配方，目标机自行拉镜像）
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={expOpts.compress} onChange={e => setExpOpts(o => ({ ...o, compress: e.target.checked }))} className="h-4 w-4 rounded" />
                  压缩镜像文件（gzip，省空间、慢一些）
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={expOpts.redactEnv} onChange={e => setExpOpts(o => ({ ...o, redactEnv: e.target.checked }))} className="h-4 w-4 rounded" />
                  环境变量脱敏（密码/Token 类替换为 ****，推荐保持勾选）
                </label>
                <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60">
                  <button
                    onClick={startExport}
                    disabled={!!exportTask && !exportTask.isDone}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                  >
                    <FileDown className="h-4 w-4" />开始导出
                  </button>
                </div>
                {exportTask && (
                  <div className="pt-1">
                    <ProgressBar percent={exportTask.percentage} message={exportTask.message} detail={exportTask.detail} done={exportTask.isDone} />
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  包内自带 compose.yaml + import.sh + README.txt：目标机没装面板也能用命令行导入。
                </p>
              </div>
            </Card>
          </div>

          <Card title={`导出包（${packages.length}）`} icon={Download}>
            {packages.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">还没有迁移包</p>}
            <div className="space-y-2">
              {packages.map(p => (
                <div key={p.file} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <Package className="h-4 w-4 text-primary-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate font-mono">{p.file}</div>
                    <div className="text-xs text-gray-400">{fmtSize(p.size)} · {new Date(p.createdAt * 1000).toLocaleString('zh-CN', { hour12: false })}</div>
                  </div>
                  <button onClick={() => downloadPackage(p.file)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-primary-600 dark:text-primary-400 border-gray-200 dark:border-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/20">
                    <Download className="h-3.5 w-3.5" />下载
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`删除迁移包 ${p.file}？`)) return
                      const r = await autoUpdateAPI.migrateDeleteExport(p.file)
                      if (okCode(r)) { setMsg({ type: 'ok', text: '已删除' }); loadPackages() }
                      else setMsg({ type: 'err', text: r.data?.msg || '删除失败' })
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />删除
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ③ 导入 */}
      {tab === 'import' && (
        <>
          <Card title="上传迁移包" icon={Upload}>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); doUpload(e.dataTransfer.files?.[0]) }}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl px-4 py-8 text-center cursor-pointer hover:border-primary-400 transition-colors"
            >
              <Upload className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-300">拖拽迁移包到这里，或 <span className="text-primary-600 dark:text-primary-400 font-medium">点击选择文件</span></p>
              <p className="text-xs text-gray-400 mt-1">.tar.gz · 上限 8 GB · 这台机器还没装面板？用包里的 import.sh（README 有说明）</p>
              {uploaded && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-mono">已上传：{uploaded.file}（{fmtSize(uploaded.size)}）</p>}
            </div>
            <input ref={fileRef} type="file" accept=".gz,.tar.gz,application/gzip" className="hidden"
              onChange={(e) => doUpload(e.target.files?.[0])} />
            {uploading && (
              <div className="mt-3">
                <ProgressBar percent={uploadPct} message="正在上传…" showPercent />
              </div>
            )}
          </Card>

          {plan && (
            <Card title={`预检结果（${(plan.items || []).length} 个容器）`} icon={ShieldCheck}>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="hidden lg:grid grid-cols-[150px_minmax(0,1fr)_110px_minmax(0,1.2fr)_90px] gap-3 px-4 py-2.5 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700/60 bg-gray-50/70 dark:bg-gray-900/20">
                  <span>容器</span><span>镜像</span><span>状态</span><span>预检提示</span><span className="text-right">操作</span>
                </div>
                {(plan.items || []).map(it => {
                  const imgMeta = { local: '本地已有 ✅', package: '包内提供 ✅', registry: '可拉取 ☁️', missing: '缺失 ❌' }[it.imageSource]
                  const hasWarn = it.nameConflict || (it.portConflicts || []).length || (it.missingMounts || []).length
                  return (
                    <div key={it.name} className={cn(
                      'flex flex-col lg:grid lg:grid-cols-[150px_minmax(0,1fr)_110px_minmax(0,1.2fr)_90px] gap-x-3 gap-y-1.5 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0',
                      it._skip ? 'opacity-40' : (hasWarn ? 'bg-amber-50/40 dark:bg-amber-900/10' : '')
                    )}>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{it.name}</div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate">{it.imageRef}</div>
                        <div className="text-xs text-gray-400">{imgMeta}{it.privilileged || it.privileged ? ' · 特权模式' : ''}</div>
                      </div>
                      <div>
                        {it.imageSource === 'missing'
                          ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">缺镜像</span>
                          : hasWarn
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">有冲突</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">可导入</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 min-w-0">
                        {it.nameConflict && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-red-500 dark:text-red-400">名字冲突</span>
                            <input
                              value={it._newName ?? it.suggestedName}
                              onChange={(e) => updatePlanItem(it.name, { _newName: e.target.value })}
                              className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono w-36"
                            />
                          </div>
                        )}
                        {(it.portConflicts || []).map((pc, i) => <div key={i} className="text-amber-600 dark:text-amber-400">端口 {pc}</div>)}
                        {(it.missingMounts || []).map((m, i) => (
                          <div key={i} className="truncate">
                            <span className="text-amber-600 dark:text-amber-400">路径不存在</span>
                            <span className="font-mono"> {m.source}</span>
                            {it.mountSuggest?.[m.source] && (
                              <button
                                onClick={() => updatePlanItem(it.name, {
                                  _mountMap: { ...(it._mountMap || {}), [m.source]: it.mountSuggest[m.source] },
                                })}
                                className="ml-1 text-primary-600 dark:text-primary-400 hover:underline"
                                title={`映射到 ${it.mountSuggest[m.source]}`}
                              >→ 映射到 {it.mountSuggest[m.source]}</button>
                            )}
                            {it._mountMap?.[m.source] && <span className="ml-1 text-emerald-600 dark:text-emerald-400">已映射 ✓</span>}
                          </div>
                        ))}
                        {!hasWarn && <div className="text-emerald-600 dark:text-emerald-400">无冲突</div>}
                      </div>
                      <div className="flex justify-end items-start">
                        <button
                          onClick={() => updatePlanItem(it.name, { _skip: !it._skip })}
                          className={cn('text-xs px-2 py-1 rounded-lg border', it._skip ? 'border-gray-200 text-gray-500' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}
                        >{it._skip ? '恢复' : '跳过'}</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={applyOpts.start} onChange={e => setApplyOpts(o => ({ ...o, start: e.target.checked }))} className="h-4 w-4 rounded" />
                  导入后自动启动（仅启动原本在运行的容器）
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={applyOpts.autoCreateDirs} onChange={e => setApplyOpts(o => ({ ...o, autoCreateDirs: e.target.checked }))} className="h-4 w-4 rounded" />
                  缺失的宿主目录自动创建（空目录，不含数据）
                </label>
                <button
                  onClick={startImport}
                  disabled={!!importTask && !importTask.isDone}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" />执行导入
                </button>
              </div>
              {importTask && (
                <div className="mt-3">
                  <ProgressBar percent={importTask.percentage} message={importTask.message} detail={importTask.detail} done={importTask.isDone} />
                </div>
              )}
              {results && (
                <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-4 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                  {results}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* 打标签弹窗 */}
      {tagModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex-1">给镜像打标签</h3>
              <button onClick={() => setTagModal({ isOpen: false, image: null, ref: '' })} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                sha256:{tagModal.image?.shortId}（{(tagModal.image?.refs || []).join('、') || '无标签'}）
              </div>
              <input
                value={tagModal.ref}
                onChange={(e) => setTagModal(m => ({ ...m, ref: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 font-mono text-sm text-gray-900 dark:text-white outline-none"
                placeholder="例如 dh-local/myapp:latest"
              />
              <p className="text-xs text-gray-400">已有同名标签且指向其他镜像时会被拒绝（绝不覆盖）。</p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button onClick={() => setTagModal({ isOpen: false, image: null, ref: '' })}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl">取消</button>
              <button onClick={doTag} disabled={!tagModal.ref}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">打标签</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
