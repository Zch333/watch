import { dispatch, refresh, navigateTo } from '../_app-shell.js';

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLOCK_PRESETS = [
    [{ start: 540, end: 720 }, { start: 810, end: 1080 }],
    [{ start: 510, end: 720 }, { start: 780, end: 1050 }],
    [{ start: 540, end: 690 }, { start: 840, end: 1050 }]
];
const RHYTHM_PRESETS = [
    { focus: 25, break: 5 },
    { focus: 50, break: 10 },
    { focus: 45, break: 15 },
    { focus: 30, break: 5 }
];

function fmtMinute(value) {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
}

function blockStrings(preset) {
    return preset.map(function (block) {
        return fmtMinute(block.start) + '–' + fmtMinute(block.end);
    });
}

function matchBlockIndex(blocks, presets) {
    const target = (blocks || []).join('|');
    for (let index = 0; index < presets.length; index += 1) {
        if (blockStrings(presets[index]).join('|') === target) {
            return index;
        }
    }
    return 0;
}

function matchRhythmIndex(focus, brk, presets) {
    for (let index = 0; index < presets.length; index += 1) {
        if (presets[index].focus === focus && presets[index].break === brk) {
            return index;
        }
    }
    return 0;
}

export default {
    data: {
        weekdayOn: [true, true, true, true, true, false, false],
        weekdayClass0: 'on',
        weekdayClass1: 'on',
        weekdayClass2: 'on',
        weekdayClass3: 'on',
        weekdayClass4: 'on',
        weekdayClass5: '',
        weekdayClass6: '',
        blockClass0: 'on',
        blockClass1: '',
        blockClass2: '',
        rhythmClass0: '',
        rhythmClass1: 'on',
        rhythmClass2: '',
        rhythmClass3: '',
        selectedBlock: 0,
        selectedRhythm: 1,
        enabledFlag: false
    },
    onShow() {
        this.restoreFromModel();
    },

    /**
     * Restore the whole editor from the current settings summary so opening
     * the page and saving without touching anything never changes the plan
     * (previously only enabledFlag was restored and the default rhythm was 50/10).
     */
    restoreFromModel() {
        const model = refresh();
        const summary = model.settingsSummary || {};
        const weekdays = summary.weekdays || [];

        const on = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            on.push(weekdays.indexOf(WEEKDAY_NAMES[index]) >= 0);
        }
        this.weekdayOn = on;
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            this['weekdayClass' + index] = on[index] ? 'on' : '';
        }

        const blockIndex = matchBlockIndex(summary.blocks, BLOCK_PRESETS);
        const rhythmIndex = matchRhythmIndex(summary.focusMinutes, summary.breakMinutes, RHYTHM_PRESETS);
        this.selectedBlock = blockIndex;
        this.selectedRhythm = rhythmIndex;
        for (let index = 0; index < BLOCK_PRESETS.length; index += 1) {
            this['blockClass' + index] = index === blockIndex ? 'on' : '';
        }
        for (let index = 0; index < RHYTHM_PRESETS.length; index += 1) {
            this['rhythmClass' + index] = index === rhythmIndex ? 'on' : '';
        }

        this.enabledFlag = model.planStatus === 'Enabled' || model.planStatus === 'Paused';
    },

    onWeekdayTap(index) {
        const on = !this.weekdayOn[index];
        this.weekdayOn[index] = on;
        this['weekdayClass' + index] = on ? 'on' : '';
    },
    onBlockTap(index) {
        this.selectedBlock = index;
        for (let current = 0; current < BLOCK_PRESETS.length; current += 1) {
            this['blockClass' + current] = current === index ? 'on' : '';
        }
    },
    onRhythmTap(index) {
        this.selectedRhythm = index;
        for (let current = 0; current < RHYTHM_PRESETS.length; current += 1) {
            this['rhythmClass' + current] = current === index ? 'on' : '';
        }
    },
    onSave() {
        const weekdays = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            if (this.weekdayOn[index]) {
                weekdays.push(WEEKDAY_NAMES[index]);
            }
        }
        const rhythm = RHYTHM_PRESETS[this.selectedRhythm];
        dispatch({
            tag: 'SettingsSaved',
            raw: {
                enabledFlag: this.enabledFlag,
                weekdays: weekdays,
                workBlocks: BLOCK_PRESETS[this.selectedBlock],
                focusMinutes: rhythm.focus,
                breakMinutes: rhythm.break
            }
        });
        navigateTo('home');
    }
};
