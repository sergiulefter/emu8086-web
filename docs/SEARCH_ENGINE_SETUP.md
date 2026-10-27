# Search engine setup (Google and Bing)

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://sergiulefter.github.io/emu8086-web/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

This guide registers the live emulator, https://sergiulefter.github.io/emu8086-web/, with Google Search
Console and Bing Webmaster Tools. Only the owner of the GitHub account can complete it. **None of these steps has
been done yet**, so this file does not claim the site is verified, indexed or submitted.

## What the site already provides
- `index.html` has a title, a meta description, a canonical URL (`https://sergiulefter.github.io/emu8086-web/`),
  `index, follow`, Open Graph and Twitter tags, and `WebApplication` JSON-LD structured data.
- The HTML contains a real text description of the app before JavaScript runs, so crawlers that do not
  execute JavaScript still see what the page is.
- `https://sergiulefter.github.io/emu8086-web/sitemap.xml` lists the one canonical page.
- `npm run check:seo` checks all of this in every production build, and the deploy workflow runs it before
  publishing.

## Important limits of GitHub Pages project sites
- **robots.txt only works at the host root.** Crawlers read `https://sergiulefter.github.io/robots.txt`, not
  `/emu8086-web/robots.txt`. The host root currently returns 404, which crawlers treat as *everything allowed*.
  The project's own `robots.txt` documents the policy and the sitemap URL, but search engines will not read it.
  **Submit the sitemap manually** (below).
  - If you ever create a user site repository named `sergiulefter.github.io`, its `robots.txt` will apply to
    this project too. Make sure it does not disallow `/emu8086-web/`.
- **A Domain property (DNS verification) is not possible**, because you do not control the DNS of `github.io`.
  Use a **URL-prefix property** instead.
- Verification files and tags must be deployed through this repository: put a file in `public/` or a tag in
  `index.html`, then push to `main`. The deploy workflow publishes the change within a minute or two.

## Google Search Console

1. Open https://search.google.com/search-console and sign in with your Google account.
2. **Add property → URL prefix**, and enter exactly `https://sergiulefter.github.io/emu8086-web/`, including the
   trailing slash.
3. **Verify ownership** with one of the methods that work on GitHub Pages:
   - **HTML tag (simplest):** copy the `<meta name="google-site-verification" content="…">` tag, add it to the
     `<head>` of `index.html` next to the other meta tags, then commit and push to `main`. Wait for the
     *Deploy to GitHub Pages* workflow to finish, then click **Verify**. Keep the tag afterwards, because
     removing it un-verifies the property. The token is not a secret, so committing it is fine.
   - **HTML file:** download `google<token>.html`, put it in `public/`, push, and check that
     `https://sergiulefter.github.io/emu8086-web/google<token>.html` loads. Then click **Verify**.
4. **Submit the sitemap:** go to **Indexing → Sitemaps**, enter `sitemap.xml` (the full URL is
   `https://sergiulefter.github.io/emu8086-web/sitemap.xml`) and click **Submit**. The status should become
   *Success* with 1 discovered URL.
5. **Inspect the homepage:** open **URL inspection**, paste the canonical URL, then use **Test live URL** →
   **View tested page** to check the rendered HTML and screenshot. You should see the emulator, the title
   *emu8086-web — Free Online 8086 Emulator & Assembler*, and the structured data under
   *Enhancements / Detected items*.
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
   - Or **add manually**: enter `https://sergiulefter.github.io/emu8086-web/`.
3. **Verify ownership** (manual route): use the **meta tag** option. Add
   `<meta name="msvalidate.01" content="…">` to `index.html`, push, wait for the deploy, then click **Verify**.
   Bing's XML-file option expects the file at the root of the site you added; if you try it, put
   `BingSiteAuth.xml` in `public/`.
4. **Submit the sitemap:** **Sitemaps → Submit sitemap** → `https://sergiulefter.github.io/emu8086-web/sitemap.xml`.
5. **Check indexing:** use **URL Inspection** for the homepage, and **Site Explorer** to see what Bing knows.
6. **Monitor crawl errors** in **Crawl & Index / Site Explorer**, and under the **Recommendations** (SEO) report.
7. **IndexNow** (optional): IndexNow notifies Bing and other participating engines immediately when a URL changes.
   - For a one-page site that changes rarely, a sitemap is enough, so **it is not implemented**.
   - If you add it later, you need a key file hosted on the site (for a project site, under `/emu8086-web/`, passed
     as `keyLocation`) and one request after each deploy.
   - Treat the key as configuration rather than a password, but never commit other credentials. Store anything
     sensitive in GitHub Actions secrets.

## After registration
- Results appear over days to weeks. Indexing is not guaranteed.
- Re-check **Pages** and **Performance** in both tools every few weeks. Note the queries that bring visitors, and
  check that the snippet text describes the app accurately.
- See [AI_DISCOVERY.md](AI_DISCOVERY.md) for distribution and the AI-search test checklist.
