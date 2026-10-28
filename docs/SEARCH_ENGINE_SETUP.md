# Search engine setup (Google and Bing)

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://emu8086.sergiulefter.com/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

This guide registers the live emulator, https://emu8086.sergiulefter.com/, with Google Search
Console and Bing Webmaster Tools. These steps require access to the relevant search console account.
The parent `sergiulefter.com` Domain property is already verified in Google Search Console and covers
this subdomain. This guide does not claim that the emulator itself has been submitted or indexed.

## What the site already provides
- `index.html` has a title, a meta description, a canonical URL (`https://emu8086.sergiulefter.com/`),
  `index, follow`, Open Graph and Twitter tags, and `WebApplication` JSON-LD structured data.
- The HTML contains a real text description of the app before JavaScript runs, so crawlers that do not
  execute JavaScript still see what the page is.
- `https://emu8086.sergiulefter.com/sitemap.xml` lists the one canonical page.
- `npm run build:cloudflare` runs tests, builds the app and runs `npm run check:seo` before publishing.

## Cloudflare hosting
- Crawlers read `https://emu8086.sergiulefter.com/robots.txt`; it allows crawling and names the sitemap.
- The parent Domain property covers both the portfolio and emulator. Submit the emulator's own sitemap
  separately using its full URL.
- Any additional verification files belong in `public/`; verification meta tags belong in `index.html`.
  Deploy the change before checking verification.

## Google Search Console

1. Open https://search.google.com/search-console and sign in with your Google account.
2. Select the verified **sergiulefter.com** Domain property.
3. Optionally add a URL-prefix property for `https://emu8086.sergiulefter.com/` to keep its reports separate.
   The verified parent domain establishes ownership of this subdomain.
4. **Submit the sitemap:** go to **Indexing → Sitemaps**, enter
   `https://emu8086.sergiulefter.com/sitemap.xml` and click **Submit**. The status should become
   *Success* with 1 discovered URL.
5. **Inspect the homepage:** open **URL inspection**, paste the canonical URL, then use **Test live URL** →
   **View tested page** to check the rendered HTML and screenshot. You should see the emulator, the title
   *emu8086-web | Free Online 8086 Emulator & Assembler*. General structured data is not necessarily
   shown as an enhancement in Search Console.
6. **Request indexing** from the same URL inspection screen. You only need to do this once, or after big changes;
   repeated requests do not speed anything up.
7. **Watch indexing and crawl errors:**
   - **Indexing → Pages** shows whether the URL is indexed and why it might not be. Common harmless states are
     *Discovered – currently not indexed* and *Crawled – currently not indexed*; give it time.
   - **Settings → Crawl stats** shows fetch errors.
8. **Watch search performance:** **Performance → Search results** shows impressions, clicks, average position and
   the queries that led to the site. AI Overviews and AI Mode traffic is counted in the same report.

Structured data note: the page uses `WebApplication` markup. Google shows software rich results only for pages
with genuine ratings or reviews, and none are added here because there are none, so you won't see a rich result.
The markup still describes the page accurately to search engines. Check it with
https://search.google.com/test/rich-results and https://validator.schema.org.

## Bing Webmaster Tools (also feeds Copilot and DuckDuckGo results)

1. Open https://www.bing.com/webmasters and sign in. A Microsoft, Google or Facebook account works.
2. **Add the site:**
   - **Import from Google Search Console** is the fastest route once step 3 above is done. It copies the site and
     sitemap, and the verification carries over.
   - Or **add manually**: enter `https://emu8086.sergiulefter.com/`.
3. **Verify ownership** (manual route): use the **meta tag** option. Add
   `<meta name="msvalidate.01" content="…">` to `index.html`, push, wait for the deploy, then click **Verify**.
   Bing's XML-file option expects the file at the root of the site you added; if you try it, put
   `BingSiteAuth.xml` in `public/`.
4. **Submit the sitemap:** **Sitemaps → Submit sitemap** → `https://emu8086.sergiulefter.com/sitemap.xml`.
5. **Check indexing:** use **URL Inspection** for the homepage, and **Site Explorer** to see what Bing knows.
6. **Monitor crawl errors** in **Crawl & Index / Site Explorer**, and under the **Recommendations** (SEO) report.
7. **IndexNow** (optional): IndexNow notifies Bing and other participating engines immediately when a URL changes.
   - For a one-page site that changes rarely, a sitemap is enough, so **it is not implemented**.
   - If you add it later, you need a key file hosted on the emulator's origin and one request after each deploy.
   - Treat the key as configuration rather than a password, but never commit other credentials. Store anything
     sensitive in GitHub Actions secrets.

## After registration
- Results appear over days to weeks. Indexing is not guaranteed.
- Re-check **Pages** and **Performance** in both tools every few weeks. Note the queries that bring visitors, and
  check that the snippet text describes the app accurately.
- See [AI_DISCOVERY.md](AI_DISCOVERY.md) for distribution and the AI-search test checklist.
