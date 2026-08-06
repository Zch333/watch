/**
 * UI-only copy: maps domain guidance action keys to display text.
 * The domain never holds UI text; this mapping lives in the view layer.
 */
const ACTION_LABELS = Object.freeze({
    stand_and_walk: '站起来走动',
    simple_stretch: '简单伸展',
    look_far: '看向远处放松眼睛',
    neck_rolls: '缓慢转动颈部',
    shoulder_open: '打开肩胛',
    hip_circles: '画圈活动髋部',
    ankle_flex: '勾脚踝活动',
    wrist_stretch: '伸展手腕',
    back_extension: '后仰舒展背部'
});

export function actionLabel(key) {
    const text = ACTION_LABELS[key];
    return text ? text : key;
}

export function actionLabels(keys) {
    const list = keys || [];
    const out = [];
    for (let index = 0; index < list.length; index += 1) {
        out.push(actionLabel(list[index]));
    }
    return out;
}
