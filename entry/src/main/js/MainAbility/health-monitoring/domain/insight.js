import { err, ok, WELLNESS_DISCLAIMER } from './model.js';

const PROHIBITED_CLAIMS = Object.freeze([
    '确诊', '诊断为', '治愈', '停止用药', '增加剂量', '减少剂量',
    'definitive diagnosis', 'stop medication', 'change dose'
]);

function confidenceFor(metrics, deviations) {
    const items = metrics || [];
    if (items.length === 0) {
        return 'low';
    }
    let good = 0;
    for (let index = 0; index < items.length; index += 1) {
        if (items[index].quality && items[index].quality.tag === 'Good') {
            good += 1;
        }
    }
    const persistence = (deviations || []).filter(function (item) { return item.unusual; }).length;
    if (good === items.length && items.length >= 3 && persistence > 0) {
        return 'high';
    }
    return good > 0 ? 'medium' : 'low';
}

export function composeInsight(input) {
    const source = input || {};
    const metrics = (source.metrics || []).filter(function (item) {
        return item.quality && item.quality.tag !== 'Rejected';
    });
    if (metrics.length === 0) {
        return err('NO_QUALIFIED_METRICS');
    }
    const facts = metrics.map(function (metric) {
        return Object.freeze({
            id: metric.id,
            metricId: metric.metricId,
            value: metric.value,
            unit: metric.unit,
            source: metric.provenance.source,
            quality: metric.quality.tag
        });
    });
    const deviations = Object.freeze((source.deviations || []).slice());
    const limitations = [WELLNESS_DISCLAIMER];
    if (metrics.some(function (item) { return item.quality.tag === 'Degraded'; })) {
        limitations.push('部分输入质量降级，结论仅供趋势参考。');
    }
    return ok(Object.freeze({
        tag: 'Insight',
        id: source.id || facts.map(function (fact) { return fact.id; }).join('::'),
        facts: Object.freeze(facts),
        trends: Object.freeze((source.trends || []).slice()),
        deviations: deviations,
        possibleExplanations: Object.freeze((source.possibleExplanations || [
            '睡眠、近期运动、压力、环境与测量条件都可能造成短期变化。'
        ]).slice()),
        actions: Object.freeze((source.actions || [
            Object.freeze({ id: 'repeat_consistently', text: '在相似条件下持续观察，不依据单次读数下结论。' })
        ]).slice()),
        redFlags: Object.freeze((source.redFlags || []).slice()),
        limitations: Object.freeze(limitations),
        confidence: confidenceFor(metrics, deviations),
        correlationIsNotCausation: true
    }));
}

export function deterministicRedFlags(userReport) {
    const report = userReport || {};
    const flags = [];
    if (report.chestPain === true || report.severeBreathingDifficulty === true ||
        report.lossOfConsciousness === true) {
        flags.push(Object.freeze({
            id: 'urgent_symptoms',
            message: '如症状严重或持续，请立即联系当地急救服务。手表读数正常也不能排除急症。'
        }));
    }
    return Object.freeze(flags);
}

export function buildAiEnvelope(insight, consent, context) {
    if (!consent || consent.aiExplanation !== true) {
        return err('AI_CONSENT_REQUIRED');
    }
    if (!insight || insight.tag !== 'Insight') {
        return err('VALIDATED_INSIGHT_REQUIRED');
    }
    const input = context || {};
    const minimizedFacts = Object.freeze(insight.facts.map(function (fact, index) {
        return Object.freeze({
            id: 'fact-' + String(index + 1),
            metricId: fact.metricId,
            value: fact.value,
            unit: fact.unit,
            quality: fact.quality
        });
    }));
    return ok(Object.freeze({
        schemaVersion: 1,
        purpose: 'wellness_explanation',
        locale: input.locale || 'zh-CN',
        insightId: insight.id,
        facts: minimizedFacts,
        trends: insight.trends,
        deviations: insight.deviations,
        dataQuality: Object.freeze({
            confidence: insight.confidence,
            limitations: insight.limitations
        }),
        redFlags: insight.redFlags,
        allowedActions: insight.actions,
        subjectContext: Object.freeze({ goals: Object.freeze((input.goals || []).slice()) })
    }));
}

function containsProhibitedClaim(value) {
    const text = JSON.stringify(value || {}).toLowerCase();
    for (let index = 0; index < PROHIBITED_CLAIMS.length; index += 1) {
        if (text.indexOf(PROHIBITED_CLAIMS[index].toLowerCase()) >= 0) {
            return PROHIBITED_CLAIMS[index];
        }
    }
    return null;
}

function confidenceRank(value) {
    return { low: 1, medium: 2, high: 3 }[value] || 0;
}

function hasSensitiveIdentity(value) {
    const text = JSON.stringify(value || {});
    return /"(?:name|full_name|email|phone|address|subjectId|deviceId|preciseLocation)"\s*:/i.test(text) ||
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function referencedFacts(refs, factsById) {
    const output = [];
    for (let index = 0; index < refs.length; index += 1) {
        if (!factsById[refs[index]]) { return null; }
        output.push(factsById[refs[index]]);
    }
    return output;
}

function numericTokens(text) {
    const matches = String(text || '').match(/-?\d+(?:\.\d+)?/g) || [];
    return matches.map(function (item) { return Number(item); });
}

function numericStatementMatchesFacts(statement, facts) {
    const numbers = numericTokens(statement);
    if (numbers.length === 0) { return true; }
    const allowed = [];
    (facts || []).forEach(function (fact) {
        if (typeof fact.value === 'number') {
            allowed.push(fact.value);
            allowed.push(Math.round(fact.value * 10) / 10);
            allowed.push(Math.round(fact.value));
        }
    });
    return numbers.every(function (number) {
        return allowed.some(function (candidate) { return Math.abs(candidate - number) < 0.0001; });
    });
}

export function validateAiOutput(output, envelope) {
    const value = output || {};
    const requiredArrays = ['observations', 'trends', 'actions', 'red_flags', 'limitations'];
    for (let index = 0; index < requiredArrays.length; index += 1) {
        if (!Array.isArray(value[requiredArrays[index]])) {
            return err('AI_SCHEMA_INVALID', requiredArrays[index]);
        }
    }
    const prohibited = containsProhibitedClaim(value);
    if (prohibited) {
        return err('AI_MEDICAL_CLAIM_REJECTED', prohibited);
    }
    if (hasSensitiveIdentity(value)) {
        return err('AI_IDENTITY_DATA_REJECTED');
    }
    if (['low', 'medium', 'high'].indexOf(value.overall_confidence) < 0) {
        return err('AI_CONFIDENCE_INVALID');
    }
    if (confidenceRank(value.overall_confidence) >
        confidenceRank(envelope && envelope.dataQuality && envelope.dataQuality.confidence)) {
        return err('AI_CONFIDENCE_EXCEEDS_INPUT');
    }
    const factIds = {};
    const factsById = {};
    const metricIds = {};
    const facts = envelope && envelope.facts ? envelope.facts : [];
    for (let index = 0; index < facts.length; index += 1) {
        factIds[facts[index].id] = true;
        factsById[facts[index].id] = facts[index];
        metricIds[facts[index].metricId] = true;
    }
    for (let index = 0; index < value.observations.length; index += 1) {
        const refs = value.observations[index].fact_ids || [];
        const referenced = referencedFacts(refs, factsById);
        if (!referenced) {
            return err('AI_UNKNOWN_FACT_REFERENCE');
        }
        if (!numericStatementMatchesFacts(value.observations[index].statement, referenced)) {
            return err('AI_NUMERIC_FACT_CONFLICT');
        }
    }
    const allowedActions = envelope && envelope.allowedActions ? envelope.allowedActions : [];
    const allowedActionTexts = allowedActions.map(function (item) { return item.text || item.action || item.id; });
    for (let index = 0; index < value.actions.length; index += 1) {
        const action = value.actions[index].action;
        if (allowedActionTexts.indexOf(action) < 0) {
            return err('AI_ACTION_NOT_ALLOWED', action);
        }
    }
    for (let index = 0; index < value.trends.length; index += 1) {
        const refs = value.trends[index].metric_ids || [];
        for (let refIndex = 0; refIndex < refs.length; refIndex += 1) {
            if (!metricIds[refs[refIndex]]) {
                return err('AI_UNKNOWN_METRIC_REFERENCE', refs[refIndex]);
            }
        }
    }
    const requiredFlags = envelope && envelope.redFlags ? envelope.redFlags : [];
    const outputFlags = value.red_flags.map(function (item) { return item.source_rule_id; });
    for (let index = 0; index < requiredFlags.length; index += 1) {
        if (outputFlags.indexOf(requiredFlags[index].id) < 0) {
            return err('AI_RED_FLAG_OMITTED', requiredFlags[index].id);
        }
    }
    return ok(Object.freeze(value));
}

export function deterministicReport(insight) {
    const item = insight || {};
    return Object.freeze({
        summaryTitle: '健康趋势摘要',
        confidence: item.confidence || 'low',
        observations: Object.freeze((item.facts || []).map(function (fact) {
            return fact.metricId + '：' + String(fact.value) + ' ' + fact.unit;
        })),
        actions: Object.freeze((item.actions || []).map(function (action) { return action.text; })),
        redFlags: Object.freeze((item.redFlags || []).map(function (flag) { return flag.message; })),
        limitations: Object.freeze((item.limitations || [WELLNESS_DISCLAIMER]).slice()),
        generatedBy: 'deterministic-template/1.0.0'
    });
}
