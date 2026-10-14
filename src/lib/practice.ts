// The easiest clip in each role (sort_order 1) is an optional, unscored practice round.
export const PRACTICE_SORT_ORDER = 1;
export const REAL_CLIP_COUNT = 2;

export const isPracticeClip = (sortOrder: number) => sortOrder === PRACTICE_SORT_ORDER;

export const realClipNumber = (sortOrder: number) => sortOrder - PRACTICE_SORT_ORDER;
