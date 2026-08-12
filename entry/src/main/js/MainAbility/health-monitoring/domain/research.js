import { err, ok } from './model.js';

export function evaluateResearchGate(request) {
    const input = request || {};
    const missing = [];
    if (input.researchConsent !== true) { missing.push('RESEARCH_CONSENT'); }
    if (!input.capability || input.capability.tag !== 'Available') { missing.push('DEVICE_CAPABILITY'); }
    if (!input.algorithmCard || input.algorithmCard.status !== 'Validated') { missing.push('ALGORITHM_CARD'); }
    if (!input.datasetCard || input.datasetCard.status !== 'Approved') { missing.push('DATASET_CARD'); }
    if (!input.license || input.license.compatible !== true) { missing.push('LICENSE_REVIEW'); }
    if (!input.powerBudget || input.powerBudget.approved !== true) { missing.push('POWER_BUDGET'); }
    if (!input.environment || input.environment !== 'isolated_research') { missing.push('RESEARCH_ISOLATION'); }
    return missing.length > 0
        ? err('RESEARCH_GATE_BLOCKED', Object.freeze(missing))
        : ok(Object.freeze({ tag: 'ResearchApproved', productionAdviceAllowed: false }));
}

export function evaluateProductReleaseGate(request) {
    const input = request || {};
    const gates = [
        'deviceEvidence', 'formalScopes', 'qualityValidation', 'algorithmCard',
        'licenseAndSbom', 'privacyAssessment', 'powerBudget', 'deletionVerified',
        'exportVerified', 'claimReview'
    ];
    const missing = gates.filter(function (gate) { return input[gate] !== true; });
    return missing.length > 0
        ? err('PRODUCT_RELEASE_BLOCKED', Object.freeze(missing))
        : ok(Object.freeze({ tag: 'ReleaseGatePassed' }));
}
