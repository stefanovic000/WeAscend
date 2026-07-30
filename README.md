# WeAscend — Personal Progress System

Cloud-synced PWA za lični napredak inspirisana „Solo Leveling“ sistemom. Engleski je podrazumevani jezik, a srpski se bira u Settings. Telefon i računar koriste isti MongoDB Atlas zapis, dok IndexedDB čuva poslednju potvrđenu verziju za pregled kada cloud nije dostupan.

Produkcija: [WeAscend](https://ascend-solo-progress.stefanovic000.chatgpt.site)

## Trenutno ponašanje

- Novi nalog počinje potpuno prazan: Level 1, 0 XP, bez atributa, skillova i questova.
- Engleski je glavni i podrazumevani jezik. U **Settings → Language** može se izabrati srpski; izbor se pamti lokalno po uređaju i radi i u read-only režimu.
- XP se jednom evidentira u transakcionoj istoriji i pripisuje globalnom nivou, atributu i skillu.
- Telefon i računar koriste MongoDB kao jedini izvor istine.
- IndexedDB je samo lokalni cache za brz prikaz i offline pregled.
- Kada cloud nije dostupan, aplikacija radi u **READ-ONLY** režimu: navigacija, kalendar, istorija i statistika rade, ali izmene nisu dozvoljene.
- Ako cloud čuvanje ne uspe, optimistička lokalna izmena se vraća na poslednju potvrđenu cloud verziju.
- Početni cloud zahtev ima limit od 8 sekundi, tako da ekran „Povezujem sistem…“ ne može beskonačno da ostane otvoren.
- Cloud konekcija se automatski pokušava ponovo, a postoji i dugme **Pokušaj sada**.

| Status | Pregled podataka | Izmene | Značenje |
| --- | --- | --- | --- |
| `CLOUD · SYNCED` | Da | Da | MongoDB je dostupan i podaci su sinhronizovani |
| `CLOUD · SYNCING` | Da | Da | Izmena se trenutno šalje u cloud |
| `CLOUD · READ-ONLY` | Da | Ne | Cloud nije dostupan; prikazuje se poslednji cache |
| `Povezujem sistem…` | Privremeno | Ne | Početna provera, najviše 8 sekundi |

## Pokretanje

Potrebni su Node.js 22.13+ i npm.

```bash
npm install
npm run dev
```

Otvori adresu koju terminal prikaže, podrazumevano `http://localhost:3000`.

Na Windows-u možeš pokrenuti i:

```bat
start.bat
```

Ostale komande:

```bash
npm test
npm run lint
npm run build
npm run preview
```

Pre commita ili deploymenta treba da prođu testovi, lint i produkcioni build.

## Lokalna konfiguracija

Kopiraj `.env.example` u `.env.local`:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ascend
OWNER_EMAIL=moja-adresa@example.com
# Opcionalno:
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-v4-flash
```

Važno:

- `.env.local` nije produkciona konfiguracija i ne šalje se na hosting.
- Produkcione vrednosti se posebno postavljaju kao Sites runtime environment variables.
- `MONGODB_URI` mora biti označen kao secret.
- Nikada ne stavljaj MongoDB URI u `VITE_*`, `NEXT_PUBLIC_*`, Git, JSON backup ili klijentski kod.
- Ako lozinka sadrži `@`, `:`, `/`, `?`, `#` ili slične znakove, URL-encode-uj je pre umetanja u URI.
- `DEEPSEEK_API_KEY` je opcionalna server-only tajna; bez nje sve osim AI XP procene radi normalno.

Bez MongoDB konfiguracije aplikacija će prikazati lokalni cache, ali će ostati **READ-ONLY**. Ne postoji lokalni režim u kom su trajne izmene dozvoljene.

## MongoDB Atlas podešavanje

1. Napravi besplatan M0 cluster.
2. Napravi posebnog database korisnika za aplikaciju.
3. Dodeli mu samo potreban pristup bazi `ascend`; nemoj koristiti Atlas administratorski nalog u URI-ju.
4. U **Security → Network Access** dodaj mrežni pristup za hosting.
5. Kopiraj Drivers connection string u `MONGODB_URI`.

Cloudflare Worker nema jednu stabilnu izlaznu IP adresu koju možeš jednostavno dodati u Atlas. Za ovaj besplatni setup može biti potreban unos:

```text
0.0.0.0/0
```

To je široko mrežno pravilo. Rizik se ograničava jakom nasumičnom lozinkom, posebnim database korisnikom sa minimalnim pravima, server-only URI tajnom i owner-only API autorizacijom.

Naziv Atlas clustera nije naziv baze. Aplikacija koristi:

```text
Database:   ascend
Collection: user_states
Index:      unique_user_state
```

Baza i kolekcija se automatski kreiraju pri prvom uspešnom upisu. Svaki dokument ima `userId`, `state`, `revision`, `createdAt` i `updatedAt`.

## Produkcija i autentifikacija

Produkcija je hostovana preko Sites/Cloudflare Worker okruženja. Statični PWA omotač je javno dostupan kako bi Android mogao da preuzme manifest i instalira punu PWA aplikaciju, ali podaci i sve funkcije aplikacije ostaju owner-only.

- Sites prijava koristi **Continue with ChatGPT**.
- `OWNER_EMAIL` dodatno ograničava aplikacioni API na očekivani email.
- Identitet dolazi iz verifikovanih hosting headera; browser ne može sam da bira `userId`.
- Neprijavljen posetilac dobija login ekran i API odgovor `401 authentication_required`.
- Prijavljen nalog koji nije `OWNER_EMAIL` dobija owner-lock ekran i API odgovor `403 owner_access_denied`; ne može da vidi niti menja podatke.
- Trenutno je dozvoljen samo jedan korisnik. Dodavanje drugih korisnika zahtevalo bi izričitu promenu server-side autorizacije.
- Posle promene produkcionih environment varijabli potrebno je napraviti novi deployment.

Produkcione vrednosti:

```text
MONGODB_URI  secret
MONGODB_DB   ascend
OWNER_EMAIL  email vlasnika
```

## Sync i konflikti između uređaja

Svako cloud stanje ima broj `revision`.

1. Uređaj učita trenutno stanje i reviziju.
2. Izmenu šalje zajedno sa tom revizijom.
3. Server prihvata upis samo ako je revizija i dalje aktuelna.
4. Ako je drugi uređaj već sačuvao noviju verziju, server vraća konflikt i aplikacija učitava najnovije cloud podatke.

Ovim se sprečava tiho prepisivanje podataka sa telefona ili računara. MongoDB konekcija se otvara i zatvara unutar jednog Worker zahteva; TCP konekcije se ne dele između različitih Cloudflare zahteva.

Kreiranje, uređivanje, beleške, arhiviranje i brisanje questova koriste posebne server-side komande preko `/api/quests`. Server menja samo ciljani quest, postavlja vreme izmene i vraća potvrđeno stanje. Ako je drugi uređaj u međuvremenu napravio izmenu, klijent učita novu reviziju i jednom bezbedno ponovi istu komandu, pa promena jednog questa ne pregazi drugi quest.

## Offline i read-only pravila

Kada internet ili MongoDB nisu dostupni:

- možeš pregledati Dashboard, Quest Manager, kalendar, Growth, Bosses, History i Settings;
- ne možeš kreirati, menjati, završiti, arhivirati ili obrisati podatke;
- import i reset su zaključani;
- export poslednje lokalno prikazane kopije je dozvoljen;
- već zarađen XP ostaje netaknut;
- neuspešan cloud upis ne ostaje kao lokalna divergentna kopija.

Service worker koristi network-first pristup i ne kešira `/api/*` zahteve.

## Backup i restore

U **Settings → Backup & Restore**:

- **Export JSON** preuzima celokupno trenutno stanje.
- **Import JSON** proverava strukturu backupa i traži potvrdu pre zamene.
- Import je dostupan samo kada je cloud online.
- Posle importa rezultat se sinhronizuje u MongoDB.

Backup ne sadrži MongoDB URI, lozinke ili autentifikacione tokene.

## Skill brisanje i istorijski XP

Brisanje skilla ne briše legitimno zarađen XP.

- Ako skill nema povezane questove ili XP, potpuno se uklanja.
- Ako ima istoriju, radi se soft-delete: nestaje iz novih izbora, ali naziv ostaje u starim questovima i XP ledgeru.
- Undo completion poništava samo XP transakciju konkretnog questa.
- Server odbija negativan XP i duplu aktivnu nagradu za istu quest instancu.

## Kalendar i planiranje

Quest Manager podržava izbor budućeg datuma i mesečni kalendar. Ponavljajući quest dobija zasebnu instancu za svaki datum, pa završavanje jedne instance ne boduje ostale.

## Boss priprema i pokušaji

Boss quest može imati povezane pripremne questove. Svaki pripremni korak koristi običan quest i sopstvenu AI XP procenu, pa se boduje tačno jednom kao konkretan rad. Boss Clear nagrada je odvojena i dobija se samo pri prvom uspešnom rezultatu.

- Neuspešan pokušaj daje `0 XP`, čuva kratku analizu i ostavlja Boss aktivnim.
- Sledeći pokušaj i dalje može dobiti punu Boss nagradu.
- Prethodno zarađen pripremni XP ostaje čak i kada Boss pokušaj ne uspe.
- Boss Clear arhivira nedovršene pripremne korake; Undo ih ponovo otvara i poništava samo Boss XP.
- Brisanje Bossa uklanja njegov sadržaj, povezane pripremne questove i analize pokušaja. Već zarađene anonimne XP transakcije ostaju u ledgeru.
- Quest koji je već dao XP ne može naknadno promeniti naziv, uslov ili XP sadržaj; beleška i arhivski status ostaju dozvoljeni.

## Opcioni DeepSeek XP advisor

Quest editor je AI-first: korisnik opisuje quest, a DeepSeek interno bira jednu od četiri skrivene kategorije i primenjuje njihovu ograničenu XP skalu. Kategorije, vreme, output bonus i rule tier nisu deo korisničkog interfejsa.

- **Estimate XP** klasifikuje quest i predlaže samo vrednost dozvoljenu internim pravilima.
- Samo uzastopna identična procena bez izmene je zaključana. Promena bilo kog polja otključava novu procenu, čak i kada se kasnije vrati prethodna vrednost.
- Posle svake procene postoji jedan **Argue** prigovor. Korisnik bira drugu dozvoljenu vrednost i objašnjava zašto; DeepSeek razumno uzima u obzir lični trud, stres i složenost, pa zahtev prihvata, prilagođava ili odbija.
- AI procena i prigovor se nikada ne primenjuju automatski.
- DeepSeek ne traži dokaz i ne procenjuje iskrenost. Negativne, pasivne, besciljne i kružne aktivnosti dobijaju `0 XP`.
- Direktan ručni XP unos je podrazumevano skriven. Može se svesno uključiti u **Settings → Experience Rules → Allow manual XP override**.
- Ako DeepSeek nije dostupan, editor prikazuje **AI system offline** i XP ostaje `0`; nema alternativnog birača nagrade. Ručni unos se dobija isključivo preko Settings opcije.
- Naziv, opis, tip, težina, attribute, skill, uslov završetka i naziv povezanog Bossa šalju se DeepSeek API-ju samo kada korisnik zatraži procenu ili prigovor.
- API ključ nikada ne dolazi u browser i nije deo backupa.
- Server prekida DeepSeek zahtev nakon 20 sekundi.
- Podrazumevani model je `deepseek-v4-flash` u non-thinking režimu radi manje potrošnje i bržeg odgovora; model se može promeniti preko `DEEPSEEK_MODEL`.

Za produkciju dodaj `DEEPSEEK_API_KEY` kao Sites secret i napravi novi deployment. Ako ključ nije podešen, ostale funkcije aplikacije rade, ali AI procena nije dostupna.

## Telefon i PWA instalacija

Na telefonu otvori produkcioni URL u browseru, prijavi se istim ChatGPT nalogom i izaberi **Add to Home Screen** ili **Install app**.

- Telefon i računar tada koriste isti MongoDB dokument.
- Javni pristup manifestu je nameran i potreban Android instalaciji; javnost frontenda ne daje pristup API-ju ili ličnim podacima.
- Samo nalog čiji email odgovara `OWNER_EMAIL` može da otvori aplikaciju posle prijave.
- Nemoj koristiti lokalni `localhost` URL sa računara kao mobilnu verziju.
- Offline možeš pregledati poslednju potvrđenu kopiju, ali izmene čekaju povratak cloud veze.
- Ako PWA posle deploymenta prikazuje staru verziju, potpuno je zatvori i ponovo pokreni.

## Važne UI odluke

- Ne koristiti `window.prompt()` ili `window.confirm()`. In-app i PWA okruženja ih mogu blokirati.
- Kreiranje atributa, skillova, bossova i potvrde destruktivnih radnji koriste aplikacione modale.
- Confirm modal mora imati dovoljno prostora za opis i statičan footer kako dugmad ne bi preklapala tekst.
- Destruktivne radnje uvek traže potvrdu.

## Troubleshooting

### Aplikacija stoji na „Povezujem sistem…“

Aktuelna verzija prekida cloud proveru posle 8 sekundi i prelazi na read-only prikaz.

1. Uradi hard refresh: `Ctrl + F5`.
2. Proveri da li je učitana najnovija deployment verzija.
3. Ako se pojavi read-only banner, nastavi sa sledećim odeljkom.
4. Ako je instalirana kao PWA, potpuno je zatvori i ponovo otvori.

Brisanje svih site podataka briše i IndexedDB cache. To radi samo ako je cloud stanje potvrđeno ili imaš JSON backup.

### Piše „Cloud nije dostupan · READ-ONLY“

Proveri redom:

1. Da li Sites produkcija ima `MONGODB_URI`, `MONGODB_DB` i `OWNER_EMAIL`.
2. Da li je `MONGODB_URI` secret i da li je posle njegove izmene napravljen novi deployment.
3. Da li Atlas cluster radi i nije pauziran.
4. Da li database korisnik i lozinka iz URI-ja postoje.
5. Da li **Network Access** dozvoljava Worker konekciju; za ovaj setup proveri `0.0.0.0/0`.
6. Sačekaj da Atlas primeni mrežnu izmenu, zatim klikni **Pokušaj sada**.

Ako lokalni `/api/state` radi, a produkcioni ne radi, najčešći uzroci su odvojene produkcione tajne ili Atlas IP Access List.

### `prompt() is not supported`

To znači da je novi UI ponovo pozvao browser `prompt()`. Rešenje je aplikacioni input modal; u trenutnom kodu nijedan CRUD tok ne treba da koristi native prompt.

### `nodejsSecureRandomBytes` / BSON greška u Workeru

MongoDB BSON modul je pokušavao Web Crypto operaciju tokom inicijalizacije Cloudflare bundle-a. `build/bson-worker-compat.ts` menja samo ObjectId process seed tokom builda i sprečava taj global-scope poziv.

Ako se MongoDB/BSON paket ažurira i promeni interni initializer, build namerno pada sa porukom da compatibility patch mora da se proveri.

### `Topology.selectServer` ili dugačak `/api/state` zahtev

To znači da Worker nije uspeo da izabere Atlas server. Proveri Network Access, cluster status, korisnika i produkcioni URI.

Server koristi:

```text
serverSelectionTimeoutMS: 5000
socketTimeoutMS:          8000
maxPoolSize:              1 po zahtevu
```

Klijent dodatno prekida bootstrap nakon 8 sekundi. MongoDB klijent se ne čuva globalno između Worker zahteva.

### Lokalno radi, produkcija ne radi

`.env.local` i Sites runtime secrets su dve odvojene konfiguracije. Lokalni uspeh potvrđuje URI i database korisnika, ali ne potvrđuje produkcioni secret ili Atlas mrežni pristup za Cloudflare.

### Stari UI posle deploymenta

Service worker je network-first, ali otvoreni tab može i dalje izvršavati staru JavaScript verziju.

1. Uradi `Ctrl + F5`.
2. Zatvori i ponovo otvori instaliranu PWA.
3. Tek kao poslednju opciju očisti site cache, uz prethodni JSON backup.

## Testovi

`npm test` proverava:

- potpuno prazno početno stanje;
- XP formulu i rast zahteva po levelu;
- podesive rank pragove;
- zaštitu od duplog XP-a;
- undo samo ciljne XP transakcije;
- zasebne instance recurring questova;
- cloud validaciju negativnog i duplog XP-a.

Pre produkcije obavezno pokreni:

```bash
npm test
npm run lint
npm run build
```

## Relevantna dokumentacija

- [MongoDB Atlas IP Access List](https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/)
- [Cloudflare Workers TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Cloudflare Workers Node.js `net`](https://developers.cloudflare.com/workers/runtime-apis/nodejs/net/)
- [Cloudflare Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion)
- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)
