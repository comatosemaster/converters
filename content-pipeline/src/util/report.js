// -----------------------------------------------------------------------
// TERMINAL OUTPUT
//
// Findings are only useful if they're read, so they're formatted for
// scanning: grouped by gate, errors before warnings, with the actionable
// fix hint attached rather than buried in a JSON file the operator has to
// go looking for.
//
// Colour degrades to plain text when not attached to a TTY (or when
// NO_COLOR is set), so piping to a file or a CI log stays readable.
// -----------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code) => (text) => (useColor ? `[${code}m${text}[0m` : text);

export const color = {
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  gray: paint('90'),
  bold: paint('1'),
};

const SEVERITY = {
  error: { icon: '✗', paint: color.red },
  warn: { icon: '!', paint: color.yellow },
  info: { icon: 'i', paint: color.gray },
};

export function printVerdicts(verdicts, { showInfo = false } = {}) {
  for (const verdict of verdicts) {
    const findings = verdict.findings.filter((finding) => showInfo || finding.severity !== 'info');
    const errors = verdict.findings.filter((finding) => finding.severity === 'error').length;
    const warnings = verdict.findings.filter((finding) => finding.severity === 'warn').length;

    const badge =
      verdict.verdict === 'pass'
        ? color.green('pass')
        : verdict.verdict === 'reject'
          ? color.red('reject')
          : color.yellow('revise');

    const counts = [];
    if (errors) counts.push(color.red(`${errors} error${errors === 1 ? '' : 's'}`));
    if (warnings) counts.push(color.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));

    console.log(`\n  ${color.bold(verdict.gate)}  ${badge}${counts.length ? `  ${counts.join(', ')}` : ''}`);

    for (const finding of findings) {
      const style = SEVERITY[finding.severity] ?? SEVERITY.info;
      const where = finding.location?.field
        ? color.gray(` (${finding.location.field})`)
        : finding.location?.heading
          ? color.gray(` (under "${finding.location.heading}")`)
          : '';
      console.log(`    ${style.paint(style.icon)} ${finding.message}${where}`);
      if (finding.fixHint) console.log(`      ${color.gray(`→ ${finding.fixHint}`)}`);
    }
  }
}

export function printOutcome(outcome) {
  const line =
    outcome === 'pass'
      ? color.green('\n✓ All gates passed.')
      : outcome === 'reject'
        ? color.red('\n✗ Rejected — this article should not be published as-is.')
        : color.yellow('\n! Needs revision before publishing.');
  console.log(line);
}

export function printJobSummary(job) {
  const stateColor =
    job.state === 'published'
      ? color.green
      : job.state === 'quarantined'
        ? color.red
        : job.state === 'staged'
          ? color.blue
          : color.gray;

  console.log(
    `  ${color.bold(job.id.padEnd(44))} ${stateColor(job.state.padEnd(12))} ${color.gray(job.title ?? job.slug ?? '')}`,
  );
}
