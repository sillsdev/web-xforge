/** Date format options for internationalization */
export type DateFormat =
  Intl.DateTimeFormatOptions | ((date: Date, options: { showTimeZone: boolean; showTime: boolean }) => string);
