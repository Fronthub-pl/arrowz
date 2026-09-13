/** The one large Signal plane of the mock: the mark, the name and the size. */
export function TopBar({ W, H }: { W: number; H: number }) {
  return (
    <header className="fw-top">
      <svg className="mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3 17 L10 3 L17 17 L10 13 Z" fill="currentColor" />
      </svg>
      <span className="name">Arrowz</span>
      <span className="sep">/</span>
      <span className="dims">{`${W}×${H}`}</span>
      {/* The right group is where ⌘K (PR 3), the language switch and the
          simple/advanced switch (PR 4) go. It stays empty rather than
          carrying a placeholder nobody would remember to remove. */}
      <div className="right" />
    </header>
  )
}
