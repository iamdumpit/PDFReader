import { useUi } from '../store/uiStore'

export function Modal({
  title,
  children,
  onClose
}: {
  title: string
  children: React.ReactNode
  onClose?: () => void
}): React.JSX.Element {
  const close = useUi((s) => s.closeDialog)
  const dismiss = onClose ?? close
  return (
    <div className="modalBack" onMouseDown={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modalHead">
          <strong>{title}</strong>
          <button className="icon" onClick={dismiss} title="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
