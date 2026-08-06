import { dispatch, refresh } from '../_app-shell.js';
import router from '@system.router';

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
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

export default {
    data: {
        weekdayOn: [true, true, true, true, true],
        weekdayClass0: 'on',
        weekdayClass1: 'on',
        weekdayClass2: 'on',
        weekdayClass3: 'on',
        weekdayClass4: 'on',
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
        const model = refresh();
        this.data.enabledFlag = model.planStatus === 'Enabled' || model.planStatus === 'Paused';
    },
    onWeekdayTap(index) {
        const key = 'weekdayClass' + index;
        const on = this.data.weekdayOn[index];
        this.data.weekdayOn[index] = !on;
        this.data[key] = this.data.weekdayOn[index] ? 'on' : '';
    },
    onBlockTap(index) {
        this.data.selectedBlock = index;
        this.data.blockClass0 = index === 0 ? 'on' : '';
        this.data.blockClass1 = index === 1 ? 'on' : '';
        this.data.blockClass2 = index === 2 ? 'on' : '';
    },
    onRhythmTap(index) {
        this.data.selectedRhythm = index;
        this.data.rhythmClass0 = index === 0 ? 'on' : '';
        this.data.rhythmClass1 = index === 1 ? 'on' : '';
        this.data.rhythmClass2 = index === 2 ? 'on' : '';
        this.data.rhythmClass3 = index === 3 ? 'on' : '';
    },
    onSave() {
        const weekdays = [];
        for (let index = 0; index < WEEKDAY_NAMES.length; index += 1) {
            if (this.data.weekdayOn[index]) {
                weekdays.push(WEEKDAY_NAMES[index]);
            }
        }
        const rhythm = RHYTHM_PRESETS[this.data.selectedRhythm];
        dispatch({
            tag: 'SettingsSaved',
            raw: {
                enabledFlag: this.data.enabledFlag,
                weekdays: weekdays,
                workBlocks: BLOCK_PRESETS[this.data.selectedBlock],
                focusMinutes: rhythm.focus,
                breakMinutes: rhythm.break
            }
        });
        router.back();
    }
};
