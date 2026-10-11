import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Boxes,
  RefreshCw,
  Copy,
  Check,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  Info,
  Layers,
  GitCompare,
  Target,
  FolderSearch,
  ListOrdered,
  Wrench,
  FileText,
  ScrollText,
  X,
  Download,
  CloudUpload,
  Loader2,
} from 'lucide-react'
import { composeBackupAPI, containerAPI, projectAPI } from '../api/client.js'
import { cn } from '../utils/cn.js'

// 「Compose」页：compose 项目 / 服务分组视图
// —— 按 label 聚合（零配置可见）→ 每个项目标注文件可达性 → 不可达的给挂载引导；
// 可达的做变量体检（文件里解析不了的 ${X} 提示出来）。更新仍走「容器」页/自动更新的既有通道。

const okCode = (r) => r?.data?.code === 200 || r?.data?.code === 0

const STATE_META = {
  readable: {
    text: '可读',
    cls: 'badge-success',
    icon: CheckCircle2,
    tip: '面板能读到 compose 文件 → 更新按文件原生重建：文件里改的端口、环境变量都会生效，不会配置漂移',
  },
  needsMount: {
    text: '需挂载',
    cls: 'badge-warning',
    icon: AlertTriangle,
    tip: '面板读不到 compose 文件 → 更新时镜像照常换新，但配置只能照抄容器现状：以后在文件里改的东西不会生效；按页面顶部的挂载引导挂上目录即可升级',
  },
  noFile: {
    text: '无文件记录',
    cls: 'badge-info',
    icon: HelpCircle,
    tip: '容器不是 compose 创建的（没有文件可读）→ 更新时配置照抄容器现状',
  },
}

// 非「可读」状态对"更新"意味着什么（可读的最优路径不重复展示，见徽标悬浮说明）
// 注意说法：镜像都会更新，差别在"重建容器时配置以谁为准"
const UPDATE_HINT = {
  needsMount: '更新方式：镜像照常更新，但配置照抄容器现状——在 compose 文件里改的东西不会生效',
  noFile: '更新方式：镜像照常更新，配置照抄容器现状',
}

// 可点击的状态筛选片（统计行用）
function FilterChip({ active, tone = 'gray', onClick, children }) {
  const styles = {
    gray: active
      ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 border-transparent hover:border-gray-400',
    success: active
      ? 'bg-green-600 text-white border-green-600'
      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-transparent hover:border-green-400',
    warning: active
      ? 'bg-yellow-500 text-white border-yellow-500'
      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-transparent hover:border-yellow-400',
    info: active
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-transparent hover:border-blue-400',
  }
  return (
    <button onClick={onClick} className={cn('badge cursor-pointer select-none border transition-colors', styles[tone])}>
      {children}
    </button>
  )
}

// 开关（与其它设置页样式一致）
function Switch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

// 时间 ↔ cron（备份计划按"每天 HH:MM"呈现；后端存标准 5 段 cron）
const pad2 = (n) => String(n).padStart(2, '0')
const cronToTime = (cron) => {
  const m = String(cron || '').match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/)
  return m ? `${pad2(+m[2])}:${pad2(+m[1])}` : ''
}
const timeToCron = (t) => {
  const [h, m] = String(t || '03:00').split(':')
  return `${+m || 0} ${+h || 3} * * *`
}
const tsName = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 原文 / 日志只读查看弹窗
function CodeViewer({ viewer, onClose, onRefresh, onCopy }) {
  const [copied, setCopied] = useState(false)
  const isFile = viewer.kind === 'file'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
          {isFile ? <FileText className="h-4 w-4 text-primary-500 flex-shrink-0" /> : <ScrollText className="h-4 w-4 text-primary-500 flex-shrink-0" />}
          <span className="font-semibold text-sm text-gray-900 dark:text-white truncate flex-1">{viewer.title}</span>
          {!isFile && (
            <button className="btn-icon-secondary" onClick={onRefresh} title="刷新">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button className="btn-icon-secondary" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        {viewer.subtitle && (
          <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 font-mono truncate border-b border-gray-100 dark:border-gray-700/60" title={viewer.subtitle}>
            {viewer.subtitle}
          </div>
        )}
        <div className="flex-1 overflow-auto bg-gray-900 dark:bg-black/60 min-h-[200px]">
          {viewer.loading ? (
            <div className="p-4 flex items-center gap-2 text-gray-400 text-xs">
              <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : viewer.error ? (
            <div className="p-4 text-red-300 text-xs whitespace-pre-wrap">{viewer.error}</div>
          ) : (
            <pre className="text-xs font-mono text-gray-100 p-4 whitespace-pre-wrap break-all">{viewer.content || '(无内容)'}</pre>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={async () => {
              const ok = await onCopy()
              if (ok) {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }
            }}
            disabled={viewer.loading || !!viewer.error}
          >
            {copied ? '已复制 ✓' : '复制内容'}
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {isFile ? '只读展示，不会修改文件' : '最新 200 行（含时间戳）'}
          </span>
        </div>
      </div>
    </div>
  )
}

function StateBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.noFile
  const Icon = meta.icon
  return (
    <span className={cn(meta.cls, 'gap-1')} title={meta.tip}>
      <Icon className="h-3 w-3" />
      {meta.text}
    </span>
  )
}

// 列表行：每个 compose 项目一行、等高（h-11）；点击展开/收起服务明细（手风琴式，展开时推开下面的行）
function ProjectRow({ project: p, onViewFile, onViewLogs, onExport }) {
  const [open, setOpen] = useState(false)
  const services = p.services || []
  const updateCount = services.filter((s) => s.haveUpdate).length
  const serviceNames = services.map((s) => s.service).join(' · ')
  return (
    <div className="border-b border-gray-100 dark:border-gray-700/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 h-11 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        title={open ? '点击收起' : '点击展开服务明细'}
      >
        {/* 固定列：项目 / 状态 / 服务数（列宽与表头对齐） */}
        <span className="font-medium text-sm text-gray-900 dark:text-white truncate w-44 flex-shrink-0" title={p.name}>
          {p.name}
        </span>
        <span className="w-28 flex-shrink-0">
          <StateBadge state={p.state} />
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap w-20 flex-shrink-0">
          {services.length} 个服务
        </span>
        {/* 弹性列：把项目里包含的服务铺开，填充中间空间 */}
        <span className="flex-1 min-w-0 text-xs text-gray-400 dark:text-gray-500 truncate" title={serviceNames}>
          {serviceNames}
        </span>
        {/* 右侧徽标 + 展开箭头 */}
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {updateCount > 0 && <span className="badge-warning whitespace-nowrap">{updateCount} 个有更新</span>}
          {p.varUnresolved?.length > 0 && (
            <span
              className="badge-warning hidden md:inline-flex whitespace-nowrap"
              title={`这些变量在面板侧解析不到（.env 和面板环境里都没有）：${p.varUnresolved.join('、')}；可能在面板数据库里，更新时注意核对`}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {p.varUnresolved.length} 个变量不在文件里
            </span>
          )}
          {p.state === 'readable' && p.hasEnvFile && (
            <span className="badge-info hidden lg:inline-flex whitespace-nowrap" title="项目目录存在 .env，变量体检已把它算作解析来源">
              有 .env
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 text-xs border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/20">
          <div className="space-y-1.5">
            {services.map((svc) => (
              <div key={svc.id} className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full flex-shrink-0',
                    svc.state === 'running' ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-500'
                  )}
                  title={svc.state}
                />
                <span className="text-gray-900 dark:text-gray-100 flex-shrink-0">{svc.service}</span>
                <span className="text-gray-400 dark:text-gray-500 font-mono truncate max-w-[30%]">{svc.name}</span>
                <span className="flex-1" />
                <span className="text-gray-500 dark:text-gray-400 font-mono truncate max-w-[45%]" title={svc.image}>
                  {svc.image}
                </span>
                {svc.haveUpdate && <span className="badge-warning flex-shrink-0">有更新</span>}
                {!svc.haveUpdate && svc.uncheckable && (
                  <span className="badge-info flex-shrink-0" title="镜像没有可查询的标签（本地构建/悬空），无法检测更新">
                    无法检测
                  </span>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
                  title={`查看 ${svc.name} 的日志（最近 200 行）`}
                  onClick={() => onViewLogs(svc, p)}
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  日志
                </button>
              </div>
            ))}
          </div>
          {p.configFiles?.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400 dark:text-gray-500 font-mono truncate flex-1" title={p.configFiles.join('\n')}>
                文件：{p.configFiles[0]}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
                title="查看 compose 文件原文（只读）"
                onClick={() => onViewFile(p)}
              >
                <FileText className="h-3.5 w-3.5" />
                查看原文
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
                title="导出该项目的 compose 配置（zip 下载）"
                onClick={() => onExport(p)}
              >
                <Download className="h-3.5 w-3.5" />
                导出
              </button>
            </div>
          )}
          <div className="text-gray-500 dark:text-gray-400">
            {p.state === 'readable'
              ? '更新方式：按 compose 文件原生重建（文件改动会生效）'
              : UPDATE_HINT[p.state] || UPDATE_HINT.noFile}
            {p.state === 'needsMount' && p.mountHint && (
              <span className="text-yellow-700 dark:text-yellow-300">
                {' '}
                · 需要挂载 <code className="font-mono">{p.mountHint}</code>
              </span>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export function Compose() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [rootsText, setRootsText] = useState('')
  const [savingRoots, setSavingRoots] = useState(false)
  const [msg, setMsg] = useState(null)
  const [copiedKey, setCopiedKey] = useState('')
  const [filter, setFilter] = useState('all')
  const guideRef = useRef(null)
  const [viewer, setViewer] = useState(null)
  const viewerSeq = useRef(0)
  const [bk, setBk] = useState(null)           // 备份设置（服务端 get 后填充）
  const [bkTime, setBkTime] = useState('03:00') // 每天备份时间（HH:MM）
  const [bkBusy, setBkBusy] = useState('')      // '' | test | save | run
  const [bkMsg, setBkMsg] = useState(null)      // {type:'ok'|'err', text}
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return localStorage.getItem('dh_apps_intro_hidden') !== '1'
    } catch {
      return true
    }
  })

  const dismissIntro = () => {
    setShowIntro(false)
    try {
      localStorage.setItem('dh_apps_intro_hidden', '1')
    } catch {
      /* 忽略隐私模式下的存储失败 */
    }
  }

  // 手动找回说明卡：打开并清掉"已收起"的记忆（想再收起，点卡上的「知道了」）
  const openIntro = () => {
    setShowIntro(true)
    try {
      localStorage.removeItem('dh_apps_intro_hidden')
    } catch {
      /* 忽略隐私模式下的存储失败 */
    }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const r = await projectAPI.list()
      if (okCode(r)) {
        setData(r.data.data)
        setRootsText((r.data.data.extraRoots || []).join('\n'))
        setLoadErr('')
      } else {
        setLoadErr(r.data.msg || '加载失败')
      }
    } catch (e) {
      setLoadErr(e?.response?.data?.msg || e?.message || '加载失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // 复制到剪贴板：优先 clipboard API；http 非安全上下文（用 IP 访问时）不可用 → 降级 execCommand
  const copyText = async (text, key) => {
    const fallbackCopy = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.top = '-1000px'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    }
    let ok = false
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        ok = false
      }
    }
    if (!ok) ok = fallbackCopy()
    if (ok) {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(''), 2000)
    } else {
      setMsg({ type: 'err', text: '复制失败，请手动选择复制' })
    }
    return ok
  }

  // ── 原文 / 日志查看（只读弹窗）──
  const closeViewer = () => {
    viewerSeq.current++
    setViewer(null)
  }

  const fetchLogs = async (seq, id) => {
    try {
      const r = await containerAPI.getLogs(id)
      if (viewerSeq.current !== seq) return
      setViewer((v) => (v ? { ...v, loading: false, content: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) } : v))
    } catch (e) {
      if (viewerSeq.current !== seq) return
      const msg =
        typeof e?.response?.data === 'string' && e.response.data
          ? e.response.data
          : e?.response?.data?.msg || e?.message || '读取失败'
      setViewer((v) => (v ? { ...v, loading: false, error: String(msg) } : v))
    }
  }

  const openFileView = async (p) => {
    const seq = ++viewerSeq.current
    setViewer({
      kind: 'file',
      title: `compose 原文 · ${p.name}`,
      subtitle: p.configFiles?.[0] || '',
      loading: true,
      error: '',
      content: '',
      containerId: p.services?.[0]?.id,
    })
    try {
      const r = await containerAPI.getComposeFile(p.services?.[0]?.id)
      if (viewerSeq.current !== seq) return
      if (okCode(r)) {
        const d = r.data.data || {}
        const parts = Object.entries(d.files || {}).map(([f, c]) => `# ── ${f} ──\n${c}`)
        const errs = Object.entries(d.errors || {}).map(([f, e2]) => `# ── ${f} ──\n（读取失败：${e2}）`)
        setViewer((v) => (v ? { ...v, loading: false, content: [...parts, ...errs].join('\n\n') } : v))
      } else {
        setViewer((v) => (v ? { ...v, loading: false, error: r.data.msg || '读取失败' } : v))
      }
    } catch (e) {
      if (viewerSeq.current !== seq) return
      const msg =
        typeof e?.response?.data === 'string' && e.response.data
          ? e.response.data
          : e?.response?.data?.msg || e?.message || '读取失败'
      setViewer((v) => (v ? { ...v, loading: false, error: String(msg) } : v))
    }
  }

  const openLogsView = (svc) => {
    const seq = ++viewerSeq.current
    setViewer({
      kind: 'logs',
      title: `日志 · ${svc.service}`,
      subtitle: svc.name,
      loading: true,
      error: '',
      content: '',
      containerId: svc.id,
    })
    fetchLogs(seq, svc.id)
  }

  const refreshLogs = () => {
    if (!viewer?.containerId) return
    const seq = ++viewerSeq.current
    setViewer((v) => (v ? { ...v, loading: true, error: '', content: '' } : v))
    fetchLogs(seq, viewer.containerId)
  }

  // ── 配置导出（zip 直接下载）──
  const blobErrMsg = async (e) => {
    const d = e?.response?.data
    if (d instanceof Blob) {
      try {
        const j = JSON.parse(await d.text())
        return j.msg || '导出失败'
      } catch {
        return '导出失败'
      }
    }
    return d?.msg || e?.message || '导出失败'
  }

  const exportConfigs = async (project) => {
    setMsg(null)
    try {
      const r = project ? await projectAPI.exportOne(project) : await projectAPI.exportAll()
      const name = project
        ? `dockhamster-compose-${project.replace(/[^A-Za-z0-9._-]+/g, '_')}-${tsName()}.zip`
        : `dockhamster-compose-${tsName()}.zip`
      downloadBlob(r.data, name)
      setMsg({ type: 'ok', text: project ? `「${project}」配置已开始下载` : '全部配置已开始下载' })
    } catch (e) {
      setMsg({ type: 'err', text: await blobErrMsg(e) })
    }
  }

  // ── WebDAV 自动备份 ──
  const loadBackup = useCallback(async () => {
    try {
      const r = await composeBackupAPI.getSettings()
      if (okCode(r)) {
        setBk(r.data.data)
        setBkTime(cronToTime(r.data.data?.cron) || '03:00')
      }
    } catch {
      /* 静默：备份设置拿不到不影响主视图 */
    }
  }, [])

  useEffect(() => {
    load()
    loadBackup()
  }, [load, loadBackup])

  const testBackup = async () => {
    if (!bk) return
    setBkBusy('test')
    setBkMsg(null)
    try {
      const r = await composeBackupAPI.test({ url: bk.url, username: bk.username, password: bk.password, remoteDir: bk.remoteDir })
      const okk = okCode(r) && r.data.data?.ok
      setBkMsg({ type: okk ? 'ok' : 'err', text: r.data.msg || (okk ? '连接成功' : '连接失败') })
    } catch (e) {
      setBkMsg({ type: 'err', text: e?.response?.data?.msg || e?.message || '测试失败' })
    } finally {
      setBkBusy('')
    }
  }

  const saveBackup = async () => {
    if (!bk) return
    setBkBusy('save')
    setBkMsg(null)
    try {
      const r = await composeBackupAPI.saveSettings({ ...bk, cron: timeToCron(bkTime) })
      if (okCode(r)) {
        setBk(r.data.data)
        setBkMsg({ type: 'ok', text: '已保存' })
      } else {
        setBkMsg({ type: 'err', text: r.data.msg || '保存失败' })
      }
    } catch (e) {
      setBkMsg({ type: 'err', text: e?.response?.data?.msg || e?.message || '保存失败' })
    } finally {
      setBkBusy('')
    }
  }

  const runBackup = async () => {
    setBkBusy('run')
    setBkMsg(null)
    try {
      const r = await composeBackupAPI.run()
      setBkMsg({ type: okCode(r) ? 'ok' : 'err', text: r.data.msg || (okCode(r) ? '备份完成' : '备份失败') })
      await loadBackup()
    } catch (e) {
      setBkMsg({ type: 'err', text: e?.response?.data?.msg || e?.message || '备份失败' })
      await loadBackup()
    } finally {
      setBkBusy('')
    }
  }

  const saveRoots = async () => {
    const roots = rootsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    setSavingRoots(true)
    setMsg(null)
    try {
      const r = await projectAPI.saveRoots(roots)
      if (okCode(r)) {
        setMsg({ type: 'ok', text: '已保存，重新扫描中…' })
        await load(true)
      } else {
        setMsg({ type: 'err', text: r.data.msg || '保存失败' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e?.response?.data?.msg || e?.message || '保存失败' })
    } finally {
      setSavingRoots(false)
    }
  }

  const projects = data?.projects || []
  const hints = data?.guide?.hints || []
  const snippet = data?.guide?.snippet || ''
  const serviceCount = projects.reduce((n, p) => n + (p.services?.length || 0), 0)
  const readableCount = projects.filter((p) => p.state === 'readable').length
  const needMountCount = projects.filter((p) => p.state === 'needsMount').length
  const noFileCount = projects.filter((p) => p.state === 'noFile').length
  const shownProjects = filter === 'all' ? projects : projects.filter((p) => p.state === filter)

  // 挂载引导的两种写法（非 compose 部署的面板也要给出 volumes 形式）
  const volumesBlock = hints.length
    ? 'volumes:\n' + hints.map((h) => `  - ${h.path}:${h.path}:ro`).join('\n')
    : ''
  const runArgs = hints.map((h) => `-v ${h.path}:${h.path}:ro`).join('\n')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Boxes className="h-6 w-6" />
            Compose
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            按 compose 项目分组查看你的容器；更新仍在「容器」页 / 「自动更新」里发起
          </p>
        </div>
        <div className="flex items-center gap-2 self-start flex-wrap">
          {!showIntro && (
            <button className="btn-secondary" onClick={openIntro} title="重新打开页面说明">
              <HelpCircle className="h-4 w-4 mr-1.5" />
              页面说明
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportConfigs('')} title="打包下载全部可读项目的 compose 配置（含 .env）">
            <Download className="h-4 w-4 mr-1.5" />
            导出配置
          </button>
          <button className="btn-secondary" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
            刷新
          </button>
        </div>
      </div>

      {/* 新手说明（可收起，记住选择） */}
      {showIntro && data && (
        <div className="card p-4 border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/10">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white"><Info className="h-4 w-4 text-primary-500 dark:text-primary-400" />这个页面是干什么的？</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  用 <code className="font-mono">docker compose</code> 创建的容器，会自动按项目归组显示在这里（无需任何配置）
                </li>
                <li>
                  每个项目下面是它的所有服务（容器）。<b>更新的入口不在这个页面</b>——仍和以前一样在「容器」页 /「自动更新」里点；这里解决的是"更新基于什么参数"
                </li>
              </ul>
              <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white pt-1"><Layers className="h-4 w-4 text-primary-500 dark:text-primary-400" />三种状态是一条递进的阶梯——三种方式都会把镜像更新掉，区别只在：重建容器时"用哪份配置"</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="py-1 pr-4 font-medium">状态</th>
                      <th className="py-1 pr-4 font-medium">重建配置以谁为准</th>
                      <th className="py-1 pr-4 font-medium">更新时会怎样</th>
                      <th className="py-1 font-medium">怎么变好</th>
                    </tr>
                  </thead>
                  <tbody className="align-top text-gray-700 dark:text-gray-300">
                    <tr>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="badge-success">可读</span>
                      </td>
                      <td className="py-1.5 pr-4">compose 文件（你写的配置）</td>
                      <td className="py-1.5 pr-4">
                        按文件重建：<b>文件改了就生效</b>，容器始终与文件一致
                      </td>
                      <td className="py-1.5">已是最优</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="badge-warning">需挂载</span>
                      </td>
                      <td className="py-1.5 pr-4">容器上次创建时的记录</td>
                      <td className="py-1.5 pr-4">
                        配置照抄旧记录，
                        <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                          <b>文件里改了不生效</b>；旧偏差被固化、两边越差越多
                        </span>
                      </td>
                      <td className="py-1.5">
                        按下方挂载引导挂上目录 → 升级为「可读」，更新就跟文件走
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        <span className="badge-info">无文件记录</span>
                      </td>
                      <td className="py-1.5 pr-4">容器上次创建时的记录</td>
                      <td className="py-1.5 pr-4">同上（配置照抄旧记录，偏差无从对账）</td>
                      <td className="py-1.5">没有 compose 文件可挂，无法升级</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                <p className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300"><GitCompare className="h-4 w-4 text-gray-400" />为什么"容器上次创建时的记录"会跟 compose 文件不一样？</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    <b>文件改了、容器没跟上</b>：你编辑了 compose 文件但没重新部署（改完忘了，或以为下次更新会自动带上）→ 容器里还是旧配置
                  </li>
                  <li>
                    <b>容器被直接改过、文件不知道</b>：有人或用面板直接改过容器（改端口、加挂载）并重建 → 这些改动文件里没有
                  </li>
                </ul>
                <p>
                  两边各改各的、无人对账 → 时间一长就对不上，文件不再可信。以"上次创建的记录"为准更新，等于把这些偏差当作标准继续沿用。
                </p>
              </div>
              <div className="space-y-1 pt-1">
                <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white"><HelpCircle className="h-4 w-4 text-primary-500 dark:text-primary-400" />这个页面我不做设置行不行？</div>
                <ul className="list-disc pl-4 space-y-1 text-gray-700 dark:text-gray-300">
                  <li>
                    <b>行。</b>这一页是"增强"，不是"必须"。完全不管它，更新也照常工作——镜像照常更新到最新，只是重建时配置以容器现状为准。
                  </li>
                  <li>
                    只有两种情况值得回来做设置：① 你以后会在 compose 文件里改东西（端口 / 环境变量 / 版本），希望改了就生效；
                    ② 发现文件与实际运行的容器已经对不上，想让它们恢复一致。
                  </li>
                  <li>从不改 compose 文件、也不在意这些的用户：<b>不需要动这一页，什么都不会坏。</b></li>
                </ul>
              </div>
            </div>
            <button className="btn-secondary whitespace-nowrap flex-shrink-0" onClick={dismissIntro}>
              知道了
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={cn(
            'text-sm rounded-lg px-3 py-2',
            msg.type === 'ok'
              ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
          )}
        >
          {msg.text}
        </div>
      )}

      {loadErr && (
        <div className="card p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20">{loadErr}</div>
      )}

      {data && !data.composeAvailable && (
        <div className="card p-4 text-sm bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-2 text-yellow-800 dark:text-yellow-200">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">面板运行环境内没有 docker compose 命令</div>
              <div className="mt-0.5 opacity-90">
                compose 原生更新通道不可用（更新将回退为容器级重建）。如需 compose 语义更新，请让面板镜像内可用
                <code className="mx-1 font-mono">docker compose</code>。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 挂载引导（怎么让面板读到这些文件） */}
      {data && hints.length > 0 && (
        <div className="card p-4" ref={guideRef}>
          <div className="flex items-center gap-2 flex-wrap">
            <FolderOpen className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">让 DockHamster 读取你的 docker compose 配置文件</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">涉及 {needMountCount} 个项目</span>
          </div>

          {/* 模块：作用 */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-1.5"><Target className="h-4 w-4 text-primary-500 dark:text-primary-400" />作用</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              使容器的更新基于 compose 配置文件——更新时以文件为准，文件里改的端口、环境变量、版本都会生效；
              读不到文件时，更新只能"按容器现状重建"，文件里的改动不会生效。
            </p>
          </div>

          {/* 模块：自动检测 */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-1.5"><FolderSearch className="h-4 w-4 text-primary-500 dark:text-primary-400" />compose 配置文件位置-自动检测</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              （不用自己判断是哪种，以下是 DockHamster 面板从本机现有容器检测、需要挂载的目录，可在确认无误后挂载）：
            </p>
            {snippet ? (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">加在面板 compose 的 volumes: 下（可直接复制）：</span>
                  <button className="btn-icon-primary" onClick={() => copyText(snippet, 'snippet')} title="复制">
                    {copiedKey === 'snippet' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <pre className="text-xs font-mono bg-gray-900 text-gray-100 dark:bg-black/50 rounded-lg p-3 overflow-x-auto">
                  {snippet}
                </pre>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      compose 部署：把下面几行加到你面板服务的 <code className="font-mono">volumes:</code> 下
                    </span>
                    <button className="btn-icon-primary" onClick={() => copyText(volumesBlock, 'vol')} title="复制">
                      {copiedKey === 'vol' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <pre className="text-xs font-mono bg-gray-900 text-gray-100 dark:bg-black/50 rounded-lg p-3 overflow-x-auto">
                    {volumesBlock}
                  </pre>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">docker run 部署：加上这些参数</span>
                    <button className="btn-icon-primary" onClick={() => copyText(runArgs, 'run')} title="复制">
                      {copiedKey === 'run' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <pre className="text-xs font-mono bg-gray-900 text-gray-100 dark:bg-black/50 rounded-lg p-3 overflow-x-auto">
                    {runArgs}
                  </pre>
                </div>
              </div>
            )}
          </div>

          {/* 模块：流程 */}
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-1.5"><ListOrdered className="h-4 w-4 text-primary-500 dark:text-primary-400" />步骤</div>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li>打开你部署 DockHamster 的 compose 文件（docker run 部署的则是启动命令/脚本）</li>
              <li>
                在 volumes 里加上上面的目录（左右两边<b>相同路径</b>；只读 <code className="font-mono">:ro</code> 即可，面板只需要读，不需要写权限）
              </li>
              <li>重新部署 / 重建面板 → 回到本页点「刷新」</li>
              <li>
                预期：这些项目从「需挂载」变成「<span className="text-green-700 dark:text-green-400">可读</span>」，更新方式升级为 compose 原生；
                若仍是「需挂载」→ 检查两边路径是否写得不一致
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* 额外根目录（高级设置，默认收起） */}
      {data && (
        <details className="card p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="flex items-center gap-1.5"><Wrench className="h-4 w-4 text-gray-400" />高级设置：路径修正（挂载的路径映射失效时用）</span>
            {(data.extraRoots?.length || 0) > 0 && <span className="badge-info">已配置 {data.extraRoots.length} 项</span>}
          </summary>
          <div className="mt-3 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
              <p>
                <b className="text-gray-700 dark:text-gray-300">含义：</b>
                这是一个"路径修正"项——当挂载的<b>路径映射失效</b>时（本该相同路径挂载，但数据在面板里挂到了别的路径），用它把路径修正回来。
              </p>
              <p>
                <b className="text-gray-700 dark:text-gray-300">举例：</b>
                文件里记录 <code className="font-mono">/opt/stacks/app/docker-compose.yml</code>；
                面板里这份数据实际挂在 <code className="font-mono">/mnt/host</code> 下（真实路径 <code className="font-mono">/mnt/host/opt/stacks/app/docker-compose.yml</code>）
                → 把 <code className="font-mono">/mnt/host</code> 填进来，面板用"修正前缀 + 原路径"重新拼一次地址就能找到。
              </p>
              <p>正常按相同路径挂载的（大多数情况）不需要填；不确定就留空。</p>
            </div>
            <textarea
              className="input font-mono text-sm"
              rows={2}
              placeholder="/mnt/nas  （每行一个；不确定就留空）"
              value={rootsText}
              onChange={(e) => setRootsText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="btn-primary" onClick={saveRoots} disabled={savingRoots}>
                {savingRoots ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                保存
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">填的前缀必须先在面板容器里存在（即你确实把宿主的目录挂到了这里）</span>
            </div>
          </div>
        </details>
      )}

      {/* 自动备份到 WebDAV */}
      {data && bk && (
        <details className="card p-4">
          <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
            <CloudUpload className="h-4 w-4 text-gray-400" />
            <span>自动备份到 WebDAV</span>
            {bk.enabled && <span className="badge-success">已开启 · 每天 {bkTime}</span>}
            {bk.lastRun &&
              (bk.lastOk ? <span className="badge-success">最近成功</span> : <span className="badge-error">最近失败</span>)}
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              把「可读」项目的 compose 配置（含同目录 .env，原样打包）按计划上传到你的 WebDAV——
              群晖 / 坚果云 / Nextcloud / Alist 等均可。备份结果的通知开关在「自动更新」页的通知区（失败默认通知）。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>WebDAV 地址</span>
                <input
                  className="input font-mono text-sm"
                  placeholder="https://dav.example.com/dav/"
                  value={bk.url || ''}
                  onChange={(e) => setBk({ ...bk, url: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>远端目录</span>
                <input
                  className="input font-mono text-sm"
                  placeholder="dockhamster/compose"
                  value={bk.remoteDir || ''}
                  onChange={(e) => setBk({ ...bk, remoteDir: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>用户名</span>
                <input
                  className="input text-sm"
                  value={bk.username || ''}
                  onChange={(e) => setBk({ ...bk, username: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>密码 / 应用密码</span>
                <input
                  className="input text-sm"
                  type="password"
                  value={bk.password || ''}
                  onChange={(e) => setBk({ ...bk, password: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>每天备份时间</span>
                <input className="input text-sm" type="time" value={bkTime} onChange={(e) => setBkTime(e.target.value)} />
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-400 space-y-1 block">
                <span>远端保留份数</span>
                <input
                  className="input text-sm"
                  type="number"
                  min="1"
                  max="60"
                  value={bk.keep || 7}
                  onChange={(e) => setBk({ ...bk, keep: +e.target.value || 7 })}
                />
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Switch checked={!!bk.enabled} onChange={(v) => setBk({ ...bk, enabled: v })} />
              <span className="text-xs text-gray-600 dark:text-gray-400">开启自动备份</span>
              <span className="flex-1" />
              <button className="btn-secondary" onClick={testBackup} disabled={!!bkBusy}>
                {bkBusy === 'test' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                测试连接
              </button>
              <button className="btn-secondary" onClick={runBackup} disabled={!!bkBusy}>
                {bkBusy === 'run' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                立即备份
              </button>
              <button className="btn-primary" onClick={saveBackup} disabled={!!bkBusy}>
                {bkBusy === 'save' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                保存
              </button>
            </div>
            {bkMsg && (
              <div
                className={cn(
                  'text-xs rounded-lg px-3 py-2',
                  bkMsg.type === 'ok'
                    ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                    : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                )}
              >
                {bkMsg.text}
              </div>
            )}
            {bk.lastRun && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                最近备份：{bk.lastRun} ·{' '}
                {bk.lastOk ? (
                  <span className="text-green-700 dark:text-green-400">成功（{bk.lastFile}）</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400">失败：{bk.lastError}</span>
                )}
              </div>
            )}
          </div>
        </details>
      )}

      {/* 统计 + 状态筛选（点标签筛选下面的列表） */}
      {data && projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span>
            共 <b className="text-gray-900 dark:text-gray-100">{projects.length}</b> 个项目 /{' '}
            <b className="text-gray-900 dark:text-gray-100">{serviceCount}</b> 个服务
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <FilterChip tone="gray" active={filter === 'all'} onClick={() => setFilter('all')}>
            全部 {projects.length}
          </FilterChip>
          <FilterChip tone="success" active={filter === 'readable'} onClick={() => setFilter('readable')}>
            可读 {readableCount}
          </FilterChip>
          {needMountCount > 0 && (
            <FilterChip tone="warning" active={filter === 'needsMount'} onClick={() => setFilter('needsMount')}>
              需挂载 {needMountCount}
            </FilterChip>
          )}
          {noFileCount > 0 && (
            <FilterChip tone="info" active={filter === 'noFile'} onClick={() => setFilter('noFile')}>
              无文件记录 {noFileCount}
            </FilterChip>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">（点标签筛选）</span>
        </div>
      )}

      {/* 项目列表 */}
      {loading && !data && (
        <div className="card p-8 flex items-center justify-center text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> 加载中…
        </div>
      )}

      {data && projects.length === 0 && (
        <div className="card p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          没有检测到 compose 项目。
          <div className="mt-1">非 compose 方式创建的容器请到「容器」页查看。</div>
        </div>
      )}

      {data && projects.length > 0 && shownProjects.length === 0 && (
        <div className="card p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          没有符合筛选的项目
        </div>
      )}

      {/* 筛选到「需挂载」时的行动指引（把"看到问题"接到"怎么做"） */}
      {filter === 'needsMount' && needMountCount > 0 && hints.length > 0 && (
        <div className="card p-3 flex items-center gap-2 flex-wrap text-sm bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-800 dark:text-yellow-200">
            这 {needMountCount} 个项目需要挂载目录后才能读到 compose 文件；挂上后更新会以文件为准（文件改了就生效）。
          </span>
          <button
            className="btn-secondary ml-auto"
            onClick={() => guideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            查看挂载步骤 ↑
          </button>
        </div>
      )}

      {/* 项目列表（表格式等高行；点击行展开服务明细） */}
      {data && projects.length > 0 && shownProjects.length > 0 && (
        <div className="card overflow-hidden">
          {/* 列表表头：列宽与行内固定列一致 */}
          <div className="hidden sm:flex items-center gap-3 px-3 h-8 text-xs text-gray-400 dark:text-gray-500 bg-gray-50/60 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700/60 select-none">
            <span className="w-44 flex-shrink-0">项目</span>
            <span className="w-28 flex-shrink-0">状态</span>
            <span className="w-20 flex-shrink-0">服务</span>
            <span className="flex-1">包含的服务</span>
            <span className="w-4 flex-shrink-0" />
          </div>
          {shownProjects.map((p) => (
            <ProjectRow key={p.name} project={p} onViewFile={openFileView} onViewLogs={openLogsView} onExport={(proj) => exportConfigs(proj.name)} />
          ))}
        </div>
      )}
      {viewer && (
        <CodeViewer
          viewer={viewer}
          onClose={closeViewer}
          onRefresh={refreshLogs}
          onCopy={() => copyText(viewer.content || '', 'viewer')}
        />
      )}

    </div>
  )
}
