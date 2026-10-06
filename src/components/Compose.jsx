import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Layers, RefreshCw, ChevronDown, ChevronUp, FileText, ScrollText, X } from 'lucide-react'
import { containerAPI } from '../api/client'

// Compose 页面：按项目分组展示 compose 管理的容器，支持查看 compose 文件原文
export function Compose() {
  const [expandedProject, setExpandedProject] = useState(null)
  const [fileViewer, setFileViewer] = useState(null) // { containerId, name }
  const [fileContent, setFileContent] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [logsViewer, setLogsViewer] = useState(null) // { containerId, name }
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

  // 按 compose 项目分组
  const projects = {}
  for (const c of containers) {
    if (!c.compose?.isManaged) continue
    const key = c.compose.project
    if (!projects[key]) projects[key] = { name: key, workingDir: c.compose.workingDir, services: [] }
    projects[key].services.push(c)
  }
  const projectList = Object.values(projects).sort((a, b) => a.name.localeCompare(b.name))

  const openFile = async (container) => {
    setFileViewer({ containerId: container.id, name: container.name, project: container.compose.project })
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">compose 项目</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {projectList.length} 个项目 · {projectList.reduce((n, p) => n + p.services.length, 0)} 个服务 · 更新走 compose 通道（单服务重建）
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
          {projectList.map((project) => {
            const expanded = expandedProject === project.name
            const runningCount = project.services.filter((s) => s.status === 'running').length
            return (
              <div
                key={project.name}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm"
              >
                <button
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  onClick={() => setExpandedProject(expanded ? null : project.name)}
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
                      openFile(project.services[0])
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
                            onClick={() => openFile(svc)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            title="查看 compose 文件原文"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openLogs(svc)}
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
          })}
        </div>
      )}

      {/* compose 原文弹窗 */}
      {fileViewer && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setFileViewer(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  compose 原文 · {fileViewer.project}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">容器 {fileViewer.name}</p>
              </div>
              <button
                onClick={() => setFileViewer(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-auto flex-1">
              {fileLoading ? (
                <div className="text-center py-10 text-gray-400 text-sm">加载中…</div>
              ) : fileContent?.error ? (
                <div className="text-center py-10 text-sm text-red-400">{fileContent.error}</div>
              ) : fileContent ? (
                <div className="space-y-3">
                  {Object.entries(fileContent.files || {}).map(([file, content]) => (
                    <div key={file} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                        {file}
                      </div>
                      <pre className="overflow-auto px-4 py-3 bg-gray-900 text-gray-100 text-xs font-mono leading-relaxed max-h-[50vh]">
                        {content}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {/* 容器日志弹窗 */}
      {logsViewer && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setLogsViewer(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  容器日志 · {logsViewer.name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">最近 200 行</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const svc = { id: logsViewer.containerId, name: logsViewer.name }
                    openLogs(svc)
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="刷新日志"
                >
                  <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setLogsViewer(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {logsLoading ? (
                <div className="text-center py-10 text-gray-400 text-sm">加载中…</div>
              ) : (
                <pre className="h-full overflow-auto px-4 py-3 bg-gray-900 text-gray-100 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {logsContent || '（无日志）'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
