[Skip to content](https://dev.to/zuplo/exploring-the-klipy-api-29po#main-content)

Navigation menu[![DEV Community](https://media2.dev.to/dynamic/image/quality=100/https://dev-to-uploads.s3.amazonaws.com/uploads/logos/resized_logo_UQww2soKuUsjaOGNB38o.png)](https://dev.to/)

Search[Powered by Algolia\\
Search](https://www.algolia.com/developers/?utm_source=devto&utm_medium=referral)

[Log in](https://dev.to/enter?signup_subforem=1)[Create account](https://dev.to/enter?signup_subforem=1&state=new-user)

## DEV Community

Close

![](https://assets.dev.to/assets/heart-plus-active-9ea3b22f2bc311281db911d416166c5f430636e76b15cd5df6b3b841d830eefa.svg)4
Add reaction


![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)4
Like
![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)0
Unicorn
![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)0
Exploding Head
![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)0
Raised Hands
![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)0
Fire


0
Jump to Comments
0
Save

Boost


More...

Copy linkCopy link

Copied to Clipboard

[Share to X](https://twitter.com/intent/tweet?text=%22Exploring%20the%20KLIPY%20API%22%20by%20Adrian%20Machado%20%23DEVCommunity%20https%3A%2F%2Fdev.to%2Fzuplo%2Fexploring-the-klipy-api-29po) [Share to LinkedIn](https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fdev.to%2Fzuplo%2Fexploring-the-klipy-api-29po&title=Exploring%20the%20KLIPY%20API&summary=Explore%20an%20alternative%20to%20GIPHY%20and%20Tenor%20API%20that%20helps%20apps%20to%20generate%20revenue%20via%20GIFs%2C%20Clips%20and%20Stickers.&source=DEV%20Community) [Share to Facebook](https://www.facebook.com/sharer.php?u=https%3A%2F%2Fdev.to%2Fzuplo%2Fexploring-the-klipy-api-29po) [Share to Mastodon](https://s2f.kytta.dev/?text=https%3A%2F%2Fdev.to%2Fzuplo%2Fexploring-the-klipy-api-29po)

[Share Post via...](about:blank#) [Report Abuse](https://dev.to/report-abuse)

![Cover image for Exploring the KLIPY API](https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fcdn.zuplo.com%2Fwww%2Fmedia%2Fposts%2F2025-02-10-klipy-api%2Fimage.png)

[![Zuplo profile image](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F9445%2F1cec1839-f678-42e3-9019-c2ce84a863f9.png)](https://dev.to/zuplo)[![Adrian Machado](https://media2.dev.to/dynamic/image/width=50,height=50,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Fuser%2Fprofile_image%2F2222056%2Fb8e6123c-1c51-44bb-9576-9f28d2a5c200.jpg)](https://dev.to/adrian_zuplo)

[Adrian Machado](https://dev.to/adrian_zuplo) for [Zuplo](https://dev.to/zuplo)

Posted on Mar 7, 2025

• Edited on Jun 11

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)4![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)

# Exploring the KLIPY API

[#api](https://dev.to/t/api) [#tutorial](https://dev.to/t/tutorial)

Recently, GIPHY has become too expensive for apps to sustain with their $12k/yr model, and Tenor is likely heading in the same direction—after all, no tool is free to maintain, and everything comes with costs. Amid these challenges, many app developers sought alternatives and discovered [KLIPY](https://klipy.com/about)—the only platform for GIFs, Clips, and Stickers with a completely different business model. KLIPY offers a lifetime free API and enables apps to generate revenue by inserting non-intrusive ads between content.

In this article, we’ll guide you through migrating from GIPHY or Tenor to KLIPY and show you how this innovative API can transform your app’s content and revenue strategy.

### **Why Switch to KLIPY API?**

KLIPY is 100% REALLY LIFETIME FREE API and stands out by combining creative flexibility with advanced features tailored for both developers and businesses. Here’s what makes it different:

### 1\. **Localization at Its Core**

KLIPY offers a powerful localization feature, ensuring that users in different regions see Trending content tailored to their language, culture, and preferences. This level of personalization boosts user engagement significantly.

### 2\. **Revenue Generation Model**

Unlike GIPHY or Tenor, KLIPY incorporates a seamless **ad revenue generation model**. With non-intrusive **programmatic and native ads**, developers can monetize their apps effectively without compromising user experience.

### 3\. Dashboard for Content and Revenue Management

You can Track and analyze Revenue (CPM, CTR, Fill rate) and user engagement. You can also maintain control over the content and ad categories your users see.

For a full list of KLIPY’s features and benefits, check out [KLIPY Developers](https://klipy.com/developers).

### **How to Integrate KLIPY API**

Migrating to KLIPY is simple and developer-friendly. Follow these steps to get started:

1. **Sign Up and [Get API Key](https://klipy.com/developers)**

Create a KLIPY account and generate your API key from the dashboard.

1. **Follow the [API documentation](https://klipy.com/api) for Guidance**

The documentation offers clear instructions and code examples to help you seamlessly incorporate KLIPY’s content into your app or platform.

1. **Start Fetching Content**

Use the KLIPY API endpoints to fetch GIFs, clips, or stickers based on your app’s needs. The API supports keyword searches, trending items, localized content and etc.

1. **Implement Monetization**

Leverage our simple Revenue API to integrate seamless, user-friendly ads into your platform. By displaying these ads in place of any GIF, Clip or Sticker in Trending or Search results, you can generate substantial revenue while enhancing the user experience.

1. **Request Production Access**

Once your integration is fully tested, request production access by filling out a simple form in the Publisher Admin Panel to unlock unlimited API calls and generate revenue.

For detailed integration instructions, refer to the [KLIPY Docs](https://klipy.com/docs#steps).

### **Endpoints Comparison**

KLIPY provides robust endpoints similar to GIPHY and Tenor but with additional flexibility and features. Let’s compare:

### **Search Endpoint**

**Giphy:**

```
GET https://api.giphy.com/v1/gifs/search
```

Enter fullscreen modeExit fullscreen mode

**Tenor:**

```
GET https://tenor.googleapis.com/v2/search
```

Enter fullscreen modeExit fullscreen mode

**KLIPY:**

```
GET https://api.klipy.com/api/v1/API_KEY/gifs/search
```

Enter fullscreen modeExit fullscreen mode

_KLIPY’s endpoint supports localization with the `locale` parameter for personalized results._

### **Trending Endpoint**

**Giphy:**

```
GET https://api.giphy.com/v1/gifs/trending
```

Enter fullscreen modeExit fullscreen mode

**Tenor:**

```
GET https://tenor.googleapis.com/v2/featured
```

Enter fullscreen modeExit fullscreen mode

**KLIPY:**

```
GET https://api.klipy.com/api/v1/API_KEY/gifs/trending
```

Enter fullscreen modeExit fullscreen mode

_KLIPY adds region-based filtering for trending content._

Get GIF by ID

**Giphy:**

```
GET https://api.giphy.com/v1/gifs/{gif_id} ​
```

Enter fullscreen modeExit fullscreen mode

**Tenor:**

```
GET
https://tenor.googleapis.com/v2/posts
```

Enter fullscreen modeExit fullscreen mode

**KLIPY:**

```
GET
https://api.klipy.com/api/v1/API_KEY/gifs/SLUG
```

Enter fullscreen modeExit fullscreen mode

## Adjusting Request Parameters

### Search Query

- **Giphy**: **`q`**
- **Tenor**: **`q`**
- **KLIPY**: **`q`**

### **Limit Results**

- **Giphy**: **`limit`** (default 25)
- **Tenor**: **`limit`** (default 20, max 50)
- **KLIPY**: **`per_page`** (default 24, min 8, max 50)

### **Offset/Pagination**

- **Giphy**: **`offset`**
- **Tenor**: **`pos`** (use the **`next`** value from the previous response)
- **KLIPY**: **`page`**

### **Content Rating**

- **Giphy**: **`rating`** ( **`g`**, **`pg`**, **`pg-13`**, **`r`**)
- **Tenor**: **`contentfilter`** ( **`off`**, **`low`**, **`medium`**, **`high`**)
- **KLIPY**: **`rating`** ( **`g`**, **`pg`**, **`pg-13`**, **`r`**)

### **Language**

- **Giphy**: **`lang`** (2-letter ISO 639-1 code)
- **Tenor**: **`locale`** ( **`xx_YY`** format, e.g., **`en_US`**)
- **KLIPY**: **`locale`** (ISO 3166 Alpha-2 format ( **`ge_GE`**; **`us_US`**;
**`uk_UK`**; etc)

### Advertisement Request Endpoint

KLIPY’s API enables seamless integration of ads within your content to generate revenue. Advertisements are available in the Trending, Search, and Recents sections of our GIFs, Clips, and Stickers products.

To show advertisements in Search and Trending sections you can use the same endpoints that already was included above and to show advertismenets in Recents section use the following endpoint:

```
GET https://api.klipy.com/api/v1/{API_KEY}/gifs/recent/{CUSTOMER_ID}
```

Enter fullscreen modeExit fullscreen mode

**Parameters**

\| **Required parameters** \| **Description** \| **Example** \| \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \| `customer_id` \| Unique ID of user in your system \| “5429ce1c-3412-4953-9a86-9af8d7f9117b” \| \| `ad-min-width` \| Minimum width in pixels ( **RECOMMENDED: 50**) \| 50 \| \| `ad-max-width` \| Maximum width in pixels ( **RECOMMENDED: device-width**) \| 401 \| \| `ad-min-height` \| Minimum height in pixels ( **RECOMMENDED: 50**) \| 50 \| \| `ad-max-height` \| Maximum height in pixels ( **RECOMMENDED: 250**) \| 250 \|

We strongly recommend sending required parameters for ad sizes, with width (minimum: 50, maximum: device.width) and height (minimum: 50, maximum: 250), to support all popular ad dimensions.

**Response:** The response includes ad content and metadata, which can be displayed within your application to monetize user interactions.

For more information on handling advertisements, check the [KLIPY API Documentation](https://klipy.com/api).

### Handling Responses and Data Structures

KLIPY’s response structure is optimized for simplicity and flexibility, ensuring smooth integration. Here’s how it compares:

Giphy Response:

```
{ "data": [...], "pagination": {...}, "meta": {...} }
```

Enter fullscreen modeExit fullscreen mode

Tenor Response:

\`\`\`json {

"results": \[...\], "next": "string" } ​

````

KLIPY Response:

```json
{ "result": true, "data":
{"data": [...], "current_page": 1, "per_page": 24, "has_next": true } }
````

Enter fullscreen modeExit fullscreen mode

### **Accessing GIF URLs**

- **Giphy**: Access via **`images.original.url`** in each GIF object.
- **Tenor**: Access via **`media_formats`** in each result object.
- **KLIPY**: Access via **`files`** in each result object.

### **Conclusion**

Migrating to KLIPY API opens up a world of opportunities with advanced features like localization and ad revenue generation. Whether you’re a developer aiming to enhance user experiences or a business looking to monetize app engagement effectively, KLIPY offers a comprehensive solution.

[![profile](https://media2.dev.to/dynamic/image/width=64,height=64,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F3774%2F99e0624e-6fb6-4460-819d-3a0d967519cb.webp)\\
Sentry](https://dev.to/sentry) Promoted

Dropdown menu

- [What's a billboard?](https://dev.to/billboards)
- [Manage preferences](https://dev.to/settings/customization#sponsors)

* * *

- [Report billboard](https://dev.to/report-abuse?billboard=262819)

[![Sentry image](https://media2.dev.to/dynamic/image/width=775%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fi.imgur.com%2FwFsBxSs.png)](https://sentry.io/for/nextjs/?utm_source=devto&utm_medium=paid-community&utm_campaign=nextjs-fy27q1-nextjs&utm_content=static-ad-product-trysentry&bb=262819)

## [npx @sentry/wizard@latest -i nextjs](https://sentry.io/for/nextjs/?utm_source=devto&utm_medium=paid-community&utm_campaign=nextjs-fy27q1-nextjs&utm_content=static-ad-product-trysentry&bb=262819)

Read More


## Top comments (0)

Subscribe

![pic](https://media2.dev.to/dynamic/image/width=256,height=,fit=scale-down,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8j7kvp660rqzt99zui8e.png)

PersonalTrusted User

[Create template](https://dev.to/settings/response-templates)

Templates let you quickly answer FAQs or store snippets for re-use.

SubmitPreview [Dismiss](https://dev.to/404.html)

[Code of Conduct](https://dev.to/code-of-conduct)• [Report abuse](https://dev.to/report-abuse)

Are you sure you want to hide this comment? It will become hidden in your post, but will still be visible via the comment's [permalink](https://dev.to/zuplo/exploring-the-klipy-api-29po#).


Hide child comments as well

Confirm


For further actions, you may consider blocking this person and/or [reporting abuse](https://dev.to/report-abuse)

[![profile](https://media2.dev.to/dynamic/image/width=64,height=64,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F3774%2F99e0624e-6fb6-4460-819d-3a0d967519cb.webp)\\
Sentry](https://dev.to/sentry) Promoted

Dropdown menu

- [What's a billboard?](https://dev.to/billboards)
- [Manage preferences](https://dev.to/settings/customization#sponsors)

* * *

- [Report billboard](https://dev.to/report-abuse?billboard=262818)

[![Sentry image](https://media2.dev.to/dynamic/image/width=775%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fi.imgur.com%2FwFsBxSs.png)](https://sentry.io/for/nextjs/?utm_source=devto&utm_medium=paid-community&utm_campaign=nextjs-fy27q1-nextjs&utm_content=static-ad-product-trysentry&bb=262818)

## [npx @sentry/wizard@latest -i nextjs](https://sentry.io/for/nextjs/?utm_source=devto&utm_medium=paid-community&utm_campaign=nextjs-fy27q1-nextjs&utm_content=static-ad-product-trysentry&bb=262818)

[![](https://media2.dev.to/dynamic/image/width=90,height=90,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F9445%2F1cec1839-f678-42e3-9019-c2ce84a863f9.png)\\
Zuplo](https://dev.to/zuplo)

Follow

### More from [Zuplo](https://dev.to/zuplo)

[Building a Monetized API (Part 4 of 4)\\
\\
#api#monetization#apigateway](https://dev.to/zuplo/building-a-monetized-api-part-4-of-4-4ecc) [Building a Monetized API (Part 3 of 4)\\
\\
#api#monetization#apigateway](https://dev.to/zuplo/building-a-monetized-api-part-3-of-4-2oml) [Building a Monetized API (Part 2 of 4)\\
\\
#api#monetization#apigateway](https://dev.to/zuplo/building-a-monetized-api-part-2-of-4-59ie)

[![profile](https://media2.dev.to/dynamic/image/width=64,height=64,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Forganization%2Fprofile_image%2F140%2F9639a040-3c27-4b99-b65a-85e100016d3c.png)\\
MongoDB](https://dev.to/mongodb) Promoted

Dropdown menu

- [What's a billboard?](https://dev.to/billboards)
- [Manage preferences](https://dev.to/settings/customization#sponsors)

* * *

- [Report billboard](https://dev.to/report-abuse?billboard=263131)

[![MongoDB Atlas image](https://media2.dev.to/dynamic/image/width=350%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fi.imgur.com%2FTTmk3GK.jpeg)](https://www.mongodb.com/cloud/atlas/lp/try3?utm_campaign=display_dev.to-broad_pl_flighted_atlas_tryatlaslp_prosp_gic-null_ww-all_dev_dv-all_eng_leadgen&utm_source=dev.to&utm_medium=display&utm_content=fastcode&bb=263131)

## [3 reasons why developers scale faster on MongoDB Atlas.](https://www.mongodb.com/cloud/atlas/lp/try3?utm_campaign=display_dev.to-broad_pl_flighted_atlas_tryatlaslp_prosp_gic-null_ww-all_dev_dv-all_eng_leadgen&utm_source=dev.to&utm_medium=display&utm_content=fastcode&bb=263131)

A flexible schema, integrated search, and automated global distribution so you can innovate and innovate with speed and agility. Build gen AI apps that run anywhere and scale everywhere.

[Start Free](https://www.mongodb.com/cloud/atlas/lp/try3?utm_campaign=display_dev.to-broad_pl_flighted_atlas_tryatlaslp_prosp_gic-null_ww-all_dev_dv-all_eng_leadgen&utm_source=dev.to&utm_medium=display&utm_content=fastcode&bb=263131)

👋 Kindness is contagious

Dropdown menu

- [What's a billboard?](https://dev.to/billboards)
- [Manage preferences](https://dev.to/settings/customization#sponsors)

* * *

- [Report billboard](https://dev.to/report-abuse?billboard=239338)

x

Explore this practical breakdown on DEV’s open platform, where developers from every background come together to push boundaries. **No matter your experience,** your viewpoint enriches the conversation.

Dropping a simple “thank you” or question in the comments goes a long way in supporting authors—your feedback helps ideas evolve.

At DEV, **shared discovery drives progress** and builds lasting bonds. If this post resonated, a quick nod of appreciation can make all the difference.

## [Okay](https://dev.to/enter?state=new-user&bb=239338)

💎 DEV Diamond Sponsors


Thank you to our Diamond Sponsors for supporting the DEV Community


[![Google AI - Official AI Model and Platform Partner](https://media2.dev.to/dynamic/image/width=880%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fxjlyhbdqehj3akhz166w.png)](https://aistudio.google.com/?utm_source=partner&utm_medium=partner&utm_campaign=FY25-Global-DEVpartnership-sponsorship-AIS&utm_content=-&utm_term=-&bb=146443)

Google AI is the official AI Model and Platform Partner of DEV

[![Neon - Official Database Partner](https://media2.dev.to/dynamic/image/width=880%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fbnl88cil6afxzmgwrgtt.png)](https://neon.tech/?ref=devto&bb=146443)

Neon is the official database partner of DEV

[![Algolia - Official Search Partner](https://media2.dev.to/dynamic/image/width=880%2Cheight=%2Cfit=scale-down%2Cgravity=auto%2Cformat=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fv30ephnolfvnlwgwm0yz.png)](https://www.algolia.com/developers/?utm_source=devto&utm_medium=referral&bb=146443)

Algolia is the official search partner of DEV

[DEV Community](https://dev.to/) — A space to discuss and keep up software development and manage your software career


- [Home](https://dev.to/)
- [DEV Challenges](https://dev.to/challenges)
- [DEV++](https://dev.to/++)
- [Videos](https://dev.to/videos)
- [DEV Education Tracks](https://dev.to/deved)
- [DEV Help](https://dev.to/help)
- [Advertise on DEV](https://dev.to/advertise)
- [Organization Accounts](https://dev.to/organizations)
- [DEV Showcase](https://dev.to/showcase)
- [About](https://dev.to/about)
- [Contact](https://dev.to/contact)
- [Free Postgres Database](https://dev.to/free-postgres-database-tier)
- [DEV Shop](https://shop.forem.com/)
- [MLH](https://mlh.io/)

- [Code of Conduct](https://dev.to/code-of-conduct)
- [Privacy Policy](https://dev.to/privacy)
- [Terms of Use](https://dev.to/terms)

Built on [Forem](https://www.forem.com/) — the [open source](https://dev.to/t/opensource) software that powers [DEV](https://dev.to/) and other inclusive communities.

Made with love and [Ruby on Rails](https://dev.to/t/rails). DEV Community © 2016 - 2026.

![DEV Community](https://media2.dev.to/dynamic/image/width=190,height=,fit=scale-down,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2F8j7kvp660rqzt99zui8e.png)

We're a place where coders share, stay up-to-date and grow their careers.


[Log in](https://dev.to/enter?signup_subforem=1) [Create account](https://dev.to/enter?signup_subforem=1&state=new-user)

![](https://assets.dev.to/assets/sparkle-heart-5f9bee3767e18deb1bb725290cb151c25234768a0e9a2bd39370c382d02920cf.svg)![](https://assets.dev.to/assets/multi-unicorn-b44d6f8c23cdd00964192bedc38af3e82463978aa611b4365bd33a0f1f4f3e97.svg)![](https://assets.dev.to/assets/exploding-head-daceb38d627e6ae9b730f36a1e390fca556a4289d5a41abb2c35068ad3e2c4b5.svg)![](https://assets.dev.to/assets/raised-hands-74b2099fd66a39f2d7eed9305ee0f4553df0eb7b4f11b01b6b1b499973048fe5.svg)![](https://assets.dev.to/assets/fire-f60e7a582391810302117f987b22a8ef04a2fe0df7e3258a5f49332df1cec71e.svg)