import { Context, Next } from 'koa';

import { ApiAndConfigParams } from '../types';
import { redirectToAuth } from '../redirect-to-auth';

import { authCallback } from './auth-callback';
import { AuthMiddleware } from './types';

export function auth({ api, config }: ApiAndConfigParams): AuthMiddleware {
  return {
    begin(): (ctx: Context, next: Next) => Promise<void> {
      return async (ctx: Context) => {
        await redirectToAuth({ ctx, api, config });
      };
    },
    callback(): (ctx: Context, next: Next) => Promise<void> {
      return async (ctx: Context, next: Next) => {
        config.logger.info('Handling request to complete OAuth process');

        const oauthCompleted = await authCallback({
          ctx,
          api,
          config,
        });

        if (oauthCompleted) {
          await next();
        }
      };
    },
  };
}
