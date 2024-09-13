import Koa from 'koa';
import Router from '@koa/router';
import request from 'supertest';

import {redirectToAuth} from '../redirect-to-auth';
import {BASE64_HOST, shopify, TEST_SHOP} from './test-helper';

describe('redirectToAuth', () => {
  let app: Koa;
  let router: Router;
  let beginMock: jest.SpyInstance;

  beforeEach(() => {
    app = new Koa();
    router = new Router();

    router.get('/redirect-to-auth', async (ctx) => {
      await redirectToAuth({
        ctx,
        api: shopify.api,
        config: shopify.config,
      });
    });

    app.use(router.routes()).use(router.allowedMethods());

    beginMock = jest.spyOn(shopify.api.auth, 'begin');
    beginMock.mockImplementationOnce(async ({rawResponse}) => {
      rawResponse.writeHead(302, { Location: 'https://oauth-url' });
      rawResponse.end();
    });
  });

  afterEach(() => {
    beginMock.mockReset();
  });

  it('triggers a server-side redirect with no params', async () => {
    const response = await request(app.callback())
      .get(`/redirect-to-auth?shop=${TEST_SHOP}`)
      .expect(302);

    expect(beginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackPath: '/auth/callback',
        isOnline: shopify.config.useOnlineTokens,
        shop: TEST_SHOP,
      }),
    );
    expect(response.header.location).toBe('https://oauth-url');
  });

  it('triggers a server-side redirect when embedded is not 1', async () => {
    const response = await request(app.callback())
      .get(`/redirect-to-auth?shop=${TEST_SHOP}&embedded=0`)
      .expect(302);

    expect(beginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackPath: '/auth/callback',
        isOnline: shopify.config.useOnlineTokens,
        shop: TEST_SHOP,
      }),
    );
    expect(response.header.location).toBe('https://oauth-url');
  });

  it('triggers a client-side redirect when embedded is 1', async () => {
    const expectedParams = new URLSearchParams({
      shop: TEST_SHOP,
      host: BASE64_HOST,
      embedded: '1',
      redirectUri: `https://${shopify.api.config.hostName}/auth?shop=${TEST_SHOP}&host=${BASE64_HOST}`,
    });
    const response = await request(app.callback())
      .get(`/redirect-to-auth?${expectedParams.toString()}`)
      .expect(302);

    const url = new URL(
      response.header.location,
      'http://not-a-real-host.myshopify.io',
    );

    expect(url.host).toBe('not-a-real-host.myshopify.io');
    expect(url.pathname).toBe('/exitiframe');
    expect(url.searchParams.toString()).toEqual(expectedParams.toString());
  });

  it('fails with invalid shop', async () => {
    const response = await request(app.callback())
      .get(`/redirect-to-auth?shop=invalid-shop`)
      .expect(500);

    expect(response.error).toBeDefined();
  });

  it('fails with invalid host', async () => {
    const expectedParams = new URLSearchParams({
      shop: TEST_SHOP,
      embedded: '1',
    });
    const response = await request(app.callback())
      .get(`/redirect-to-auth?${expectedParams.toString()}`)
      .expect(500);

    expect(response.error).toBeDefined();
  });
});
