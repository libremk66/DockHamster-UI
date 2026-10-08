import React, { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  Save,
  Search,
  Play,
  Bell,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Trash2,
} from 'lucide-react'
import { autoUpdateAPI, containerAPI } from '../api/client.js'
import { ProgressBar } from './ProgressBar.jsx'
import { CheckUpdateButton } from './CheckUpdateButton.jsx'
import { cn } from '../utils/cn.js'
import { gotoTaskCenter } from '../utils/nav.js'

// 简易开关组件
function Switch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  )
}

function Card({ title, icon: Icon, children, className }) {
  return (
    <div className={cn("rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm", className)}>
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary-500 dark:text-primary-400" />}
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

const TRIGGER_LABEL = { auto: '定时', manual: '手动', group: '整组' }

const NOTIFY_INPUT_CLS = "w-full px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"

// 通知渠道定义（与后端 module/notify.go 对应）
const NOTIFY_GROUPS = [
  {
    label: '群机器人', channels: [
      {
        type: 'feishu', name: '飞书', fields: [
          { key: 'webhook', label: 'Webhook 地址', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...' },
          { key: 'secret', label: '签名密钥（可选，机器人开了签名校验才需要）', placeholder: '' },
        ]
      },
      {
        type: 'wecom', name: '企业微信', fields: [
          { key: 'webhook', label: 'Webhook 地址', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...' },
        ]
      },
      {
        type: 'dingtalk', name: '钉钉', fields: [
          { key: 'webhook', label: 'Webhook 地址', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...' },
          { key: 'secret', label: '加签密钥（可选）', placeholder: '' },
        ]
      },
    ]
  },
  {
    label: '手机推送', channels: [
      {
        type: 'bark', name: 'Bark', fields: [
          { key: 'server', label: '服务器（默认 https://api.day.app）', placeholder: 'https://api.day.app' },
          { key: 'key', label: 'Key', placeholder: '你的 Bark Key' },
        ]
      },
      {
        type: 'serverchan', name: 'Server酱', fields: [
          { key: 'sendKey', label: 'SendKey', placeholder: 'SCT...' },
        ]
      },
      {
        type: 'telegram', name: 'Telegram', fields: [
          { key: 'token', label: 'Bot Token', placeholder: '123456:ABC...' },
          { key: 'chatId', label: 'Chat ID', placeholder: '123456789' },
          { key: 'apiBase', label: 'API 地址（可选，直连不通可填反代）', placeholder: 'https://api.telegram.org' },
        ]
      },
    ]
  },
  {
    label: '通用', channels: [
      {
        type: 'webhook', name: '自定义 Webhook', fields: [
          { key: 'url', label: 'URL', placeholder: 'https://...' },
          { key: 'method', label: '方法', type: 'select' },
          { key: 'headers', label: '请求头 JSON（可选）', placeholder: '{"Authorization": "Bearer xxx"}', textarea: true },
          { key: 'bodyTemplate', label: 'Body 模板（可选，支持 {title} {text}）', placeholder: '{"msg": "{title}"}', textarea: true },
        ]
      },
    ]
  },
]

export function AutoUpdate() {
  const [settings, setSettings] = useState(null)
  const [status, setStatus] = useState(null)
  const [containers, setContainers] = useState([])
  const [excludeText, setExcludeText] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [sideWarn, setSideWarn] = useState(false)
  const [loadKey, setLoadKey] = useState(0)
  const [snapStats, setSnapStats] = useState(null)

  const loadSnapStats = useCallback(async () => {
    try {
      const r = await autoUpdateAPI.getSnapshots()
      if (r.data.code === 200 || r.data.code === 0) setSnapStats(r.data.data)
    } catch (e) { /* 忽略 */ }
  }, [])

  // 首次加载：关键数据（设置/状态，决定页面能否渲染）先行；
  // 容器列表与快照统计随后并行、各自容错 —— 更新进行中后端变慢时不再拖垮整页
  useEffect(() => {
    let mounted = true
    // 注意：官方老接口成功码是 0，新接口是 200，两者都要认
    const okCode = (r) => r?.data?.code === 200 || r?.data?.code === 0
    ;(async () => {
      setLoadErr('')
      // ① 关键数据
      try {
        const [s, st] = await Promise.all([autoUpdateAPI.getSettings(), autoUpdateAPI.getStatus()])
        if (!mounted) return
        if (okCode(s)) {
          setSettings(s.data.data)
          setExcludeText((s.data.data.exclude || []).join(', '))
        } else {
          setLoadErr(s?.data?.msg || '后端返回异常')
        }
        if (okCode(st)) setStatus(st.data.data)
      } catch (e) {
        console.error('加载自动更新数据失败:', e)
        if (mounted) {
          const code = e?.response?.status
          const timedOut = e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')
          setLoadErr(
            code === 404 ? '__NO_API__'
              : timedOut ? '请求超时（后端繁忙或网络较慢）'
                : (e?.response?.data?.msg || e?.message || '网络错误')
          )
        }
        return
      }
      // ② 非关键数据：慢或失败都不阻塞页面主体
      try {
        const [c, snap] = await Promise.all([containerAPI.getContainers(), autoUpdateAPI.getSnapshots()])
        if (!mounted) return
        if (okCode(c)) setContainers(c.data.data || [])
        if (okCode(snap)) setSnapStats(snap.data.data)
        setSideWarn(!okCode(c) || !okCode(snap))
      } catch (e) {
        console.warn('容器列表/快照统计加载失败（不影响页面）:', e)
        if (mounted) setSideWarn(true)
      }
    })()
    return () => { mounted = false }
  }, [loadKey])

  // 状态刷新：运行中 2 秒一次（实时进度），空闲 10 秒一次
  // refreshKey 变化时立即重新拉取（点「立即运行」后马上看到进行中面板）
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    let mounted = true
    let timer = null
    const poll = async () => {
      let nextDelay = 10000
      try {
        const st = await autoUpdateAPI.getStatus()
        if (mounted && (st.data.code === 200 || st.data.code === 0)) {
          setStatus(st.data.data)
          const busy = st.data.data?.running || (st.data.data?.activeTasks || []).length > 0
          nextDelay = busy ? 2000 : 10000
        }
      } catch (e) { /* 忽略瞬时失败 */ }
      if (mounted) timer = setTimeout(poll, nextDelay)
    }
    poll()
    return () => { mounted = false; if (timer) clearTimeout(timer) }
  }, [refreshKey])

  const patch = useCallback((key, value) => {
    setSettings(prev => (prev ? { ...prev, [key]: value } : prev))
    setMsg(null)
  }, [])

  const isAll = !!(settings?.containers || []).includes('*')

  const toggleContainer = (name) => {
    if (!settings) return
    const list = settings.containers || []
    const next = list.includes(name) ? list.filter(n => n !== name) : [...list, name]
    patch('containers', next)
  }

  const setContainerPolicy = (name, policy) => {
    if (!settings) return
    const cp = { ...(settings.containerPolicy || {}) }
    if (policy === 'inherit') delete cp[name]
    else cp[name] = policy
    patch('containerPolicy', cp)
  }

  const globalPolicy = settings?.oldImagePolicy || 'clean'

  const onCheckDone = (st) => {
    setRefreshKey(k => k + 1)
    if (st && !st.running) {
      setMsg({ type: 'ok', text: `检查完成：共 ${st.checked || 0} 个镜像，${st.needUpdate || 0} 个有新版本` })
    }
  }

  const pruneSnapshots = async () => {
    setMsg(null)
    try {
      const r = await autoUpdateAPI.pruneSnapshots()
      if (r.data.code === 200) {
        setMsg({ type: 'ok', text: r.data.msg || '已清理' })
        loadSnapStats()
      } else {
        setMsg({ type: 'err', text: r.data.msg || '清理失败' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '清理失败' })
    }
  }

  const save = async () => {
    if (!settings) return
    setBusy(true); setMsg(null)
    try {
      const payload = {
        ...settings,
        exclude: excludeText.split(',').map(s => s.trim()).filter(Boolean),
      }
      const r = await autoUpdateAPI.saveSettings(payload)
      if (r.data.code === 200) {
        setSettings(r.data.data)
        setExcludeText((r.data.data.exclude || []).join(', '))
        setMsg({ type: 'ok', text: '已保存并生效' })
      } else {
        setMsg({ type: 'err', text: r.data.msg || '保存失败' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '保存失败' })
    } finally {
      setBusy(false)
    }
  }

  const runNow = async () => {
    setMsg(null)
    try {
      const r = await autoUpdateAPI.run()
      if (r.data.code === 200) {
        setMsg({ type: 'ok', text: '已开始运行，下方会实时显示进度' })
        setRefreshKey(k => k + 1) // 立即刷新一次，马上显示「进行中」面板
      } else {
        setMsg({ type: 'err', text: r.data.msg || '运行失败' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '运行失败' })
    }
  }

  // 更新某个渠道的配置（表单态，保存后生效）
  const updateChannel = (type, patchObj) => {
    if (!settings) return
    const notify = settings.notify || {}
    const cur = notify[type] || {}
    patch('notify', { ...notify, [type]: { ...cur, ...patchObj } })
  }

  // 测试某个渠道（直接用当前表单值发一条，不用先保存）
  const testChannel = async (type) => {
    if (!settings) return
    setTesting(type); setMsg(null)
    try {
      const ch = (settings.notify || {})[type] || {}
      const r = await autoUpdateAPI.testNotify(type, ch)
      if (r.data.code === 200 || r.data.code === 0) setMsg({ type: 'ok', text: r.data.msg || '已发送' })
      else setMsg({ type: 'err', text: r.data.msg || '发送失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '发送失败' })
    } finally {
      setTesting(null)
    }
  }

  if (loadErr && !settings) {
    const noApi = loadErr === '__NO_API__'
    return (
      <div className="p-6 pt-4">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium">{noApi ? '后端未提供「自动更新」接口' : '自动更新数据加载失败'}</p>
            <p className="mt-1 text-amber-600 dark:text-amber-400">
              {noApi ? '该功能需要 DockHamster 后端。' : loadErr}
            </p>
            <button
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2"
              onClick={() => setLoadKey((k) => k + 1)}
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 dark:text-gray-500">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  const lastStatus = status?.lastStatus || {}
  const runs = status?.runs || []
  const activeTasks = status?.activeTasks || []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      {/* 页头 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" />
            自动更新
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm">
            按计划自动更新指定容器，更新完成后自动清理旧镜像（多容器共用镜像受引用计数保护）
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">总开关</span>
          <Switch checked={settings.enabled} onChange={(v) => patch('enabled', v)} />
          <button
            onClick={save}
            disabled={busy}
            className={cn("btn-primary flex items-center gap-1.5", busy && "opacity-60 cursor-not-allowed")}
          >
            <Save className="h-4 w-4" />
            {busy ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      {/* 提示信息 */}
      {msg && (
        <div className={cn(
          "rounded-lg px-4 py-2.5 text-sm flex items-center gap-2",
          msg.type === 'ok'
            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
        )}>
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {sideWarn && (
        <div className="rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          容器列表 / 快照统计没能加载（不影响下面的自动更新设置与运行记录），稍后重新进入本页即可。
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 计划 */}
        <Card title="执行计划" icon={Timer}>
          <div className="space-y-3">
            <label className="block text-sm text-gray-600 dark:text-gray-400">Cron 表达式（本地时区）</label>
            <input
              type="text"
              value={settings.cron}
              onChange={(e) => patch('cron', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 font-mono text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="0 4 * * *"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              分 时 日 月 周 ｜ 示例：<code>0 4 * * *</code>＝每天 04:00；<code>30 3 * * 6</code>＝每周六 03:30
              {status?.nextAutoAt && (
                <span className="ml-2 text-primary-600 dark:text-primary-400">下次自动更新：{status.nextAutoAt.slice(5)}</span>
              )}
              <span className="ml-2">（检查更新频率已挪到「容器」页）</span>
            </p>
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">更新完成后的旧镜像处理</span>
                <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {[
                    { v: 'clean', label: '🧹 自动清理' },
                    { v: 'snapshot', label: '🏷 打快照保留' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => patch('oldImagePolicy', opt.v)}
                      className={cn(
                        'px-3 py-1.5 text-xs transition-colors',
                        globalPolicy === opt.v
                          ? 'bg-primary-600 text-white font-semibold'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {globalPolicy === 'snapshot' ? (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/60 px-3 py-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-amber-800 dark:text-amber-300">
                    <span>每镜像保留最近</span>
                    <input
                      type="number" min={1} max={50}
                      value={settings.snapshotKeep || 3}
                      onChange={(e) => patch('snapshotKeep', Math.max(1, Math.min(50, parseInt(e.target.value || '3', 10) || 3)))}
                      className="w-14 px-2 py-1 rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-200"
                    />
                    <span>个 · 命名</span>
                    <input
                      type="text"
                      value={settings.snapshotTemplate || '{name}:{date}-{time}'}
                      onChange={(e) => patch('snapshotTemplate', e.target.value)}
                      className="w-48 px-2 py-1 rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 font-mono text-amber-900 dark:text-amber-200"
                      title="可用变量：{name} {date} {time} {id}"
                    />
                    <span className="text-amber-600 dark:text-amber-400/80">前缀 {settings.snapshotPrefix || 'dh-snap'}/</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <span>
                      当前已有 <b>{snapStats?.count ?? 0}</b> 个快照 · 占用 <b>{snapStats?.sizeLabel || '0B'}</b>
                      {snapStats?.diskFreeLbl ? `（系统盘剩余 ${snapStats.diskFreeLbl}）` : ''}
                    </span>
                    <button
                      onClick={pruneSnapshots}
                      className="ml-auto px-2 py-1 rounded-md border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    >
                      清理旧快照
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  满足安全条件（无容器引用、无标签、非新镜像）才删除，省空间
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                每行白名单容器可单独覆盖策略（默认继承上面的全局设置）
              </p>
            </div>
          </div>
        </Card>

        {/* 手动运行 */}
        <Card title="立即运行" icon={Play}>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>不等计划时间，立刻按当前白名单执行一轮。</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {status?.running
                  ? <span className="text-blue-500 flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />正在运行{activeTasks.length > 0 ? `（${activeTasks.filter(t => t.isDone).length}/${activeTasks.length}）` : '...'}</span>
                  : '当前空闲'}
              </p>
            </div>
            <button
              onClick={runNow}
              disabled={status?.running}
              className={cn(
                "btn-primary flex items-center gap-1.5",
                status?.running && "opacity-60 cursor-not-allowed"
              )}
            >
              <Play className="h-4 w-4" /> 立即运行
            </button>
          </div>
        </Card>
      </div>

      {/* 进行中（实时进度） */}
      {activeTasks.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-800 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary-500 dark:text-primary-400 animate-spin" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              进行中（{activeTasks.filter(t => t.isDone && !t.failed).length}/{activeTasks.length} 完成
              {activeTasks.some(t => t.failed) && <span className="text-red-500">，{activeTasks.filter(t => t.failed).length} 失败</span>}）
            </h3>
            <button className="ml-auto text-xs text-primary-600 dark:text-primary-400 hover:underline" onClick={gotoTaskCenter}>全部任务 ↗</button>
          </div>
          <div className="px-5 py-3 space-y-3">
            {activeTasks.map((t, idx) => {
              // 还没轮到的行给出排队语境（之前只写"等待中"，看不出前面还有几台）
              const pendingBefore = activeTasks.slice(0, idx).filter(x => !x.isDone && !x.failed).length
              const waiting = !t.isDone && !t.failed && t.message === '等待中'
              const message = waiting
                ? (pendingBefore > 0 ? `排队中（前面还有 ${pendingBefore} 台）` : '即将开始')
                : t.message
              return (
                <div key={t.taskID}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.name}</span>
                    {t.failed
                      ? <span className="text-xs text-red-500 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />失败</span>
                      : t.isDone
                        ? <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />完成</span>
                        : <span className="text-xs text-gray-400 dark:text-gray-500">{t.percentage || 0}%</span>}
                  </div>
                  <ProgressBar percent={t.percentage} message={message} detail={t.detailMsg} done={t.isDone} failed={t.failed} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 白名单 */}
      <Card title="自动更新白名单" icon={Zap}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAll}
              onChange={(e) => patch('containers', e.target.checked ? ['*'] : [])}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">全部容器（*，DockHamster 自身除外）</span>
          </label>

          <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2", isAll && "opacity-50 pointer-events-none")}>
            {containers.map(c => {
              const checked = (settings.containers || []).includes(c.name)
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                    checked
                      ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/10"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  )}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none flex-1 min-w-0">
                    <input type="checkbox" checked={checked} onChange={() => toggleContainer(c.name)} className="h-4 w-4 rounded flex-shrink-0" />
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", c.status === 'running' ? 'bg-emerald-500' : 'bg-gray-400')} />
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                    {lastStatus[c.name] && (
                      <span
                        title={`上次：${lastStatus[c.name].time} ${lastStatus[c.name].message || ''}`}
                        className={lastStatus[c.name].ok ? 'text-emerald-500' : 'text-red-500'}
                      >
                        {lastStatus[c.name].ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </label>
                  <select
                    value={(settings.containerPolicy || {})[c.name] || 'inherit'}
                    onChange={(e) => setContainerPolicy(c.name, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    title="此容器的旧镜像处置策略"
                    className={cn(
                      "ml-auto text-[11px] rounded-md border px-1.5 py-1 bg-white dark:bg-gray-800 outline-none flex-shrink-0",
                      (settings.containerPolicy || {})[c.name] === 'snapshot'
                        ? "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                        : (settings.containerPolicy || {})[c.name] === 'clean'
                          ? "border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    )}
                  >
                    <option value="inherit">继承全局</option>
                    <option value="clean">🧹 清理</option>
                    <option value="snapshot">🏷 打快照</option>
                    <option value="keep">保留不处理</option>
                  </select>
                </div>
              )
            })}
            {containers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">未获取到容器列表</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">排除名单（逗号分隔，优先级高于白名单）</label>
            <input
              type="text"
              value={excludeText}
              onChange={(e) => { setExcludeText(e.target.value); setMsg(null) }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              placeholder="例如：critical-db, wiki"
            />
          </div>
        </div>
      </Card>

      {/* 通知（多渠道） */}
      <Card title="通知（多渠道）" icon={Bell}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.notifyOnSuccess}
                onChange={(e) => patch('notifyOnSuccess', e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">更新成功时发送简报</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.notifyOnFailure}
                onChange={(e) => patch('notifyOnFailure', e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">出现失败时发送告警</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!settings.watchdogDisabled}
                onChange={(e) => patch('watchdogDisabled', !e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300" title="容器意外退出 / 被 OOM 杀掉 / 反复重启时推送；面板主动的停止重启不会误报">
                容器异常告警（退出 / OOM / 重启循环）
              </span>
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500 self-center">渠道勾选后按上面的规则发送；改完点右上角「保存设置」生效</span>
          </div>

          {NOTIFY_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">{group.label}</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {group.channels.map(chDef => {
                  const ch = (settings.notify || {})[chDef.type] || {}
                  return (
                    <div
                      key={chDef.type}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 transition-colors",
                        ch.enabled
                          ? "border-primary-300 dark:border-primary-700 bg-primary-50/40 dark:bg-primary-900/10"
                          : "border-gray-200 dark:border-gray-700"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!ch.enabled}
                            onChange={(e) => updateChannel(chDef.type, { enabled: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{chDef.name}</span>
                        </label>
                        {ch.enabled && (
                          <button
                            onClick={() => testChannel(chDef.type)}
                            disabled={testing === chDef.type}
                            className={cn(
                              "text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 flex items-center gap-1",
                              testing === chDef.type && "opacity-60 cursor-not-allowed"
                            )}
                          >
                            <Send className="h-3 w-3" />
                            {testing === chDef.type ? '发送中' : '测试'}
                          </button>
                        )}
                      </div>
                      {ch.enabled && (
                        <div className="mt-2 space-y-2">
                          {chDef.fields.map(f => (
                            <div key={f.key}>
                              <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{f.label}</label>
                              {f.type === 'select' ? (
                                <select
                                  value={ch[f.key] || ''}
                                  onChange={(e) => updateChannel(chDef.type, { [f.key]: e.target.value })}
                                  className={cn(NOTIFY_INPUT_CLS, "text-xs")}
                                >
                                  <option value="">POST（默认）</option>
                                  <option value="GET">GET</option>
                                </select>
                              ) : f.textarea ? (
                                <textarea
                                  rows={2}
                                  value={ch[f.key] || ''}
                                  onChange={(e) => updateChannel(chDef.type, { [f.key]: e.target.value })}
                                  placeholder={f.placeholder || ''}
                                  className={cn(NOTIFY_INPUT_CLS, "text-xs font-mono resize-y")}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={ch[f.key] || ''}
                                  onChange={(e) => updateChannel(chDef.type, { [f.key]: e.target.value })}
                                  placeholder={f.placeholder || ''}
                                  className={cn(NOTIFY_INPUT_CLS, "text-xs font-mono")}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 运行记录 */}
      <Card title="运行记录（最近 30 次）" icon={RefreshCw}>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            还没有运行记录。{settings.enabled ? '等待计划时间或点「立即运行」。' : '总开关当前关闭。'}
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {runs.map((r, i) => (
              <div key={i} className="rounded-lg border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/30 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium",
                      r.trigger === 'auto'
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : r.trigger === 'group'
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    )}>
                      {TRIGGER_LABEL[r.trigger] || r.trigger}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{r.time}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {(r.updated || []).length > 0 && <span className="text-emerald-600 dark:text-emerald-400">✅ {r.updated.length}</span>}
                    {(r.failed || []).length > 0 && <span className="text-red-600 dark:text-red-400">⚠️ {r.failed.length}</span>}
                    {r.cleanedImages > 0 && <span className="text-gray-500 dark:text-gray-400">🗑️ {r.cleanedImages}</span>}
                    {(r.snapshots || []).length > 0 && <span className="text-amber-600 dark:text-amber-400">🏷️ {r.snapshots.length}</span>}
                    <span className="text-gray-400 dark:text-gray-500">⏱ {r.durationSec}s</span>
                  </span>
                </div>
                {((r.updated || []).length > 0 || (r.failed || []).length > 0 || r.note || (r.snapshots || []).length > 0) && (
                  <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    {(r.updated || []).length > 0 && <div>已更新：{r.updated.join('、')}</div>}
                    {(r.snapshots || []).length > 0 && (
                      <div className="text-amber-600 dark:text-amber-400">🏷️ 已打快照：{r.snapshots.join('、')}</div>
                    )}
                    {(r.failed || []).map((f, j) => (
                      <div key={j} className="text-red-500 dark:text-red-400">失败：{f.name}（{f.error}）</div>
                    ))}
                    {r.note && <div>ℹ️ {r.note}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
