/** Date format options for internationalization */
export type DateFormat = Intl.DateTimeFormatOptions | ((date: Date, options: { showTimeZone?: boolean }) => string);
