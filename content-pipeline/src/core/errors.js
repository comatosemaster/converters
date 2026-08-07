// -----------------------------------------------------------------------
// TYPED ERRORS
//
// The class of a failure decides the response, so the class has to be
// part of the error rather than something a caller infers from a message
// string. A rate limit should be retried; a schema violation should not
// (retrying deterministic malformed output just buys the same output
// again, at full price).
//
// `retryable` is the single flag the retry layer reads.
// -----------------------------------------------------------------------

export class PipelineError extends Error {
  constructor(message, { code = 'PIPELINE_ERROR', retryable = false, details = {} } = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

/** The network flaked: 429, 5xx, timeout. Safe to retry with backoff. */
export class TransientError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'TRANSIENT', retryable: true, details });
  }
}

/** A model returned something unparseable or schema-violating. Repair, then retry once. */
export class OutputFormatError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'OUTPUT_FORMAT', retryable: false, details });
  }
}

/** An artifact failed its schema on write. This is a bug in a step, not bad luck. */
export class ValidationError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'VALIDATION', retryable: false, details });
  }
}

/** A step ran in an illegal state, or a required input is missing. Always a bug - fail loudly. */
export class ContractError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'CONTRACT', retryable: false, details });
  }
}

/** A cost or rate cap was hit. Halt, don't retry - retrying is exactly what the cap forbids. */
export class BudgetError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'BUDGET', retryable: false, details });
  }
}

/** git, gh, or the site build failed. Not our bug; state is preserved and the step is safe to re-run. */
export class ExternalError extends PipelineError {
  constructor(message, details) {
    super(message, { code: 'EXTERNAL', retryable: false, details });
  }
}
