import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TimeConversionPage } from './TimeConversionPage'

describe('TimeConversionPage', () => {
  afterEach(cleanup)

  it('converts a duration to hundredth hours', async () => {
    render(<TimeConversionPage />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Heures' }), { target: { value: '7' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), { target: { value: '30' } })

    expect(screen.getAllByRole('status')[0]).toHaveTextContent('7,50 h')
  })

  it('converts French decimal hours back to hours and minutes', async () => {
    render(<TimeConversionPage />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Heures centièmes' }), { target: { value: '7,25' } })

    expect(screen.getAllByRole('status')[1]).toHaveTextContent('7 h 15')
  })

  it('explains an invalid minute value', async () => {
    render(<TimeConversionPage />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Minutes' }), { target: { value: '60' } })

    expect(screen.getByRole('alert')).toHaveTextContent('comprises entre 0 et 59')
  })
})
