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

## Structure

```text
src/
├── app/          Expo Router screens and navigation
├── components/   reusable mobile UI
└── theme/        color, spacing and shape tokens
```

Planned integration order: authentication, cloud API client, Growth Areas and Skills, quests, XP ledger, history, then premium/AI capabilities.
