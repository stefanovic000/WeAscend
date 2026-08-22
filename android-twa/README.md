# WeAscend Android TWA

Ovaj direktorijum sadrži Android projekat koji pakuje produkcionu WeAscend PWA kao Trusted Web Activity.

Trenutno je spremno:

- package ID `com.wesystemlabs.weascend`;
- Android projekat za API 36;
- produkcioni URL `https://weascend.wesystemlabs.com`;
- launcher, maskable i splash ikone;
- testni potpisani APK `app-release-signed.apk`;
- testni sertifikat povezan sa domenom kroz `apps/web/public/.well-known/assetlinks.json`;
- browser fallback za uređaje bez TWA podrške;
- push/notification delegacija je namerno isključena.

## Instalacija testnog APK-a

1. Prenesi `app-release-signed.apk` na Android telefon ili uključi USB debugging i koristi `adb install -r app-release-signed.apk`.
2. Ako Android pita, dozvoli instalaciju iz tog izvora samo za aplikaciju kojom otvaraš APK.
3. Pokreni WeAscend sa launcher ikone i proveri login, navigaciju, Back dugme, long-press, offline pregled i različite orijentacije.

Testni keystore se nalazi u `keystore/weascend-test.jks` i Git ga ignoriše. On služi samo za lokalni APK i ne sme postati Play upload ili app-signing ključ.

## Provera i ponovni build

```bash
npm run android:check
cd android-twa
bubblewrap build
```

Bubblewrap trenutno na Windowsu može pogrešno pozvati Java putanju koja sadrži razmak. Ako potpisivanje padne posle uspešnog Gradle builda, unsigned aligned APK može se potpisati direktno Android `apksigner` alatom.

## Pre Play Store izdanja

1. Napraviti poseban produkcioni upload key i čuvati ga izvan Git-a uz bezbedan backup.
2. Napraviti AAB sa produkcionim ključem i uključiti Play App Signing.
3. Dodati Play app-signing SHA-256 fingerprint u `assetlinks.json` zajedno sa potrebnim testnim fingerprintom.
4. Popuniti Play listing, Data Safety, privacy i account-deletion podatke.
5. Proći Internal i Closed Testing pre produkcije.

Android projekat i package ID ostaju isti; web izmene se i dalje objavljuju na postojećem WeAscend domenu.
