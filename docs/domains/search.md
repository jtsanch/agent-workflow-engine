# Search Domain

This document describes the implemented search domain in the repository.

The current search domain is a thin, protected API façade over a shared web-search tool.

It currently covers:

- authenticated access to a `/search` endpoint
- translation of query parameters into a shared search-tool input
- tool-registry execution of `web_search.search`
- normalized search results returned to the frontend

It does not currently include search persistence, saved searches, ranking policy management, or a dedicated search UI page.

## Scope

The search domain spans:

- the protected API search route
- the API search service
- the shared tool registry entry for web search
- the `WebSearchTool` implementation
- the frontend API client used to call `/search`

The search domain does not own authentication itself. It depends on the auth domain because `/search` is a protected route.

## Entities

### Search Request

The implemented API search request accepts these fields:

- `query`
- `zipcode`
- `stores`
- `category`

These are passed through from query parameters to the search service.

### Search Input

Inside the API, the search service uses:

- `SearchInput = Pick<WebSearchInput, "query" | "zipcode" | "stores" | "category">`

So the API only uses a narrow subset of the broader shared `WebSearchInput` type.

### Search Result

The shared search result shape includes:

- `title`
- `url`
- `snippet`
- optional `publishedAt`
- optional `source`
- optional `score`
- optional `raw`

### Search Metadata

Search responses may include metadata with:

- `total`
- `provider`
- `latencyMs`

### Search Tool

The actual search provider integration is the shared `web_search.search` tool.

Current implementation characteristics:

- provider: DuckDuckGo instant answers
- normalized output shape
- retry handling for transient HTTP failures

## Ownership Boundaries

### API Controller

The controller owns:

- reading search query parameters from the HTTP request
- calling the search service
- returning `{ item }`

The controller does not validate query parameters with a schema and does not implement search policy.

### Search Service

The search service owns:

- creating a tool registry
- constructing a minimal `RunContext`
- executing `web_search.search`

The search service does not own result shaping beyond returning the tool result.

### Shared Tool Layer

The shared tool layer owns:

- tool registration
- tool execution dispatch
- the concrete `WebSearchTool`

This is where the actual provider call and result normalization happen.

### Frontend API Client

The frontend owns:

- building query-string parameters for `/search`
- calling the protected endpoint
- consuming the normalized result shape

There is no dedicated search page in the current web app. The domain is present in the client API layer, but not surfaced as a first-class page.

## Invariants

The implementation enforces or assumes the following invariants:

- `/search` is a protected API route
- the API search flow executes through `web_search.search`
- the API returns the tool result inside `{ item }`
- the shared tool registry includes `web_search.search`
- empty effective search input returns an empty result set with provider metadata indicating `none`
- live web-search behavior is provider-backed outside test mode
- test mode returns stubbed results unless live tests are explicitly enabled

## Business Rules

### Access

- search is only available to authenticated users
- search follows the same auth gating as other protected API endpoints

### Query Construction

- if `query` is present and non-empty, it is used directly
- if `query` is absent, the tool derives a query from:
  - `category`
  - `stores`
  - `zipcode`
- if `category` is absent while deriving a query, the tool defaults to `grocery deals`

### Store Handling

- `stores` may be passed as a comma-delimited string or array in shared tool types
- the API route currently passes `stores` as a string query parameter
- the tool normalizes comma-delimited store strings into separate store terms

### Result Shaping

- results are normalized into title, URL, and snippet records
- the tool trims the result set to at most five entries
- metadata includes provider and latency when available

### Test Behavior

- in test mode, the web search tool returns stubbed results unless live tests are explicitly enabled

## APIs

### `GET /search`

Purpose:

- execute a public-information web search through the shared search tool

Auth:

- protected

Query parameters:

- `query` optional
- `zipcode` optional
- `stores` optional
- `category` optional

Response shape:

- `{ item }`

Where `item` is the normalized search response:

- `results`
- optional `metadata`

## Execution Flows

### 1. API Search Flow

1. An authenticated client calls `GET /search`.
2. The API auth middleware validates the request.
3. The search controller reads `query`, `zipcode`, `stores`, and `category` from query parameters.
4. The controller passes them to the search service.
5. The search service creates a tool registry.
6. The search service constructs a minimal `RunContext`.
7. The service executes `web_search.search` through the registry.
8. The controller returns the result as `{ item }`.

### 2. Tool Execution Flow

1. The registry looks up the `web_search.search` tool.
2. The tool builds an effective search query.
3. If the effective query is empty, the tool returns an empty result set immediately.
4. Otherwise, the tool calls DuckDuckGo’s instant-answer API.
5. The tool extracts and normalizes results from:
   - `AbstractText` and `AbstractURL`
   - `RelatedTopics`
6. The tool returns normalized results and metadata.

### 3. Derived Query Flow

1. No explicit `query` is supplied.
2. The tool normalizes `stores`.
3. The tool uses:
   - `category` or default `grocery deals`
   - store names
   - `near {zipcode}` when `zipcode` is present
4. The combined derived query is sent to the provider.

## Failure Modes

### Authorization Failures

- missing auth
- invalid token
- disabled user

Observed result:

- the same auth failures as other protected API routes

### Tool Registry Failures

- `web_search.search` is not registered in the tool registry

Observed result:

- the registry throws `Unknown tool`

### Provider Failures

- network timeout
- transient provider failure
- provider returns a retriable HTTP status

Observed result:

- the tool retries transient failures up to the configured retry limit
- if retries are exhausted, the tool throws a formatted error

### Empty Input Behavior

- no effective `query`
- no usable `category`
- no usable `stores`
- no usable `zipcode`

Observed result:

- search returns:
  - `results: []`
  - metadata with `provider: "none"` and `latencyMs: 0`

### Response Parsing Gaps

- provider returns an unexpected payload shape
- provider returns no usable `AbstractText` or `RelatedTopics`

Observed result:

- the tool returns an empty normalized result set rather than failing

## Inconsistencies and Drift

### The Shared Search Input Type Is Richer Than the API Contract

The shared `WebSearchInput` type includes:

- `options`
- `select`
- `rerank`

The current API route and service only use:

- `query`
- `zipcode`
- `stores`
- `category`

So the broader shared type is not the real API contract today.

### The API Route Has No Explicit Query Validation Schema

Unlike several other routes in the API, `/search` does not parse query parameters through Zod.

It relies on optional typing at the route signature and downstream tool behavior.

### Search Domain Is Implemented Without a Dedicated UI Surface

The frontend has a `searchCatalog` API client function, but there is no first-class search page in the current web app.

So the search domain exists in the API and shared tooling, but has limited visible product surface.

### Search Is Domain-Thin and Tool-Heavy

Most of the real behavior lives in the shared tool implementation, not in an API-specific search policy layer.

That means the search “domain” in the API is mostly dispatch and transport.

### Provider Metadata Is Normalized but Limited

The shared result model allows richer fields like:

- `publishedAt`
- `source`
- `score`
- `raw`

The current DuckDuckGo-based tool typically produces only:

- `title`
- `url`
- `snippet`
- metadata with provider and latency

So the domain contract is broader than what the active provider usually supplies.

### Search Domain Is Grocery-Oriented by Current Query Defaults

When no explicit `query` is provided, the tool defaults category handling to `grocery deals`.

That means the implemented default behavior is shaped around grocery-search use cases rather than a provider-neutral generic search policy.
