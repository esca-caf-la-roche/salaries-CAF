export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="La Cordée, CAF La Roche Bonneville">
      <svg className="brand__mark" viewBox="0 0 48 48" aria-hidden="true">
        <path d="M4 39 18 11l7 14 5-9 14 23H4Z" fill="currentColor" />
        <path d="m13 39 8-13 5 8 5-9 9 14H13Z" fill="#f4f1e8" />
        <circle cx="35" cy="10" r="4" fill="#e26d3f" />
      </svg>
      {!compact && <span><strong>La Cordée</strong><small>CAF La Roche Bonneville</small></span>}
    </div>
  )
}
