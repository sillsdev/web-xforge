import { ActivityLogger } from './activity-logger';

export type InteropCallback = (err?: any, ret?: any) => void;

/**
 * Identifies one interop call. Passed to the method being called so that the entry the method logs itself carries the
 * same call id as the interopCall entry logged here, letting the two be paired up even when calls overlap.
 */
export interface InteropCallContext {
  readonly callId: number;
}

/** An interop method as declared in index.ts. The call context is supplied by withActivityLogging. */
export type InteropMethod = (callback: InteropCallback, context: InteropCallContext, ...args: any[]) => void;

/** An interop method as the interop layer calls it (i.e. from dotnet), without the call context. */
export type ExternalInteropMethod = (callback: InteropCallback, ...args: any[]) => void;

/** Counts calls within this process, so a callId is only unique when taken together with the pid. */
let interopCallIndex = 0;

/**
 * Report activity of wrapped methods.
 *
 * The MethodName..TMethods.. return type causes the individually wrapped method names to appear in the output
 * index.d.ts.
 */
export function withActivityLogging<TMethods extends Record<string, InteropMethod>>(
  interopMethods: TMethods
): { [MethodName in keyof TMethods]: ExternalInteropMethod } {
  const wrapped = {} as { [MethodName in keyof TMethods]: ExternalInteropMethod };
  for (const methodName of Object.keys(interopMethods) as (keyof TMethods & string)[]) {
    const method: InteropMethod = interopMethods[methodName];
    wrapped[methodName] = (callback: InteropCallback, ...args: any[]): void => {
      const context: InteropCallContext = { callId: interopCallIndex++ };
      // Short-circuit wrapping if logging is disabled.
      if (!ActivityLogger.instance.enabled) {
        method(callback, context, ...args);
        return;
      }
      const startedAt: number = Date.now();
      method(
        (err, ret) => {
          ActivityLogger.instance.log('interopCall', {
            callId: context.callId,
            method: methodName,
            durationMs: Date.now() - startedAt,
            status: err == null ? 'ok' : 'error',
            errorMessage: err == null ? undefined : `${err}`
          });
          callback(err, ret);
        },
        context,
        ...args
      );
    };
  }
  return wrapped;
}
