# Discovery by search engines and AI-assisted search

> Part of **emu8086-web**, the free online 8086 assembler, emulator and debugger: [open the live emulator](https://sergiulefter.github.io/emu8086-web/) · [README and FAQ](../README.md) · [architecture](ARCHITECTURE.md) · [support matrix](SUPPORT_MATRIX.md) · [known differences](KNOWN_UI_DIFFERENCES.md) · [verification report](VERIFICATION_REPORT.md)

This file explains, without guarantees, how people and AI search tools can find emu8086-web, and what has been
done in the repository to help.

## Four different outcomes

| Outcome | What it means | What it depends on |
|---|---|---|
| 1. **Indexed** | A search engine has crawled the page and stored it | crawlable HTML, no `noindex`, sitemap submission, links from elsewhere |
| 2. **Shown in results** | The page appears for a query someone types | relevance of the title, description and content to the query, plus the page's standing (links, usage) |
| 3. **Cited in an AI search answer** | Google AI Overviews / AI Mode, Bing Copilot, ChatGPT Search or Perplexity link to the page in an answer | the page must first be indexed by the system's search source; the answer then picks pages that clearly answer the question |
| 4. **In model training data** | A language model learned about the project during training | crawls for training data, which are separate from search crawls; no site can ensure this, and it is not a goal here |

Being indexed does not mean being shown, and being shown does not mean being cited. Allowing a training crawler
does **not** mean a model will know about or recommend the project.

## How the main systems find pages (as documented by their providers)
- **Google AI Overviews and AI Mode** use Google Search's index and ranking. There is no separate submission and
  no special markup; the normal Search requirements apply (indexed, eligible for a snippet). **Gemini** answers
  with web results also rely on Google Search.
- **Microsoft Copilot** answers use Bing's index, so Bing Webmaster Tools is the main lever
  ([SEARCH_ENGINE_SETUP.md](SEARCH_ENGINE_SETUP.md)).
- **ChatGPT Search** uses OpenAI's `OAI-SearchBot` crawler and third-party search providers. `GPTBot` is OpenAI's
  *training* crawler and is unrelated to appearing in ChatGPT Search.
- **Perplexity** uses its own crawler (`PerplexityBot`) and its own index.
- **GitHub search** ranks repositories by name, description, topics and README text.

No crawler is blocked. The host-level `robots.txt` (`https://sergiulefter.github.io/robots.txt`) returns 404, which
means *allow everything*. No crawler-specific rules were added, because none are needed.

### Why there is no `llms.txt`
`llms.txt` is a community proposal, not a standard. Google, Bing, OpenAI and Perplexity do not document using it
for search, and it is not a requirement for any of the systems above. The README and documentation already give
a clear, linkable description, so an `llms.txt` would duplicate them. It can be added later if a tool you care
about documents a real use for it.

## What has been done in this repository
- **A clear project identity:** the name *emu8086-web* is used consistently in the page title, metadata,
  structured data, the app's own windows, the README and the docs. The page and the README state that it is
  independent from EMU8086.
- **Crawlable HTML:** the page's initial HTML contains a short, real description of the app (with an `<h1>`, plain
  paragraphs and a link to the source) before JavaScript runs, plus a `<noscript>` message. The app replaces it
  when it starts. The same text is visible to people and crawlers, with no hidden text.
- **Metadata:** title, description, canonical URL, Open Graph and Twitter cards with a real screenshot, and
  `WebApplication` JSON-LD with no invented ratings, reviews or counts.
- **Accurate documentation:**
  - The README starts with what it is, the live link, features, platforms, use cases, EMU8086 compatibility and an
    FAQ written as direct answers to common questions.
  - The details are in the [support matrix](SUPPORT_MATRIX.md), the
    [known differences](KNOWN_UI_DIFFERENCES.md) and the [verification report](VERIFICATION_REPORT.md).
  - Claims about compatibility are deliberately conservative.
- **GitHub metadata:** a repository description, the homepage URL and topics such as `8086`, `emu8086`,
  `x86-assembly`, `emulator` and `assembler`.

## What helps most from here: real references
AI answers and search rankings both lean on what *other* sites say about a project. The most useful steps are
genuine:

- **Tell the people who need it.** Instructors and students in courses that use EMU8086 are the primary audience.
  A link from a course page, lab handout or university forum is the most valuable kind of reference.
- **Programming communities:** share it where it is on-topic and where the rules allow showing your own work.
  Read each community's self-promotion rules first. Examples:
  - Reddit communities about assembly, learning programming and computer science
  - Hacker News (*Show HN*)
  - relevant Discord or Stack Exchange chat rooms

  On Q&A sites, mention it only when it truly answers the question, and say that you wrote it.
- **A technical write-up:** a blog post (dev.to, Hashnode or a personal blog) about how the emulator works, for
  example step back with a memory journal, or testing a CPU against 2.9 million hardware-recorded tests. This
  earns links naturally and gives AI systems a citable explanation.
- **Directories:** list it where alternatives to EMU8086 are collected (for example AlternativeTo's EMU8086 page),
  and in curated lists about assembly or emulators that accept contributions.
- **Demonstrations:** a short screen recording or GIF of stepping through a program, linked from the README.

Avoid fake reviews, bought or exchanged links, posting the same message to many communities, and editing Wikipedia
about your own project. These break platform rules and can get the site demoted.

## AI visibility test checklist (repeat every 1–3 months)

Ask each question in a **fresh session** (logged out, or in a private window, with no previous context about
emu8086-web), in each system:

| # | Question |
|---|---|
| 1 | What is a free online alternative to EMU8086? |
| 2 | Where can I run Intel 8086 assembly code online? |
| 3 | Is there a browser-based EMU8086 alternative? |
| 4 | What is the best online 8086 emulator for Linux? |
| 5 | Can I run 8086 assembly without installing software? |
| 6 | Which online 8086 emulator supports debugging? |
| 7 | Is there a free 8086 assembler with register inspection? |
| 8 | What browser-based tools support EMU8086-style assembly? |
| 9 | Where can students practice 8086 assembly programming? |

Systems to check: **Google Search**, **Google AI Overviews / AI Mode**, **Gemini**, **ChatGPT Search**,
**Perplexity**, **Bing** and **Microsoft Copilot**.

Record each result in a table:

| Date | System | Question # | Mentioned? | Linked/cited URL | Description accurate? | Notes |
|---|---|---|---|---|---|---|

How to read the results:
- A single run proves nothing, because answers vary between sessions, locations and days. Look for trends across
  several checks.
- If a system describes the project **inaccurately** (for example, claims EXE or macro support), make the README
  or FAQ wording clearer on that point. Do not add keyword-heavy text.
- Do these checks by hand. Automated scraping of search engines or AI assistants is against most of their terms
  of service.
- Compare with Search Console and Bing Webmaster data. Impressions there show search visibility, which normally
  comes before AI citations.
