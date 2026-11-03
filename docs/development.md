# Development & deployment

Everything needed to run, verify and deploy WeAscend. The product behaviour itself is described in
the [README](../README.md); the historical Serbian notes are in [operations.sr.md](operations.sr.md).

## Requirements

- Node.js **22.13+** and npm
- Optional: MongoDB Atlas cluster, Firebase project, DeepSeek key, Resend account

## Install and run

```bash
npm run install:all        # apps/web + apps/mobile
cp apps/web/.env.example apps/web/.env.local
npm run dev                # http://localhost:3000
```

The app starts without any external service:

| Configuration present | Behaviour |
| --- | --- |
| Nothing | Local development identity, IndexedDB cache only, read-only UI |
| Firebase only | Real sign-in, cloud calls fail with `cloud_not_configured`, read-only |
| Firebase + MongoDB | Full product |
| + DeepSeek | AI XP estimates and boss-step drafts |
| + Resend | Branded verification and password-reset emails |

The development identity exists **only** when `NODE_ENV !== "production"` **and**
`FIREBASE_PROJECT_ID` is unset. Production has no bypass.

## Environment variables

Server-only values must never be exposed as `VITE_*` or `NEXT_PUBLIC_*`.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | server | Atlas connection and database name (default `ascend`) |
| `FIREBASE_PROJECT_ID` | server | Token audience/issuer check; also the auth-config switch |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` | public | Web SDK configuration served by `/api/auth/config` |
| `AUTH_EMAIL_PROVIDER`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `AUTH_EMAIL_REPLY_TO`, `APP_BASE_URL` | server | Branded Firebase action emails |
| `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | server | Service account used to mint one-time action codes |
| `AUTH_EMAIL_RATE_LIMIT_SECRET` | server | Hash key for the 48-hour email rate-limit table |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | server | XP advisor and boss-step planner |
| `AI_LIMITS_ENABLED`, `AI_XP_DAILY_LIMIT`, `AI_BOSS_STEPS_DAILY_LIMIT`, `AI_COOLDOWN_SECONDS` | server | Per-user AI quotas (implemented, off during the beta) |
| `PREMIUM_BETA_ACCESS` | server | Grants Premium to every authenticated tester |
| `ANDROID_APPLICATION_ID` | build | Permanent Play package id |

The full commented template is [apps/web/.env.example](../apps/web/.env.example).

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | 46 `node:test` cases over the domain, API rules, auth and email builders |
| `npm run lint` | ESLint (Next.js config) |
| `npm run build` | Production build through `vinext` (Vite + RSC) |
| `npm run preview` | Serve the production build locally |
| `npm run android:check` | Assert that the PWA manifest and the TWA manifest agree |
| `npm run mobile:typecheck` | TypeScript check for the Expo client |

## Data model and migrations

Four collections, all keyed by the verified Firebase `userId`:

| Collection | Contents |
| --- | --- |
| `user_states_v2` | `{ userId, state, revision, createdAt, updatedAt }` — unique index on `userId` |
| `users_v2` | Profile, language, role, plan and plan expiry |
| `ai_usage_v2` | Per-user, per-day AI counters and cooldown |
| `auth_email_usage_v2` | Hashed rate-limit keys, TTL 48 h |

There is no migration framework. The state document is versioned (`version: 1`) and validated on
every read and write by `normalizeCloudState`; unknown or malformed data is rejected rather than
coerced. Indexes are created lazily on first use.

## Deployment

The web app builds to a Cloudflare Worker (`apps/web/worker/index.ts`) and is served by
`vinext start` locally. On the hosting platform:

1. Build with `npm run build --prefix apps/web`.
2. Set every server-side variable from the table above as a secret — never in the repository.
3. Set `APP_BASE_URL` to the exact public HTTPS origin (no path). Action links are never built from
   the incoming `Host` header.
4. Add the production domain to **Firebase → Authentication → Authorized domains**.
5. Allow the platform's egress in **Atlas → Network Access**. Cloudflare Workers have no stable
   egress IP, so a `0.0.0.0/0` rule may be required; keep the database user minimal and the password
   long.

### Firebase checklist

1. Enable Google and Email/Password providers.
2. Add a Web app and copy the five public configuration values.
3. Turn on email-enumeration protection.
4. For branded mail: create a service account with `firebaseauth.users.sendEmail`, verify a Resend
   domain, then set `AUTH_EMAIL_PROVIDER=resend` only after a test verification and reset round-trip.
5. Register the Android app with the permanent package id `com.wesystemlabs.weascend`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login says authentication is not configured | All five `FIREBASE_*` values present and the domain authorized |
| Google button stuck after closing the popup | Reload; the client unlocks on focus, visibility change and a 5 s fallback |
| Email/password user cannot sign in | The verification link was clicked; a new one is sent on the next attempt |
| UI is READ-ONLY | `MONGODB_URI`, Atlas reachability, or an expired token — the client never writes without a confirmed cloud |
| Local works, production does not | `.env.local` is not deployed; production reads platform secrets only |

## Screenshots

```bash
npm run dev                  # terminal 1, from the repository root
cd docs/demo && npm install
npm run capture              # writes docs/screenshots/*.png
```

The capture script mocks `/api/*` in the browser and uses a deterministic demo ledger, so it touches
no database and produces identical images between runs.
