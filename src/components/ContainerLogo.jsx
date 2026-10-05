import React, { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { getImageLogo } from '../config/imageLogos.js'
import { getCachedFavicon, resolveFavicon } from '../utils/webFavicon.js'
import { cn } from '../utils/cn.js'

// 容器图标优先级：容器自带/内置/自定义 logo → Web 界面 favicon（异步解析+缓存）→ 渐变占位
export function ContainerLogo({ container, customIcons = {}, className = 'h-10 w-10' }) {
  const ports = Array.isArray(container.ports) ? container.ports : []
  const webPort = container.status === 'running' ? ports[0] : null
  const builtIn = container.iconUrl
    || (container.usingImage ? getImageLogo(container.usingImage, customIcons) : null)
  const [favicon, setFavicon] = useState(() => (webPort ? getCachedFavicon(container.name, webPort) : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (builtIn || !webPort) return
    let alive = true
    resolveFavicon(container.name, webPort).then((url) => {
      if (alive && url) setFavicon(url)
    })
    return () => { alive = false }
  }, [container.name, webPort, builtIn])

  const src = failed ? null : (builtIn || favicon)
  if (src) {
    return (
      <img
        src={src}
        alt={container.name}
        className={cn('rounded-lg object-cover shadow-sm flex-shrink-0', className)}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div className={cn('rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-sm flex-shrink-0', className)}>
      <Package className="h-5 w-5 text-white" />
    </div>
  )
}
