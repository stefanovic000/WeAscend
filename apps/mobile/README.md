# WeAscend Mobile

Native Android and iOS client built with Expo, React Native and TypeScript.

This folder is intentionally separate from the existing web/PWA client. The first milestone establishes native navigation and the mobile information architecture without changing production data or authentication.

## Run locally

```bash
cd apps/mobile
npm install
npm run android
```

`npm start` opens the Expo development server. iOS local builds require macOS and Xcode; Android development works on Windows with Android Studio.

The app uses the production WeAscend API by default. To point a development build elsewhere, copy `.env.example` to `.env.local` and change `EXPO_PUBLIC_WEASCEND_API_URL`. Never put Firebase Admin, MongoDB, Resend or AI secrets in a mobile environment file.

## Structure

```text
src/
├── app/          Expo Router screens and navigation
├── components/   reusable mobile UI
└── theme/        color, spacing and shape tokens
```

Email/password authentication, verification and persisted Firebase sessions are connected to the existing account system. Google OAuth is intentionally deferred until the Android OAuth client is registered. Next integration order: cloud state, Growth Areas and Skills, quests, XP ledger, history, then premium/AI capabilities.
