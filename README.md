# ASCEND — Solo Progress System

Online-first PWA za lični napredak. Telefon i računar koriste isti MongoDB Atlas zapis, dok IndexedDB čuva lokalni cache i omogućava bezbedan prikaz poslednje sinhronizovane verzije kada veza nestane.

## Pokretanje

Potrebni su Node.js 22+ i npm.

```bash
npm install
npm run dev
```

Otvori adresu koju terminal prikaže (podrazumevano `http://localhost:3000`). Na Windows-u možeš i dvokliknuti `start.bat`.

Bez `MONGODB_URI` aplikacija u lokalnom razvoju automatski radi u lokalnom režimu. Za proveru cloud sinhronizacije napravi `.env.local` prema `.env.example`.

## Ostale komande

```bash
npm test
npm run build
npm run preview
```

## Backup

U ekranu **Settings** izaberi **Export JSON**. Restore prihvata samo validan ASCEND backup i pre zamene podataka traži potvrdu. Importovana verzija se zatim sinhronizuje sa cloud bazom.

## MongoDB Atlas

1. U MongoDB Atlas-u napravi besplatan M0 cluster.
2. Napravi posebnog database korisnika sa pristupom samo ovoj bazi.
3. U Network Access dozvoli pristup aplikaciji. Za javni serverless deployment Atlas obično zahteva `0.0.0.0/0`, pa obavezno koristi dugu nasumičnu lozinku i ograničenog database korisnika.
4. Kopiraj `.env.example` u `.env.local` i zameni placeholder vrednosti:

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=ascend
OWNER_EMAIL=moja-adresa@example.com
```

`MONGODB_URI` je server-only tajna. Nikada je ne stavljaj u `VITE_*`, `NEXT_PUBLIC_*`, Git, JSON backup ili klijentski kod.

## Sync i zaštita podataka

- Produkcija koristi prijavu preko Sites platforme; isti nalog na oba uređaja dobija isti zapis.
- Server proverava identitet i nikad ne prihvata `userId` iz browsera.
- Svako čuvanje koristi broj revizije. Ako je drugi uređaj već sačuvao noviju verziju, zastareli upis se odbija i učitava se najnovija verzija.
- Kada cloud veza nestane, aplikacija prikazuje poslednji IndexedDB cache, ali zaključava izmene da se ne naprave dve divergentne kopije.
- Prvi online start prenosi postojeće lokalne podatke samo ako je cloud zapis prazan.
- XP istorija ostaje transakciona; server odbija negativan XP i duplu aktivnu nagradu za istu quest instancu.

## Produkcija

Za deployment postavi `MONGODB_URI`, `MONGODB_DB` i po želji `OWNER_EMAIL` kao runtime environment variables/secrets na hostingu. Tek tada objavi Sites verziju. Aplikacija se potom može instalirati na telefonu iz browsera kao PWA i koristiti istim nalogom kao na računaru.
