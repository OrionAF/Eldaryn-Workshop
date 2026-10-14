// Engine input boundary (plan I9): a value the engine is about to read is a finite number, or the call
// throws an EngineInputError that names the entity and the key. Nothing downstream returns NaN.

/** Thrown when an engine entry point is handed an input it cannot simulate. */
export class EngineInputError extends Error {
  /**
   * @param {string} message
   * @param {{kind?: string, key?: string, value?: unknown}} [detail]
   */
  constructor(message, { kind, key, value } = {}) {
    super(message);
    this.name = 'EngineInputError';
    this.kind = kind ?? null;
    this.key = key ?? null;
    this.value = value;
  }
}

const show = (v) => (typeof v === 'string' ? `'${v}'` : String(v));

/**
 * Every `keys` entry of `obj` is a finite number.
 * @param {string} kind  what `obj` is, for the message ('player', 'mob 2', ...)
 * @param {Object} obj
 * @param {string[]} keys
 */
export function assertFiniteEntity(kind, obj, keys) {
  if (obj == null || typeof obj !== 'object') throw new EngineInputError(`${kind} is missing`, { kind });
  for (const key of keys) {
    const v = obj[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new EngineInputError(`${kind}.${key} is ${show(v)}; expected a finite number`, { kind, key, value: v });
    }
  }
}

/**
 * Every `keys` entry of `obj` is a finite number above 0.
 * @param {string} kind @param {Object} obj @param {string[]} keys
 */
export function assertPositive(kind, obj, keys) {
  assertFiniteEntity(kind, obj, keys);
  for (const key of keys) {
    if (!(obj[key] > 0)) {
      throw new EngineInputError(`${kind}.${key} is ${obj[key]}; expected a number above 0`, { kind, key, value: obj[key] });
    }
  }
}
