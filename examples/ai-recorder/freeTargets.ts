import type { InnoSageServiceId } from './ServiceConfig';

type Inputs = Partial<Record<InnoSageServiceId, string>>;

/** A bundled allowlist alone does not activate a service. Each environment opts in separately. */
export function freeTargets(
  approved: Record<InnoSageServiceId, string>,
  inputs: Inputs,
  productionEligible: boolean,
): Inputs {
  const exact = (service: InnoSageServiceId) =>
    inputs[service]?.replace(/\/$/, '') === approved[service] ? approved[service] : undefined;
  return { staging: exact('staging'), production: productionEligible ? exact('production') : undefined };
}
