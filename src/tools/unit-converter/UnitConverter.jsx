import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  CATEGORIES,
  COMMON_CONVERSIONS,
  getCategoryById,
  getUnitById,
  convertValue,
  formatResult,
  swapUnits,
  validateInput,
  getFormula,
  addRecentConversion,
} from './unitUtils.js';

const PRECISION_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '2', label: '2 decimals' },
  { value: '4', label: '4 decimals' },
  { value: '6', label: '6 decimals' },
];

const INITIAL_CATEGORY_ID = CATEGORIES[0].id; // 'length'
const initialCategory = getCategoryById(INITIAL_CATEGORY_ID);

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual conversion math, validation, and formatting lives in
// unitUtils.js - this file is just the UI wired up to it, re-run
// directly in the render body on every change, like the other tools on
// this site (no debouncing).
//
// This component never hardcodes a unit list or a category name - it
// only ever reads CATEGORIES from unitUtils.js. Adding a 4th category
// there (say, Volume) makes it appear here automatically, tabs and all.

export default function UnitConverter() {
  const [categoryId, setCategoryId] = useState(INITIAL_CATEGORY_ID);
  const [fromUnit, setFromUnit] = useState(initialCategory.defaultFrom);
  const [toUnit, setToUnit] = useState(initialCategory.defaultTo);
  const [amount, setAmount] = useState('');
  const [precision, setPrecision] = useState('auto');
  const [recentConversions, setRecentConversions] = useState([]);
  const [copied, setCopied] = useState(false);

  useDocumentMeta({
    title: 'Unit Converter - Length, Weight & Temperature | Rootconverter',
    description:
      'Convert units instantly between length, weight, and temperature in your browser - live results, adjustable precision, conversion formulas, and a running history. Nothing is uploaded.',
  });

  const category = getCategoryById(categoryId);
  const fromUnitObj = getUnitById(categoryId, fromUnit);
  const toUnitObj = getUnitById(categoryId, toUnit);

  // Re-validates and re-converts on every change - simple, and matches
  // how the other tools on this site work.
  const validation = validateInput(amount, categoryId, fromUnit);
  const convertedValue = validation.ok ? convertValue(categoryId, validation.value, fromUnit, toUnit) : null;
  const formattedResult = convertedValue !== null ? formatResult(convertedValue, precision) : '';
  const formula = getFormula(categoryId, fromUnitObj, toUnitObj);

  // Records a conversion into the "recent" list. Takes optional overrides
  // so callers can record the value THEY'RE about to set, rather than
  // whatever's still in state before React re-renders (setState is
  // async, so reading `fromUnit` etc. right after calling its setter
  // would still see the OLD value).
  function recordConversion(overrides = {}) {
    const nextCategoryId = overrides.categoryId ?? categoryId;
    const nextFromUnit = overrides.fromUnit ?? fromUnit;
    const nextToUnit = overrides.toUnit ?? toUnit;
    const nextPrecision = overrides.precision ?? precision;
    const nextAmount = overrides.amount ?? amount;

    const nextValidation = validateInput(nextAmount, nextCategoryId, nextFromUnit);
    if (!nextValidation.ok) return;

    const nextResult = convertValue(nextCategoryId, nextValidation.value, nextFromUnit, nextToUnit);
    const nextCategory = getCategoryById(nextCategoryId);
    const nextToUnitObj = getUnitById(nextCategoryId, nextToUnit);
    const nextFromUnitObj = getUnitById(nextCategoryId, nextFromUnit);

    setRecentConversions((prev) =>
      addRecentConversion(prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        categoryId: nextCategoryId,
        categoryName: nextCategory.name,
        amount: nextAmount,
        fromUnit: nextFromUnit,
        toUnit: nextToUnit,
        precision: nextPrecision,
        summary: `${nextAmount} ${nextFromUnitObj.symbol} = ${formatResult(nextResult, nextPrecision)} ${nextToUnitObj.symbol}`,
      }),
    );
  }

  function handleCategoryChange(newCategoryId) {
    if (newCategoryId === categoryId) return;
    const newCategory = getCategoryById(newCategoryId);
    setCategoryId(newCategoryId);
    setFromUnit(newCategory.defaultFrom);
    setToUnit(newCategory.defaultTo);
    recordConversion({ categoryId: newCategoryId, fromUnit: newCategory.defaultFrom, toUnit: newCategory.defaultTo });
  }

  function handleFromUnitChange(newFromUnit) {
    setFromUnit(newFromUnit);
    recordConversion({ fromUnit: newFromUnit });
  }

  function handleToUnitChange(newToUnit) {
    setToUnit(newToUnit);
    recordConversion({ toUnit: newToUnit });
  }

  function handleSwap() {
    const { from, to } = swapUnits(fromUnit, toUnit);
    setFromUnit(from);
    setToUnit(to);
    recordConversion({ fromUnit: from, toUnit: to });
  }

  function handlePrecisionChange(newPrecision) {
    setPrecision(newPrecision);
    recordConversion({ precision: newPrecision });
  }

  function handleCommonConversion(common) {
    setFromUnit(common.from);
    setToUnit(common.to);
    recordConversion({ fromUnit: common.from, toUnit: common.to });
  }

  function handleRestoreRecent(entry) {
    setCategoryId(entry.categoryId);
    setFromUnit(entry.fromUnit);
    setToUnit(entry.toUnit);
    setPrecision(entry.precision);
    setAmount(entry.amount);
  }

  function handleClear() {
    setCategoryId(INITIAL_CATEGORY_ID);
    setFromUnit(initialCategory.defaultFrom);
    setToUnit(initialCategory.defaultTo);
    setAmount('');
    setPrecision('auto');
  }

  async function handleCopy() {
    if (!validation.ok) return;
    await navigator.clipboard.writeText(`${formattedResult} ${toUnitObj.symbol}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasUnsavedWork =
    amount.trim() !== '' ||
    categoryId !== INITIAL_CATEGORY_ID ||
    fromUnit !== category.defaultFrom ||
    toUnit !== category.defaultTo ||
    precision !== 'auto';
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="unit-converter">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="field">
        <div className="field-header">
          <label>Category</label>
        </div>
        <div className="mode-toggle" aria-label="Unit category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={cat.id === categoryId}
              className={cat.id === categoryId ? 'mode-button active' : 'mode-button'}
              onClick={() => handleCategoryChange(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="unit-amount">Amount</label>
          <input
            id="unit-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => recordConversion()}
            placeholder="e.g. 100"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="unit-from">From</label>
          <select id="unit-from" value={fromUnit} onChange={(event) => handleFromUnitChange(event.target.value)}>
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </div>

        {/* Wrapped in a .field with the same (hidden) label height as the
            From/To selects beside it, so the button lines up with them
            using the exact same box model instead of hand-tuned margins. */}
        <div className="field unit-swap-field">
          <label htmlFor="unit-swap" aria-hidden="true">
            &nbsp;
          </label>
          <button
            id="unit-swap"
            type="button"
            className="swap-button unit-swap-button"
            onClick={handleSwap}
            aria-label={`Swap ${fromUnitObj?.name ?? 'from'} and ${toUnitObj?.name ?? 'to'}`}
            title="Swap units"
          >
            ⇄
          </button>
        </div>

        <div className="field">
          <label htmlFor="unit-to">To</label>
          <select id="unit-to" value={toUnit} onChange={(event) => handleToUnitChange(event.target.value)}>
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name} ({unit.symbol})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label htmlFor="unit-precision">Precision</label>
        </div>
        <select
          id="unit-precision"
          value={precision}
          onChange={(event) => handlePrecisionChange(event.target.value)}
        >
          {PRECISION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {amount.trim() === '' ? (
        <p className="field-hint">Enter an amount above to see the converted result.</p>
      ) : !validation.ok ? (
        <p className="field-error">{validation.error}</p>
      ) : (
        <div className="unit-result" aria-live="polite">
          <p className="unit-result-value">
            {formattedResult} <span className="unit-result-symbol">{toUnitObj.symbol}</span>
          </p>
          <p className="field-hint">{toUnitObj.name}</p>
          {formula && (
            <p className="unit-result-formula">
              Formula: <code>{formula}</code>
            </p>
          )}
          <div className="mode-toggle">
            <button type="button" className="copy-button" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy result'}
            </button>
            <button type="button" className="ghost-button" onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-header">
          <label>Common conversions</label>
        </div>
        <div className="mode-toggle">
          {COMMON_CONVERSIONS[categoryId].map((common) => (
            <button
              key={`${common.from}-${common.to}`}
              type="button"
              className="mode-button"
              onClick={() => handleCommonConversion(common)}
            >
              {common.label}
            </button>
          ))}
        </div>
      </div>

      {recentConversions.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Recent conversions</label>
          </div>
          <ul className="unit-recent-list">
            {recentConversions.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="unit-recent-item" onClick={() => handleRestoreRecent(entry)}>
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">{entry.categoryName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're following a recipe in the wrong measurement system, converting a weather
          forecast, or double-checking a shipping weight, this tool converts length, weight, and
          temperature live as you type - entirely in your browser, with nothing ever uploaded.
        </p>

        <h2>How unit conversion works</h2>
        <p>
          Most units within a category relate to each other by a simple multiplication factor -
          a meter is always exactly 3.280839895 feet, no matter which two you're converting
          between. This tool converts through a shared "base unit" for each category (meters for
          length, grams for weight) rather than a direct factor between every possible pair, so
          converting inches to miles works by going inches → meters → miles internally, using the
          same two factors that convert any other length.
        </p>

        <h2>Length conversion guide</h2>
        <p>
          Metric length units (millimeter, centimeter, meter, kilometer) scale by powers of ten,
          which is why converting between them is just shifting a decimal point. Imperial and
          nautical units don't share that neat relationship with metric - an inch is defined as
          exactly 2.54 centimeters, a mile as exactly 1,609.344 meters, and a nautical mile (used
          in aviation and maritime navigation) as exactly 1,852 meters, based on one minute of
          latitude rather than any metric or imperial definition at all.
        </p>

        <h2>Weight conversion guide</h2>
        <p>
          Like length, metric weight units (milligram, gram, kilogram, metric ton) scale by
          powers of ten. Imperial weight is a little more irregular: an ounce is exactly
          28.349523125 grams, a pound is exactly 16 ounces (453.59237 grams), and a stone -
          common in the UK and Ireland for body weight - is exactly 14 pounds.
        </p>

        <h2>Temperature conversion guide</h2>
        <p>
          Temperature is the one category here that isn't a simple multiplication, because the
          three scales don't start counting from the same zero point. Celsius sets 0° at water's
          freezing point; Fahrenheit sets 32° there instead; Kelvin - the scientific standard -
          starts at absolute zero, the coldest temperature physically possible, which is
          −273.15°C. Converting between them always needs both a scale factor AND an offset,
          which is why this tool shows the exact formula used for every temperature conversion.
        </p>

        <h2>Common mistakes</h2>
        <ul>
          <li>Forgetting that Fahrenheit and Celsius use different zero points - "half of 100°F" is not 50°C, it's about 10°C.</li>
          <li>Mixing up the metric ton (1,000 kg) with the US "short ton" (907.18 kg) or UK "long ton" (1,016.05 kg) - only the metric ton is included here, since it's the SI-standard one.</li>
          <li>Assuming a nautical mile equals a regular (statute) mile - a nautical mile is about 15% longer.</li>
          <li>Typing a temperature below absolute zero by mistake - this tool catches that and explains why, rather than showing a nonsense result.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Why does my Fahrenheit-to-Celsius result look odd?</h3>
          <p>
            Because the scales don't share a zero point, the formula subtracts 32 BEFORE scaling
            - a common place to go wrong doing it by hand. Check the formula shown under the
            result to see exactly what was calculated.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does "Auto" precision mean?</h3>
          <p>
            Auto rounds to 6 decimal places to avoid floating-point noise, then trims any trailing
            zeros - so a clean result like 100 shows as "100," not "100.000000."
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I enter a negative number?</h3>
          <p>
            For temperature, yes - negative Celsius and Fahrenheit values are common and fully
            supported (down to each scale's own absolute-zero floor). Length and weight don't
            support negative amounts, since a negative distance or mass isn't a real quantity.
          </p>
        </div>
        <div className="faq-item">
          <h3>Where do my recent conversions go when I leave the page?</h3>
          <p>
            They're kept only in this tab's memory for the current session, never saved to disk or
            sent anywhere - reloading the page clears the list.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my data uploaded anywhere?</h3>
          <p>No - every conversion is calculated locally in your browser; nothing is sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the <Link to="/category/everyday">Everyday tools</Link> category on Rootconverter.
        </p>
      </article>
    </div>
  );
}
