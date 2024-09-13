import { LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import Koa from 'koa';
import Router from '@koa/router';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import {
  createTestHmac,
  mockShopifyResponse,
  shopify,
  SHOPIFY_HOST,
} from '../../__tests__/test-helper';

describe('validateAuthenticatedSession', () => {
  let app: Koa;
  let router: Router;
  let session: Session;
  const shop = 'my-shop.myshopify.io';
  const sessionId = `offline_${shop}`;

  describe('for embedded apps', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let validJWT: any;

    beforeEach(() => {
      shopify.config.auth.path = '/api/auth';
      shopify.config.auth.callbackPath = '/api/auth/callback';
      shopify.api.config.isEmbeddedApp = true;

      app = new Koa();
      router = new Router();

      // Middleware to validate the authenticated session
      router.use('/test/(.*)', shopify.validateAuthenticatedSession());

      // Define route for /test/shop
      router.get('/test/shop', async (ctx) => {
        ctx.body = { data: { shop: { name: ctx.query.shop } } };
      });

      app.use(router.routes()).use(router.allowedMethods());

      validJWT = jwt.sign(
        {
          dummy: 'data',
          aud: shopify.api.config.apiKey,
          dest: `https://${shop}`,
        },
        shopify.api.config.apiSecretKey,
        {
          algorithm: 'HS256',
        }
      );

      const scopes = shopify.api.config.scopes
        ? shopify.api.config.scopes.toString()
        : '';

      session = new Session({
        id: sessionId,
        shop,
        state: '123-this-is-a-state',
        isOnline: shopify.config.useOnlineTokens,
        scope: scopes,
        expires: undefined,
        accessToken: 'totally-real-access-token',
      });

      shopify.config.sessionStorage.storeSession(session);
    });

    it('active and valid session does not redirect', async () => {
      mockShopifyResponse({ data: { shop: { name: shop } } });

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(200);

      expect(response.body).toEqual({
        data: {
          shop: {
            name: shop,
          },
        },
      });
    });

    it('inactive session with auth header returns 403 with correct headers', async () => {
      session.expires = new Date('2020-12-31T00:00:00');

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(403);

      expect(
        response.headers['x-shopify-api-request-failure-reauthorize']
      ).toBe('1');
      expect(
        response.headers['x-shopify-api-request-failure-reauthorize-url']
      ).toBe(`/api/auth?shop=my-shop.myshopify.io`);
    });

    it('no session, with auth header returns 403 with correct headers', async () => {
      jest
        .spyOn(shopify.api.session, 'getCurrentId')
        .mockResolvedValueOnce(undefined);

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(403);

      expect(
        response.headers['x-shopify-api-request-failure-reauthorize']
      ).toBe('1');
      expect(
        response.headers['x-shopify-api-request-failure-reauthorize-url']
      ).toBe(`/api/auth?shop=my-shop.myshopify.io`);
    });

    it('no session, no shop param, with auth header returns 403 with correct headers', async () => {
      jest
        .spyOn(shopify.api.session, 'getCurrentId')
        .mockResolvedValueOnce(undefined);

      const response = await request(app.callback())
        .get('/test/shop')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(403);

      expect(
        response.headers['x-shopify-api-request-failure-reauthorize']
      ).toBe('1');
      expect(
        response.headers['x-shopify-api-request-failure-reauthorize-url']
      ).toBe(`/api/auth?shop=my-shop.myshopify.io`);
    });

    it('no session, without auth header redirects to auth', async () => {
      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .expect(302);

      expect(response.header.location).toBe(
        `/api/auth?shop=my-shop.myshopify.io`
      );
    });

    it('redirect to exit iFrame if different shop, embedded param set to 1', async () => {
      const encodedHost = Buffer.from(SHOPIFY_HOST, 'utf-8').toString('base64');
      const response = await request(app.callback())
        .get(
          `/test/shop?shop=other-shop.myshopify.io&host=${encodedHost}&embedded=1`
        )
        .expect(302);

      const location = new URL(response.header.location, 'https://example.com');
      const locationParams = location.searchParams;

      expect(location.pathname).toBe(shopify.config.exitIframePath);
      expect(locationParams.get('shop')).toBe('other-shop.myshopify.io');
      expect(locationParams.get('host')).toBe(encodedHost);
      expect(locationParams.get('redirectUri')).toEqual(
        expect.stringMatching(shopify.config.auth.path)
      );
    });

    it('redirects to auth if different shop, no embedded param', async () => {
      const response = await request(app.callback())
        .get('/test/shop?shop=other-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(302);

      const expectedRedirectUriStart = new URL(
        shopify.config.auth.callbackPath,
        `${shopify.api.config.hostScheme}://${shopify.api.config.hostName}`
      );
      const location = new URL(response.header.location);
      const locationParams = location.searchParams;
      const scopes = shopify.api.config.scopes
        ? shopify.api.config.scopes.toString()
        : '';

      expect(location.hostname).toBe('other-shop.myshopify.io');
      expect(location.pathname).toBe('/admin/oauth/authorize');
      expect(locationParams.get('client_id')).toBe(shopify.api.config.apiKey);
      expect(locationParams.get('scope')).toBe(scopes);
      expect(locationParams.get('redirect_uri')).toEqual(
        expect.stringMatching(expectedRedirectUriStart.href)
      );
    });

    it('session found, shops match, scopes differ, with auth header', async () => {
      session.scope = 'read_products,read_draft_orders';

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(403);

      expect(
        response.headers['x-shopify-api-request-failure-reauthorize']
      ).toBe('1');
      expect(
        response.headers['x-shopify-api-request-failure-reauthorize-url']
      ).toBe(`/api/auth?shop=my-shop.myshopify.io`);
    });

    it('returns a 401 if the session token is invalid', async () => {
      const invalidJWT = jwt.sign(
        {
          dummy: 'data',
          aud: shopify.api.config.apiKey,
          dest: `https://${shop}`,
        },
        'different-secret-key',
        { algorithm: 'HS256' }
      );

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${invalidJWT}`)
        .expect(401);

      expect(response.text).toMatch('Failed to parse session token');
    });

    it('returns a 500 if the storage throws an error', async () => {
      jest
        .spyOn(shopify.config.sessionStorage, 'loadSession')
        .mockRejectedValueOnce(new Error('Storage error'));

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Authorization', `Bearer ${validJWT}`)
        .expect(500);

      expect(response.text).toBe('Storage error');
    });
  });

  describe('for non-embedded apps', () => {
    let validCookies: string[];

    beforeEach(() => {
      shopify.api.config.isEmbeddedApp = false;

      app = new Koa();
      router = new Router();

      // Middleware to validate the authenticated session
      router.use('/test/(.*)', shopify.validateAuthenticatedSession());

      // Define route for /test/shop
      router.get('/test/shop', async (ctx) => {
        ctx.body = { data: { shop: { name: ctx.query.shop } } };
      });

      app.use(router.routes()).use(router.allowedMethods());

      validCookies = [
        `shopify_app_session=${sessionId}`,
        `shopify_app_session.sig=${createTestHmac(
          shopify.api.config.apiSecretKey,
          sessionId
        )}`,
      ];

      const scopes = shopify.api.config.scopes
        ? shopify.api.config.scopes.toString()
        : '';

      session = new Session({
        id: sessionId,
        shop: 'my-shop.myshopify.io',
        state: '123-this-is-a-state',
        isOnline: shopify.config.useOnlineTokens,
        scope: scopes,
        expires: undefined,
        accessToken: 'totally-real-access-token',
      });

      shopify.config.sessionStorage.storeSession(session);
    });

    it('finds a session with the right cookie', async () => {
      mockShopifyResponse({
        data: {},
        extensions: {},
      });

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Cookie', validCookies)
        .expect(200);

      expect({
        method: 'POST',
        url: `https://my-shop.myshopify.io/admin/api/${LATEST_API_VERSION}/graphql.json`,
      }).toMatchMadeHttpRequest();

      expect(response.body).toEqual({
        data: {
          shop: {
            name: 'my-shop.myshopify.io',
          },
        },
      });
    });

    it('fails to find a session if there is no signature', async () => {
      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Cookie', [validCookies[0]])
        .expect(302);

      expect(response.header.location).toBe(`/auth?shop=my-shop.myshopify.io`);
    });

    it('returns a 403 with the authentication header in XHR requests', async () => {
      session.expires = new Date('2020-12-31T00:00:00');

      const response = await request(app.callback())
        .get('/test/shop?shop=my-shop.myshopify.io')
        .set('Cookie', validCookies)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(403);

      expect(
        response.headers['x-shopify-api-request-failure-reauthorize']
      ).toBe('1');
      expect(
        response.headers['x-shopify-api-request-failure-reauthorize-url']
      ).toBe(`${shopify.config.auth.path}?shop=my-shop.myshopify.io`);
    });
  });
});
