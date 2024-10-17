# `@shopify/shopify-app-koa`

<!-- ![Build Status]() -->

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)
[![npm version](https://badge.fury.io/js/@ingenierias-lentas%2Fshopify-app-koa.svg)](https://badge.fury.io/js/@ingenierias-lentas%2Fshopify-app-koa)

This package makes it easy for [Koa](https://koajs.com/) apps to integrate with Shopify.
It builds on the `@shopify/shopify-api` package and creates a middleware layer that allows the app to communicate with and authenticate requests from Shopify.

> **Note**: this package will enable your app's backend to work with Shopify APIs, and by default it will behave as an [embedded app](https://shopify.dev/docs/apps/auth/oauth/session-tokens). You'll need to use [Shopify App Bridge](https://shopify.dev/docs/apps/tools/app-bridge) in your frontend to authenticate requests to the backend.

## Requirements

To follow these usage guides, you will need to:

- have a Shopify Partner account and development store
- have an app already set up on your partner account
- have a JavaScript package manager such as [npm](https://www.npmjs.com/) installed

## Getting started

To install this package, you can run this on your terminal:

```bash
# Create your project folder
mkdir /my/project/path
# Set up a new yarn project
npm init -y
# You can use your preferred Node package manager
npm install shopify-app-koa
```

Then, you can import the package in your app by creating an `index.js` file containing:

```javascript
const Koa = require('koa');
const Router = require('@koa/router');
const { bodyParser } = require('@koa/bodyparser');
const { shopifyApp } = require('@ingenierias-lentas/shopify-app-koa'); // Assuming you are using your own package version
const { DeliveryMethod } = require('@shopify/shopify-api');
const { SHOPIFY_HOST } = require('@shopify/shopify-api/test-helpers');

require('dotenv').config();

const {
    SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET,
    SHOPIFY_HOST_SCHEME,
    SHOPIFY_HOST_NAME,
} = process.env;

const shopify = shopifyApp({
  api: {
    apiKey: SHOPIFY_API_KEY,
    apiSecretKey: SHOPIFY_API_SECRET,
    scopes: [''],
    hostScheme: SHOPIFY_HOST_SCHEME,
    hostName: SHOPIFY_HOST_NAME,
    isEmbeddedApp: false,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
});

function handleWebhookRequest(
    topic,
    shop,
    webhookRequestBody,
    webhookId,
    apiVersion,
    context
) {
    const sessionId = shopify.session.getOfflineId(shop);
    console.log(`Webhook received for shop ${shop} with session ID ${sessionId}`);
    console.log(`Request: ${JSON.stringify(context.request)}`);

    // Run your webhook-processing code here!
}
const webhookHandlers = {
    CUSTOMERS_DATA_REQUEST: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
    ],
    CUSTOMERS_REDACT: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
    ],
    SHOP_REDACT: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
    ],
};

const app = new Koa();
const router = new Router();

// Add body parser for handling POST requests
app.use(bodyParser({
    enableTypes: ['json', 'text'], // Enable both JSON and text parsing
    encoding: 'utf-8',
    extendTypes: {
        text: ['text/plain'], // Only treat text/plain as text
    },
}));

// Shopify Auth Routes
router.get(shopify.config.auth.path, shopify.auth.begin());
router.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);

// Shopify Webhook handling route
router.post(
  shopify.config.webhooks.path,
  ...shopify.processWebhooks({ webhookHandlers })
);

// Root route with Shopify installation check
router.get('/', shopify.validateAuthenticatedSession(), async (ctx) => {
  ctx.body = 'Hello world!';
});

// Apply routes and middleware
app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT, () => console.log(`Server started on ${SHOPIFY_HOST_SCHEME}://${SHOPIFY_HOST_NAME}`));
```

Once you set the appropriate configuration values, you can then run your Express app as usual, for instance using:

```bash
node ./index.js
# For local, install localtunnel
# Then add the localtunnel url to the .env file
lt --port 8080
```

To load your app within the Shopify Admin app, you need to:

1. Update your app's URL in your Partners Dashboard app setup page to `http://localhost:8080`
1. Update your app's callback URL to `http://localhost:8080/api/auth/callback` in that same page
1. Go to **Test your app** in Partners Dashboard and select your development store

## Next steps

Now that your app is up and running, you can learn more about the `shopifyApp` object in [the reference docs](https://github.com/Shopify/shopify-app-js/tree/main/packages/apps/shopify-api/docs/reference).
