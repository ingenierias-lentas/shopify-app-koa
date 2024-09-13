import { Context } from 'koa';
import {
  BotActivityDetected,
  CookieNotFound,
  privacyTopics,
  InvalidOAuthError,
  Session,
  Shopify,
} from '@shopify/shopify-api';

import { AppConfigInterface } from '../config-types';
import { redirectToAuth } from '../redirect-to-auth';

import { AuthCallbackParams } from './types';

export async function authCallback({
  ctx,
  api,
  config,
}: AuthCallbackParams): Promise<boolean> {
  try {
    const callbackResponse = await api.auth.callback({
      rawRequest: ctx.req, // raw Node.js request object
      rawResponse: ctx.res, // raw Node.js response object
    });

    config.logger.debug('Callback is valid, storing session', {
      shop: callbackResponse.session.shop,
      isOnline: callbackResponse.session.isOnline,
    });

    await config.sessionStorage.storeSession(callbackResponse.session);

    // If this is an offline OAuth process, register webhooks
    if (!callbackResponse.session.isOnline) {
      await registerWebhooks(config, api, callbackResponse.session);
    }

    // If we're completing an offline OAuth process, immediately kick off the online one
    if (config.useOnlineTokens && !callbackResponse.session.isOnline) {
      config.logger.debug(
        'Completing offline token OAuth, redirecting to online token OAuth',
        { shop: callbackResponse.session.shop },
      );

      await redirectToAuth({ ctx, api, config, isOnline: true });
      return false;
    }

    ctx.state.shopify = {
      ...ctx.state.shopify,
      session: callbackResponse.session,
    };

    config.logger.debug('Completed OAuth callback', {
      shop: callbackResponse.session.shop,
      isOnline: callbackResponse.session.isOnline,
    });

    return true;
  } catch (error) {
    config.logger.error(`Failed to complete OAuth with error: ${error}`);

    await handleCallbackError(ctx, api, config, error);
  }

  return false;
}

async function registerWebhooks(
  config: AppConfigInterface,
  api: Shopify,
  session: Session,
) {
  config.logger.debug('Registering webhooks', { shop: session.shop });

  const responsesByTopic = await api.webhooks.register({ session });

  for (const topic in responsesByTopic) {
    if (!Object.prototype.hasOwnProperty.call(responsesByTopic, topic)) {
      continue;
    }

    for (const response of responsesByTopic[topic]) {
      if (!response.success && !privacyTopics.includes(topic)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = response.result;

        if (result.errors) {
          config.logger.error(
            `Failed to register ${topic} webhook: ${result.errors[0].message}`,
            { shop: session.shop },
          );
        } else {
          config.logger.error(
            `Failed to register ${topic} webhook: ${JSON.stringify(result.data)}`,
            { shop: session.shop },
          );
        }
      }
    }
  }
}

async function handleCallbackError(
  ctx: Context,
  api: Shopify,
  config: AppConfigInterface,
  error: Error,
) {
  switch (true) {
    case error instanceof InvalidOAuthError:
      ctx.status = 400;
      ctx.body = error.message;
      break;
    case error instanceof CookieNotFound:
      await redirectToAuth({ ctx, api, config });
      break;
    case error instanceof BotActivityDetected:
      ctx.status = 410;
      ctx.body = error.message;
      break;
    default:
      ctx.status = 500;
      ctx.body = error.message;
      break;
  }
}
