import { Context } from 'koa';

import { ApiAndConfigParams } from '../types';
import { RedirectToShopifyOrAppRootMiddleware } from './types';

export function redirectToShopifyOrAppRoot({
  api,
  config,
}: ApiAndConfigParams): RedirectToShopifyOrAppRootMiddleware {
  return function () {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return async function (ctx: Context, _next: () => Promise<void>) {
      if (ctx.response.headerSent) {
        config.logger.info(
          'Response headers have already been sent, skipping redirection to host',
          { shop: ctx.state.shopify?.session?.shop },
        );
        return;
      }

      const host = api.utils.sanitizeHost(ctx.query.host as string)!;
      const redirectUrl = api.config.isEmbeddedApp
        ? await api.auth.getEmbeddedAppUrl({
            rawRequest: ctx.req, // raw Node.js request object
            rawResponse: ctx.res, // raw Node.js response object
          })
        : `/?shop=${ctx.state.shopify.session.shop}&host=${encodeURIComponent(
            host,
          )}`;

      config.logger.debug(`Redirecting to host at ${redirectUrl}`, {
        shop: ctx.state.shopify.session.shop,
      });

      ctx.redirect(redirectUrl); // Redirect the request using Koa's redirect method
    };
  };
}
