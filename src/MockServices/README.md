# Mock services for Scripture Forge's external dependencies

Local, scriptable, protocol-level fake servers for the four external services Scripture Forge
depends on, so the real app code (auth0-spa-js, ASP.NET JwtBearer, ParatextData, hg) runs
unchanged against them. Design: `spec-local-mock-services.md` (repo root, if present) — this
package implements it.

One Node/TypeScript process, one port (**5100**), path-prefixed services:

| Prefix                                | Service                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth0`                              | Fake Auth0: authorize (code+PKCE), oauth/token (all four grants SF uses), v2/logout, OIDC discovery + JWKS, Management API v2 with `identities[]` carrying Paratext tokens |
| `/registry/api8`                      | Mock Paratext Registry: userinfo, projects, licenses, members, token refresh w/ rotation                                                                                   |
| `/archives/send_receive_server/api94` | Mock send/receive archives server backed by **real hg repos on disk**                                                                                                      |
| `/dbl`                                | Mock DBL resources adapter: resource list + `.p8z` download                                                                                                                |
| `/_control`                           | Control API for scenario scripting (reset/seed, users, projects, commits, chaos)                                                                                           |

## Quick start

```bash
cd src/MockServices
npm install
npm start                      # listens on http://localhost:5100, applies the default seed
```

Project create/modify operations shell out to `src/ParatextProjectTool` (a small dotnet console
tool that drives ParatextData — the same library and version the SF backend uses), so the dotnet
SDK is a hard dependency of this package. The tool is built automatically (`dotnet build`) on the
first project operation; set `MOCK_DOTNET_EXE` if `dotnet` is not on PATH.

Then run the app against it:

```bash
cd src/SIL.XForge.Scripture
SF_MOCK_SERVICES=true dotnet run    # loads appsettings.Mock.json; serves Angular with start:mock
```

`SF_MOCK_SERVICES=true` layers `appsettings.Mock.json` (fake client IDs, all four service URLs,
`NgServeScript: start:mock`) over your normal dev configuration. Nothing in the mock world is
secret. The frontend `mock` build configuration (`environment.mock.ts`) points auth0-spa-js at
`http://localhost:5100/auth0`.

In mock mode the app's file storage (`Site:SiteDir`/`SharedDir` — audio, sync, training-data,
avatars) is redirected to a gitignored `.sf-local-data/` folder at the repo root, and the
required subdirectories are created automatically at startup (see `Program.cs`). This keeps mock
data out of `/var/lib` and out of your real dev data, and is separate from `xforge_mock` (Mongo).

In the dev container, the `mock-services` compose service runs this package automatically.

### One-time Paratext setup for sync (send/receive)

ParatextData refuses network access unless its `InternetSettings.xml`
(`~/.local/share/Paratext95/InternetSettings.xml`) has
`<PermittedInternetUse>Enabled</PermittedInternetUse>`. Without it, connecting/syncing a project
throws `VpnDisconnectedException`. The dev container's Paratext init normally sets this; if sync
fails with that error, set it manually. (Login and non-Paratext features don't need it.)

## Logging in

- **Interactive:** click Log In in the app; the fake Auth0 shows a user picker (no passwords).
- **Headless (agents/E2E):** designate the user first, then drive the normal login button:

```bash
node client/cli.mjs next-login 'oauth2|paratext|mock-admin'
```

or pass `login_hint=<email>` on /authorize. Default seed users: `admin@mock.local`,
`translator@mock.local`, `observer@mock.local` (Paratext-linked), `unlinked@mock.local`.

## Scenario scripting (control API)

Typed client: `client/index.ts` (`MockServicesClient`). CLI: `client/cli.mjs` (usage in header).
Core flow for a tracker-style repro ("set up X in a Paratext project, then sync"):

```ts
const control = new MockServicesClient();
await control.reset("default");
await control.commit("aaaa…aaa2", {
  bookCode: "RUT",
  usfm: "\\id RUT …edited on the Paratext side…"
}); // then sync in SF and observe
await control.addChaos({ service: "registry", mode: "fail500", remaining: 1 });
await control.revokeTokens({ authId: "oauth2|paratext|mock-admin", kind: "paratext" });
```

`POST /_control/reset?seed=default` wipes state + repos and reapplies a seed (`src/seeds/`).
`GET /_control/state` dumps everything for assertions.

An existing local Paratext project directory (e.g. a real test project) can be imported as a
mock project — its members get linked mock users created automatically, so any of them can log
in and connect the project right away:

```bash
node client/cli.mjs import-project /path/to/MyParatextProject
node client/cli.mjs next-login 'oauth2|paratext|<member-slug>'   # then click Log In
```

## State model

- Users/projects/resources/tokens: in-memory, snapshotted to `.data/state.json` (survives
  restarts; `reset` re-seeds).
- Project repositories: real hg repos under `.data/repos/{ptId}` — the source of truth for
  scripture content. "Simulate a Paratext edit" = write USFM + `hg commit` (that's what
  `/_control/projects/{ptId}/commit` does), so merge/conflict behavior is hg's real behavior.
- Project files (Settings.xml, ProjectUserAccess.xml, book files) are written by ParatextData
  itself via `src/ParatextProjectTool`, so file naming (`08RUT<ShortName>.SFM`), BooksPresent
  bookkeeping, role strings and book-permission assignments are byte-faithful to real Paratext
  output. The archives mock's `getfile` serves ProjectUserAccess.xml straight from the repo.
- One RS256 keypair (`.data/mock-rsa-private-key.pem`, generated on first run) signs everything;
  registry/archives/DBL validate Bearer JWTs against it.

## Fidelity & known deviations

Provenance of each endpoint's shape is noted in a header comment in its router. Sources:
registry = official swagger (pinned in `reference/`), archives = ParatextData 9.5.0.24 decompile,
DBL = empirical production capture, Auth0 = SF code inspection + Auth0 docs.

Known deviations from the real services (kept intentionally):

- Auth0: no upstream IdPs (Google/Paratext OAuth dance) — identities are pre-linked via the
  control API; no Actions engine — the custom claims (`http://xforge.org/userid`, `…/role`) are
  set directly from user state; account-linking heuristics are not emulated.
- Interactive /authorize is a user picker with no passwords (mock world has no secrets).
- DBL download serves the `.p8z` directly with 200 instead of a 302 to CloudFront (the client
  follows redirects, so behavior is equivalent).
- Project licenses cannot be validly signed (Paratext's license-signing key is private), so in
  mock mode the SF backend skips ParatextData's license gate
  (`JwtInternetSharedRepositorySource.SendReceiveAllowedForProject`) — without this, every
  send/receive would fail silently.
- Access tokens default to 10-minute expiry (`MOCK_TOKEN_TTL` to change) so refresh paths
  actually get exercised.

## Environment variables

| Var               | Default                         | Purpose                                                           |
| ----------------- | ------------------------------- | ----------------------------------------------------------------- |
| `MOCK_PORT`       | 5100                            | Listen port                                                       |
| `MOCK_BASE_URL`   | `http://localhost:${MOCK_PORT}` | Must match the app's configured URLs; token `iss` derives from it |
| `MOCK_DATA_DIR`   | `<package>/.data`               | Keys, snapshot, hg repos, p8z fixtures                            |
| `MOCK_TOKEN_TTL`  | 600                             | Access-token lifetime (seconds)                                   |
| `MOCK_HG_EXE`     | `hg`                            | Mercurial executable (needs ≥4.1 for zstd-v2)                     |
| `MOCK_DOTNET_EXE` | `dotnet`                        | dotnet CLI used to build/run ParatextProjectTool                  |
| `MOCK_QUIET`      | —                               | `true` silences request logging                                   |
