import React from 'react'
import { Github, Heart, BookOpen } from 'lucide-react'
import logoImg from '../assets/dockhamster-logo.png'

// 「关于」页保持最小化：名称与许可、上下游仓库入口、一行致谢。
// 功能清单 / 截图 / 更新日志统一维护在仓库（README / FEATURES.md），这里不再同步，避免信息滞后。
export function About() {
  const linkCls = 'text-primary-600 dark:text-primary-400 hover:underline break-all'
  return (
    <div className="max-w-3xl mx-auto">
      <div className="px-2 sm:px-6 py-4 space-y-4">
        {/* 头部 */}
        <div className="card p-6 flex items-center gap-4">
          <img src={logoImg} alt="DockHamster" className="w-14 h-14 rounded-2xl shadow-md flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              DockHamster <span className="text-base font-medium text-gray-400 dark:text-gray-500">容器仓鼠</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              基于 onlyLTY/dockerCopilot 的增强版（AGPL-3.0）· Docker 容器更新管理工具
            </p>
          </div>
        </div>

        {/* 仓库入口 */}
        <div className="card p-6 space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-start gap-2">
            <Github className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400" />
            <div>
              <span className="text-gray-900 dark:text-white font-medium">本项目：</span>
              <a
                href="https://github.com/libremk66/DockHamster"
                target="_blank"
                rel="noopener noreferrer"
                className={linkCls}
              >
                github.com/libremk66/DockHamster
              </a>
              <span className="text-gray-500 dark:text-gray-500">（使用说明、功能介绍、更新日志都在仓库里）</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <BookOpen className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-400" />
            <div>
              <span className="text-gray-900 dark:text-white font-medium">上游项目：</span>
              <a
                href="https://github.com/onlyLTY/dockerCopilot"
                target="_blank"
                rel="noopener noreferrer"
                className={linkCls}
              >
                onlyLTY/dockerCopilot
              </a>
              <span className="text-gray-500 dark:text-gray-500">（后端）与 </span>
              <a
                href="https://github.com/dongshull/Docker-Copilot-React"
                target="_blank"
                rel="noopener noreferrer"
                className={linkCls}
              >
                dongshull/Docker-Copilot-React
              </a>
              <span className="text-gray-500 dark:text-gray-500">（前端）</span>
            </div>
          </div>
        </div>

        {/* 致谢 */}
        <div className="card p-6 flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          <Heart className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p>
            感谢两位原作者的开源与长期维护——没有上游，就没有这个项目；也感谢每一位提交
            Issue、给出建议的使用者，本项目的多项修复正是由社区反馈推动的。
          </p>
        </div>
      </div>
    </div>
  )
}
