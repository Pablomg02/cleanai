# Subscription to API-equivalent conversion factors (Anthropic, Google, OpenAI)

Research date: 2026-11-11 (Google AI Pro and Gemini 4 Hydrogen updated 2026-11-13). Web research only. Every number below has a source, or is labelled **ASSUMPTION**. Most estimates of API-equivalent value come from third parties, because neither Anthropic nor Google publishes absolute limits.

---

## 0. TL;DR

| Plan | USD/mo (list, pre-tax) | EUR/mo Spain (incl. 21% IVA) | Dataset models included | API-USD/mo low / **mid** / high | Ratio (mid) | Confidence |
|---|---|---|---|---|---|---|
| Claude Pro | 20 | 21.78 (assumed) | Opus, Sonnet, Haiku (Fable only via pay-as-you-go credits) | 600 / **850** / 1,200 | **42.5x** | medium |
| Claude Max (formerly "Max 5x") | 100 | 108.90 (assumed) | Fable (up to 50% of weekly limit), Opus, Sonnet, Haiku | 3,000 / **4,350** / 5,825 | **43.5x** | medium |
| Claude Ultra (formerly "Max 20x") | 200 | 217.80 (assumed) | Fable (up to 50% of weekly limit), Opus, Sonnet, Haiku | 5,800 / **8,700** / 11,926 | **43.5x** | medium |
| Google AI Pro | 19.99 | 21.99 | Gemini 4 Hydrogen (no Carbon: pay-as-you-go) | 60 / **150** / 400 (ASSUMPTION) | 7.5x | low |
| Google AI Ultra (5x) | 99.99 | 99.99 | Gemini 4 Carbon, Hydrogen | 300 / **750** / 2,000 (ASSUMPTION) | 7.5x | low |
| Google AI Ultra (20x) | 199.99 | 219.99 | Gemini 4 Carbon, Hydrogen | 1,200 / **3,000** / 8,000 (ASSUMPTION) | 15x | low |

- FX: ECB reference rate on **2026-11-10: 1 EUR = 1.1214 USD**.
- Ratio = API-USD per month at full use / subscription list price in USD.
- To show cost per task as "€ of subscription", use: `€_sub = API_USD_cost × price_eur / api_usd_month`. The factor `price_eur / api_usd_month(mid)` is in the JSON as `eur_sub_per_api_usd_mid`.
- Per-model caveat: the Anthropic ratios are measured mostly on **Opus** workloads. Measured **Fable** usage gives about 0.4x as much API value per unit of limit (see §4). On **Pro**, Fable has **no** subscription discount (ratio 1.0) because it is billed through usage credits at API rates.

---

## 1. Plans, prices and model inclusion

### Anthropic (official: claude.com/pricing, fetched 2026-11-11; support articles)

On **2026-10-30**, Anthropic renamed its plans. "Max 20x" ($200) became **Ultra** and "Max 5x" ($100) became plain **Max**. Prices did not change. Verified Ultra accounts lost the 5-hour limit, and "weekly limits remain unchanged". Sources: buildmvpfast.com (2026-11-04), which cites the @claudeai post on X (2026-10-30), and letsdatascience.com / requesty.ai.

| Plan | USD | Usage (official wording) | Models | Claude Code | Extra |
|---|---|---|---|---|---|
| Free | 0 | "Limited" | Sonnet, Haiku | No | - |
| Pro | $20/mo ($17/mo billed annually, $200/yr) | 1x Pro per 5 h and per week | Opus, Sonnet, Haiku. Fable "paid with usage credits" | Yes | - |
| Max | $100/mo | "5x Pro usage" per 5 h and per week | Opus, Sonnet, Haiku. Fable "included, up to half your weekly limit" | Yes | **$100/mo API credits** |
| Ultra | $200/mo | "No 5-hour limit" (verified accounts), "10x Pro usage" every week | Opus, Sonnet, Haiku. Fable at 50% of weekly limit | Yes | **$200/mo API credits** |

- The pricing page says: "Prices shown don't include applicable tax."
- **Fable support article** (support.claude.com/en/articles/15424964, "updated yesterday", i.e. around 2026-11-10):
  - On Max, Ultra and premium seats, Fable 5.2, 5.1 and 5 are "a standard part of your plan".
  - On Pro and standard seats, they "run on pay-as-you-go usage credits".
  - Fable is not available on Free.
  - Fable draws from the regular weekly limit and uses it "faster than other Claude models", up to 50% of the weekly limit. Fable 5.2 in Claude Code needs version 2.1.321 or later.
  - Fable moved to usage credits on Pro on **2026-07-20**, and Pro users got a one-time $100 credit (pasqualepillitteri.it, aipricing.guru, Jul 2026).
- **Monthly API credits** on Max and Ultra cover the Claude API, Batches, Managed Agents and the Agent SDK. They do **not** cover interactive Claude Code. They expire every billing cycle (buildmvpfast.com, 2026-11-04). I counted them 1:1 in the totals.
- Claude Code: included in Pro, Max and Ultra. Claude chat and Claude Code share the same limits (support article 11145838). The pricing page lists Opus on Pro, so Opus is available in Claude Code on Pro. Claude Code on Pro and Team Standard now defaults to Opus (mixed-news.com, 2026).
- **API prices** of the dataset models (platform.claude.com pricing, fetched 2026-11-11). Input / output per MTok, with cache reads in brackets:

  | Model | Input | Output | Cache read |
  |---|---|---|---|
  | Fable 5.2 | $8 | $40 | $0.20 |
  | Opus 5.5 | $4 | $20 | $0.20 |
  | Sonnet 5.5 | $2 | $10 | $0.10 |
  | Haiku 5.5 (prompts ≤100k) | $0.10 | $0.50 | - |

  For comparison, Fable 5.1 was $10 / $50.

**EUR in Spain.** Anthropic shows only USD, and the exact euro amount appears only at claude.ai/upgrade.
- Evidence of a euro price list:
  - Anthropic announced "€18 + VAT per month" for Pro in 2024 (cited by geotoolbox.ai).
  - A Chollometro deal from January 2026 lists Claude Pro in Spain at **21,78 €** (= 18 € × 1.21).
  - A Spanish comparison quotes Max at "unos 108 €" on the web (and 149,99 € through the App Store).
  - An Italian source reports a 90 € net price for the $100 tier.
- **ASSUMPTION:** Spanish web prices are 18 / 90 / 180 € net, i.e. **21.78 / 108.90 / 217.80 € with IVA**. Converting USD at 1.1214 plus 21% IVA gives almost the same: 21.58 / 107.90 / 215.80 €. App Store prices are higher (Max about 40% more).

### Google (official: gemini.google/es/subscriptions, fetched 2026-11-11 and 2026-11-13; blog.google, 2026-05-19, 2026-11-10 and 2026-11-12)

| Plan | EUR (Spain page) | USD | Usage | Models relevant here | Antigravity |
|---|---|---|---|---|---|
| AI Plus | 4.99 € | $4.99 (some sources say $7.99) | 2x Free | Gemini 4 Hydrogen (subscriptions page, 2026-11-13; not in the launch post) | - |
| AI Pro | 21.99 € | $19.99 | 4x Free | Gemini 4 Hydrogen and Argon, **no Carbon** | "entry-level" limits, Hydrogen included |
| AI Ultra (5x) | 99.99 € | $99.99 | 5x AI Pro | "Highest access to Gemini 4 Carbon", Argon and Hydrogen | higher limits |
| AI Ultra (20x) | 219.99 € | $199.99 | 20x AI Pro | Carbon, Argon and Hydrogen | highest limits |

- At I/O on **2026-05-19**, Google introduced the $100 Ultra tier and cut the top Ultra tier from $250 to $200 (blog.google).
- **Gemini 4 Carbon** reached general availability on **2026-11-10**. It is rolling out to **all Google AI Ultra subscribers** in the Gemini app, AI Mode and **Antigravity**, and Argon remains on Pro and above (blog.google, 9to5google, 2026-11-10).
- **Gemini 4 Hydrogen** launched on **2026-11-12** (blog.google, "Introducing Gemini 4 Hydrogen"). Official post: "If you're a paid Google AI Pro or Ultra subscriber, you can try it in Google Antigravity"; it is also in the Gemini app model dropdown (free users only via auto selection) and in Search for all users. API price: **$1.50 in / $7.50 out per MTok**, flat across the 1M context. Thinking levels low / medium / high (default in the API) / xhigh; Artificial Analysis lists xhigh as its default. The post gives no usage limits per plan and does not mention AI Plus; only the subscriptions page lists Hydrogen for Plus.
- Carbon API price is **$2 in / $10 out per MTok until 2026-11-30, then $4 / $20**. Artificial Analysis switched Carbon to $2 / $10 on 2026-11-13 (before: $4 / $20). If your dataset's costs use one of these and the quota uses the other, the ratio moves by up to 2x.
- Gemini CLI: the official quota page still lists 1,500 requests/day for Pro and 2,000 for Ultra (last updated 2026-06-18). One guide dated 2026-11-07 says Pro and Ultra subscribers were moved from Gemini CLI to the Antigravity CLI on 2026-06-18. **Unverified**, and treated here as irrelevant: Antigravity is the agentic surface.
- Antigravity on Pro and Ultra also offers Claude Sonnet 5.5 and Opus 5.5, on a **separate fixed rate limit** (sessionwatcher.com, 2026-11-06; antigravity.google blog, 2026-05-19).
- VAT: the Spanish page does not say whether IVA is included. **ASSUMPTION:** it is included, as is usual for Google One consumer prices in the EU, and 219.99 € vs $199.99 is consistent with that.

---

## 2. Usage limits (official wording)

**Anthropic**
- No absolute token or message numbers are published, only multiples of Pro.
- Pro: a 5-hour session limit plus a weekly limit. The help center says Pro can "expect to send at least 45 messages every 5 hours" with short conversations (support.anthropic.com article 8324991; this figure is old).
- Max: 5x Pro per 5 hours **and** per week.
- Ultra: 10x Pro per week, with no 5-hour limit once verified. Before the rename, "Max 20x" meant 20x Pro per 5 hours but 10x per week, so the weekly cap was always about 10x.
- Max and Ultra have a separate weekly Fable cap of 50% of the weekly limit.
- 5-hour limits were raised at the Opus 5.5 launch (2026-09-22), with no numbers given (mixed-news.com).
- A temporary extra Fable allowance applies after the Fable 5.2 launch (support article).
- In price terms, each tier costs $20 per "1x Pro of weekly usage" (buildmvpfast.com), so **the ratio is the same across Anthropic tiers** if users reach the weekly cap.

**Google**
- Gemini app: compute-based limits that "refresh every 5 hours until you reach your weekly limit". The cost of a request depends on its complexity, the model, the features used and the chat length. No numbers are published (gemini.google, blog.google 2026-05-19, implicator.ai 2026-05-29).
- Antigravity: the $100 Ultra plan "has a rate limit of 5X worth of tokens compared to the $20/month Pro plan", and the $200 plan 20X. Quota is "drawn down according to API pricing". AI credits are now only an overage mechanism (antigravity.google blog, 2026-05-19).
- No absolute quota exists anywhere ("Google publishes no request or token counts for any plan": sessionwatcher.com and plancaps.com, both checked 2026-11-03).

---

## 3. Measured or estimated API-equivalent value

### Anthropic data points (USD of API list price per month; 1 month = 4.33 weeks)

| # | Source (date) | Plan | Value | Ratio | Notes |
|---|---|---|---|---|---|
| A1 | SemiAnalysis "Anthropic subscriptions offer 5x" (2026-10-05). Numbers via bestcadpapers.com (2026-10-06), because the tables are paywalled | Pro | $1,178/mo | 59x | Opus 5.5, agentic coding. Meter-step method per token type |
| A2 | same | Max 5x | $5,725/mo | 57x | Opus 5.5 |
| A3 | same | Max 20x (now Ultra) | $11,726/mo | 59x | Opus 5.5. Weekly cap unchanged by the rename, so still valid for Ultra |
| A4 | same | $200 plan, Fable 5.1 | $2,485 for the 50% Fable cap | - | Fable 5.1 only. This implies about $4,970 per full limit, roughly 0.42x the Opus value |
| A5 | wokey.ai (data 2026-11-02 to 11-09; ≥5 accounts, gateway-measured, fixed split of about 92% cache reads) | Pro | $154/wk (IQR $148–160) = about $669/mo | 33x | Mixed models. 17.4M non-cached / 63.6M total tokens per week |
| A6 | same | Ultra | $1,623/wk (IQR $1,292–1,657) = about $7,031/mo | 35x | About 11x Pro. Max 5x not yet published |
| A7 | FinOps LLM (2026-09-27, updated 10-10), n=1, Claude Code logs | Max 20x | $1.86k/wk (range $1.74–2.2k) = about $8.0k/mo | 40x | Aug 2026. A week with more Fable hit the cap "$300 sooner" |
| A8 | same | Max 5x | ≥$1,217/wk (cap never hit) = ≥$5.3k/mo | ≥53x | Lower bound. Promotion scaling applied |
| A9 | SemiAnalysis via pasqualepillitteri.it (2026-06-12) | Max 20x | about $8,000/mo | 40x | Before Opus 5.5. Entry $20 plans "up to about $700" (35x) |
| A10 | Botfarm (2026-03-20), n=1, 2 weeks | Max 5x / Max 20x | about $2,250 / $4,730 per month | 22–24x | Old limits, Opus 4.6. Author calls them lower bounds |
| A11 | Danube Labs (2026-10-04), n=1, ccusage | Max 5x | $420/wk after Opus 5.5 (−62% vs August's $1,112/wk) | (18x) | **Actual use, not proven to be at the cap.** Shows that real users often reach a fraction of the cap |

- Anthropic's official statements give no dollar values.
- Implicator (2026-05-14) estimated Anthropic's own *compute cost* (not API value) at about $60/mo for a heavy Pro user and $570 for Max 20x.

**Synthesis.** Recent measurements at the cap (A1–A3, A5–A8) cluster between **33x and 59x**. The spread comes mostly from the cache-read share and the model mix: SemiAnalysis is Opus-only, and wokey uses a fixed mixed split.
- I use a **mid of about 42.5x** (roughly the geometric mean of wokey and SemiAnalysis), applied uniformly because weekly limits scale linearly with price.
- Max and Ultra add their API credits at 1:1.
- Pro: 600 / 850 / 1,200 USD.
- Max: 3,000 / 4,350 / 5,825 USD (5x Pro + $100 credits). The low end is near the wokey extrapolation.
- Ultra: 5,800 / 8,700 / 11,926 USD (10x Pro + $200 credits). Low = wokey IQR bottom; high = SemiAnalysis.
- If your audience is "typical" rather than "at the cap", A11 suggests real use can be 2–5x lower.

### Google data points
- **No measurement of API-equivalent value exists** for Google AI Pro or Ultra, or for Antigravity, the Gemini app or the Gemini CLI. Several searches came up empty, and SemiAnalysis's subscription study does not cover Google.
- The only data are single-user anecdotes (aicoderscope.com and other blogs quoting a Reddit post, early 2026, Gemini 3 Pro at $2/$12):
  - An AI Pro user used "over 300 million input / 1–2 million output in a week" before January 2026. Mostly cached, that is about $80+/week; uncached, about $600/week.
  - After the March 2026 cuts, the same user hit the cap at "<9M input / 200k output", about $20/week or **$90/month (about 4.5x)**.
- Since then, Google raised Antigravity limits several times, and on 2026-05-19 it raised base Gemini entitlements when it removed included credits.
- **ASSUMPTION (low confidence):**
  - AI Pro: mid **7.5x** ($150/mo), range 3x–20x. The low end matches the March anecdote; the high end allows for later increases.
  - Ultra 5x has 5x Pro's limits at 5x the price, so the **same ratio of 7.5x** ($750/mo).
  - Ultra 20x has 20x the limits at 10x the price, so **double the ratio, 15x** ($3,000/mo), range 6x–40x. The 40x end is parity with Anthropic.
  - These assumptions should be replaced with a measurement: run a fixed Carbon task in Antigravity on an Ultra account and read the 5-hour and weekly quota percentage before and after.

---

## 4. Does the ratio depend on the model or effort level?

**Effort levels (low / medium / high / xhigh / max).** On both providers, limits are consumed by tokens or compute, not per message.
- Anthropic: Claude Code counts by token use, so a higher effort means more tokens, which raises both API cost and limit consumption.
- Google: Antigravity's quota is explicitly "drawn down according to API pricing".
- **ASSUMPTION:** the ratio does not depend on effort level. Use one factor per (plan, model).

**Google, across Gemini models.** The quota is price-weighted, so the ratio is roughly **constant across Gemini models** (Argon, Carbon, Hydrogen, Flash) within a plan (antigravity.google blog, 2026-05-19). Carbon "uses more tokens than Argon" (blog.google), which consumes more quota in absolute terms but leaves the ratio unchanged.

**Anthropic, across Claude models.** The ratio is **not** constant. Anthropic publishes no weights, beyond saying that Fable uses limits "faster than other Claude models" and is capped at 50% of the weekly limit.
- **Fable vs Opus.** SemiAnalysis (A4 vs A3): Fable 5.1 gives about $4,970 per full limit against $11,726 for Opus 5.5 on the same plan, a factor of about **0.42**. This is corroborated qualitatively by FinOps ("Fable-heavier week hit the cap $300 sooner") and by SemiAnalysis's margins (Opus 5.5 subscription use at −369% gross margin at 100% use, Fable 5.1 at +1%, meaning Opus is far more subsidized).
  - Conflicting source: wokey says "Opus 5.5 uses about 0.6x the limit per token of other Opus and Fable models". Read per token, that would make Fable's ratio about 1.5x Opus's. This is ambiguous and conflicts with SemiAnalysis's controlled test, so I give it less weight.
  - Fable 5.2 is 20% cheaper on the API than 5.1 ($8/$40 vs $10/$50). If its limit weight per token did not fall as well, its multiplier would be about 0.34.
  - **Proposed Fable multiplier: 0.40 (range 0.3–1.0).** Effective Fable ratio on Max or Ultra is about 17x (mid).
- **Fable on Pro.** It is billed through usage credits at API rates, so the ratio is **1.0** (no subsidy).
- **Sonnet 5.5 and Haiku 5.5.** No data. Most measurements are 85–95% Opus (A10, A11), so the plan ratios above are effectively Opus ratios.
  - **ASSUMPTION:** multiplier 1.0 (limits roughly price-weighted).
  - If limits instead follow compute cost, Haiku 5.5 is the main risk. Its list price is unusually low ($0.10/$0.50), so its ratio could be well below 1.0. Flag Sonnet and Haiku conversions as low confidence.
- **Fable's 50% cap.** If a benchmark user ran only Fable, the plan's monthly Fable value is capped at about half the limit: about $2.5k/mo on Ultra and $1.25k/mo on Max (SemiAnalysis, Fable 5.1). The multiplier above already reflects the per-unit rate. The cap only matters for "how many tasks per month" charts.

Recommended per-model multipliers on the plan ratio (Anthropic):

| Model | Multiplier |
|---|---|
| Opus 5.5 | 1.0 |
| Sonnet 5.5 | 1.0 (assumed) |
| Haiku 5.5 | 1.0 (assumed, high uncertainty) |
| Fable 5.2 on Max/Ultra | 0.4 |
| Fable on Pro | ratio = 1.0 (not a multiplier) |

---

## 5. EUR/USD
- **ECB reference rate on 2026-11-10: 1 EUR = 1.1214 USD** (ecb.europa.eu daily XML, fetched 2026-11-11).
- Context: early-November fixings were between 1.118 and 1.127. The 2026 low was 1.1105 on 2026-10-29, and the year opened at about 1.17 (tradingnews.com, poundsterlinglive.com).

---

## 6. Default plan per provider
- **Anthropic: `claude-max` ($100, about 108.90 €).** It is the cheapest plan that includes Fable, has unlimited Claude Code and is the classic heavy-professional tier. Because weekly limits scale linearly with price ($20 per 1x Pro), its ratio (about 43x) is essentially the same as Ultra's, so the choice changes the € price shown but barely changes the conversion.
- **Google: `google-ai-ultra-5x` ($99.99 / 99.99 €).** AI Pro does not include Gemini 4 Carbon, so the cheapest plan that runs both Google models in the dataset is Ultra 5x. Since 2026-11-13 AI Pro is in the web's ≈ 20 € tier for Gemini 4 Hydrogen, with Carbon as pay-as-you-go (like Fable on Claude Pro). It is also the direct price analogue of Claude Max. Ultra 20x doubles the ratio for a heavy user who actually reaches the cap.

---

## 7. Main sources (with dates)

**Anthropic, official**
- https://claude.com/pricing (fetched 2026-11-11)
- https://support.claude.com/en/articles/15424964-claude-fable-5-on-your-plan (updated about 2026-11-10)
- https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan (about Nov 2026)
- https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-11-11)

**Anthropic, third-party**
- https://www.buildmvpfast.com/blog/claude-max-plan-changes-ultra-5-hour-limit-2026 (2026-11-04)
- https://wokey.ai/claude-usage-limits (data 2026-11-09)
- https://newsletter.semianalysis.com/p/anthropic-subscriptions-offer-5x (2026-10-05)
- https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/ (2026-10-06)
- https://finopsllm.com/research/claude-max-20x-vs-5x-weekly-limit (2026-09-27 / 10-10)
- https://danubelabs.net/en/blog/claude-max-weekly-limits-cut (2026-10-04)
- https://botfarm.run/blog/claude-max-true-price/ (2026-03-20)
- https://pasqualepillitteri.it/en/news/4793/semianalysis-token-value-claude-chatgpt-plans (2026-06-12)
- https://www.implicator.ai/anthropics-usage-based-billing-is-exact-its-plan-limits-are-vague-by-design.md (2026-05-14)
- https://theaicareerlab.com/blog/claude-opus-5-5-vs-fable-5-1-for-professionals (2026-09-27 / 10-31)
- https://mixed-news.com/en/claude-opus-5-5-price-4-per-million-tokens-usage-limits/ (2026-09-22)

**Euro pricing in Spain**
- https://www.chollometro.com/ofertas/claude-pro-con-claude-code-3-meses-al-50-1781735 (2026-01)
- https://www.ssdnodes.com/learn/lang/es/claude-prices-in-spain-and-latin-america (2026-11-05)
- https://geotoolbox.ai/es/blog/precio-claude (2026)

**Google**
- https://gemini.google/es/subscriptions/ (fetched 2026-11-11)
- https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions (2026-05-19)
- https://www.antigravity.google/blog/changes-to-antigravity-plans (2026-05-19)
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/ (2026-11-10)
- https://9to5google.com/2026/11/10/gemini-app-4-carbon/ (2026-11-10)
- https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/ (2026-11-12)
- https://9to5google.com/2026/11/12/gemini-4-hydrogen-launch/ (2026-11-12)
- https://sessionwatcher.com/guides/antigravity-pricing (2026-11-03 / 11-06)
- https://plancaps.com/tools/antigravity (2026-11-03)
- https://www.implicator.ai/google-caps-gemini-per-prompt-quota-use-after-subscriber-backlash/ (2026-05-29)
- https://aicoderscope.com/blog/google-antigravity-review-2026/ (2026)
- https://agentpedia.codes/blog/antigravity-credits-pricing-explained (2026-10-30)

**FX**
- https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (rate of 2026-11-10)

---

## 8. Machine-readable result

```json
{
  "fx_usd_per_eur": 1.1214,
  "fx_date": "2026-11-10 (ECB reference rate)",
  "ratio_definition": "api_usd_month / price_usd (monthly list price, pre-tax). To convert an API-USD task cost into EUR of subscription: eur = api_usd * price_eur / api_usd_month.mid (= api_usd * eur_sub_per_api_usd_mid).",
  "effort_dependence": "none assumed (limits are token/compute-weighted on both providers)",
  "model_multipliers": {
    "Anthropic": {
      "Opus": 1.0,
      "Sonnet": 1.0,
      "Haiku": 1.0,
      "Fable": 0.4,
      "notes": "Multiply the plan ratio by this. Opus=1.0 is the baseline (measurements are mostly Opus). Fable 0.4 is derived from SemiAnalysis 2026-10-05 (Fable 5.1 $2,485 per 50% of limit vs Opus 5.5 $11,726 per 100%), range 0.3-1.0. Sonnet and Haiku are ASSUMPTIONS with no data (Haiku is most uncertain). On Claude Pro, Fable is pay-as-you-go at API rates, so its ratio is 1.0."
    },
    "Google": {
      "Carbon": 1.0,
      "Hydrogen": 1.0,
      "notes": "Antigravity quota is drawn down according to API pricing, so the ratio is the same across Gemini models and thinking levels."
    }
  },
  "plans": [
    {
      "id": "claude-pro",
      "provider": "Anthropic",
      "name": "Claude Pro",
      "price_eur": 21.78,
      "price_usd": 20,
      "models": ["Opus", "Sonnet", "Haiku"],
      "api_usd_month": {"low": 600, "mid": 850, "high": 1200},
      "ratio_mid": 42.5,
      "eur_sub_per_api_usd_mid": 0.02562,
      "confidence": "medium",
      "sources": [
        "https://claude.com/pricing (2026-11-11)",
        "https://wokey.ai/claude-usage-limits (2026-11-09)",
        "https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/ (2026-10-06, SemiAnalysis 2026-10-05)"
      ],
      "notes": "1x weekly limit plus a 5-hour limit. Fable is not included in the plan: it runs on usage credits at API rates (ratio 1.0). The EUR price assumes 18 EUR + 21% IVA (Chollometro Jan 2026 shows 21.78 EUR); the USD conversion gives 21.58 EUR. Measured 33x (wokey, mixed models, about 92% cache reads) to 59x (SemiAnalysis, Opus 5.5)."
    },
    {
      "id": "claude-max",
      "provider": "Anthropic",
      "name": "Claude Max (formerly Max 5x)",
      "price_eur": 108.90,
      "price_usd": 100,
      "models": ["Fable", "Opus", "Sonnet", "Haiku"],
      "api_usd_month": {"low": 3000, "mid": 4350, "high": 5825},
      "ratio_mid": 43.5,
      "eur_sub_per_api_usd_mid": 0.02503,
      "confidence": "medium",
      "sources": [
        "https://claude.com/pricing (2026-11-11)",
        "https://www.buildmvpfast.com/blog/claude-max-plan-changes-ultra-5-hour-limit-2026 (2026-11-04)",
        "https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/ (2026-10-06)",
        "https://finopsllm.com/research/claude-max-20x-vs-5x-weekly-limit (2026-10-10)",
        "https://danubelabs.net/en/blog/claude-max-weekly-limits-cut (2026-10-04)",
        "https://botfarm.run/blog/claude-max-true-price/ (2026-03-20, old limits)"
      ],
      "notes": "5x Pro per 5 hours and per week, plus $100/mo API credits (counted 1:1; they do not cover interactive Claude Code). Fable is capped at 50% of the weekly limit and burns limits faster. The EUR price assumes 90 EUR + IVA. Real (not at-cap) use reported by one ccusage user was about $420/week after Opus 5.5."
    },
    {
      "id": "claude-ultra",
      "provider": "Anthropic",
      "name": "Claude Ultra (formerly Max 20x)",
      "price_eur": 217.80,
      "price_usd": 200,
      "models": ["Fable", "Opus", "Sonnet", "Haiku"],
      "api_usd_month": {"low": 5800, "mid": 8700, "high": 11926},
      "ratio_mid": 43.5,
      "eur_sub_per_api_usd_mid": 0.02503,
      "confidence": "medium",
      "sources": [
        "https://claude.com/pricing (2026-11-11)",
        "https://wokey.ai/claude-usage-limits (2026-11-09)",
        "https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/ (2026-10-06)",
        "https://finopsllm.com/research/claude-max-20x-vs-5x-weekly-limit (2026-10-10)",
        "https://pasqualepillitteri.it/en/news/4793/semianalysis-token-value-claude-chatgpt-plans (2026-06-12)"
      ],
      "notes": "Renamed from Max 20x on 2026-10-30. 10x Pro weekly (unchanged), no 5-hour limit for verified accounts, plus $200/mo API credits. Measured 35x (wokey, $1,623/week) to 59x (SemiAnalysis, Opus 5.5). Fable-only use is capped at about $2.5k/mo (50% of the limit). The EUR price assumes 180 EUR + IVA."
    },
    {
      "id": "google-ai-pro",
      "provider": "Google",
      "name": "Google AI Pro",
      "price_eur": 21.99,
      "price_usd": 19.99,
      "models": ["Gemini 4 Hydrogen"],
      "pay_as_you_go": ["Gemini 4 Carbon"],
      "api_usd_month": {"low": 60, "mid": 150, "high": 400},
      "ratio_mid": 7.5,
      "eur_sub_per_api_usd_mid": 0.1466,
      "confidence": "low",
      "sources": [
        "https://gemini.google/es/subscriptions/ (2026-11-11)",
        "https://www.antigravity.google/blog/changes-to-antigravity-plans (2026-05-19)",
        "https://aicoderscope.com/blog/google-antigravity-review-2026/ (2026, early-2026 anecdote)",
        "https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/ (2026-11-12)"
      ],
      "notes": "Includes Gemini 4 Hydrogen (Gemini app and Antigravity, since 2026-11-12) and Argon. Does NOT include Gemini 4 Carbon, which is treated as pay-as-you-go at API rates. The API value is an ASSUMPTION: no measurement exists. A March 2026 anecdote gives about $90/mo; limits were raised later. 5-hour refresh up to an unpublished weekly cap."
    },
    {
      "id": "google-ai-ultra-5x",
      "provider": "Google",
      "name": "Google AI Ultra (5x, $99.99)",
      "price_eur": 99.99,
      "price_usd": 99.99,
      "models": ["Gemini 4 Carbon", "Gemini 4 Hydrogen"],
      "api_usd_month": {"low": 300, "mid": 750, "high": 2000},
      "ratio_mid": 7.5,
      "eur_sub_per_api_usd_mid": 0.1333,
      "confidence": "low",
      "sources": [
        "https://gemini.google/es/subscriptions/ (2026-11-11)",
        "https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions (2026-05-19)",
        "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/ (2026-11-10)",
        "https://www.antigravity.google/blog/changes-to-antigravity-plans (2026-05-19)"
      ],
      "notes": "5x AI Pro limits ('5X worth of tokens'). Carbon available to all Ultra subscribers since 2026-11-10. ASSUMPTION: same ratio as Pro (5x limits for 5x the price). Quota is drawn by API price. Carbon API price is $2/$10 until 2026-11-30, then $4/$20. EUR assumed to include IVA."
    },
    {
      "id": "google-ai-ultra-20x",
      "provider": "Google",
      "name": "Google AI Ultra (20x, $199.99)",
      "price_eur": 219.99,
      "price_usd": 199.99,
      "models": ["Gemini 4 Carbon", "Gemini 4 Hydrogen"],
      "api_usd_month": {"low": 1200, "mid": 3000, "high": 8000},
      "ratio_mid": 15.0,
      "eur_sub_per_api_usd_mid": 0.07333,
      "confidence": "low",
      "sources": [
        "https://gemini.google/es/subscriptions/ (2026-11-11)",
        "https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions (2026-05-19)",
        "https://www.antigravity.google/blog/changes-to-antigravity-plans (2026-05-19)"
      ],
      "notes": "20x AI Pro limits for 10x the Pro price, so ASSUMPTION: double the Pro ratio. The high end assumes parity with Anthropic (about 40x). No public measurement exists."
    }
  ],
  "default_plan_per_provider": {
    "Anthropic": "claude-max",
    "Google": "google-ai-ultra-5x"
  },
  "default_plan_justification": {
    "Anthropic": "Claude Max ($100) is the cheapest plan that includes Fable, it includes Claude Code, and it is the usual heavy-professional tier. Because the weekly limit scales linearly with price, its ratio is about the same as Ultra's, so the choice barely changes the conversion.",
    "Google": "Google AI Ultra 5x ($99.99) is the cheapest plan that includes Gemini 4 Carbon (AI Pro is Argon only), and it is the direct price analogue of Claude Max."
  }
}
```

---

# 9. OpenAI / ChatGPT (added 2026-11-11)

Same method and FX as above (ECB 2026-11-10, 1.1214). Baseline model: **GPT-6.1 Sol**. Web research only. help.openai.com blocked automated fetches, so its wording comes from search snippets and secondary quotes.

| Plan | USD/mo | EUR/mo Spain (IVA assumed included) | Dataset models | API-USD/mo low / **mid** / high | Ratio (mid) | Confidence |
|---|---|---|---|---|---|---|
| ChatGPT Go | 8 | 8 | Luna only (**not in the web**) | 40 / **85** / 115 (ASSUMPTION) | 10.6x | very low |
| ChatGPT Plus | 20 | 23 | Astra, Sol 6.1, Terra 6.1, Luna (the first three only in Work/Codex) | 150 / **211** / 285 | 10.6x | medium |
| ChatGPT Pro 100 | 100 | 103 | all 4 | 1,990 / **2,210** / 3,380 | 22.1x | medium-low |
| ChatGPT Pro 200 | 200 | 229 | all 4 | 3,980 / **4,420** / 6,760 | 22.1x | medium-low |
| ChatGPT Pro 500 | 500 | 510 | all 4 (+ Ultrafast) | 9,950 / **11,050** / 16,900 | 22.1x | low |

**Plans and limits**
- **API prices match AA**, checked on developers.openai.com/api/docs/pricing. Input / output per MTok:

  | Model | Input | Output |
  |---|---|---|
  | Astra | $10 | $50 |
  | Sol 6.1 | $2 | $10 |
  | Terra 6.1 | $1 | $5 |
  | Luna | $0.10 | $0.50 |

- **Pro limits doubled on 2026-10-29.** Release notes: "Pro 100 and Pro 500 now include twice their previous Work and Codex allowance", and the Pro 200 cut was cancelled. Reported multiples are now 10x / 20x / 50x Plus at $10 per "1x", against $20 per "1x" on Plus, so **Pro's ratio is about 2x Plus's**.
  - ASSUMPTION: the doubling is permanent. If it is reverted, Pro values roughly halve.
- **Pro tiers include monthly API credits** equal to their price ($100 / $200 / $500). They are counted 1:1 and do not cover Codex.
- **Purchased Codex credits** ($40 per 1,000, 25 credits per API dollar) are at API parity. No dataset model is credit-only on Plus or Pro.
- **Effort**: no per-plan restriction is published for Codex. ASSUMPTION: the ratio does not depend on effort.

**Measurements** (the base value is one "1x Plus" weekly cap per month, at GPT-6.1 Sol prices)
- **SemiAnalysis** (2026-10-05, via bestcadpapers and forklog), GPT-6.1 Sol, 96.6% cached input:
  - Plus: $211/mo.
  - Pro 100 at its old 5x: $1,055/mo.
  - Pro 200 at 10x: $2,084/mo, or $2,897/mo when using Astra.
- **InventiveHQ** (2026-10-04), measured from Codex session files at GPT-6 Sol prices:
  - Pro 100 (5x): $1,440–1,640/mo.
  - Pro 200 (10x): $2,800–2,900/mo.
  - Plus: about $285/mo, projected.
  - Forklog reports about −30% after 6.1 halved cache prices without changing limits, which reconciles the two sources.
- **Per-1x value used**: low $189, mid $211, high $328 (the high one is the InventiveHQ Pro 100 upper value / 5).
  - Plus low ASSUMES the 5-hour window leaves about 20% of the weekly cap unreachable.
  - Each Pro tier = multiple × per-1x value + its API credits.
- **No measurement after the doubling exists yet.**

**Model multipliers** (relative to GPT-6.1 Sol)

| Model | Multiplier | Basis |
|---|---|---|
| GPT-6 Astra | **1.4** (range 1.0–1.55) | SemiAnalysis $2,897 / $2,084 = 1.39; 1/0.7 = 1.43 from the cache-price change; OpenAI's per-5h message estimates imply about 1.5 |
| GPT-6.1 Terra | 1.0 | ASSUMPTION: its per-5h message estimate matches its price ratio |
| GPT-6 Luna | 1.0 | ASSUMPTION, range 1.0–1.4 |

**Default plan**
- **`chatgpt-pro-100`**: the counterpart of Claude Max and Google AI Ultra 5x.
- Choosing Plus would make OpenAI tasks look about 2x more expensive in € of subscription.

**EUR prices**
- Web prices from geotoolbox.ai/es (updated 2026-11-09): Go and Plus checked August 2026, Pro tiers October 2026.
- A 2025 press breakdown shows 229 € containing exactly 21% IVA.

**Sources**
- Official:
  - https://developers.openai.com/api/docs/pricing
  - https://learn.chatgpt.com/docs/pricing
  - https://developers.openai.com/api/docs/guides/chatgpt-api-credits
  - https://chatgpt.com/es-ES/pricing
  - (all fetched 2026-11-11)
- Third party:
  - https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/ (2026-10-06)
  - https://forklog.com/en/claude-offers-far-more-compute-than-chatgpt-as-google-opens-access-to-argon/ (2026-10-14)
  - https://inventivehq.com/blog/codex-subscription-usage-measured (2026-10-04)
  - https://www.bleepingcomputer.com/news/artificial-intelligence/openai-doubles-chatgpt-pro-usage-limits-after-backlash-over-planned-50-percent-cut/ (2026-10-29)
  - https://smartscope.blog/en/blog/chatgpt-pro-usage-limits-doubled-pro-200-not-2026/ (2026-10-30)
  - https://www.buildmvpfast.com/blog/chatgpt-pro-limits-doubled-vs-claude-max-2026 (2026-11-04)
  - https://pasqualepillitteri.it/en/news/19330/openai-launches-pro-500-500-dollars-month (Nov 8 update)
  - https://the-decoder.com/openai-rolls-out-gpt-6-astra-to-top-tier-chatgpt-plans-at-half-the-rate-of-gpt-5-6-sol/ (2026-09-05)
- EUR:
  - https://geotoolbox.ai/es/blog/precio-chatgpt (2026-11-09)
  - https://www.ssdnodes.com/learn/lang/es/chatgpt-prices-in-spain-and-latin-america (2026-11-05)

**To verify by hand**
- The help.openai.com articles: the official 10x / 20x / 50x wording and Plus access to Astra.
- The euro prices at chatgpt.com/es-ES checkout.
- A post-doubling measurement: a fixed Sol 6.1 task, reading Codex `/status` before and after.
