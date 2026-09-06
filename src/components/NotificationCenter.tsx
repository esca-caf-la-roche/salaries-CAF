import { Bell, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dispatchPendingValidationAlerts, getEmployeeSummaries, getMonthlyTimeValidations, getNotifications, markNotificationRead } from '../services/api'
import { previousSchoolMonth } from '../lib/monthValidation'
import type { UserNotification } from '../types'

export function NotificationCenter({ role }: { role: 'admin' | 'employee' }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (role === 'admin') await dispatchPendingValidationAlerts().catch(() => undefined)
      const items = await getNotifications()
      if (role === 'employee') {
        const due = previousSchoolMonth(new Date())
        const [employees, validations] = await Promise.all([getEmployeeSummaries(due.schoolYear), getMonthlyTimeValidations()])
        const employee = employees[0]
        const alreadyValidated = validations.some((validation) => validation.employeeId === employee?.id && validation.schoolYear === due.schoolYear && validation.month === due.month)
        if (employee?.contractType === 'CDI' && !alreadyValidated) items.unshift({
          id: `task-${employee.id}-${due.schoolYear}-${due.month}`, title: 'Validation mensuelle à faire',
          body: 'Contrôlez et validez les heures du mois terminé.', actionUrl: '/', createdAt: new Date().toISOString(), readAt: null,
        })
      }
      if (active) setNotifications(items)
    }
    void load().catch(() => { if (active) setNotifications([]) })
    return () => { active = false }
  }, [role])

  const unread = notifications.filter((notification) => !notification.readAt).length
  const read = async (notification: UserNotification) => {
    if (notification.readAt || notification.id.startsWith('task-')) return
    await markNotificationRead(notification.id)
    setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item))
  }

  return <details className="notification-center">
    <summary aria-label={`${unread} notification${unread !== 1 ? 's' : ''} non lue${unread !== 1 ? 's' : ''}`}>
      <Bell aria-hidden="true" />
      {unread > 0 && <b>{unread}</b>}
    </summary>
    <section aria-label="Notifications">
      <header><strong>Tâches et notifications</strong><small>{unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est consulté'}</small></header>
      {!notifications.length && <p>Aucune notification pour le moment.</p>}
      <ul>{notifications.map((notification) => <li className={notification.readAt ? '' : 'notification--unread'} key={notification.id}>
        <Link to={notification.actionUrl} onClick={() => void read(notification)}>
          <strong>{notification.title}</strong><span>{notification.body}</span>
          <small>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(notification.createdAt))}</small>
        </Link>
        {!notification.readAt && !notification.id.startsWith('task-') && <button type="button" aria-label={`Marquer « ${notification.title} » comme lue`} onClick={() => void read(notification)}><Check aria-hidden="true" /></button>}
      </li>)}</ul>
    </section>
  </details>
}
