# ASCEND — Solo Progress System

Local-first PWA za lični napredak. Svi podaci se čuvaju na uređaju u IndexedDB-u; nema naloga, servera ni cloud sinhronizacije.

## Pokretanje

Potrebni su Node.js 22+ i npm.

```bash
npm install
npm run dev
```

Otvori adresu koju terminal prikaže (podrazumevano `http://localhost:3000`). Na Windows-u možeš i dvokliknuti `start.bat`.

## Ostale komande

```bash
npm test
npm run build
npm run preview
```

## Backup

U ekranu **Settings** izaberi **Export JSON**. Restore prihvata samo validan ASCEND backup i pre zamene podataka traži potvrdu.

## Privatnost i arhitektura

Questovi, XP transakcije, atributi, skillovi i bossovi ostaju u lokalnoj IndexedDB bazi. Sloj `app/db.ts` je izdvojen od domenske logike, pa se kasnije može dodati adapter za cloud sinhronizaciju bez menjanja XP pravila.
