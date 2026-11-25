// Internal shared policy; copied verbatim into packages by sync-admission-policy.mjs.
// Legacy results without freshness remain supported, without a freshness guarantee.
export function permitsEffect(result, { maxStalenessMs, consistency } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      !Object.hasOwn(result, 'authority') || !Object.hasOwn(result, 'decision') ||
      result.authority !== 'VALID' || result.decision !== 'ALLOW') return false;
  if (result.consistency !== undefined &&
      (!['bounded', 'strict'].includes(result.consistency) ||
       (consistency && result.consistency !== consistency))) return false;
  if (result.receipt && ['authority', 'decision'].some(key =>
      result.receipt[key] !== undefined && result.receipt[key] !== result[key])) return false;
  const f = result.freshness;
  if (f === undefined) return true;
  if (!f || typeof f !== 'object' || Array.isArray(f) || f.fresh !== true) return false;
  const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  if (f.leaseRemainingMs !== undefined && f.leaseRemainingMs !== null &&
      (!nonNegative(f.leaseRemainingMs) || f.leaseRemainingMs === 0)) return false;
  if (f.ageMs !== undefined && f.ageMs !== null && !nonNegative(f.ageMs)) return false;
  if (nonNegative(f.ageMs) && nonNegative(f.maxStalenessMs) && f.ageMs > f.maxStalenessMs) return false;
  const snapshot = ['snapshotAt', 'snapshotAgeMs', 'effectiveSnapshotLimitMs'].some(key => key in f) || f.source === 'canonical-primary';
  if (!snapshot) return true;
  if (f.source !== 'canonical-primary' || f.isPrimary !== true ||
      !nonNegative(f.snapshotAgeMs) || !nonNegative(f.effectiveSnapshotLimitMs) ||
      f.effectiveSnapshotLimitMs > 5000 || f.snapshotAgeMs > f.effectiveSnapshotLimitMs ||
      (nonNegative(maxStalenessMs) && (f.snapshotAgeMs > maxStalenessMs || f.effectiveSnapshotLimitMs > maxStalenessMs))) return false;
  if (typeof f.snapshotAt !== 'string') return false;
  const m = f.snapshotAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!m) return false;
  const [, y, month, day, hour, minute, second, zone, oh, om] = m;
  const leap = +y % 4 === 0 && (+y % 100 !== 0 || +y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return +month >= 1 && +month <= 12 && +day >= 1 && +day <= days[+month - 1] &&
    +hour < 24 && +minute < 60 && +second < 60 &&
    (zone === 'Z' || (+oh < 24 && +om < 60)) && Number.isFinite(Date.parse(f.snapshotAt));
}
