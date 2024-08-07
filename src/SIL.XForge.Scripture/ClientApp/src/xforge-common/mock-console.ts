/** Record of a log item. */
export class LogItem {
  constructor(
    public readonly logLevel: LogLevel,
    public readonly message?: any,
    public readonly params?: any[]
  ) {}
}

export enum LogLevel {
  Trace,
  Debug,
  Info,
  Warn,
  Error
}

export interface LoggerInterface {
  trace(message?: any, ...optionalParams: any[]): void;
  debug(message?: any, ...optionalParams: any[]): void;
  info(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;

  log(level: LogLevel, message: any, ...optionalParams: any[]): void;
}

export abstract class AbstractFunctionLogger implements LoggerInterface {
  public abstract trace(message?: any, ...optionalParams: any[]): void;
  public abstract debug(message?: any, ...optionalParams: any[]): void;
  public abstract info(message?: any, ...optionalParams: any[]): void;
  public abstract warn(message?: any, ...optionalParams: any[]): void;
  public abstract error(message?: any, ...optionalParams: any[]): void;

  public log(level: LogLevel, message?: any, ...optionalParams: any[]): void {
    switch (level) {
      case LogLevel.Trace:
        this.trace(message, ...optionalParams);
        break;
      case LogLevel.Debug:
        this.debug(message, ...optionalParams);
        break;
      case LogLevel.Info:
        this.info(message, ...optionalParams);
        break;
      case LogLevel.Warn:
        this.warn(message, ...optionalParams);
        break;
      case LogLevel.Error:
        this.error(message, ...optionalParams);
        break;
      default:
        throw new Error(`Log level "${level}" not supported`);
    }
  }
}

/** Implementation of LoggerInterface that keeps a record of each log usage, for later examination.
 *
 * This class might be used as:
 * ```
 * expectedMessage = /record not found/;
 * mockedConsole.muteFor(expectedMessage);
 * ...SUT...
 * mockedConsole.assertHasOnly(expectedMessage);
 * ```
 * Or as:
 * ```
 * mockedConsole.expectAndHideOnly(/record not found/);
 * ...SUT...
 * mockedConsole.verify();
 * ```
 */
export class MockConsole extends AbstractFunctionLogger {
  /** Create a new instance and install it as the global console. */
  static install(): MockConsole {
    const instance: MockConsole = new this();
    (console as any) = instance;
    return instance;
  }

  public logs: LogItem[] = [];
  private hushes: RegExp[] = [];
  private expectations: { message: RegExp; context: string; count?: number }[] = [];

  constructor(private readonly originalConsole: Console = console) {
    super();
  }

  trace(message?: any, ...optionalParams: any[]): void {
    this.logs.push(new LogItem(LogLevel.Trace, message, optionalParams));
    if (this.hushes.filter((husher: RegExp) => husher.test(message)).length === 0) {
      this.originalConsole.trace(message, optionalParams);
    }
  }

  debug(message?: any, ...optionalParams: any[]): void {
    this.logs.push(new LogItem(LogLevel.Debug, message, optionalParams));
    if (this.hushes.filter((husher: RegExp) => husher.test(message)).length === 0) {
      this.originalConsole.debug(message, optionalParams);
    }
  }

  info(message?: any, ...optionalParams: any[]): void {
    this.logs.push(new LogItem(LogLevel.Info, message, optionalParams));
    if (this.hushes.filter((husher: RegExp) => husher.test(message)).length === 0) {
      this.originalConsole.info(message, optionalParams);
    }
  }

  warn(message?: any, ...optionalParams: any[]): void {
    this.logs.push(new LogItem(LogLevel.Warn, message, optionalParams));
    if (this.hushes.filter((husher: RegExp) => husher.test(message)).length === 0) {
      this.originalConsole.warn(message, optionalParams);
    }
  }

  error(message?: any, ...optionalParams: any[]): void {
    this.logs.push(new LogItem(LogLevel.Error, message, optionalParams));
    if (this.hushes.filter((husher: RegExp) => husher.test(message)).length === 0) {
      this.originalConsole.error(message, optionalParams);
    }
  }

  log(message?: any, ...optionalParams: any[]): void {
    this.info(message, optionalParams);
  }

  reset(): void {
    this.logs = [];
    this.hushes = [];
    this.expectations = [];
  }

  /** When a message is logged with this regexp, log the event but don't print the message. */
  muteFor(regex: RegExp): void {
    this.hushes.push(regex);
  }

  /** Assert that a message was logged, matching a regex. */
  assertHasLog(message: RegExp, context: string = 'should have contained expected log item'): void {
    const has: boolean = this.logs.filter((logItem: LogItem) => message.test(logItem.message)).length > 0;
    if (!has) {
      if (this.logs.length === 0) {
        this.originalConsole.log('Nothing was logged.');
      } else {
        this.originalConsole.log('The following was logged:');
        this.logs.forEach(this.originalConsole.log);
      }
    }
    expect(has).withContext(context).toBeTrue();
  }

  /** Assert that a message was logged, and no other messages were logged. */
  assertHasOnlyLog(message: RegExp, moreContext: string = ''): void {
    const hits: number = this.logs.filter((logItem: LogItem) => message.test(logItem.message)).length;
    const has: boolean = hits > 0;
    const logCount: number = this.logs.length;
    if (!has) {
      if (this.logs.length === 0) {
        this.originalConsole.log('Nothing was logged.');
      } else {
        this.originalConsole.log('The following was logged:');
        this.logs.forEach(this.originalConsole.log);
      }
      fail(`should have contained expected log item matching regex ${message}. ${moreContext}`);
    } else {
      if (logCount > 1) {
        this.originalConsole.log('The following was logged:');
        this.logs.forEach(this.originalConsole.log);
        fail(`item was logged matching regex ${message}, but not alone. ${moreContext}`);
      }
    }
  }

  /** Specify a log message to mute and later check for when verifying. */
  expectAndHide(message: RegExp, context: string = ''): void {
    this.expectations.push({ message, context });
    this.muteFor(message);
  }

  /** Specify a log message to mute and later check when verifying that it was the only log message. */
  expectAndHideOnly(message: RegExp, context: string = ''): void {
    if (this.expectations.length > 0) {
      throw new Error('Can not expect a single log item in addition to other log items.');
    }
    this.expectations.push({ message, context, count: 1 });
    this.muteFor(message);
  }

  /** Assert that the expected log messages occurred. */
  verify(): void {
    this.expectations.forEach(expectation => {
      if (expectation.count != null && expectation.count === 1) {
        this.assertHasOnlyLog(expectation.message, expectation.context);
      } else {
        this.assertHasLog(expectation.message, expectation.context);
      }
    });
  }

  assertNoLogs(context: string = 'should not have log messages'): void {
    if (this.logs.length !== 0) {
      this.originalConsole.log('The following was logged:');
      this.logs.forEach(this.originalConsole.log);
    }
    expect(this.logs.length).withContext(context).toEqual(0);
  }
}
