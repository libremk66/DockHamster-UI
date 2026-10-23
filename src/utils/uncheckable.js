// 「无法检测」的提示文案：按后端给的原因区分，避免一律说"悬空/本地构建"误导用户。
// 兼容旧后端：没有 uncheckableReason 时回退调用方原来的文案。

const AUTH_TIP = '无法查询仓库：可能是私有镜像（需在「镜像 → 私有仓库」配置该仓库凭据），也可能该镜像在仓库中不存在'
const AUTH_BAD_TIP = '已配置该仓库凭据但仍被拒绝：凭据无效或没有该镜像的读取权限'
const NOT_FOUND_TIP = '仓库中找不到该镜像（可能已删除/改名，或该 tag 已不存在）'

export function uncheckableTooltip(reason, fallbackText) {
  switch (reason) {
    case 'auth':
      return AUTH_TIP
    case 'auth-bad':
      return AUTH_BAD_TIP
    case 'not-found':
      return NOT_FOUND_TIP
    default:
      return fallbackText
  }
}
