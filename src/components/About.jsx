import React from 'react'
import { Sparkles, Heart } from 'lucide-react'
import logoImg from '../assets/dockhamster-logo.png'



const IMPROVEMENTS = [
  { title: '自动更新（UI 配置）', desc: '白名单容器按 cron 计划自动更新；容器页开关一键加入/移出白名单；更新检测与自动更新两条独立链路，均可随点随查' },
  { title: '旧镜像安全清理', desc: '更新完成后自动清理被替换的旧镜像；多容器共用镜像受「引用计数」保护，还有容器在用就绝不删' },
  { title: '共用镜像整组更新', desc: '同一镜像被多个容器共用时，一键依次更新全部（同一镜像只拉取一次）' },
  { title: '多渠道通知', desc: '8 个渠道：飞书（自建应用·交互卡片）/ 企业微信（应用消息，可推个人微信）/ 钉钉 / QQ 官方机器人 / Bark / Server酱 / Telegram / 自定义 Webhook；卡片式管理，每渠道可独立测试' },
  { title: '任务中心与历史记录', desc: '所有拉取 / 更新任务统一汇总：进行中实时进度 + 历史记录长期留存（面板重建不丢），标明触发方式、支持多选删除' },
  { title: '实时进度展示', desc: '真实字节级拉取进度 + 速度 + 心跳耗时；批量有「进行中」面板，单个更新在容器行内展开进度子行，切页面/刷新后自动接回' },
  { title: '列表化界面与搜索', desc: '容器页 / 镜像页均为列表布局，支持按名称、镜像、Tag 实时搜索' },
  { title: '镜像快照与回滚', desc: '更新前的旧镜像可自动打快照保留；容器页一键回滚到任意历史版本，回滚前自动备份当前版本（双向可回滚）' },
  { title: '容器迁移', desc: '镜像体检（找出换机即丢的镜像）→ 打包导出（含 compose 与一键导入脚本）→ 上传导入（预检冲突，改名/端口/卷路径可重映射）' },
  { title: '更新健康校验与自动回滚', desc: '更新后观察新容器是否稳定（退出 / 反复重启 / OOM / 健康检查失败）→ 自动回滚到旧容器，更新失败不再把服务撂倒' },
  { title: '镜像加速源 + 测速', desc: '内置常用加速源，一键并发测速按延迟排序；「加速拉取」把 Docker Hub 镜像走选定源拉取并自动打回原名' },
  { title: '面板自更新', desc: '用一次性接力容器完成面板自身替换，启动失败自动回滚；容器页对自身容器点「更新」同效' },
  { title: '容器异常守护', desc: '意外退出 / 被 OOM / 反复重启 → 推送告警（面板主动操作不误报），恢复运行也会通知' },
  { title: 'Web 端口直达 + 图标', desc: '容器行内直接列出对外端口，点一下打开该容器的 Web 界面；图标自动匹配，没有的自动抓取网页 favicon' },
  { title: '上游修复', desc: '修复多 RepoDigests 时"永远提示有更新"、检查缓存并发安全、更新时保持容器原有运行状态；无标签镜像不再误报"有更新"' },
]


export function About() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="px-2 sm:px-6 py-4 space-y-6">
        {/* 头部 */}
        <div className="card p-6 flex items-center gap-4">
          <img src={logoImg} alt="DockHamster" className="w-14 h-14 rounded-2xl shadow-md flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">DockHamster <span className="text-base font-medium text-gray-400 dark:text-gray-500">容器仓鼠</span></h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              基于 onlyLTY/dockerCopilot 的增强版（AGPL-3.0）· Docker 容器更新管理工具
            </p>
          </div>
        </div>

        {/* 改进之处 */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">本项目针对原项目的改进</h3>
          </div>
          <ul className="space-y-3">
            {IMPROVEMENTS.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{item.desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 致谢 */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-5 w-5 text-red-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">致谢 / Thanks</h3>
          </div>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            <p>
              DockHamster 的一切基础，来自{' '}
              <a href="https://github.com/onlyLTY/dockerCopilot" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">onlyLTY/dockerCopilot</a>
              {' '}（后端）与{' '}
              <a href="https://github.com/dongshull/Docker-Copilot-React" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline">dongshull/Docker-Copilot-React</a>
              {' '}（前端）。感谢两位原作者的开源与长期维护——没有上游，就没有这个项目。
            </p>
            <p>
              也感谢上游社区每一位提交 Issue、给出建议与鼓励的使用者：本版本中的多项修复（如"更新完仍提示有更新"）正是由你们的反馈推动的；也感谢最初 Docker Copilot 的每一位用户，它是属于我们共同的作品。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
