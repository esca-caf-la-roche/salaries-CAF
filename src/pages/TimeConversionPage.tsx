import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { decimalHoursToMinutes, hoursMinutesToDecimal, parseFrenchDecimal } from '../lib/timeConversion'

function displayDecimal(value: number) {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function TimeConversionPage() {
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [decimalHours, setDecimalHours] = useState('')

  const wholeHours = Number(hours)
  const wholeMinutes = Number(minutes)
  const minutesAreValid = Number.isInteger(wholeMinutes) && wholeMinutes >= 0 && wholeMinutes < 60
  const hoursAreValid = Number.isInteger(wholeHours) && wholeHours >= 0
  const convertedDecimal = hours !== '' && minutes !== '' && hoursAreValid && minutesAreValid
    ? hoursMinutesToDecimal(wholeHours, wholeMinutes)
    : null
  const parsedDecimal = parseFrenchDecimal(decimalHours)
  const convertedTime = parsedDecimal == null ? null : decimalHoursToMinutes(parsedDecimal)

  return <div className="page conversion-page">
    <header className="page-heading">
      <div>
        <p className="eyebrow">Outil pratique</p>
        <h1>Conversion des heures</h1>
        <p>Convertissez une durée en heures centièmes, ou retrouvez les heures et minutes correspondantes.</p>
      </div>
    </header>

    <div className="conversion-grid">
      <section className="conversion-card" aria-labelledby="hours-to-decimal-title">
        <header><ArrowLeftRight aria-hidden="true" /><div><h2 id="hours-to-decimal-title">Heures : minutes → centièmes</h2><p>Ex. 7 h 30 devient 7,50 h.</p></div></header>
        <div className="conversion-fields">
          <label>Heures<input aria-label="Heures" inputMode="numeric" min="0" step="1" type="number" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
          <span aria-hidden="true">:</span>
          <label>Minutes<input aria-label="Minutes" inputMode="numeric" min="0" max="59" step="1" type="number" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
        </div>
        {hours !== '' && !hoursAreValid && <p className="conversion-error" role="alert">Les heures doivent être un nombre entier positif.</p>}
        {minutes !== '' && !minutesAreValid && <p className="conversion-error" role="alert">Les minutes doivent être comprises entre 0 et 59.</p>}
        <output className="conversion-result" aria-live="polite">{convertedDecimal == null ? 'Saisissez une durée' : <><strong>{displayDecimal(convertedDecimal)} h</strong><span>heures centièmes</span></>}</output>
      </section>

      <section className="conversion-card" aria-labelledby="decimal-to-hours-title">
        <header><ArrowLeftRight aria-hidden="true" /><div><h2 id="decimal-to-hours-title">Heures centièmes → heures : minutes</h2><p>Ex. 7,50 h devient 7 h 30.</p></div></header>
        <label className="conversion-decimal-input">Heures centièmes<input aria-label="Heures centièmes" inputMode="decimal" min="0" step="0.01" type="text" value={decimalHours} onChange={(event) => setDecimalHours(event.target.value)} placeholder="Ex. 7,50" /></label>
        {decimalHours !== '' && parsedDecimal == null && <p className="conversion-error" role="alert">Saisissez un nombre positif, avec une virgule ou un point.</p>}
        <output className="conversion-result" aria-live="polite">{convertedTime == null ? 'Saisissez des heures centièmes' : <><strong>{convertedTime.hours} h {String(convertedTime.minutes).padStart(2, '0')}</strong><span>heures et minutes</span></>}</output>
      </section>
    </div>
    <p className="conversion-note">Le résultat est arrondi à deux décimales dans le premier sens et à la minute la plus proche dans le second.</p>
  </div>
}
