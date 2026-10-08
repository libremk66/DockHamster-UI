// 跨页跳转：App 里监听 'dh:navigate' 事件切换标签（与既有 authChange 事件风格一致）
export function navigateTo(tab) {
  window.dispatchEvent(new CustomEvent('dh:navigate', { detail: { tab } }))
}

// 跳转到「任务」页（各触发点进度旁的"全部任务 ↗"）
export function gotoTaskCenter() {
  navigateTo('#tasks')
}
