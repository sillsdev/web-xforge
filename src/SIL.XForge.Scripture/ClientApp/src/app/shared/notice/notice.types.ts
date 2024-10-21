export const noticeTypes = ['primary', 'secondary', 'success', 'warning', 'error', 'info', 'light', 'dark'] as const;
export type NoticeType = (typeof noticeTypes)[number];

export const noticeModes = ['fill-light', 'fill-dark', 'fill-extra-dark', 'outline', 'basic'] as const;
export type NoticeMode = (typeof noticeModes)[number];
