import { Context, Next } from 'koa';
import { Shopify } from '@shopify/shopify-api';

import { CspHeadersMiddleware } from './types';

interface CspHeadersParams {
  api: Shopify;
}

export function cspHeaders({ api }: CspHeadersParams): CspHeadersMiddleware {
  return function cspHeaders() {
    return async (ctx: Context, next: Next) => {
      addCSPHeader(api, ctx);
      await next();
    };
  };
}

export function addCSPHeader(api: Shopify, ctx: Context) {
  const shop = api.utils.sanitizeShop(ctx.query.shop as string);
  if (api.config.isEmbeddedApp && shop) {
    ctx.set(
      'Content-Security-Policy',
      `frame-ancestors https://${encodeURIComponent(
        shop,
      )} https://admin.shopify.com https://*.spin.dev;`,
    );
  } else {
    ctx.set('Content-Security-Policy', `frame-ancestors 'none';`);
  }
}
