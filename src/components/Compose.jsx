import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, RefreshCw, ChevronDown, ChevronUp, FileText, ScrollText, X } from 'lucide-react'
import { containerAPI } from '../api/client'

// Compose 页面：按项目分组展示 compose 管理的容器，支持查看 compose 文件原文与容器日志
export function Compose() {
  const [expandedProject, setExpandedProject] = useState(null)
  const [fileViewer, setFileViewer] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [logsViewer, setLogsViewer] = useState(null)
  const [logsContent, setLogsContent] = useState(null)
  const [logsLoading, setLogsLoading] = useState(false)

  const { data: containers = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await containerAPI.getContainers()
      if (response.data.code === 200 || response.data.code === 0) {
        return response.data.data || []
      }
      return []
    },
    refetchInterval: 10000,
  })

  const projectList = groupByProject(containers)

  const openFile = async (container) => {
    setFileViewer({ name: container.name, project: container.compose?.project })
    setFileContent(null)
    setFileLoading(true)
    try {
      const response = await containerAPI.getComposeFile(container.id)
      if (response.data.code === 200 || response.data.code === 0) {
        setFileContent(response.data.data)
      } else {
        setFileContent({ files: {}, error: response.data.msg })
      }
    } catch (error) {
      setFileContent({ files: {}, error: error.message })
    } finally {
      setFileLoading(false)
    }
  }

  const openLogs = async (container) => {
    setLogsViewer({ containerId: container.id, name: container.name })
    setLogsContent(null)
    setLogsLoading(true)
    try {
      const response = await containerAPI.getContainerLogs(container.id)
      setLogsContent(typeof response.data === 'string' ? response.data : (response.data?.msg || '读取失败'))
    } catch (error) {
      setLogsContent('读取日志失败: ' + (error.response?.data || error.message))
    } finally {
      setLogsLoading(false)
    }
  }

  const totalServices = projectList.reduce((n, p) => n + p.services.length, 0)

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">compose 项目</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {projectList.length} 个项目 · {totalServices} 个服务 · 更新走 compose 通道（单服务重建）
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="刷新"
        >
          <RefreshCw className={`h-5 w-5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">加载中…</div>
      ) : projectList.length === 0 ? (
        <div className="text-center py-16">
          <Layers className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">没有检测到 compose 管理的容器</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projectList.map((project) => (
            <ProjectCard
              key={project.name}
              project={project}
              expanded={expandedProject === project.name}
              onToggle={() => setExpandedProject(expandedProject === project.name ? null : project.name)}
              onViewFile={openFile}
              onViewLogs={openLogs}
            />
          ))}
        </div>
      )}

      {fileViewer && (
        <ComposeFileModal
          viewer={fileViewer}
          content={fileContent}
          loading={fileLoading}
          onClose={() => setFileViewer(null)}
        />
      )}
      {logsViewer && (
        <LogsModal
          viewer={logsViewer}
          content={logsContent}
          loading={logsLoading}
          onRefresh={openLogs}
          onClose={() => setLogsViewer(null)}
        />
      )}
    </div>
  )
}

// groupByProject 将 compose 容器按项目名归组并排序
function groupByProject(containers) {
  const projects = {}
  for (const c of containers) {
    if (!c.compose?.isManaged) continue
    const key = c.compose.project
    if (!projects[key]) {
      projects[key] = { name: key, workingDir: c.compose.workingDir, services: [] }
    }
    projects[key].services.push(c)
  }
  return Object.values(projects).sort((a, b) => a.name.localeCompare(b.name))
}

// ProjectCard 单个 compose 项目卡片：头部信息 + 服务列表
function ProjectCard({ project, expanded, onToggle, onViewFile, onViewLogs }) {
  const runningCount = project.services.filter((s) => s.status === 'running').length
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white">{project.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {runningCount}/{project.services.length} 运行中
            </span>
          </div>
          {project.workingDir && (
            <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate mt-0.5">
              {project.workingDir}
            </div>
          )}
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation()
            onViewFile(project.services[0])
          }}
          className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          title="查看该项目 compose 文件原文"
        >
          <FileText className="h-3.5 w-3.5" />
          原文
        </span>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700/60 divide-y divide-gray-100 dark:divide-gray-700/60">
          {project.services.map((svc) => (
            <div key={svc.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${svc.status === 'running' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{svc.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{svc.usingImage}</div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {svc.status === 'running' ? '运行中' : '已停止'}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onViewLogs(svc)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                  title="查看日志（最近 200 行）"
                >
                  <ScrollText className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ModalShell 弹窗外壳：遮罩 + 面板 + 标题栏（标题栏右侧可插入自定义操作）
function ModalShell({ title, subtitle, onClose, actions, panelClass, children }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl flex flex-col shadow-2xl ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ComposeFileModal 展示 compose 项目全部文件原文（含读取失败提示）
function ComposeFileModal({ viewer, content, loading, onClose }) {
  const errors = content?.errors || {}
  const files = Object.entries(content?.files || {})
  return (
    <ModalShell
      title={`compose 原文 · ${viewer.project || ''}`}
      subtitle={`容器 ${viewer.name}`}
      onClose={onClose}
      panelClass="max-h-[85vh]"
    >
      <div className="p-5 overflow-auto flex-1">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">加载中…</div>
        ) : content?.error ? (
          <div className="text-center py-10 text-sm text-red-400">{content.error}</div>
        ) : (
          <div className="space-y-3">
            {files.map(([file, text]) => (
              <div key={file} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                  {file}
                </div>
                <pre className="overflow-auto px-4 py-3 bg-gray-900 text-gray-100 text-xs font-mono leading-relaxed max-h-[50vh]">
                  {text}
                </pre>
              </div>
            ))}
            {Object.entries(errors).map(([file, message]) => (
              <div key={file} className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs">
                <span className="font-mono text-gray-500 dark:text-gray-400">{file}</span>
                <span className="text-red-400 ml-2">读取失败: {message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// LogsModal 展示容器日志（最近 200 行，可刷新）
function LogsModal({ viewer, content, loading, onRefresh, onClose }) {
  return (
    <ModalShell
      title={`容器日志 · ${viewer.name}`}
      subtitle="最近 200 行"
      onClose={onClose}
      panelClass="h-[80vh]"
      actions={
        <button
          onClick={() => onRefresh({ id: viewer.containerId, name: viewer.name })}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="刷新日志"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="flex-1 overflow-hidden p-4">
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">加载中…</div>
        ) : (
          <pre className="h-full overflow-auto px-4 py-3 bg-gray-900 text-gray-100 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
            {content || '（无日志）'}
          </pre>
        )}
      </div>
    </ModalShell>
  )
}
