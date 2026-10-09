import React, { useState } from 'react'
import {
  Plus, X, RefreshCw, Check, AlertTriangle,
  Feather, MessageSquare, Pin, MessageCircle, Send, BellRing, Server, Webhook as WebhookIcon,
} from 'lucide-react'
import { cn } from '../utils/cn.js'
import { autoUpdateAPI } from '../api/client.js'

// 通知渠道定义（**单实例**：每种渠道一份配置；字段与后端 module/notify.go 一一对应）
const CHANNEL_DEFS = [
  {
    type: 'feishu', name: '飞书', color: '#3370FF', Icon: Feather,
    mode: (ch) => (ch.appId ? '自建应用' : ch.webhook ? '群机器人' : '未配置'),
    fields: [
      { key: 'appId', label: 'App ID（应用模式；填了走自建应用，消息为卡片）', placeholder: 'cli_xxxxxxxxxxxxxxxx' },
      { key: 'appSecret', label: 'App Secret（应用模式）', placeholder: '' },
      { key: 'receiveId', label: '接收者 ID（应用模式必填）', placeholder: 'open_id / user_id / email / 群 chat_id' },
      {
        key: 'receiveIdType', label: '接收者类型', type: 'select', options: [
          { value: 'open_id', label: 'open_id（用户，推荐）' },
          { value: 'user_id', label: 'user_id（用户）' },
          { value: 'email', label: 'email（邮箱）' },
          { value: 'chat_id', label: 'chat_id（群聊）' },
        ]
      },
      { key: 'domain', label: '开放平台域名（可选，Lark 国际版填 https://open.larksuite.com）', placeholder: '' },
      { key: 'webhook', label: '或：群机器人 Webhook（与上面二选一）', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...' },
      { key: 'secret', label: '群机器人签名密钥（可选，开了签名校验才需要）', placeholder: '' },
    ],
  },
  {
    type: 'wecom', name: '企业微信', color: '#07C160', Icon: MessageSquare,
    mode: (ch) => (ch.appId ? '应用消息' : ch.webhook ? '群机器人' : '未配置'),
    fields: [
      { key: 'appId', label: 'CorpID（企业 ID，应用模式；填了走应用消息，可推个人微信）', placeholder: 'wwxxxxxxxxxxxxxxxx' },
      { key: 'appSecret', label: '应用 Secret（应用模式）', placeholder: '' },
      { key: 'agentId', label: 'AgentID（应用 ID，应用模式必填）', placeholder: '1000002' },
      { key: 'receiveId', label: '接收成员（可选，默认 @all）', placeholder: '企业微信账号，多个用 | 分隔，如 zhangsan|lisi' },
      { key: 'webhook', label: '或：群机器人 Webhook（与上面二选一）', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...' },
    ],
  },
  {
    type: 'dingtalk', name: '钉钉', color: '#3296FA', Icon: Pin,
    mode: () => '群机器人',
    fields: [
      { key: 'webhook', label: 'Webhook 地址', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...' },
      { key: 'secret', label: '加签密钥（可选）', placeholder: '' },
    ],
  },
  {
    type: 'qq', name: 'QQ', color: '#12B7F5', Icon: MessageCircle,
    mode: (ch) => (ch.receiveIdType === 'user' ? '单聊' : '群聊') + '（官方机器人）',
    fields: [
      { key: 'appId', label: 'AppID（QQ 开放平台 → 机器人）', placeholder: '10xxxxxxx' },
      { key: 'appSecret', label: 'ClientSecret（机器人密钥）', placeholder: '' },
      { key: 'receiveId', label: '接收目标 ID（⚠️ QQ 主动消息每月限 4 条/群、4 条/用户，目标需先与机器人交互过）', placeholder: '群 group_openid 或 用户 openid' },
      {
        key: 'receiveIdType', label: '目标类型', type: 'select', options: [
          { value: 'group', label: '群聊（group_openid）' },
          { value: 'user', label: '单聊（用户 openid）' },
        ]
      },
    ],
  },
  {
    type: 'telegram', name: 'Telegram', color: '#229ED9', Icon: Send,
    mode: () => 'Bot',
    fields: [
      { key: 'token', label: 'Bot Token', placeholder: '123456:ABC...' },
      { key: 'chatId', label: 'Chat ID', placeholder: '123456789' },
      { key: 'apiBase', label: 'API 地址（可选，直连不通可填反代）', placeholder: 'https://api.telegram.org' },
    ],
  },
  {
    type: 'bark', name: 'Bark', color: '#8B5CF6', Icon: BellRing,
    mode: () => 'iOS 推送',
    fields: [
      { key: 'server', label: '服务器（默认 https://api.day.app）', placeholder: 'https://api.day.app' },
      { key: 'key', label: 'Key', placeholder: '你的 Bark Key' },
    ],
  },
  {
    type: 'serverchan', name: 'Server酱', color: '#FF7A45', Icon: Server,
    mode: () => '微信推送',
    fields: [
      { key: 'sendKey', label: 'SendKey', placeholder: 'SCT...' },
    ],
  },
  {
    type: 'webhook', name: '自定义 Webhook', color: '#6B7280', Icon: WebhookIcon,
    mode: () => '自建',
    fields: [
      { key: 'url', label: 'URL', placeholder: 'https://...' },
      { key: 'method', label: '方法', type: 'select' },
      { key: 'headers', label: '请求头 JSON（可选）', placeholder: '{"Authorization": "Bearer xxx"}', textarea: true },
      { key: 'bodyTemplate', label: 'Body 模板（可选，支持 {title} {text}）', placeholder: '{"msg": "{title}"}', textarea: true },
    ],
  },
]

const INPUT_CLS = "w-full px-2.5 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"

function hasConfig(ch) {
  if (!ch) return false
  return Object.entries(ch).some(([k, v]) => k !== 'enabled' && typeof v === 'string' && v.trim() !== '')
}

// 渠道图标：彩色圆底 + 白色图标（无品牌图资产，走统一风格）
function ChannelIcon({ def, size = 'md' }) {
  const cls = size === 'sm' ? 'h-6 w-6' : 'h-10 w-10'
  const iconCls = size === 'sm' ? 'h-3 w-3' : 'h-5 w-5'
  return (
    <span className={cn('rounded-full grid place-items-center flex-shrink-0', cls)} style={{ backgroundColor: def.color }}>
      <def.Icon className={cn(iconCls, 'text-white')} />
    </span>
  )
}

// 小开关（与自动更新页的 Switch 视觉一致；本组件不依赖父组件）
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer',
        checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  )
}

/**
 * 通知渠道（单实例 + 卡片形态，交互参考 MoviePilot）：
 * - 卡片 = 已启用的渠道；点击卡片 → 配置弹窗
 * - ➕ = 从未启用的渠道里选一个添加（每种渠道最多一份）
 * - ✕ = 移除（仅停用，配置保留；重新添加时字段还在）
 * - 弹窗「确认」即时保存（含启用开关 + 测试按钮）
 */
export function NotifyChannels({ notify, onSave }) {
  const chs = notify || {}
  const [editType, setEditType] = useState(null)
  const [draft, setDraft] = useState({})
  const [addOpen, setAddOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const enabledDefs = CHANNEL_DEFS.filter((d) => chs[d.type]?.enabled)
  const availableDefs = CHANNEL_DEFS.filter((d) => !chs[d.type]?.enabled)

  // forceEnable：从「➕ 添加渠道」进入时强制打开启用开关
  // （后端会把未配置的渠道也序列化成 {enabled:false}，不能只靠 ?? true 兜底）
  const openEdit = (def, forceEnable = false) => {
    setEditType(def)
    setDraft({ ...(chs[def.type] || {}), enabled: forceEnable ? true : !!chs[def.type]?.enabled })
    setTestMsg(null)
    setAddOpen(false)
  }
  const closeEdit = () => { setEditType(null); setDraft({}); setTestMsg(null) }

  const confirm = async () => {
    setSaving(true)
    try {
      await onSave({ ...chs, [editType.type]: { ...draft, enabled: !!draft.enabled } })
      closeEdit()
    } finally { setSaving(false) }
  }
  // 移除 = 仅停用（配置保留，重新添加时还在）
  const remove = (def) => onSave({ ...chs, [def.type]: { ...(chs[def.type] || {}), enabled: false } })

  const test = async () => {
    setTesting(true); setTestMsg(null)
    try {
      const r = await autoUpdateAPI.testNotify(editType.type, { ...draft, enabled: true })
      if (r.data.code === 200 || r.data.code === 0) setTestMsg({ ok: true, text: r.data.msg || '已发送，请查看' })
      else setTestMsg({ ok: false, text: r.data.msg || '发送失败' })
    } catch (e) {
      setTestMsg({ ok: false, text: e.response?.data?.msg || e.message || '发送失败' })
    } finally { setTesting(false) }
  }

  return (
    <div>
      {/* 渠道卡片 */}
      {enabledDefs.length === 0 ? (
        <div className="text-sm text-gray-400 dark:text-gray-500 py-3">
          还没有启用通知渠道 —— 点下方「添加渠道」选择。
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          {enabledDefs.map((def) => {
            const ch = chs[def.type] || {}
            return (
              <div
                key={def.type}
                onClick={() => openEdit(def)}
                className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 p-3.5 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    {def.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(def) }}
                    title="移除（仅停用，配置保留）"
                    className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{def.mode ? def.mode(ch) : ''}</span>
                  <ChannelIcon def={def} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ➕ 添加渠道 */}
      <div className="relative inline-block">
        <button
          onClick={() => setAddOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          <Plus className="h-4 w-4" />添加渠道
        </button>
        {addOpen && (
          <div className="absolute z-30 mt-1 w-60 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 max-h-72 overflow-auto">
            {availableDefs.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">全部渠道都已启用</div>
            ) : (
              availableDefs.map((def) => (
                <button
                  key={def.type}
                  onClick={() => openEdit(def, true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <ChannelIcon def={def} size="sm" />
                  <span>{def.name}</span>
                  {hasConfig(chs[def.type]) && (
                    <span className="ml-auto text-[10px] text-gray-400" title="之前配置过，字段已保留">已配置</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* 配置弹窗 */}
      {editType && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={closeEdit}>
          <div
            className="w-[560px] max-w-full max-h-[86vh] overflow-auto rounded-2xl bg-white dark:bg-gray-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
              <ChannelIcon def={editType} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white">配置 · {editType.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">保存后立即生效</div>
              </div>
              <button className="text-gray-400 hover:text-gray-600" onClick={closeEdit}><X className="h-5 w-5" /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <Toggle checked={!!draft.enabled} onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
                <div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">启用</div>
                  <div className="text-xs text-gray-400">关闭即从渠道列表移除（配置保留）</div>
                </div>
              </div>

              {editType.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
                  {f.type === 'select' ? (
                    <select
                      value={draft[f.key] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className={cn(INPUT_CLS, 'text-sm')}
                    >
                      {(f.options || [{ value: '', label: 'POST（默认）' }, { value: 'GET', label: 'GET' }]).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.textarea ? (
                    <textarea
                      rows={2}
                      value={draft[f.key] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder={f.placeholder || ''}
                      className={cn(INPUT_CLS, 'text-xs font-mono resize-y')}
                    />
                  ) : (
                    <input
                      type="text"
                      value={draft[f.key] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder={f.placeholder || ''}
                      className={cn(INPUT_CLS, 'text-xs font-mono')}
                    />
                  )}
                </div>
              ))}

              {testMsg && (
                <div className={cn('text-xs flex items-center gap-1.5', testMsg.ok ? 'text-emerald-600' : 'text-red-500')}>
                  {testMsg.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {testMsg.text}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-900/20 rounded-b-2xl">
              <button
                onClick={test}
                disabled={testing}
                className={cn('btn-ghost', testing && 'opacity-60 cursor-not-allowed')}
              >
                {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {testing ? '发送中…' : '测试'}
              </button>
              <button onClick={confirm} disabled={saving} className={cn('btn-primary', saving && 'opacity-60')}>
                {saving ? '保存中…' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
