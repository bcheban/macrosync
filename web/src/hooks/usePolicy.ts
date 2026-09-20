import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Policy, Strategy } from '@/types/domain';
import { BUCKET_IDS, type Bucket } from '@/lib/confidence';

/**
 * What this deployment publishes, for interfaces that must not offer more.
 *
 * Scalping is switched off and two confidence bands are blocked, and both are
 * environment variables rather than constants — so the site asks instead of
 * assuming. Hard-coding either here would be a second copy of the rule, and
 * the copy would be wrong the moment somebody turned scalping back on.
 *
 * Falls back to showing everything. A failed fetch should leave the interface
 * offering more than the engine serves, never less: an empty tab explains
 * itself, a missing one just looks broken.
 */
export function usePolicy(): { strategies: Strategy[]; bands: Bucket[] } {
  const [policy, setPolicy] = useState<Policy | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    api
      .activeSignals(controller.signal)
      .then((response) => setPolicy(response.policy ?? null))
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  const bands = policy?.confidenceBands?.length
    ? BUCKET_IDS.filter((bucket) => policy.confidenceBands.includes(bucket))
    : BUCKET_IDS;

  return {
    strategies: policy?.strategies?.length ? policy.strategies : ['scalping', 'day', 'swing'],
    bands: [...bands],
  };
}
