import { Context } from 'koa';

import { AppConfigInterface } from './config-types';
import { RedirectOutOfAppFunction, ApiAndConfigParams } from './types';

export function redirectOutOfApp({
  api,
  config,
}: ApiAndConfigParams): RedirectOutOfAppFunction {
  return function redirectOutOfApp({ ctx, redirectUri, shop }): void {
    if (
      (!api.config.isEmbeddedApp && isFetchRequest(ctx)) ||
      ctx.headers.authorization?.match(/Bearer (.*)/)
    ) {
      appBridgeHeaderRedirect(config, ctx, redirectUri);
    } else if (ctx.request.query.embedded === '1') {
      exitIframeRedirect(config, ctx, redirectUri, shop);
    } else {
      serverSideRedirect(config, ctx, redirectUri, shop);
    }
  };
}

function appBridgeHeaderRedirect(
  config: AppConfigInterface,
  ctx: Context,
  redirectUri: string,
) {
  config.logger.debug(
    `Redirecting: request has bearer token, returning headers to ${redirectUri}`,
  );

  ctx.status = 403;
  ctx.set('Access-Control-Expose-Headers', [
    'X-Shopify-Api-Request-Failure-Reauthorize',
    'X-Shopify-Api-Request-Failure-Reauthorize-Url',
  ]);
  ctx.set('X-Shopify-API-Request-Failure-Reauthorize', '1');
  ctx.set('X-Shopify-API-Request-Failure-Reauthorize-Url', redirectUri);
  ctx.body = '';
}

function exitIframeRedirect(
  config: AppConfigInterface,
  ctx: Context,
  redirectUri: string,
  shop: string,
): void {
  config.logger.debug(
    `Redirecting: request is embedded, using exitiframe path to ${redirectUri}`,
    { shop },
  );

  const queryParams = new URLSearchParams({
    ...ctx.request.query,
    shop,
    redirectUri,
  }).toString();

  ctx.redirect(`${config.exitIframePath}?${queryParams}`);
}

function serverSideRedirect(
  config: AppConfigInterface,
  ctx: Context,
  redirectUri: string,
  shop: string,
): void {
  config.logger.debug(
    `Redirecting: request is at top level, going to ${redirectUri} `,
    { shop },
  );

  ctx.redirect(redirectUri);
}

function isFetchRequest(ctx: Context) {
  return ctx.get('X-Requested-With') === 'XMLHttpRequest' || ctx.get('sec-fetch-dest') === 'empty';
}
