// 镜像引用相关的防御性工具。
//
// 背景：daemon 在"容器记录的引用已不指向当前镜像"时会把列表里的 Image 退化成
// 镜像 ID（sha256:…）。若把这个 ID 当镜像名回填，更新会被后端拒绝，容器永远更新不了。
// 后端已改成优先用容器创建时的 Config.Image（createImage），这里再兜一层，
// 保证对接旧后端时界面也不至于卡死。

// 与后端 ValidateUpdateImageRef 的 bareImageIDRe 保持一致
const BARE_ID_RE = /^(sha256:)?[0-9a-f]{12,64}$/i

export function isBareImageId(ref) {
  return BARE_ID_RE.test((ref || '').trim())
}

// 选出可用于显示/更新的镜像引用：usingImage 非裸 ID → 用它；
// 否则 createImage 非裸 ID → 用它；都不行原样返回（让后端的报错提示来兜底）。
export function resolveContainerImageRef(container) {
  if (!container) return ''
  const using = (container.usingImage || '').trim()
  if (using && !isBareImageId(using)) return using
  const created = (container.createImage || '').trim()
  if (created && !isBareImageId(created)) return created
  return using || created
}
