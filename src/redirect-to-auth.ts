import { Shopify } from '@shopify/shopify-api';
import { Context } from 'koa';

import { RedirectToAuthParams } from './types';
import { redirectOutOfApp } from './redirect-out-of-app';
import { AppConfigInterface } from './config-types';

export async function redirectToAuth({
  ctx,
  api,
  config,
  isOnline = false,
}: RedirectToAuthParams) {
  const shop = api.utils.sanitizeShop(ctx.query.shop as string);
  if (!shop) {
    config.logger.error('No shop provided to redirect to auth');
    ctx.status = 500;
    ctx.body = 'No shop provided';
    return;
  }

  if (ctx.query.embedded === '1') {
    clientSideRedirect(api, config, ctx, shop);
  } else {
    await serverSideRedirect(api, config, ctx, shop, isOnline);
  }
}

function clientSideRedirect(
  api: Shopify,
  config: AppConfigInterface,
  ctx: Context,
  shop: string,
): void {
  const host = api.utils.sanitizeHost(ctx.query.host as string);
  if (!host) {
    ctx.status = 500;
    ctx.body = 'No host provided';
    return;
  }

  const redirectUriParams = new URLSearchParams({ shop, host }).toString();
  const redirectUri = `${api.config.hostScheme}://${api.config.hostName}${config.auth.path}?${redirectUriParams}`;

  redirectOutOfApp({ config, api })({ ctx, redirectUri, shop });
}

async function serverSideRedirect(
  api: Shopify,
  config: AppConfigInterface,
  ctx: Context,
  shop: string,
  isOnline: boolean,
): Promise<void> {
  config.logger.debug(
    `Redirecting to auth at ${config.auth.path}, with callback ${config.auth.callbackPath}`,
    { shop, isOnline },
  );

  await api.auth.begin({
    callbackPath: config.auth.callbackPath,
    shop,
    isOnline,
    rawRequest: ctx.req, // Koa's request object
    rawResponse: ctx.res, // Koa's response object
  });
}
