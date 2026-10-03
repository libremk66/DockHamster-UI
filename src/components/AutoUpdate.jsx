import React, { useState, useEffect, useCallback } from 'react'
import {
  Zap,
  Save,
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
import { cn } from '../utils/cn.js'

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

export function AutoUpdate() {
  const [settings, setSettings] = useState(null)
  const [status, setStatus] = useState(null)
  const [containers, setContainers] = useState([])
  const [excludeText, setExcludeText] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadErr, setLoadErr] = useState(false)

  // 首次加载：设置 + 状态 + 容器列表
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [s, st, c] = await Promise.all([
          autoUpdateAPI.getSettings(),
          autoUpdateAPI.getStatus(),
          containerAPI.getContainers(),
        ])
        if (!mounted) return
        // 注意：官方老接口成功码是 0，新接口是 200，两者都要认
        const okCode = (r) => r.data.code === 200 || r.data.code === 0
        if (okCode(s)) {
          setSettings(s.data.data)
          setExcludeText((s.data.data.exclude || []).join(', '))
        }
        if (okCode(st)) setStatus(st.data.data)
        if (okCode(c)) setContainers(c.data.data || [])
      } catch (e) {
        console.error('加载自动更新数据失败:', e)
        if (mounted) setLoadErr(true)
      }
    })()
    return () => { mounted = false }
  }, [])

  // 状态定时刷新（运行进度/记录）
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const st = await autoUpdateAPI.getStatus()
        if (st.data.code === 200 || st.data.code === 0) setStatus(st.data.data)
      } catch (e) { /* 忽略瞬时失败 */ }
    }, 10000)
    return () => clearInterval(timer)
  }, [])

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
      if (r.data.code === 200) setMsg({ type: 'ok', text: '已开始运行，稍后可在下方「运行记录」查看结果' })
      else setMsg({ type: 'err', text: r.data.msg || '运行失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '运行失败' })
    }
  }

  const testNotify = async () => {
    if (!settings) return
    setTesting(true); setMsg(null)
    try {
      const r = await autoUpdateAPI.testNotify(settings.feishuWebhook)
      if (r.data.code === 200) setMsg({ type: 'ok', text: r.data.msg || '已发送' })
      else setMsg({ type: 'err', text: r.data.msg || '发送失败' })
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.msg || e.message || '发送失败' })
    } finally {
      setTesting(false)
    }
  }

  if (loadErr && !settings) {
    return (
      <div className="p-6 pt-4">
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700 dark:text-amber-300">
            <p className="font-medium">后端未提供「自动更新」接口</p>
            <p className="mt-1 text-amber-600 dark:text-amber-400">该功能需要定制版后端（libremk66/dockercopilot-custom）。</p>
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

  return (
    <div className="p-2 pt-4 sm:p-0 sm:pt-0 space-y-4 max-w-5xl">
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
            </p>
            <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.deleteOldImage}
                onChange={(e) => patch('deleteOldImage', e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <Trash2 className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">更新完成后自动清理旧镜像（安全条件保护）</span>
            </label>
          </div>
        </Card>

        {/* 手动运行 */}
        <Card title="立即运行" icon={Play}>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <p>不等计划时间，立刻按当前白名单执行一轮。</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {status?.running
                  ? <span className="text-blue-500 flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />正在运行...</span>
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
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">全部容器（*，DockCopilot 自身除外）</span>
          </label>

          <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2", isAll && "opacity-50 pointer-events-none")}>
            {containers.map(c => {
              const checked = (settings.containers || []).includes(c.name)
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                    checked
                      ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/10"
                      : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  )}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleContainer(c.name)} className="h-4 w-4 rounded" />
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", c.status === 'running' ? 'bg-emerald-500' : 'bg-gray-400')} />
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{c.name}</span>
                  {lastStatus[c.name] && (
                    <span
                      title={`上次：${lastStatus[c.name].time} ${lastStatus[c.name].message || ''}`}
                      className={lastStatus[c.name].ok ? 'text-emerald-500' : 'text-red-500'}
                    >
                      {lastStatus[c.name].ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </label>
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

      {/* 通知 */}
      <Card title="通知（飞书）" icon={Bell}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">飞书机器人 Webhook</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.feishuWebhook}
                onChange={(e) => patch('feishuWebhook', e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              />
              <button
                onClick={testNotify}
                disabled={testing}
                className={cn("btn-secondary flex items-center gap-1.5 whitespace-nowrap", testing && "opacity-60 cursor-not-allowed")}
              >
                <Send className="h-4 w-4" /> {testing ? '发送中...' : '测试发送'}
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">飞书群 → 设置 → 群机器人 → 添加「自定义机器人」→ 复制 Webhook 地址</p>
          </div>
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
          </div>
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
                    <span className="text-gray-400 dark:text-gray-500">⏱ {r.durationSec}s</span>
                  </span>
                </div>
                {((r.updated || []).length > 0 || (r.failed || []).length > 0 || r.note) && (
                  <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    {(r.updated || []).length > 0 && <div>已更新：{r.updated.join('、')}</div>}
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
