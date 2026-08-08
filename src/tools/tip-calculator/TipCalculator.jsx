import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning.js';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard.jsx';
import {
  TIP_PRESETS,
  SERVICE_PRESETS,
  CURRENCY_OPTIONS,
  ROUNDING_OPTIONS,
  MAX_PEOPLE,
  createInitialPeople,
  addPerson,
  removePerson,
  updatePersonName,
  updatePersonSubtotal,
  validatePersonSubtotal,
  getAssignedTotal,
  validateAssignment,
  formatCurrency,
  validateInputs,
  calculateSnapshot,
  buildSummaryText,
  buildPerPersonText,
  exportReceipt,
  saveCalculation,
} from './tipUtils.js';

const INITIAL_PEOPLE_COUNT = '1';

function isPristineCustomPeople(people) {
  return people.length === 2 && people.every((person, i) => person.name === `Person ${i + 1}` && person.subtotal === '');
}

// --- The tool component -------------------------------------------------------
//
// Note: this component only renders its own UI. It does NOT wrap itself in
// <ToolLayout> - the router (see src/pages/ToolPage.jsx) does that
// automatically using the name/description from the registry.
//
// All the actual math, validation, and text formatting lives in
// tipUtils.js - this file is just the UI wired up to it, re-run directly
// in the render body on every change, like the other tools on this site
// (no debouncing).

export default function TipCalculator() {
  const [billAmount, setBillAmount] = useState('');
  const [tipPercent, setTipPercent] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [feesAmount, setFeesAmount] = useState('');
  const [peopleCount, setPeopleCount] = useState(INITIAL_PEOPLE_COUNT);

  const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'custom'
  const [customPeople, setCustomPeople] = useState(() => createInitialPeople(2));

  const [roundingMode, setRoundingMode] = useState('none');
  const [currencyId, setCurrencyId] = useState('usd');
  const [customCurrencySymbol, setCustomCurrencySymbol] = useState('');

  const [recentCalculations, setRecentCalculations] = useState([]);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedPerPerson, setCopiedPerPerson] = useState(false);
  const [receiptBlobUrl, setReceiptBlobUrl] = useState('');

  const currencySymbol =
    currencyId === 'custom' ? customCurrencySymbol.trim() || '$' : CURRENCY_OPTIONS.find((c) => c.id === currencyId).symbol;

  // Re-validates and re-calculates on every change - simple, and matches
  // how the other tools on this site work.
  const validation = validateInputs({ billAmount, tipPercent, peopleCount, taxAmount, feesAmount, splitMode });

  const assignedTotal = getAssignedTotal(customPeople);
  const assignment = validation.ok ? validateAssignment(customPeople, validation.values.billAmount) : null;
  const personErrors = customPeople.map((person) => validatePersonSubtotal(person.subtotal));
  const allPeopleValid = personErrors.every((result) => result.ok);

  // "Prevent final calculations until the bill has been fully assigned" -
  // in Custom Split, nothing downstream gets computed until every row is
  // a valid number AND the rows add up to the bill (within a cent).
  const canCalculate =
    validation.ok && (splitMode === 'equal' || (allPeopleValid && assignment?.isBalanced));

  const snapshot = canCalculate
    ? calculateSnapshot({
        billAmount: validation.values.billAmount,
        tipPercent: validation.values.tipPercent,
        taxAmount: validation.values.taxAmount,
        feesAmount: validation.values.feesAmount,
        peopleCount: splitMode === 'equal' ? validation.values.peopleCount : 0,
        splitMode,
        customPeople,
        roundingMode,
        currencySymbol,
      })
    : null;

  // calculateSnapshot() builds a brand-new object every render even when
  // nothing meaningful changed, so the effect below depends on this
  // STRING instead - two renders with identical inputs produce an
  // identical string (compared by value), which keeps the blob URL from
  // being needlessly recreated on every unrelated re-render.
  const receiptText = snapshot ? exportReceipt(snapshot) : null;

  // Builds a downloadable .txt receipt whenever the receipt content
  // actually changes.
  useEffect(() => {
    if (!receiptText) {
      setReceiptBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      return;
    }
    const url = URL.createObjectURL(new Blob([receiptText], { type: 'text/plain' }));
    setReceiptBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptText]);

  // Records the current calculation into the "recent" list. Only called
  // at deliberate action boundaries (a field losing focus, a preset or
  // mode being picked) rather than on every keystroke, so the list
  // doesn't fill up with near-duplicate entries while typing.
  function recordCalculation() {
    if (!snapshot) return;
    setRecentCalculations((prev) =>
      saveCalculation(prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        inputs: { billAmount, tipPercent, taxAmount, feesAmount, peopleCount, splitMode, roundingMode, currencyId, customCurrencySymbol },
        customPeople,
        summary: `${formatCurrency(snapshot.grandTotal, currencySymbol)} total, ${snapshot.perPerson.length} ${
          snapshot.perPerson.length === 1 ? 'person' : 'people'
        }`,
      }),
    );
  }

  function handleTipPresetClick(percent) {
    setTipPercent(String(percent));
    recordCalculation();
  }

  function handleSplitModeChange(mode) {
    setSplitMode(mode);
    recordCalculation();
  }

  function handleRoundingChange(mode) {
    setRoundingMode(mode);
    recordCalculation();
  }

  function handleCurrencyChange(id) {
    setCurrencyId(id);
    recordCalculation();
  }

  function handleAddPerson() {
    setCustomPeople((prev) => addPerson(prev));
  }

  function handleRemovePerson(personId) {
    setCustomPeople((prev) => removePerson(prev, personId));
  }

  function handleResetSplit() {
    setCustomPeople(createInitialPeople(2));
  }

  function handleRestoreRecent(entry) {
    setBillAmount(entry.inputs.billAmount);
    setTipPercent(entry.inputs.tipPercent);
    setTaxAmount(entry.inputs.taxAmount);
    setFeesAmount(entry.inputs.feesAmount);
    setPeopleCount(entry.inputs.peopleCount);
    setSplitMode(entry.inputs.splitMode);
    setRoundingMode(entry.inputs.roundingMode);
    setCurrencyId(entry.inputs.currencyId);
    setCustomCurrencySymbol(entry.inputs.customCurrencySymbol);
    setCustomPeople(entry.customPeople);
  }

  function handleClear() {
    setBillAmount('');
    setTipPercent('');
    setTaxAmount('');
    setFeesAmount('');
    setPeopleCount(INITIAL_PEOPLE_COUNT);
    setSplitMode('equal');
    setCustomPeople(createInitialPeople(2));
    setRoundingMode('none');
    setCurrencyId('usd');
    setCustomCurrencySymbol('');
  }

  async function handleCopySummary() {
    if (!snapshot) return;
    await navigator.clipboard.writeText(buildSummaryText(snapshot));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 1500);
  }

  async function handleCopyPerPerson() {
    if (!snapshot) return;
    await navigator.clipboard.writeText(buildPerPersonText(snapshot));
    setCopiedPerPerson(true);
    setTimeout(() => setCopiedPerPerson(false), 1500);
  }

  const hasUnsavedWork =
    billAmount.trim() !== '' ||
    tipPercent.trim() !== '' ||
    taxAmount.trim() !== '' ||
    feesAmount.trim() !== '' ||
    peopleCount !== INITIAL_PEOPLE_COUNT ||
    splitMode !== 'equal' ||
    !isPristineCustomPeople(customPeople) ||
    roundingMode !== 'none' ||
    currencyId !== 'usd' ||
    customCurrencySymbol.trim() !== '';
  useUnsavedChangesWarning(hasUnsavedWork);

  return (
    <div className="tip-calculator">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedWork} />

      <div className="converter-toolbar json-toolbar">
        <button type="button" className="ghost-button" onClick={handleCopySummary} disabled={!snapshot}>
          {copiedSummary ? 'Copied!' : 'Copy Summary'}
        </button>
        <button type="button" className="ghost-button" onClick={handleCopyPerPerson} disabled={!snapshot}>
          {copiedPerPerson ? 'Copied!' : 'Copy Per-Person Breakdown'}
        </button>
        <a
          className="ghost-button"
          href={receiptBlobUrl || undefined}
          download={receiptBlobUrl ? 'receipt.txt' : undefined}
          aria-disabled={!receiptBlobUrl}
        >
          Download Receipt
        </a>
        <button type="button" className="ghost-button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="tip-bill">Bill amount</label>
          <input
            id="tip-bill"
            type="text"
            inputMode="decimal"
            value={billAmount}
            onChange={(event) => setBillAmount(event.target.value)}
            onBlur={recordCalculation}
            placeholder="e.g. 84.50"
            autoComplete="off"
          />
          {validation.errors.billAmount && <p className="field-error">{validation.errors.billAmount}</p>}
        </div>

        <div className="field">
          <label htmlFor="tip-tax">Tax (optional)</label>
          <input
            id="tip-tax"
            type="text"
            inputMode="decimal"
            value={taxAmount}
            onChange={(event) => setTaxAmount(event.target.value)}
            onBlur={recordCalculation}
            placeholder="e.g. 6.80"
            autoComplete="off"
          />
          {validation.errors.taxAmount && <p className="field-error">{validation.errors.taxAmount}</p>}
        </div>

        <div className="field">
          <label htmlFor="tip-fees">Additional fees (optional)</label>
          <input
            id="tip-fees"
            type="text"
            inputMode="decimal"
            value={feesAmount}
            onChange={(event) => setFeesAmount(event.target.value)}
            onBlur={recordCalculation}
            placeholder="e.g. 2.00"
            autoComplete="off"
          />
          {validation.errors.feesAmount && <p className="field-error">{validation.errors.feesAmount}</p>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="tip-percent">Tip percentage</label>
        <input
          id="tip-percent"
          type="text"
          inputMode="decimal"
          value={tipPercent}
          onChange={(event) => setTipPercent(event.target.value)}
          onBlur={recordCalculation}
          placeholder="e.g. 18"
        />
        {validation.errors.tipPercent && <p className="field-error">{validation.errors.tipPercent}</p>}
        <div className="mode-toggle">
          {TIP_PRESETS.map((percent) => (
            <button
              key={percent}
              type="button"
              className={tipPercent === String(percent) ? 'mode-button active' : 'mode-button'}
              onClick={() => handleTipPresetClick(percent)}
            >
              {percent}%
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Or pick by service quality</label>
        </div>
        <div className="mode-toggle">
          {SERVICE_PRESETS.map((service) => (
            <button
              key={service.label}
              type="button"
              className={tipPercent === String(service.percent) ? 'mode-button active' : 'mode-button'}
              onClick={() => handleTipPresetClick(service.percent)}
            >
              {service.label} ({service.percent}%)
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-header">
          <label>Split mode</label>
        </div>
        <div className="mode-toggle" aria-label="Split mode">
          <button
            type="button"
            aria-pressed={splitMode === 'equal'}
            className={splitMode === 'equal' ? 'mode-button active' : 'mode-button'}
            onClick={() => handleSplitModeChange('equal')}
          >
            Equal Split
          </button>
          <button
            type="button"
            aria-pressed={splitMode === 'custom'}
            className={splitMode === 'custom' ? 'mode-button active' : 'mode-button'}
            onClick={() => handleSplitModeChange('custom')}
          >
            Custom Split
          </button>
        </div>
      </div>

      {splitMode === 'equal' ? (
        <div className="field">
          <label htmlFor="tip-people">Number of people</label>
          <input
            id="tip-people"
            type="text"
            inputMode="numeric"
            value={peopleCount}
            onChange={(event) => setPeopleCount(event.target.value)}
            onBlur={recordCalculation}
            placeholder="e.g. 4"
          />
          {validation.errors.peopleCount && <p className="field-error">{validation.errors.peopleCount}</p>}
          <p className="field-hint">Between 1 and {MAX_PEOPLE} people.</p>
        </div>
      ) : (
        <div className="field">
          <div className="field-header">
            <label>Who ordered what</label>
            <div className="mode-toggle">
              <button type="button" className="ghost-button" onClick={handleAddPerson} disabled={customPeople.length >= MAX_PEOPLE}>
                Add Person
              </button>
              <button type="button" className="ghost-button" onClick={handleResetSplit}>
                Reset Split
              </button>
            </div>
          </div>

          <div className="tip-people-table-wrap">
            <table className="tip-people-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Subtotal</th>
                  <th scope="col">Tip share</th>
                  <th scope="col">Tax share</th>
                  <th scope="col">Fees share</th>
                  <th scope="col">Total</th>
                  <th scope="col">
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customPeople.map((person, index) => {
                  const rowError = personErrors[index];
                  const personSnapshot = snapshot?.perPerson.find((p) => p.id === person.id);
                  return (
                    <tr key={person.id}>
                      <td>
                        <input
                          type="text"
                          value={person.name}
                          onChange={(event) => setCustomPeople((prev) => updatePersonName(prev, person.id, event.target.value))}
                          onBlur={recordCalculation}
                          aria-label={`Name for row ${index + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={person.subtotal}
                          onChange={(event) =>
                            setCustomPeople((prev) => updatePersonSubtotal(prev, person.id, event.target.value))
                          }
                          onBlur={recordCalculation}
                          placeholder="0.00"
                          aria-label={`Subtotal for ${person.name || `row ${index + 1}`}`}
                        />
                        {!rowError.ok && person.subtotal !== '' && <p className="field-error">{rowError.error}</p>}
                      </td>
                      <td>{personSnapshot ? formatCurrency(personSnapshot.tipShare, currencySymbol) : '—'}</td>
                      <td>{personSnapshot ? formatCurrency(personSnapshot.taxShare, currencySymbol) : '—'}</td>
                      <td>{personSnapshot ? formatCurrency(personSnapshot.feesShare, currencySymbol) : '—'}</td>
                      <td className="tip-people-table-total">
                        {personSnapshot ? formatCurrency(personSnapshot.total, currencySymbol) : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleRemovePerson(person.id)}
                          disabled={customPeople.length <= 1}
                          aria-label={`Remove ${person.name || `row ${index + 1}`}`}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {validation.ok && (
            <div className="comparison-panel">
              <h3>Bill assignment</h3>
              <dl className="comparison-meta">
                <div>
                  <dt>Total bill</dt>
                  <dd>{formatCurrency(validation.values.billAmount, currencySymbol)}</dd>
                </div>
                <div>
                  <dt>Assigned total</dt>
                  <dd>{formatCurrency(assignedTotal, currencySymbol)}</dd>
                </div>
                <div>
                  <dt>Remaining difference</dt>
                  <dd className={assignment.isBalanced ? '' : 'limit-exceeded'}>
                    {formatCurrency(Math.abs(assignment.difference), currencySymbol)}
                  </dd>
                </div>
              </dl>
              {!assignment.isBalanced && (
                <p className="field-error">
                  {assignment.difference > 0
                    ? `${formatCurrency(assignment.difference, currencySymbol)} of the bill hasn't been assigned to anyone yet.`
                    : `The assigned subtotals go ${formatCurrency(Math.abs(assignment.difference), currencySymbol)} over the bill amount.`}{' '}
                  Adjust the amounts above - totals can't be calculated until they add up.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="unit-converter-row">
        <div className="field">
          <label htmlFor="tip-rounding">Rounding</label>
          <select id="tip-rounding" value={roundingMode} onChange={(event) => handleRoundingChange(event.target.value)}>
            {ROUNDING_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="tip-currency">Currency</label>
          <select id="tip-currency" value={currencyId} onChange={(event) => handleCurrencyChange(event.target.value)}>
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {currencyId === 'custom' && (
          <div className="field">
            <label htmlFor="tip-currency-symbol">Custom symbol</label>
            <input
              id="tip-currency-symbol"
              type="text"
              value={customCurrencySymbol}
              onChange={(event) => setCustomCurrencySymbol(event.target.value)}
              onBlur={recordCalculation}
              placeholder="e.g. Fr."
              maxLength={4}
            />
          </div>
        )}
      </div>

      {billAmount.trim() === '' ? (
        <p className="field-hint">Enter a bill amount above to see the calculated totals.</p>
      ) : !snapshot ? (
        <p className="field-hint">
          {splitMode === 'custom'
            ? 'Finish assigning the bill above to see totals.'
            : 'Fix the highlighted fields above to see totals.'}
        </p>
      ) : (
        <div className="unit-result" aria-live="polite">
          <dl className="comparison-meta">
            <div>
              <dt>Bill</dt>
              <dd>{formatCurrency(snapshot.billAmount, currencySymbol)}</dd>
            </div>
            <div>
              <dt>Tip ({snapshot.tipPercent}%)</dt>
              <dd>{formatCurrency(snapshot.tipAmount, currencySymbol)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatCurrency(snapshot.taxAmount, currencySymbol)}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>{formatCurrency(snapshot.feesAmount, currencySymbol)}</dd>
            </div>
          </dl>

          <p className="unit-result-value">
            {formatCurrency(snapshot.grandTotal, currencySymbol)} <span className="unit-result-symbol">grand total</span>
          </p>

          {splitMode === 'equal' && (
            <p className="tip-each-pays">
              Each person pays <strong>{formatCurrency(snapshot.perPerson[0].total, currencySymbol)}</strong>
            </p>
          )}
        </div>
      )}

      {recentCalculations.length > 0 && (
        <div className="field">
          <div className="field-header">
            <label>Recent calculations</label>
          </div>
          <ul className="unit-recent-list">
            {recentCalculations.map((entry) => (
              <li key={entry.id}>
                <button type="button" className="unit-recent-item" onClick={() => handleRestoreRecent(entry)}>
                  <span className="unit-recent-summary">{entry.summary}</span>
                  <span className="unit-recent-meta">{entry.inputs.splitMode === 'equal' ? 'Equal split' : 'Custom split'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="tool-article">
        <p>
          Whether you're splitting a dinner check with friends, dividing a group order where
          everyone ordered something different, or just double-checking a 20% tip in your head,
          this calculator handles it live in your browser - nothing is ever uploaded.
        </p>

        <h2>How to calculate a tip</h2>
        <p>
          A tip is simply a percentage of the bill: multiply the bill subtotal by the tip
          percentage and divide by 100 - a 20% tip on a $50 bill is $50 × 20 ÷ 100 = $10. Whether
          tax should be included in that calculation is a matter of local custom (this calculator
          keeps tax as its own separate line, so you can decide either way by including or
          excluding it from the bill amount you enter).
        </p>

        <h2>How to split restaurant bills fairly</h2>
        <p>
          There are two common approaches. <strong>Equal split</strong> divides everything -
          bill, tip, tax, and fees - into identical shares, the simplest option when everyone
          ordered roughly the same amount. <strong>Custom split</strong> instead has each person
          enter what they personally ordered, then divides the tip, tax, and fees{' '}
          <em>proportionally</em> to how much each person spent - fairer when orders vary a lot,
          since someone who ordered a $12 appetizer shouldn't pay the same tip share as someone
          who ordered a $45 steak.
        </p>

        <h2>Equal vs. proportional bill splitting</h2>
        <p>
          Equal splitting is faster and avoids any debate about who ordered what, but it can feel
          unfair when orders are very different in price. Proportional splitting takes a little
          more entry (everyone's subtotal) but keeps every person's tip/tax/fee share matched to
          what they actually spent - this calculator validates that the entered subtotals add up
          to the full bill before it will calculate a proportional split, catching a forgotten
          item before it skews everyone's total.
        </p>

        <h2>Tip etiquette around the world</h2>
        <p>
          Tipping norms vary widely: in the United States, 15-20% is standard at sit-down
          restaurants and often expected. In much of Europe, a service charge may already be
          included in the bill, and any extra tip is a smaller, optional gesture. In Japan and
          South Korea, tipping is uncommon and can even be seen as impolite. When traveling, it's
          worth checking local norms rather than assuming your home country's convention applies.
        </p>

        <h2>Common tipping percentages</h2>
        <ul>
          <li><strong>25%</strong> - exceptional service</li>
          <li><strong>20%</strong> - great service (a common default in the US)</li>
          <li><strong>18%</strong> - good, solid service</li>
          <li><strong>15%</strong> - average, acceptable service</li>
          <li><strong>10%</strong> - poor service (or the norm in regions with lower tipping expectations)</li>
        </ul>

        <h2>Best practices</h2>
        <ul>
          <li>Decide up front whether tax is included in the tip calculation - it changes the result and it's easy to forget which way you did it.</li>
          <li>For group orders, agree on Equal vs. Custom split BEFORE ordering, since it can change what people choose.</li>
          <li>Use "Round final amount up" when paying in cash and splitting evenly, so nobody owes an awkward fraction of a cent.</li>
          <li>Double-check the "Bill assignment" summary in Custom Split before finalizing - a single missed item throws off everyone's share.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="faq-item">
          <h3>Should I tip on the pre-tax or post-tax amount?</h3>
          <p>
            Both are common in practice. This calculator treats "Bill amount" as whatever base
            you want the tip calculated on, and tax as a separate line added afterward - enter tax
            in the bill amount instead if you'd rather tip on the post-tax total.
          </p>
        </div>
        <div className="faq-item">
          <h3>Why won't Custom Split show a result?</h3>
          <p>
            The subtotals you enter for each person need to add up to the full bill amount first
            (within a cent, to allow for rounding) - check the "Bill assignment" panel to see
            exactly how much is unassigned or over-assigned.
          </p>
        </div>
        <div className="faq-item">
          <h3>What does each rounding option actually round?</h3>
          <p>
            "Round tip" rounds only the tip amount before it's added to the total. "Round final
            amount" instead rounds the grand total AND each person's individual share - useful
            when you want to avoid anyone owing an odd fraction of a cent.
          </p>
        </div>
        <div className="faq-item">
          <h3>Can I use a currency other than the ones listed?</h3>
          <p>
            Yes - choose "Custom symbol" from the currency dropdown and type any symbol or
            abbreviation you like. This only changes how numbers are displayed; no actual
            currency conversion happens anywhere in this tool.
          </p>
        </div>
        <div className="faq-item">
          <h3>Is my bill information uploaded anywhere?</h3>
          <p>No - every calculation happens locally in your browser; nothing is sent anywhere.</p>
        </div>

        <h2>Related tools</h2>
        <p>
          Browse the <Link to="/category/business-finance">Business &amp; Finance</Link> category
          on Rootconverter.
        </p>
      </article>
    </div>
  );
}
