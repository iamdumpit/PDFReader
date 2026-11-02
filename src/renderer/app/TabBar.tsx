import { useEffect } from 'react'
import { useDoc } from '../store/documentStore'
import { useAnn } from '../store/annotationStore'
import { isDirty, tabTitle, useTabs } from '../store/tabStore'
import { useForms } from '../store/formStore'

export function TabBar(): React.JSX.Element | null {
  const { tabs, activeId, switchTab, closeTab, openDialog, cycle } = useTabs()
  // re-render when the active tab's name or dirtiness changes
  useDoc((s) => s.fileName)
  useAnn((s) => s.annotations.length)
  useForms((s) => s.rev)
  useDoc((s) => s.modified)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey) return
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        const id = useTabs.getState().activeId
        if (id) useTabs.getState().closeTab(id)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        cycle(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycle])

  if (!tabs.length) return null

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((t) => {
        const title = tabTitle(t, activeId)
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId}
            className={`tab${t.id === activeId ? ' active' : ''}`}
            title={title}
            onClick={() => switchTab(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
          >
            <span className="tabTitle">{title}</span>
            {isDirty(t, activeId) && <span className="dirty" title="Unsaved annotations">●</span>}
            <button
              className="tabClose"
              title="Close (Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button className="tabNew" title="Open PDF in new tab (Ctrl+O)" onClick={() => void openDialog()}>
        +
      </button>
    </div>
  )
}
