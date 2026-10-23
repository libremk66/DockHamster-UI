// 镜像 → 对应的"仓库网页"链接。
//
// 此前所有镜像都拼 hub.docker.com/r/<name>，ghcr.io 等非 Hub 镜像会跳到 404
// （如 ghcr.io/libremk66/hamsterdash → hub.docker.com/r/ghcr.io/libremk66/hamsterdash）。
// 这里按 registry 分流；无法给出可靠链接的（第三方 registry）返回 null，按钮直接隐藏。

// 去掉可能的 tag / digest（调用方一般传 image.name，这里兜底）
function stripTag(name) {
  let s = name.trim()
  if (s.includes('@')) s = s.slice(0, s.indexOf('@'))
  const lastColon = s.lastIndexOf(':')
  if (lastColon > s.lastIndexOf('/')) s = s.slice(0, lastColon)
  return s
}

function registryHostOf(name) {
  const first = name.split('/')[0]
  if (first.includes('.') || first.includes(':') || first === 'localhost') return first.toLowerCase()
  return 'docker.io'
}

// 返回 { url, label, title }；无法给出可靠链接时返回 null
export function imageHubLink(name) {
  if (!name) return null
  const repo = stripTag(name)
  if (!repo || repo === 'None' || repo === '<none>' || repo.startsWith('dh-snap/')) return null

  const host = registryHostOf(repo)
  const parts = repo.split('/')

  if (host === 'docker.io' || host === 'index.docker.io' || host === 'registry-1.docker.io') {
    // docker.io/library/nginx → nginx；docker.io/libremk66/app → libremk66/app；
    // libremk66/dockhamster（无域名写法）→ 原样
    let pathParts = parts
    if (parts[0].includes('.') || parts[0].includes(':')) pathParts = parts.slice(1)
    const path = pathParts.join('/').replace(/^library\//, '')
    if (!path) return null
    return {
      url: `https://hub.docker.com/r/${path}`,
      label: 'Hub',
      title: '在 Docker Hub 查看',
    }
  }

  if (host === 'ghcr.io') {
    // ghcr.io/<owner>/<pkg...> → GitHub Packages 页面（用户/组织的私有包登录后可访问）
    const owner = parts[1]
    const pkg = parts.slice(2).join('/')
    if (!owner || !pkg) return null
    return {
      url: `https://github.com/users/${owner}/packages/container/package/${encodeURIComponent(pkg)}`,
      label: 'GHCR',
      title: '在 GitHub Packages 查看',
    }
  }

  // 其它 registry（lscr.io / quay.io / 自建带端口…）没有统一网页入口：不出坏链接
  return null
}
