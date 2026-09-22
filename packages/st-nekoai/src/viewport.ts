export type ViewportBox = {
  left: number
  top: number
  width: number
  height: number
}

export function readViewport(): ViewportBox {
  const vv = window.visualViewport
  return {
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  }
}

export function syncViewportVars(box = readViewport()) {
  const root = document.documentElement
  root.style.setProperty('--nekoai-vv-left', `${box.left}px`)
  root.style.setProperty('--nekoai-vv-top', `${box.top}px`)
  root.style.setProperty('--nekoai-vv-width', `${box.width}px`)
  root.style.setProperty('--nekoai-vv-height', `${box.height}px`)
  return box
}

export function watchViewport(onChange?: (box: ViewportBox) => void) {
  const run = () => {
    onChange?.(syncViewportVars())
  }
  run()
  const vv = window.visualViewport
  vv?.addEventListener('resize', run)
  vv?.addEventListener('scroll', run)
  window.addEventListener('resize', run)
  return () => {
    vv?.removeEventListener('resize', run)
    vv?.removeEventListener('scroll', run)
    window.removeEventListener('resize', run)
  }
}
