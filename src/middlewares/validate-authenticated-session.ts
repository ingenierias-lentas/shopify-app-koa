import { Session, Shopify, InvalidJwtError } from '@shopify/shopify-api';
import { Context, Next } from 'koa';

import { redirectToAuth } from '../redirect-to-auth';
import { ApiAndConfigParams } from '../types';
import { redirectOutOfApp } from '../redirect-out-of-app';

import { ValidateAuthenticatedSessionMiddleware } from './types';
import { hasValidAccessToken } from './has-valid-access-token';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface validateAuthenticatedSessionParams extends ApiAndConfigParams {}

export function validateAuthenticatedSession({
  api,
  config,
}: validateAuthenticatedSessionParams): ValidateAuthenticatedSessionMiddleware {
  return function validateAuthenticatedSession() {
    return async (ctx: Context, next: Next) => {
      config.logger.info('Running validateAuthenticatedSession');

      let sessionId: string | undefined;
      try {
        sessionId = await api.session.getCurrentId({
          isOnline: config.useOnlineTokens,
          rawRequest: ctx.req,
          rawResponse: ctx.res,
        });
      } catch (error) {
        config.logger.error(`Error when loading session from storage: ${error}`);
        handleSessionError(ctx, error);
        return;
      }

      let session: Session | undefined;
      if (sessionId) {
        try {
          session = await config.sessionStorage.loadSession(sessionId);
        } catch (error) {
          config.logger.error(`Error when loading session from storage: ${error}`);
          ctx.status = 500;
          ctx.body = error.message;
          return;
        }
      }

      let shop = api.utils.sanitizeShop(ctx.query.shop as string) || session?.shop;

      if (session && shop && session.shop !== shop) {
        config.logger.debug('Found a session for a different shop in the request', {
          currentShop: session.shop,
          requestShop: shop,
        });
        return redirectToAuth({ ctx, api, config });
      }

      if (session) {
        config.logger.debug('Request session found and loaded', { shop: session.shop });

        if (session.isActive(api.config.scopes)) {
          config.logger.debug('Request session exists and is active', { shop: session.shop });

          if (await hasValidAccessToken(api, session)) {
            config.logger.info('Request session has a valid access token', { shop: session.shop });

            ctx.state.shopify = {
              ...ctx.state.shopify,
              session,
            };
            //return await next();
            return next();
          }
        }
      }

      const bearerPresent = ctx.headers.authorization?.match(/Bearer (.*)/);
      if (bearerPresent) {
        if (!shop) {
          shop = await setShopFromSessionOrToken(api, session, bearerPresent[1]);
        }
      }

      const redirectUri = `${config.auth.path}?shop=${shop}`;
      config.logger.info(`Session was not valid. Redirecting to ${redirectUri}`, { shop });

      return redirectOutOfApp({ api, config })({
        ctx,
        redirectUri,
        shop: shop!,
      });
    };
  };
}

function handleSessionError(ctx: Context, error: Error) {
  switch (true) {
    case error instanceof InvalidJwtError:
      ctx.status = 401;
      ctx.body = error.message;
      break;
    default:
      ctx.status = 500;
      ctx.body = error.message
      break;
  }
}

async function setShopFromSessionOrToken(
  api: Shopify,
  session: Session | undefined,
  token: string,
): Promise<string | undefined> {
  let shop: string | undefined;

  if (session) {
    shop = session.shop;
  } else if (api.config.isEmbeddedApp) {
    const payload = await api.session.decodeSessionToken(token);
    shop = payload.dest.replace('https://', '');
  }
  return shop;
}
