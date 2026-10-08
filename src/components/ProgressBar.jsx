import React from 'react'
import { cn } from '../utils/cn.js'

/**
 * 统一进度条组件
 * @param percent      百分比 0-100
 * @param message      阶段文案（如「正在拉取新镜像」）
 * @param detail       细节（如「45.6MB / 120.6MB · 8.2MB/s · ⏱12s」）
 * @param done         是否完成（变绿）
 * @param failed       是否失败（变红；与 done 组合区分完成/失败）
 * @param showPercent  是否在行尾显示百分比
 */
export function ProgressBar({ percent = 0, message, detail, done = false, failed = false, showPercent = false, className }) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0))
  // message 与 detail 相同时只显示一次（如完成态两处都是"更新成功"）
  const showDetail = !!detail && detail !== message
  const hasMeta = message || showDetail || showPercent
  return (
    <div className={cn("w-full min-w-0", className)}>
      <div className="w-full h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            failed ? "bg-red-500" : done ? "bg-emerald-500" : "bg-primary-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hasMeta && (
        <div className="mt-1 flex items-center gap-1.5 text-xs min-w-0">
          {message && (
            <span className={cn("truncate", failed ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400")}>
              {message}
            </span>
          )}
          {showDetail && <span className="text-gray-400 dark:text-gray-500 font-mono truncate hidden sm:inline">{detail}</span>}
          {showPercent && <span className="ml-auto text-gray-500 dark:text-gray-400 flex-shrink-0">{Math.round(pct)}%</span>}
        </div>
      )}
    </div>
  )
}
