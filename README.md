# WeAscend — Personal Progress System

Cloud-synced PWA za lični napredak inspirisana „Solo Leveling“ sistemom. Engleski je podrazumevani jezik, a srpski se bira u Settings. Svaki Firebase nalog ima sopstveno MongoDB stanje; IndexedDB čuva odvojenu poslednju potvrđenu verziju po nalogu samo za offline pregled.

Produkcija: [WeAscend](https://weascend.wesystemlabs.com)

## Osnovno ponašanje

- Novi nalog počinje potpuno prazan: Level 1, 0 XP, bez atributa, skillova i questova.
- Vođeni spotlight tutorijal se automatski prikazuje jednom po nalogu: prelazi kroz Dashboard, Attributes & Skills, kalendar, pravljenje questa, AI XP, Bosses i History, dok jasno ističe kontrolu o kojoj govori. Probni quest se nikada ne čuva, a tutorijal može ponovo da se pokrene iz Settings.
- Firebase Authentication podržava Google i email/password prijavu.
- Email/password nalog mora potvrditi email pre pristupa podacima.
- MongoDB je jedini cloud izvor istine; IndexedDB je cache odvojen po Firebase UID-u.
- Kada cloud nije dostupan, aplikacija je READ-ONLY: podaci mogu da se pregledaju, ali ne i menjaju.
- XP se jednom evidentira u transakcionoj istoriji i pripisuje globalnom nivou, atributu i skillu.
- Revizije sprečavaju da jedan uređaj neprimetno pregazi novije stanje sa drugog uređaja.
- Engleski je glavni jezik; srpski se bira u **Settings → Language**.

## Pokretanje

Potrebni su Node.js 22.13+ i npm.

```bash
npm install
npm run dev
```

Otvori adresu koju terminal prikaže, podrazumevano `http://localhost:3000`.

Na Windows-u možeš koristiti i `start.bat`.

Provere:

```bash
npm test
npm run lint
npm run build
npm run preview
```

## Lokalna konfiguracija

Kopiraj `.env.example` u `.env.local`:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ascend

FIREBASE_PROJECT_ID=weascend-project
FIREBASE_API_KEY=Firebase-Web-API-key
FIREBASE_AUTH_DOMAIN=weascend-project.firebaseapp.com
FIREBASE_APP_ID=Firebase-Web-App-ID
FIREBASE_MESSAGING_SENDER_ID=Firebase-Sender-ID

# Uključi tek kada su sve vrednosti podešene.
AUTH_EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
AUTH_EMAIL_FROM=WeAscend <account@weascend.example>
APP_BASE_URL=https://weascend.wesystemlabs.com
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@weascend-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
AUTH_EMAIL_RATE_LIMIT_SECRET=duga-nasumicna-tajna

ANDROID_APPLICATION_ID=com.wesystemlabs.weascend

DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash

AI_LIMITS_ENABLED=false
AI_XP_DAILY_LIMIT=20
AI_BOSS_STEPS_DAILY_LIMIT=5
AI_COOLDOWN_SECONDS=10
PREMIUM_BETA_ACCESS=true
```

Važno:

- `.env.local` se ne šalje na hosting.
- `MONGODB_URI`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, Firebase Admin ključ i rate-limit secret su server-only tajne.
- Nikada ih ne stavljaj u `VITE_*`, `NEXT_PUBLIC_*`, Git, JSON backup ili browser kod.
- Firebase web konfiguracija identifikuje projekat i nije Firebase Admin credential, ali se i dalje učitava kroz environment konfiguraciju.
- Bez Firebase konfiguracije lokalni development koristi lokalnog test korisnika. Produkcija nema taj bypass.
- Bez MongoDB-a aplikacija može prikazati cache, ali ne dozvoljava trajne izmene.

## Firebase Authentication

1. U [Firebase Console](https://console.firebase.google.com/) napravi WeAscend projekat.
2. U **Authentication → Sign-in method** uključi Google i Email/Password.
3. U **Project settings → Your apps** dodaj Web app.
4. Kopiraj `projectId`, `apiKey`, `authDomain`, `appId` i `messagingSenderId` u environment vrednosti.
5. U Authentication settings dodaj lokalni i produkcioni domen u **Authorized domains**.
6. Uključi email-enumeration protection.
7. Za Resend migraciju napravi Firebase service account sa pravom `firebaseauth.users.sendEmail` i sačuvaj njegov email/private key samo u serverskim environment vrednostima.
8. U Resend-u potvrdi domen, napravi server-only API ključ i koristi adresu tog domena u `AUTH_EMAIL_FROM`.
9. Postavi `APP_BASE_URL` na tačan javni HTTPS origin, bez putanje. Linkovi se ne grade iz dolaznog Host headera.
10. Tek nakon probnog verification i reset emaila postavi `AUTH_EMAIL_PROVIDER=resend`. Bez tog flag-a aplikacija privremeno koristi Firebase email slanje.
11. Firebase Android app je registrovan sa trajnim package ID-em `com.wesystemlabs.weascend`; signing SHA fingerprinti se dodaju kada nastane prvi ključ.

Klijent šalje Firebase ID token serveru preko HTTPS-a. Server proverava potpis, issuer, audience/projekat, vreme važenja, `auth_time`, stabilni UID i potvrđen email. Browser nikada ne bira `userId`.

Kod prilagođenih poruka Firebase i dalje pravi jednokratni action code, dok Resend šalje WeAscend HTML i plain-text email. Verification endpoint prihvata i bezbedno proverava token još nepotvrđenog korisnika; ostali privatni API endpointi i dalje zahtevaju potvrđen email. Nepotvrđena Firebase sesija ostaje samo na uređaju na kojem je započeta registracija i nema pristup privatnim API-jima. Ako se verifikacioni link otvori u istom browseru i pripada istoj email adresi, aplikacija osvežava potvrđeni token i automatski ulazi; drugi browser ili drugi nalog i dalje zahtevaju prijavu. Password-reset odgovor je isti bez obzira na to da li nalog postoji, a slanje je ograničeno cooldown-om i dnevnim limitom. API ključ, Firebase private key i sadržaj emaila ne ulaze u browser niti MongoDB.

## MongoDB Atlas

Napravi poseban database korisnički nalog sa minimalnim pravima nad bazom `ascend`. Cloudflare Worker nema stabilnu izlaznu IP adresu, pa besplatan Atlas setup može zahtevati `0.0.0.0/0`. Rizik se ograničava snažnom database lozinkom, minimalnim pravima, server-only URI-jem i autentifikacijom svakog API zahteva.

Nova multi-user verzija koristi:

```text
Database:    ascend
Collections: user_states_v2
             users_v2
             ai_usage_v2
             auth_email_usage_v2
```

Kolekcije korisničkog stanja su indeksirane stabilnim Firebase `userId`-em. `auth_email_usage_v2` čuva samo hashovan rate-limit ključ, vrstu poruke, brojač i vreme; ne čuva adresu, action link ni sadržaj emaila i automatski ističe nakon 48 sati. Stara owner-only kolekcija `user_states` je trajno obrisana 5. avgusta 2026. Nova verzija ne pokušava migraciju starih podataka i svaki Firebase nalog dobija zasebno, prazno stanje.

## Sync i privatnost između korisnika

- Svaki server-side upit koristi UID iz verifikovanog tokena.
- Klijent ne šalje niti bira vlasnički UID.
- Export sadrži samo stanje trenutno prijavljenog korisnika.
- Import menja samo stanje trenutno prijavljenog korisnika.
- Lokalni cache koristi ključ `user:<firebase-uid>` i zato se ne meša između naloga.
- Legacy IndexedDB baza se uklanja pri prvom pokretanju nove verzije.
- API odgovori imaju `Cache-Control: no-store, private`.
- Service worker ne kešira `/api/*` zahteve.

## Brisanje naloga i privatnost

- **Settings → Account → Delete account** briše questove, beleške, XP istoriju, skillove, atribute, bossove, šablone, AI usage zapis, profil i Firebase Auth nalog.
- `/delete-account` pruža isti tok iz browsera čak i kada PWA više nije instalirana.
- `/privacy` objašnjava koje podatke koriste Firebase, MongoDB, lokalni cache i AI servis.
- `/terms` pruža javno dostupne uslove korišćenja za testere i budući Play listing.
- Brisanje zahteva potvrdu i ne može se poništiti.
- JSON export treba napraviti pre brisanja ako korisnik želi privatnu kopiju.

## AI zaštita

DeepSeek ostaje opcioni AI advisor. Quest sadržaj se šalje samo kada korisnik eksplicitno zatraži XP procenu, prigovor ili generisanje Boss koraka.

Zaštita po korisniku je implementirana, ali je za inicijalne testere isključena:

```dotenv
AI_LIMITS_ENABLED=false
```

Kada se uključi, sistem podržava odvojeni dnevni limit za XP procene i Boss korake, kao i cooldown između zahteva. Autentifikacija, veličina zahteva i server-side zaštita API ključa ostaju aktivni bez obzira na ovaj flag.

## Planovi tokom zatvorene bete

Važne razlike moraju ostati definisane u centralnom `PLAN_LIMITS` katalogu i vidljive korisnicima u **Settings → Plan & Usage**.

| Mogućnost | WeAscend Free | Premium |
| --- | ---: | ---: |
| XP procene | 15 mesečno | 150 mesečno |
| XP žalbe | 15 mesečno | 100 mesečno |
| AI Boss planovi | 1 mesečno | 10 mesečno |
| Sačuvani questovi | 500 | 1.000 |

- `PREMIUM_BETA_ACCESS=true` daje svim prijavljenim testerima besplatan Premium pristup bez naplate.
- Quest kapacitet se proverava na klijentu radi jasnog UI-ja i na serveru radi stvarne zaštite. Smanjenje plana nikada ne briše stare questove; korisnik iznad limita može da ih menja ili briše, ali ne i da pravi nove.
- `AI_LIMITS_ENABLED=false` znači da su AI kvote tokom testiranja prikazane radi transparentnosti, ali se još ne primenjuju.
- Plan se određuje na serveru i ne ulazi u lokalni AppState ili JSON backup, pa ga klijent ne može sam promeniti.
- Billing, upgrade dugmad i paywall još nisu aktivni. Personal AI Memory, Smart Daily Plan i Weekly Ascension Report ostaju za kasnije faze.

## Offline režim

Kada internet ili cloud nisu dostupni:

- Dashboard, kalendar, Growth, Bosses, History i Settings mogu da se pregledaju;
- kreiranje, menjanje, završavanje, arhiviranje, import, reset i brisanje nisu dozvoljeni;
- export poslednje potvrđene kopije je dozvoljen;
- neuspešan cloud upis se vraća na poslednju potvrđenu verziju.

## Questovi, XP i istorija

- Jedna quest instanca može dati XP samo jednom.
- Undo poništava samo transakciju konkretnog questa.
- Brisanje questa uklanja njegov sadržaj i belešku, ali već legitimno zarađena transakcija ostaje kao anoniman istorijski zapis.
- Skill ili atribut bez istorije briše se potpuno; onaj sa istorijskim XP-em radi soft-delete da bi ledger ostao tačan.
- Archive sklanja quest iz podrazumevanog prikaza bez brisanja sadržaja ili XP-a.
- Quest Templates prave zasebnu instancu po datumu; obično ponavljanje se podešava samo kroz Templates da ne bi postojala dva konkurentna sistema.
- Boss priprema zarađuje sopstveni XP; Boss Clear nagrada ostaje odvojena.

## Play Store priprema

- Kompanija: WeSystemLabs
- Trajni Android application ID: `com.wesystemlabs.weascend`
- Login: Google kao glavni, email/password kao fallback i reviewer pristup.
- Login i registracija imaju odvojene, stalno vidljive tabove. Email registracija prikazuje minimalno pravilo lozinke i konkretne Firebase greške umesto jedne opšte poruke.
- Play reviewer nalog mora biti trajan, bez OTP-a, sa engleskim uputstvom i primerima podataka.
- Privacy Policy i spoljni account-deletion URL moraju biti uneti u Play Console.
- Android TWA projekat za API 36 nalazi se u `android-twa/`; notifikacije su namerno isključene za prvu test verziju.
- Potpisani lokalni test APK je spreman, a njegov testni SHA fingerprint je povezan sa domenom kroz Digital Asset Links. Testni ključ se nikada ne koristi za Play izdanje.
- `npm run android:check` proverava da PWA i Android konfiguracija ostanu usklađene.
- `npm run android:assetlinks -- "SHA-256-FINGERPRINT"` bezbedno generiše javni Digital Asset Links fajl; signing ključ nikada ne ide u Git.
- Detaljan redosled za prvi test APK nalazi se u `android-twa/README.md`.

## Troubleshooting

### Login ekran kaže da autentifikacija nije podešena

Proveri svih pet `FIREBASE_*` environment vrednosti i napravi novi deployment. Zatim proveri da li je domen dodat u Firebase Authorized domains.

### Google dugme ostane zaključano posle zatvaranja popup-a

Login ekran otključava Google dugme čim se browser vrati iz popup-a, uz rezervno otključavanje posle pet sekundi. Svaki novi pokušaj poništava zakašnjeli UI rezultat prethodnog pokušaja, pa korisnik može bezbedno pokušati ponovo.

### Email/password korisnik ne može da uđe

Korisnik mora kliknuti verification link. Nova poruka za potvrdu se šalje pri sledećem pokušaju prijave.

WeAscend ima sopstvenu javnu `/email-action` stranicu za Firebase email akcije. Ona obrađuje potvrdu emaila, reset lozinke i vraćanje promenjene email adrese, sa engleskim ili srpskim tekstom prema jeziku email poruke. Firebase kod ostaje u URL-u samo tokom te akcije i ne upisuje se u MongoDB niti u aplikacioni state.

Kada je Resend aktiviran, server traži jednokratni Firebase kod, ugrađuje ga u fiksni WeAscend `/email-action` link i šalje naš brendirani email. Ako custom provider još nije potpuno podešen, klijent koristi postojeći Firebase email kao migracioni fallback. Operativna Resend greška se ne prebacuje tiho na Firebase, kako korisnik ne bi dobijao dve različite poruke.

### Cloud je READ-ONLY

Proveri MongoDB URI, Atlas cluster, database korisnika i Network Access. Zatim proveri da li autentifikovani zahtev dobija važeći Firebase token.

### Lokalno radi, produkcija ne radi

`.env.local` i produkcione environment vrednosti su odvojene. Lokalni development može koristiti bypass kada Firebase nije podešen; produkcija namerno ne može.

### Stari UI posle deploymenta

Uradi hard refresh, potpuno zatvori instaliranu PWA i ponovo je pokreni. Brisanje site podataka koristi samo kao poslednju opciju.

## Testovi

Automatski testovi proveravaju prazno početno stanje, XP formulu, rank pragove, dupli XP, undo, template logiku, Boss pokušaje, cloud validaciju i Firebase granicu između neprijavljenog, nepotvrđenog i dva različita potvrđena korisnika.

Pre produkcije obavezno pokreni:

```bash
npm test
npm run lint
npm run build
```

## Dokumentacija

- [Firebase Authentication for Web](https://firebase.google.com/docs/auth/web/start)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Auth REST account deletion](https://firebase.google.com/docs/reference/rest/auth)
- [MongoDB Atlas IP Access List](https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)
- [Android Trusted Web Activities](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)
