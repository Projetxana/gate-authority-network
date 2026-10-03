export const pricingSnapshot = {
  asOf: '2026-10-02',
  cloudflareWorkers: {
    includedRequestsPerMonth: 10_000_000,
    usdPerMillionRequests: 0.30,
    includedCpuMsPerMonth: 30_000_000,
    usdPerMillionCpuMs: 0.02,
  },
};

export function estimateCloudflareWorkerCost({checksPerMonth,cpuMsPerCheck=0.5}) {
  const p=pricingSnapshot.cloudflareWorkers;
  const billableRequests=Math.max(0,checksPerMonth-p.includedRequestsPerMonth);
  const requestCost=(billableRequests/1_000_000)*p.usdPerMillionRequests;
  const totalCpuMs=checksPerMonth*cpuMsPerCheck;
  const billableCpuMs=Math.max(0,totalCpuMs-p.includedCpuMsPerMonth);
  const cpuCost=(billableCpuMs/1_000_000)*p.usdPerMillionCpuMs;
  return {
    checksPerMonth,
    cpuMsPerCheck,
    requestCostUsd:+requestCost.toFixed(2),
    cpuCostUsd:+cpuCost.toFixed(2),
    edgeComputeCostUsd:+(requestCost+cpuCost).toFixed(2),
    excludes:['control-plane storage','event ingestion','observability','support','enterprise networking','taxes'],
  };
}

export function revenueScenario({checksPerMonth,usdPerMillion}) {
  const revenue=(checksPerMonth/1_000_000)*usdPerMillion;
  return {usdPerMillion,revenueUsd:+revenue.toFixed(2)};
}
