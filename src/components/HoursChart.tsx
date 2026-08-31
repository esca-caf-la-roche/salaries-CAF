import { formatHours, monthLabel } from '../lib/format'
import type { MonthlyHours } from '../types'

export function HoursChart({ data, activeMonth }: { data: MonthlyHours[]; activeMonth: number | 'all' }) {
  const width = 900
  const height = 260
  const padding = { left: 34, right: 18, top: 24, bottom: 34 }
  const max = Math.max(80, ...data.map((item) => item.weightedHours))
  const x = (index: number) => padding.left + index * ((width - padding.left - padding.right) / 11)
  const y = (hours: number) => padding.top + (max - hours) * ((height - padding.top - padding.bottom) / max)
  const points = data.map((item, index) => `${x(index)},${y(item.weightedHours)}`).join(' ')

  return (
    <div className="chart-wrap">
      <svg className="hours-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="chart-title chart-desc">
        <title id="chart-title">Heures pondérées par mois</title>
        <desc id="chart-desc">{data.map((item) => `${monthLabel(item.month)} : ${formatHours(item.weightedHours)} heures`).join(', ')}</desc>
        {[0, .25, .5, .75, 1].map((ratio) => {
          const value = Math.round(max * (1 - ratio))
          const lineY = padding.top + ratio * (height - padding.top - padding.bottom)
          return <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} className="chart-grid" /><text x="0" y={lineY + 4}>{value} h</text></g>
        })}
        <polygon points={`${padding.left},${height - padding.bottom} ${points} ${width - padding.right},${height - padding.bottom}`} className="chart-area" />
        <polyline points={points} className="chart-line" />
        {data.map((item, index) => (
          <g key={item.month} className={activeMonth === item.month ? 'chart-point chart-point--active' : 'chart-point'}>
            <circle cx={x(index)} cy={y(item.weightedHours)} r={activeMonth === item.month ? 6 : 4} />
            <text className="chart-month" textAnchor="middle" x={x(index)} y={height - 8}>{monthLabel(item.month)}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
