import { Context, Next } from 'koa';
import { Session, Shopify } from '@shopify/shopify-api';

import { redirectToAuth } from '../redirect-to-auth';
import { AppConfigInterface } from '../config-types';
import { ApiAndConfigParams } from '../types';
import { AppInstallations } from '../app-installations';

import { EnsureInstalledMiddleware } from './types';
import { addCSPHeader } from './csp-headers';
import { validateAuthenticatedSession } from './validate-authenticated-session';
import { hasValidAccessToken } from './has-valid-access-token';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface EnsureInstalledParams extends ApiAndConfigParams {}

export function ensureInstalled({
  api,
  config,
}: EnsureInstalledParams): EnsureInstalledMiddleware {
  return function ensureInstalledOnShop() {
    return async (ctx: Context, next: Next) => {
      config.logger.info('Running ensureInstalledOnShop');

      if (!api.config.isEmbeddedApp) {
        config.logger.warning(
          'ensureInstalledOnShop() should only be used in embedded apps; calling validateAuthenticatedSession() instead',
        );

        return validateAuthenticatedSession({ api, config })()(ctx, next);
      }

      const shop = getRequestShop(api, config, ctx);
      if (!shop) {
        return;
      }

      config.logger.debug('Checking if shop has installed the app', { shop });

      const sessionId = api.session.getOfflineId(shop);
      const session = await config.sessionStorage.loadSession(sessionId);

      const exitIframeRE = new RegExp(`^${config.exitIframePath}`, 'i');
      if (!session && !ctx.path.match(exitIframeRE)) {
        config.logger.debug(
          'App installation was not found for shop, redirecting to auth',
          { shop },
        );

        return redirectToAuth({ ctx, api, config });
      }

      if (api.config.isEmbeddedApp && ctx.query.embedded !== '1') {
        if (await sessionHasValidAccessToken(api, config, session)) {
          await embedAppIntoShopify(api, config, ctx, shop);
          return;
        } else {
          config.logger.info(
            'Found a session, but it is not valid. Redirecting to auth',
            { shop },
          );

          return redirectToAuth({ ctx, api, config });
        }
      }

      addCSPHeader(api, ctx);

      config.logger.info('App is installed and ready to load', { shop });

      await next();
    };
  };
}

export function deleteAppInstallationHandler(
  appInstallations: AppInstallations,
  config: AppConfigInterface,
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  return async function (_topic: string, shop: string, _body: any, _webhookId: string) {
    config.logger.debug('Deleting shop sessions', { shop });

    await appInstallations.delete(shop);
  };
}

function getRequestShop(
  api: Shopify,
  config: AppConfigInterface,
  ctx: Context,
): string | undefined {
  if (typeof ctx.query.shop !== 'string') {
    config.logger.error(
      'ensureInstalledOnShop did not receive a shop query argument',
      { shop: ctx.query.shop },
    );

    ctx.status = 400;
    ctx.body = 'No shop provided';
    return undefined;
  }

  const shop = api.utils.sanitizeShop(ctx.query.shop);

  if (!shop) {
    config.logger.error(
      'ensureInstalledOnShop did not receive a valid shop query argument',
      { shop: ctx.query.shop },
    );

    ctx.status = 422;
    ctx.body = 'Invalid shop provided';
    return undefined;
  }

  return shop;
}

async function sessionHasValidAccessToken(
  api: Shopify,
  config: AppConfigInterface,
  session: Session | undefined,
): Promise<boolean> {
  if (!session) {
    return false;
  }

  try {
    return (
      session.isActive(api.config.scopes) &&
      (await hasValidAccessToken(api, session))
    );
  } catch (error) {
    config.logger.error(`Could not check if session was valid: ${error}`, {
      shop: session.shop,
    });
    return false;
  }
}

async function embedAppIntoShopify(
  api: Shopify,
  config: AppConfigInterface,
  ctx: Context,
  shop: string,
): Promise<void> {
  let embeddedUrl: string;
  try {
    embeddedUrl = await api.auth.getEmbeddedAppUrl({
      rawRequest: ctx.req, // raw Node.js request object
      rawResponse: ctx.res, // raw Node.js response object
    });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    config.logger.error(
      `ensureInstalledOnShop did not receive a host query argument`,
      { shop },
    );

    ctx.status = 400;
    ctx.body = 'No host provided';
    return;
  }

  config.logger.debug(
    `Request is not embedded but app is. Redirecting to ${embeddedUrl} to embed the app`,
    { shop },
  );

  ctx.redirect(embeddedUrl + ctx.path);
}
