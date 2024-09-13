import { Context, Next } from 'koa';

import { ApiAndConfigParams } from '../types';

export interface AuthMiddleware {
  begin: () => (ctx: Context, next: Next) => Promise<void>;
  callback: () => (ctx: Context, next: Next) => Promise<void>;
}

export interface AuthCallbackParams extends ApiAndConfigParams {
  ctx: Context;
}
