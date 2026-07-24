import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { state } from './state.js';
import type { ChaosRule } from './types.js';

function consume(rule: ChaosRule): void {
  if (rule.remaining === undefined) return;
  rule.remaining -= 1;
  if (rule.remaining <= 0) {
    state.chaosRules = state.chaosRules.filter(r => r !== rule);
  }
}

/** Failure-injection middleware; rules are managed via POST/DELETE /_control/chaos. */
export function chaosFor(service: ChaosRule['service']): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const rule = state.chaosRules.find(
      r => r.service === service && (r.endpoint === undefined || req.path.includes(r.endpoint))
    );
    if (rule === undefined) return next();
    consume(rule);
    switch (rule.mode) {
      case 'fail500':
        return res.status(500).json({ error: 'mock chaos: injected server error' });
      case 'fail429':
        return res.status(429).json({ error: 'mock chaos: injected rate limit' });
      case 'authExpired':
        return res.status(401).json({ error: 'mock chaos: injected expired credentials' });
      case 'hang':
        return; // never respond
      case 'slow':
        setTimeout(next, 5000);
        return;
    }
  };
}
