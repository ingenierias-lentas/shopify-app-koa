import { Session } from '@shopify/shopify-api';
import Koa from 'koa';
import Router from '@koa/router';
import request from 'supertest';

import { redirectToShopifyOrAppRoot } from '../redirect-to-shopify-or-app-root';
import {
  BASE64_HOST,
  shopify,
  SHOPIFY_HOST,
  TEST_SHOP,
} from '../../__tests__/test-helper';

describe('redirectToShopifyOrAppRoot', () => {
  const session = new Session({
    id: 'session-id',
    accessToken: 'access-token',
    shop: TEST_SHOP,
    isOnline: false,
    state: '1234',
  });

  let app: Koa;
  let router: Router;

  beforeEach(() => {
    app = new Koa();
    router = new Router();

    // Middleware to make sure the session is available
    router.get(
      '/redirect-to-host',
      async (ctx, next) => {
        ctx.state.shopify = { session };
        await next();
      },
      redirectToShopifyOrAppRoot({ api: shopify.api, config: shopify.config })()
    );

    app.use(router.routes()).use(router.allowedMethods());
  });

  it('redirects to Shopify when embedded', async () => {
    const host = BASE64_HOST;
    const response = await request(app.callback())
      .get(`/redirect-to-host?host=${host}&embedded=1`)
      .expect(302);

    const url = new URL(response.header.location);
    expect(url.host).toBe(SHOPIFY_HOST);
    expect(url.pathname).toBe(`/apps/${shopify.api.config.apiKey}`);
  });

  it('redirects to app when not embedded', async () => {
    shopify.api.config.isEmbeddedApp = false;

    const host = BASE64_HOST;
    const response = await request(app.callback())
      .get(`/redirect-to-host?host=${host}&embedded=1`)
      .expect(302);

    expect(response.header.location).toBe(
      `/?shop=${TEST_SHOP}&host=${encodeURIComponent(host)}`
    );
  });
});
