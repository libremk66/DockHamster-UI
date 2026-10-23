import React, { useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2, X } from 'lucide-react'
import { registryAuthAPI } from '../api/client.js'

// 私有镜像仓库凭据管理面板。
//
// 为什么需要：ghcr.io 等私有包匿名查询只会得到 unauthorized，面板此前一律标
// "无法检测"，更新也会失败。这里按 registry 配一组凭据，供检测更新与拉取使用。
// 密码不回显（后端只给 hasPassword），编辑时留空 = 保持不变。

const PRESETS = [
  { registry: 'ghcr.io', hint: '用户名填 GitHub 账号，密码填带 read:packages 权限的 PAT' },
  { registry: 'docker.io', hint: '用户名填 Docker Hub 账号，密码填访问令牌（Access Token）' },
]

export function RegistryAuthPanel({ isOpen, onClose }) {
  // 每行：{ registry, username, password, hasPassword }；password 为空表示"保持不变"
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setMsg('')
    setErr('')
    registryAuthAPI.getSettings().then((r) => {
      const entries = r.data?.data?.entries || []
      setRows(entries.map(e => ({ ...e, password: '' })))
    }).catch(() => setErr('读取配置失败'))
  }, [isOpen])

  if (!isOpen) return null

  const updateRow = (i, key, val) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  }

  const addRow = (registry = '') => {
    if (rows.some(r => (r.registry || '').trim().toLowerCase() === registry.toLowerCase() && registry)) {
      setErr(`${registry} 已在列表中`)
      return
    }
    setRows(prev => [...prev, { registry, username: '', password: '', hasPassword: false }])
    setErr('')
  }

  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const payload = {
        entries: rows
          .map(r => ({
            registry: (r.registry || '').trim(),
            username: (r.username || '').trim(),
            password: r.password || '', // 空 = 后端沿用旧密码
          }))
          .filter(r => r.registry || r.username || r.password),
      }
      const r = await registryAuthAPI.saveSettings(payload)
      if (r.data?.code === 200) {
        const entries = r.data?.data?.entries || []
        setRows(entries.map(e => ({ ...e, password: '' })))
        setMsg('已保存 ✓ 下次检查更新/更新镜像时生效')
      } else {
        setErr(r.data?.msg || '保存失败')
      }
    } catch (e) {
      setErr(e.response?.data?.msg || e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-600"></div>

        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
              <KeyRound className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">私有仓库凭据</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                用于私有镜像（如 ghcr.io 私有包）的更新检测与拉取；密码保存后不再回显，留空表示保持不变
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          {rows.length === 0 && (
            <div className="text-sm text-gray-400 dark:text-gray-500 py-3 text-center">
              还没有配置任何凭据（当前所有仓库都按匿名访问）
            </div>
          )}

          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  placeholder="registry（如 ghcr.io / docker.io / 192.168.1.2:5000）"
                  value={r.registry}
                  onChange={(e) => updateRow(i, 'registry', e.target.value)}
                />
                <button
                  onClick={() => removeRow(i)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="删除这条凭据"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="input text-sm"
                  placeholder="用户名"
                  autoComplete="off"
                  value={r.username}
                  onChange={(e) => updateRow(i, 'username', e.target.value)}
                />
                <input
                  className="input text-sm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={r.hasPassword ? '密码（留空保持不变）' : '密码 / 访问令牌'}
                  value={r.password}
                  onChange={(e) => updateRow(i, 'password', e.target.value)}
                />
              </div>
              {r.hasPassword && !r.password && (
                <div className="text-[11px] text-gray-400 dark:text-gray-500">✓ 已保存密码（不显示）</div>
              )}
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => addRow('')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Plus className="h-3.5 w-3.5" />添加凭据
            </button>
            {PRESETS.map(p => (
              <button
                key={p.registry}
                onClick={() => addRow(p.registry)}
                className="px-3 py-1.5 rounded-lg border text-xs font-mono text-gray-500 dark:text-gray-400 border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                title={p.hint}
              >
                + {p.registry}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 leading-5 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
            <div>• GitHub（ghcr.io）：用户名填 GitHub 账号，密码填带 <span className="font-mono">read:packages</span> 权限的 PAT</div>
            <div>• Docker Hub（docker.io）：建议用 Access Token 而不是账号密码</div>
            <div>• 凭据只存在面板数据目录（权限 0600），接口不回传密码</div>
          </div>

          {err && <div className="text-sm text-red-600 dark:text-red-400">{err}</div>}
          {msg && <div className="text-sm text-emerald-600 dark:text-emerald-400">{msg}</div>}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            关闭
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
