import { decide } from '../entry/src/main/js/MainAbility/domain/decide.js';
import { enablePlan } from '../entry/src/main/js/MainAbility/domain/commands.js';
import { capabilityObserved } from '../entry/src/main/js/MainAbility/domain/events.js';
import { initialDomainState } from '../entry/src/main/js/MainAbility/domain/model.js';
import { evolveAll } from '../entry/src/main/js/MainAbility/domain/evolve.js';
import { capabilitySupported } from '../entry/src/main/js/MainAbility/domain/state.js';
import { localDate, minuteOfDay } from '../entry/src/main/js/MainAbility/domain/values.js';
import { localToInstant } from '../entry/src/main/js/MainAbility/domain/calendar.js';

// P1-02 递归规则视界探针（Move25 代码审阅报告 v2.2 附录 A.3）
// 场景：默认 Mon–Fri 配置，周三 2026-08-05 启用计划，能力声明 supportsRecurring+supportsCalendar。
// 预期（正确行为）：周重复规则应覆盖配置的完整星期集合 {Mon..Fri}。
// 实测（缺陷）：规则星期并集仅为 {Wed,Thu,Fri} —— 视界外星期提醒永不注册。

const OFFSET = 480;
const d = localDate(2026, 8, 5).value; // 星期三（默认 Mon–Fri 设置）
const facts = {
  now: localToInstant(d, minuteOfDay(600).value, OFFSET).value,
  localWall: { localDate: d, minuteOfDay: minuteOfDay(600).value },
  utcOffsetMinutes: OFFSET,
  registeredPlan: [],
  horizonDays: 3
};
let state = initialDomainState();
const evo = evolveAll(state, [capabilityObserved(capabilitySupported({
  supportsRecurring: true, supportsCalendar: true, maxPendingCount: 30 }))]);
if (evo.tag === 'Err') { console.error('evolveAll failed:', JSON.stringify(evo.error)); process.exit(2); }
state = evo.value;
const decision = decide(state, enablePlan(), facts);
if (decision.tag === 'Err') { console.error('decide failed:', JSON.stringify(decision.error)); process.exit(2); }
const registerEffect = decision.value.effects.find(e => e.tag === 'RegisterReminders');
const weekdays = [...new Set(registerEffect.recurrenceRules.flatMap(r => r.weekdays))];
console.log('recurrenceRules count =', registerEffect.recurrenceRules.length);
console.log('rule weekdays union   =', weekdays.join(','));
console.log('intent dates          =', [...new Set(registerEffect.intents.map(
  i => i.localDate.year + '-' + i.localDate.month + '-' + i.localDate.day))].join(', '));
console.log('configured weekdays   = Mon,Tue,Wed,Thu,Fri');
console.log('missing from rules    =', ['Mon','Tue','Wed','Thu','Fri'].filter(w => !weekdays.includes(w)).join(',') || '(none)');
