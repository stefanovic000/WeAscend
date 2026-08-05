# WeAscend Android TWA

Ovaj direktorijum čuva trajnu konfiguraciju Android omotača za postojeću WeAscend PWA.

Trenutno je spremno:

- package ID `com.wesystemlabs.weascend`;
- produkcioni WeAscend URL i web manifest;
- boje, launcher/maskable ikone i splash podešavanje;
- browser fallback za uređaje bez TWA podrške;
- push/notification delegacija je namerno isključena.

Nije još napravljeno:

- produkcioni/upload signing key;
- SHA-256 fingerprint i javni `.well-known/assetlinks.json`;
- generisani Android/Gradle projekat;
- APK ili AAB;
- Play Console izdanje.

To je namerno: signing key je trajni sigurnosni identitet aplikacije. Ne treba praviti probni ključ koji bi kasnije slučajno bio izgubljen ili objavljen u Git-u.

## Kada budemo pravili prvi test APK

1. Objaviti i testirati novu multi-user web verziju sa dva odvojena naloga.
2. Instalirati Bubblewrap i njegov JDK/Android command-line alat izvan ovog repozitorijuma.
3. Napraviti i bezbedno sačuvati WeAscend upload key; putanja predviđena u konfiguraciji je `android-twa/keystore/weascend-upload.jks`, a fajl je Git-ignored.
4. Dodati njegov SHA-256 fingerprint u `twa-manifest.json`.
5. Generisati javni Asset Links fajl komandom:

   ```bash
   npm run android:assetlinks -- "AA:BB:...:FF"
   ```

   Komanda prihvata više fingerprinta, pa kasnije može sadržati i lokalni/upload i Google Play app-signing fingerprint.
6. Objaviti web verziju sa generisanim `public/.well-known/assetlinks.json`.
7. Generisati Android projekat iz `twa-manifest.json`, zatim napraviti test APK. AAB za Play ostaje za kasniju fazu.

Pre Android builda pokrenuti `npm run android:check`. Provera namerno prijavljuje da signing key i Asset Links nedostaju sve dok ne dođemo do signing faze.
