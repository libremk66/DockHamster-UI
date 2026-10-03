import React from 'react'
import {
  Box,
  LogOut,
  Server,
  DatabaseBackup,
  Package,
  Info,
  Github,
  ArrowUpCircle,
  RefreshCw
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { cn } from '../utils/cn.js'
import logoImg from '../assets/dockhamster-logo.png'
import { useVersionCheck } from '../hooks/useVersionCheck.js'

export function Sidebar({ activeTab, onTabChange, onLogout, isCollapsed = false, onToggleCollapse, windowWidth = 1024 }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
  const [showUpdateHint, setShowUpdateHint] = React.useState(false)
  const PROJECT_URL = 'https://github.com/libremk66/DockHamster'

  // 时间格式转换函数 - 将UTC时间转换为北京时间
  const formatVersionBuildDate = (dateString) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        return dateString
      }

      // 转换为北京时间 (UTC+8)
      const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000)

      return beijingDate.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
    } catch (error) {
      return dateString
    }
  }

  // 使用版本检查 Hook
  const {
    backendVersion,
    remoteVersion,
    buildDate,
    hasBackendUpdate,
    imageUpdate,
    versionUpdate,
    checkForUpdates
  } = useVersionCheck()

  // 智能判断是否可以手动切换侧边栏
  const canToggleSidebar = windowWidth >= 1024
  const isTabletSize = windowWidth >= 768 && windowWidth < 1024
  const isMobileSize = windowWidth < 768

  const handleToggleCollapse = () => {
    // 只在桌面模式允许切换
    if (canToggleSidebar && onToggleCollapse) {
      onToggleCollapse()
    }
  }

  const navItems = [
    {
      id: '#containers',
      label: '容器',
      icon: Server,
    },
    {
      id: '#autoupdate',
      label: '自动更新',
      icon: RefreshCw,
    },
    {
      id: '#images',
      label: '镜像',
      icon: Box,
    },
    {
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#migrate',
      label: '迁移',
      icon: Package,
    },
    {
      id: '#about',
      label: '关于',
      icon: Info,
    },
  ]

  return (
    <>
      {/* 顶部导航栏 - 仅在手机模式（sm）显示 */}
      {windowWidth < 768 && (
        <div className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-3 sm:px-4 z-40 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: '0.875rem', height: 'calc(3.5rem + env(safe-area-inset-top))' }}>
          {/* 左侧：Logo 和项目信息 */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity active:scale-95 rounded-lg group"
            title="打开菜单"
          >
            <img
              src={logoImg}
              alt="菜单"
              className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg object-cover border-0"
            />
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">DockHamster</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{backendVersion || 'v1.0'}</span>
            </div>
          </button>

          {/* 右侧：主题切换和退出登录 */}
          <div className="flex items-center gap-1">
            <ThemeToggle collapsed={false} />
            <button
              onClick={onLogout}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors active:scale-95"
              title="退出登录"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* 添加顶部导航栏的占位符 - 仅在手机模式显示 */}
      {windowWidth < 768 && <div style={{ height: 'calc(3.5rem + env(safe-area-inset-top))' }} />}

      {/* 侧边栏遮罩 - 仅在手机菜单打开时显示 */}
      {windowWidth < 768 && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 shadow-xl lg:shadow-none transform transition-all duration-300 ease-in-out flex flex-col",
          isCollapsed ? "w-20" : "w-64 sm:w-72 md:w-64",
          // 手机模式：根据菜单打开状态显示/隐藏；md及以上：始终显示
          windowWidth < 768
            ? (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full")
            : "translate-x-0",
          "max-h-screen overflow-y-auto",
          // 手机模式距顶部导航栏下方，其他模式从顶部开始
          windowWidth < 768 ? "top-14" : "top-0",
          "border-r border-gray-200 dark:border-gray-700"
        )}
      >
        <div className="flex flex-col h-full">
          {/* 头部 - 现代卡片设计 (仅在非手机模式显示) */}
          {isMobileSize === false && (
            <div className="p-4 sm:p-5 flex-shrink-0">
              <button
                onClick={handleToggleCollapse}
                disabled={!canToggleSidebar}
                className={cn(
                  "w-full flex items-center transition-all duration-300 group",
                  !canToggleSidebar ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-80",
                  isCollapsed ? "justify-center" : "space-x-3"
                )}
                title={
                  isMobileSize ? "手机模式" :
                    isTabletSize ? "平板模式（自动收缩）" :
                      isCollapsed ? "展开侧边栏" : "收起侧边栏"
                }
              >
                <div className="flex-shrink-0">
                  <img
                    src={logoImg}
                    alt="DockHamster"
                    className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl object-cover shadow-md group-hover:shadow-lg group-hover:scale-110 transition-all duration-200 border-0"
                  />
                </div>
                {!isCollapsed && isMobileSize === false && (
                  <div className="text-left transition-all duration-300 min-w-0 flex-1">
                    <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">DockHamster</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">容器管理平台</p>
                  </div>
                )}
              </button>
            </div>
          )}

          {/* 分割线 */}
          <div className="px-4 sm:px-5">
            <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
          </div>

          {/* 导航菜单 */}
          <nav className={cn("flex-1 py-6 sm:py-8 overflow-y-auto space-y-2", isCollapsed ? "px-2.5" : "px-3 sm:px-4")}>
            <ul className="space-y-0.5">
              {navItems.map((item, index) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => {
                        onTabChange(item.id)
                        setIsMobileMenuOpen(false)
                      }}
                      className={cn(
                        "w-full flex items-center rounded-lg text-left transition-all duration-200 group active:scale-95 relative overflow-hidden",
                        isCollapsed ? "justify-center p-2.5 sm:p-3" : "space-x-3 px-3 sm:px-4 py-2.5 sm:py-3",
                        isActive
                          ? "bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/30 dark:to-primary-900/10 text-primary-700 dark:text-primary-300 font-semibold shadow-sm"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                      )}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {/* 左侧指示条 */}
                      {isActive && !isCollapsed && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500 dark:bg-primary-400 rounded-r-full" />
                      )}

                      <Icon className={cn(
                        "flex-shrink-0 transition-all duration-200",
                        isCollapsed ? "h-6 w-6" : "h-5 w-5",
                        isActive && "scale-110"
                      )} />
                      {!isCollapsed && (
                        <span className="truncate text-sm sm:text-base font-medium">{item.label}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          {/* 底部操作区 - 所有尺寸都显示 */}
          <div className={cn("flex flex-col flex-shrink-0", isCollapsed ? "p-2.5" : "p-4 sm:p-5")}>
            {/* 分割线 */}
            <div className="mb-4">
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 dark:via-gray-700 to-transparent" />
            </div>

            {/* 操作按钮 */}
            <div className={cn(
              "flex items-center gap-2 mb-4",
              isCollapsed ? "flex-col" : "justify-between"
            )}>
              <ThemeToggle collapsed={isCollapsed} />
              <button
                onClick={onLogout}
                className={cn(
                  "flex items-center justify-center gap-2 transition-all duration-200 group active:scale-95",
                  isCollapsed
                    ? "p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg w-full"
                    : "px-3 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex-1"
                )}
                title={isCollapsed ? "退出登录" : ""}
              >
                <LogOut className="h-4 w-4 flex-shrink-0 group-hover:rotate-12 transition-transform duration-300" />
                {!isCollapsed && (
                  <span className="text-xs sm:text-sm font-medium">退出</span>
                )}
              </button>
            </div>

            {/* 版本信息部分 */}
            {isCollapsed ? (
              // 收起状态 - 简约指示
              <div className="space-y-3">
                {/* 状态指示 */}
                <div className="flex justify-center">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400/50 dark:shadow-emerald-600/50" title={`运行中 - ${backendVersion || 'v1.0'}`} />
                </div>

                {/* 项目主页 */}
                <div className="flex justify-center">
                  <a
                    href={PROJECT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
                    title="项目主页（GitHub）"
                  >
                    <Github className="h-5 w-5" />
                  </a>
                </div>

                {/* 更新提示 */}
                {hasBackendUpdate && (
                  <div className="flex justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" title="有新版本" />
                  </div>
                )}
              </div>
            ) : (
              // 展开状态
              <div className="space-y-2">
                {/* 项目主页 + 当前版本 */}
                <div className="flex items-center justify-center gap-2 px-1">
                  <a
                    href={PROJECT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
                    title="项目主页（GitHub）"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{backendVersion || 'v1.0'}</span>
                </div>

                {/* 最新版本提示 */}
                {hasBackendUpdate ? (
                  <button
                    onClick={() => setShowUpdateHint(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                    title="查看更新方式"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                    {versionUpdate ? `有新版本 ${remoteVersion}` : '有新版本（镜像已更新）'}
                  </button>
                ) : (
                  remoteVersion && remoteVersion !== 'unknown' ? (
                    // 显示"本地版本"而不是远端值：CDN 有缓存延迟，远端可能短暂落后而导致号码看起来不对
                    <div className="text-center text-[10px] text-gray-400 dark:text-gray-500" title="已是最新版本">
                      已是最新 · {backendVersion || '—'}
                    </div>
                  ) : (
                    // 检查失败（无外网 / GitHub 不可达）时不打扰用户，下一页刷新自动重试
                    <div className="text-center text-[10px] text-transparent select-none" title="">·</div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 更新指引弹窗（Docker 部署场景：面板不能"自己更新自己"，给出正确路径） */}
      {showUpdateHint && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowUpdateHint(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex-1">有新版本可用</h3>
              <button onClick={() => setShowUpdateHint(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center justify-center gap-2 py-2">
                <span className="font-mono text-gray-400">{backendVersion || '—'}</span>
                <span className="text-gray-300">→</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {versionUpdate ? remoteVersion : '镜像已更新'}
                </span>
              </div>
              {!versionUpdate && imageUpdate && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  检测到镜像仓库已发布新版本（版本号未变，可能是构建修复）
                </p>
              )}
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">Docker 部署怎么更新？</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <b className="text-gray-700 dark:text-gray-300">① 面板内更新（推荐）</b>：打开「容器」页 → 找到 <span className="font-mono">dockhamster</span> 容器 → 点「更新」，会自动拉取新镜像并重建，<b>配置数据保留</b>。
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <b className="text-gray-700 dark:text-gray-300">② 命令行</b>：<code className="font-mono bg-white dark:bg-gray-800 px-1 rounded">docker compose pull &amp;&amp; docker compose up -d</code>
                </div>
              </div>
              <p className="text-xs text-gray-400">更新前建议先看一眼版本说明，确认没有破坏性变更。</p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button onClick={() => setShowUpdateHint(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">知道了</button>
              <a href={`${PROJECT_URL}/releases`} target="_blank" rel="noopener noreferrer"
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors text-center">查看版本说明</a>
            </div>
          </div>
        </div>
      )}



      {/* 版本更新提示弹窗 */}    </>
  )
}

// 手机底部导航栏组件
export function MobileBottomNav({ activeTab, onTabChange, windowWidth = 1024 }) {
  const navItems = [
    {
      id: '#containers',
      label: '容器',
      icon: Server,
    },
    {
      id: '#autoupdate',
      label: '自动更新',
      icon: RefreshCw,
    },
    {
      id: '#images',
      label: '镜像',
      icon: Box,
    },
    {
      id: '#backups',
      label: '备份',
      icon: DatabaseBackup,
    },
    {
      id: '#migrate',
      label: '迁移',
      icon: Package,
    },
    {
      id: '#about',
      label: '关于',
      icon: Info,
    },
  ]

  return (
    <>
      {windowWidth < 768 && (
        <nav 
          className="fixed left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full z-40 shadow-lg transition-all duration-300" 
          style={{ 
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)'
          }}
        >
          <div className="flex items-center justify-around px-3 py-3 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-2 px-2.5 rounded-full transition-all duration-200 active:scale-95 flex-1",
                    isActive
                      ? "text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/40"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  )}
                  title={item.label}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}