import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  UNIT_SYSTEMS,
  DEFAULT_UNIT_SYSTEM,
  SCALE_MIN_BMI,
  SCALE_MAX_BMI,
  SCALE_SECTIONS,
  calculateBMI,
  calculateHealthyWeightRange,
  getBMICategory,
  validateBmiInputs,
  getScaleIndicatorPercent,
  formatBMI,
  formatWeightValue,
} from './bmiUtils.js';

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual BMI math (formula, category thresholds, healthy weight
// range, unit conversion) lives in bmiUtils.js - this file is just the
// UI wired up to it, re-run directly in the render body on every change
// (no debouncing), like every other converter tool on this site.
//
// Metric and imperial keep entirely separate field state rather than
// live-converting one into the other while typing - simpler, and avoids
// a half-typed imperial value being silently mangled by a metric
// round-trip every keystroke.

export default function BmiCalculator() {
  const [unitSystem, setUnitSystem] = useState(DEFAULT_UNIT_SYSTEM);
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [copied, setCopied] = useState(false);

  // Re-validates and re-calculates on every change - simple, and matches
  // how the other converter tools on this site work.
  const validation = validateBmiInputs(unitSystem, { heightCm, weightKg, heightFt, heightIn, weightLb });
  const bmi = validation.ok ? calculateBMI(validation.heightCm, validation.weightKg) : null;
  const category = bmi !== null ? getBMICategory(bmi) : null;
  const healthyRange = validation.ok ? calculateHealthyWeightRange(validation.heightCm, unitSystem) : null;
  const weightUnitLabel = unitSystem === 'imperial' ? 'lb' : 'kg';

  function handleClear() {
    setUnitSystem(DEFAULT_UNIT_SYSTEM);
    setHeightCm('');
    setWeightKg('');
    setHeightFt('');
    setHeightIn('');
    setWeightLb('');
    setCopied(false);
  }

  async function handleCopy() {
    if (bmi === null || !category || !healthyRange) return;
    const text = `BMI: ${formatBMI(bmi)} (${category.label}) - Healthy weight range: ${formatWeightValue(healthyRange.min)}-${formatWeightValue(healthyRange.max)} ${weightUnitLabel}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasUnsavedWork =
    unitSystem !== DEFAULT_UNIT_SYSTEM ||
    heightCm.trim() !== '' ||
    weightKg.trim() !== '' ||
    heightFt.trim() !== '' ||
    heightIn.trim() !== '' ||
    weightLb.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);

  const indicatorPercent = bmi !== null ? getScaleIndicatorPercent(bmi) : null;

  return (
    <div className="bmi-calculator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopy} disabled={bmi === null}>
          {copied ? 'Copied!' : 'Copy Result'}
        </button>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Unit system</label>
        </div>
        <div className="mode-toggle" role="group" aria-label="Unit system">
          {UNIT_SYSTEMS.map((system) => (
            <button
              key={system.id}
              type="button"
              aria-pressed={system.id === unitSystem}
              className={system.id === unitSystem ? 'mode-button active' : 'mode-button'}
              onClick={() => setUnitSystem(system.id)}
            >
              {system.label}
            </button>
          ))}
        </div>
      </div>

      {unitSystem === 'metric' ? (
        <div className="unit-converter-row">
          <div className="field">
            <label htmlFor="bmi-height-cm">Height (cm)</label>
            <input
              id="bmi-height-cm"
              type="text"
              inputMode="decimal"
              value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
              placeholder="e.g. 175"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="bmi-weight-kg">Weight (kg)</label>
            <input
              id="bmi-weight-kg"
              type="text"
              inputMode="decimal"
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
              placeholder="e.g. 70"
              autoComplete="off"
            />
          </div>
        </div>
      ) : (
        <div className="unit-converter-row">
          <div className="field">
            <label htmlFor="bmi-height-ft">Height (ft)</label>
            <input
              id="bmi-height-ft"
              type="text"
              inputMode="decimal"
              value={heightFt}
              onChange={(event) => setHeightFt(event.target.value)}
              placeholder="e.g. 5"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="bmi-height-in">Height (in)</label>
            <input
              id="bmi-height-in"
              type="text"
              inputMode="decimal"
              value={heightIn}
              onChange={(event) => setHeightIn(event.target.value)}
              placeholder="e.g. 9"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="bmi-weight-lb">Weight (lb)</label>
            <input
              id="bmi-weight-lb"
              type="text"
              inputMode="decimal"
              value={weightLb}
              onChange={(event) => setWeightLb(event.target.value)}
              placeholder="e.g. 160"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {validation.error && <p className="field-error">{validation.error}</p>}

      {bmi === null ? (
        <p className="field-hint">Enter your height and weight above to see your BMI.</p>
      ) : (
        <div className="unit-result" aria-live="polite">
          <p className="unit-result-value">
            {formatBMI(bmi)} <span className={`bmi-badge bmi-badge-${category.id}`}>{category.label}</span>
          </p>
          <p className="field-hint">
            Healthy weight range for your height: {formatWeightValue(healthyRange.min)}-
            {formatWeightValue(healthyRange.max)} {weightUnitLabel}
          </p>

          <div
            className="bmi-scale"
            role="img"
            aria-label={`BMI scale from ${SCALE_MIN_BMI} to ${SCALE_MAX_BMI}, your BMI of ${formatBMI(bmi)} falls in the ${category.label} range`}
          >
            <div className="bmi-scale-bar">
              {SCALE_SECTIONS.map((section) => (
                <div
                  key={section.id}
                  className={`bmi-scale-section bmi-scale-section-${section.id}`}
                  style={{ flexBasis: `${((section.to - section.from) / (SCALE_MAX_BMI - SCALE_MIN_BMI)) * 100}%` }}
                >
                  {section.label}
                </div>
              ))}
              <div className="bmi-scale-indicator" style={{ left: `${indicatorPercent}%` }} />
            </div>
          </div>
        </div>
      )}

      <p className="field-warning">
        BMI is a screening tool and does not diagnose body fatness or overall health. Consult a
        healthcare professional for medical advice.
      </p>

      <article className="tool-article">
        <p>
          Whether you're tracking your own health trends or just curious what your numbers mean,
          this calculator computes your Body Mass Index instantly in your browser - switch between
          metric and imperial units any time, and see your category and a healthy weight range for
          your height update live as you type.
        </p>

        <h2>What is BMI?</h2>
        <p>
          Body Mass Index (BMI) is a simple screening measure calculated from height and weight:{' '}
          <code>weight (kg) ÷ height (m)²</code>. It's widely used because it only needs two easy
          measurements, but it's a population-level screening tool, not a diagnosis - it doesn't
          distinguish muscle from fat, and a very muscular person can show a "high" BMI despite low
          body fat.
        </p>

        <h2>BMI categories explained</h2>
        <ul>
          <li><strong>Underweight</strong> - BMI below 18.5.</li>
          <li><strong>Normal weight</strong> - BMI 18.5 to 24.9.</li>
          <li><strong>Overweight</strong> - BMI 25 to 29.9.</li>
          <li><strong>Obesity Class I</strong> - BMI 30 to 34.9.</li>
          <li><strong>Obesity Class II</strong> - BMI 35 to 39.9.</li>
          <li><strong>Obesity Class III</strong> - BMI 40 and above.</li>
        </ul>
        <p>These thresholds follow the World Health Organization's standard BMI classification.</p>

        <h2>Metric vs. imperial BMI</h2>
        <p>
          The underlying formula is identical either way - imperial measurements are simply
          converted to metric (inches to centimeters, pounds to kilograms) before the same
          calculation runs, so switching units never changes the result for the same physical
          height and weight, only how you enter them.
        </p>

        <h2>Limitations of BMI</h2>
        <ul>
          <li>It doesn't distinguish muscle mass from fat mass - athletes often score "overweight" or higher despite low body fat.</li>
          <li>It doesn't account for where fat is distributed, which matters more for some health risks than total body fat alone.</li>
          <li>The same thresholds are applied to all adults regardless of age, sex, or ethnicity, even though healthy ranges can genuinely vary across those groups.</li>
          <li>It's a screening tool, not a diagnosis - a healthcare professional considers many other factors before drawing any health conclusion.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Is BMI accurate for everyone?</h3>
          <p>
            No - it's a useful population-level screening number, but it can be misleading for very
            muscular people, older adults, pregnant women, and children (who use different,
            age-specific charts entirely). It's a starting point, not a verdict.
          </p>
        </div>
        <div className="faq-item">
          <h3>What's a "healthy" BMI?</h3>
          <p>
            The WHO defines 18.5-24.9 as "Normal weight" for adults - this calculator's healthy
            weight range shows exactly what weight range that translates to for your entered
            height.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why do I need a healthcare professional if I can calculate this myself?</h3>
          <p>
            BMI alone can't measure body composition, distribution of fat, or overall health -
            a professional can combine it with other measurements and your medical history to give
            advice that's actually specific to you.
          </p>
        </div>
        <div className="faq-item">
          <h3>Does this calculator work for children?</h3>
          <p>
            No - children and teens are assessed against age- and sex-specific growth charts, not
            the fixed adult thresholds used here. This tool is intended for adults.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my height and weight data uploaded anywhere?</h3>
          <p>No - every calculation happens locally in your browser; nothing is ever sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Try the <Link to="/tool/unit-converter">Unit Converter</Link>, or browse the rest of the{' '}
          <Link to="/category/everyday">Everyday tools</Link> on Rootconverter.
        </p>
      </article>
    </div>
  );
}
