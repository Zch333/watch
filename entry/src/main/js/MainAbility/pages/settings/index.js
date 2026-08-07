function runtime() {
    var globalObject = typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof global !== 'undefined' ? global : null);
    if (globalObject && globalObject.__MOVE25_LITE_RUNTIME__) {
        var liteApp = globalObject.__MOVE25_LITE_RUNTIME__;
        if (liteApp && typeof liteApp.start === 'function') {
            liteApp.start();
        }
        return liteApp;
    }
    if (typeof getApp !== 'function') {
        if (globalObject && globalObject.__MOVE25_HOST_RUNTIME__) {
            return globalObject.__MOVE25_HOST_RUNTIME__;
        }
        return null;
    }
    try {
        var app = getApp();
        if (app && app.start) {
            app.start();
        }
        return app;
    } catch (error) {
        return null;
    }
}

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Lite JS has no compound class selectors and no class data binding on
// `text`, so the on/off chip state is bound as inline style colors instead.
const CHIP_ON_BG = '#0a59f7';
const CHIP_ON_FG = '#ffffff';
const CHIP_OFF_BG = '#2a2a2e';
const CHIP_OFF_FG = '#dddddd';
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
    // -1 means the current setting is a custom value: it must not be mapped
    // to the first preset, or an untouched save would silently replace the
    // user's custom schedule with a preset (P1-09).
    return -1;
}

function matchRhythmIndex(focus, brk, presets) {
    for (let index = 0; index < presets.length; index += 1) {
        if (presets[index].focus === focus && presets[index].break === brk) {
            return index;
        }
    }
    return -1;
}

export default {
    data: {
        weekdayOn: [true, true, true, true, true, false, false],
        weekdayBg0: CHIP_ON_BG,
        weekdayFg0: CHIP_ON_FG,
        weekdayBg1: CHIP_ON_BG,
        weekdayFg1: CHIP_ON_FG,
        weekdayBg2: CHIP_ON_BG,
        weekdayFg2: CHIP_ON_FG,
        weekdayBg3: CHIP_ON_BG,
        weekdayFg3: CHIP_ON_FG,
        weekdayBg4: CHIP_ON_BG,
        weekdayFg4: CHIP_ON_FG,
        weekdayBg5: CHIP_OFF_BG,
        weekdayFg5: CHIP_OFF_FG,
        weekdayBg6: CHIP_OFF_BG,
        weekdayFg6: CHIP_OFF_FG,
        blockBg0: CHIP_ON_BG,
        blockFg0: CHIP_ON_FG,
        blockBg1: CHIP_OFF_BG,
        blockFg1: CHIP_OFF_FG,
        blockBg2: CHIP_OFF_BG,
        blockFg2: CHIP_OFF_FG,
        rhythmBg0: CHIP_OFF_BG,
        rhythmFg0: CHIP_OFF_FG,
        rhythmBg1: CHIP_ON_BG,
        rhythmFg1: CHIP_ON_FG,
        rhythmBg2: CHIP_OFF_BG,
        rhythmFg2: CHIP_OFF_FG,
        rhythmBg3: CHIP_OFF_BG,
        rhythmFg3: CHIP_OFF_FG,
        selectedBlock: 0,
        selectedRhythm: 1,
        enabledFlag: false,
        // Custom (non-preset) values read when the page opened. Saving
        // without touching anything must preserve them exactly.
        originalBlocks: [],
        originalFocusMinutes: 25,
        originalBreakMinutes: 5,
        hasError: false,
        errorText: ''
    },
    onInit() {
        this.restoreFromModel();
    },
    onReady() {
        this.restoreFromModel();
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
        const app = runtime();
        if (!app || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        const model = app.refresh();
        const summary = model.settingsSummary || {};
        const weekdays = summary.weekdays || [];

        const on = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            on.push(weekdays.indexOf(WEEKDAY_NAMES[index]) >= 0);
        }
        this.weekdayOn = on;
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            this['weekdayBg' + index] = on[index] ? CHIP_ON_BG : CHIP_OFF_BG;
            this['weekdayFg' + index] = on[index] ? CHIP_ON_FG : CHIP_OFF_FG;
        }

        // Keep the exact current values around for an untouched save.
        this.originalBlocks = (summary.rawBlocks || []).map(function (block) {
            return { start: block.start, end: block.end };
        });
        this.originalFocusMinutes = summary.focusMinutes;
        this.originalBreakMinutes = summary.breakMinutes;

        const blockIndex = matchBlockIndex(summary.blocks, BLOCK_PRESETS);
        const rhythmIndex = matchRhythmIndex(summary.focusMinutes, summary.breakMinutes, RHYTHM_PRESETS);
        this.selectedBlock = blockIndex;
        this.selectedRhythm = rhythmIndex;
        for (let index = 0; index < BLOCK_PRESETS.length; index += 1) {
            this['blockBg' + index] = index === blockIndex ? CHIP_ON_BG : CHIP_OFF_BG;
            this['blockFg' + index] = index === blockIndex ? CHIP_ON_FG : CHIP_OFF_FG;
        }
        for (let index = 0; index < RHYTHM_PRESETS.length; index += 1) {
            this['rhythmBg' + index] = index === rhythmIndex ? CHIP_ON_BG : CHIP_OFF_BG;
            this['rhythmFg' + index] = index === rhythmIndex ? CHIP_ON_FG : CHIP_OFF_FG;
        }

        this.enabledFlag = model.planStatus === 'Enabled' || model.planStatus === 'Paused';
        this.hasError = false;
        this.errorText = '';
    },

    onWeekdayTap(index) {
        const on = !this.weekdayOn[index];
        this.weekdayOn[index] = on;
        this['weekdayBg' + index] = on ? CHIP_ON_BG : CHIP_OFF_BG;
        this['weekdayFg' + index] = on ? CHIP_ON_FG : CHIP_OFF_FG;
    },
    onBlockTap(index) {
        this.selectedBlock = index;
        for (let current = 0; current < BLOCK_PRESETS.length; current += 1) {
            this['blockBg' + current] = current === index ? CHIP_ON_BG : CHIP_OFF_BG;
            this['blockFg' + current] = current === index ? CHIP_ON_FG : CHIP_OFF_FG;
        }
    },
    onRhythmTap(index) {
        this.selectedRhythm = index;
        for (let current = 0; current < RHYTHM_PRESETS.length; current += 1) {
            this['rhythmBg' + current] = current === index ? CHIP_ON_BG : CHIP_OFF_BG;
            this['rhythmFg' + current] = current === index ? CHIP_ON_FG : CHIP_OFF_FG;
        }
    },
    onSave() {
        const app = runtime();
        if (!app || !app.isReady()) {
            this.hasError = true;
            this.errorText = '应用仍在初始化，请稍候';
            return;
        }
        const weekdays = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            if (this.weekdayOn[index]) {
                weekdays.push(WEEKDAY_NAMES[index]);
            }
        }
        // A preset hit maps to the preset; a custom value falls back to what
        // the page read when it opened.
        const workBlocks = this.selectedBlock >= 0
            ? BLOCK_PRESETS[this.selectedBlock]
            : this.originalBlocks;
        const rhythm = this.selectedRhythm >= 0
            ? RHYTHM_PRESETS[this.selectedRhythm]
            : {
                focus: this.originalFocusMinutes,
                break: this.originalBreakMinutes
            };
        const nextModel = app.dispatch({
            tag: 'SettingsSaved',
            raw: {
                enabledFlag: this.enabledFlag,
                weekdays: weekdays,
                workBlocks: workBlocks,
                focusMinutes: rhythm.focus,
                breakMinutes: rhythm.break
            }
        });
        const errors = nextModel.errors || [];
        if (errors.length === 0) {
            // Only leave the page when saving, reconciling and persisting all
            // succeeded: a failed save must stay visible (P1-10).
            app.navigateTo('home');
            return;
        }
        this.hasError = true;
        this.errorText = errors[errors.length - 1].text ||
            errors[errors.length - 1].code ||
            '保存失败';
    }
};
