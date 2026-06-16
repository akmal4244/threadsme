# ThreadsMe Extension Bridge

Dokumen ini menerangkan sambungan antara ThreadsMe local dan akaun Threads yang login dalam Chrome.

## Objektif

ThreadsMe local boleh jana story, audit produk, dan susun queue 25 posting sehari. Tetapi Threads native schedule hanya boleh disahkan apabila sistem melihat akaun Threads sebenar. Extension ini menutup jurang itu.

## Komponen

| Komponen | Fungsi |
| --- | --- |
| ThreadsMe Core | Simpan queue, Quality Gate, Product Intel, status `Pending/Blocked/Lulus/Gagal`. |
| ThreadsMe Extension | Baca sesi Chrome, scan scheduled posts di Threads, isi composer, schedule slot, dan hantar proof. |
| Threads Account | Akaun Akmal yang sudah login dalam Chrome. Tiada password disimpan dalam ThreadsMe. |

## Flow Disyorkan

1. Jalankan ThreadsMe AI server: `npm run ai`.
2. Buka `http://localhost/threadsme/`.
3. Buka `Automasi Live`.
4. Klik `Dapatkan pairing`.
5. Load folder `threadsme-extension` di `chrome://extensions`.
6. Paste token pairing dalam popup extension.
7. Klik `Connect akaun Threads`.
8. Login Threads jika Chrome belum login.
9. Klik `Scan Threads`.
10. Klik `Sync ke ThreadsMe`.
11. Jika count kurang daripada 25, klik `Isi sampai 25` hanya selepas semak bahawa extension sudah connect akaun yang betul.

## Status Online

Dashboard memaparkan `Semua sistem online` apabila:

- AI server ThreadsMe online di `127.0.0.1:8788`.
- Extension token valid.
- Extension berjaya mengesan akaun Threads login.
- Scheduled native count mencapai target, biasanya `25/25`.

Jika status masih `Belum connect`, pasang extension dan paste token pairing.

Jika status `Extension sync` tetapi bukan `Semua sistem online`, biasanya salah satu ini berlaku:

- Threads belum login dalam Chrome.
- Scheduled native count kurang daripada 25.
- Extension scan halaman yang bukan Drafts/Scheduled.
- UI Threads berubah dan selector perlu dibaiki.

## Guard Produk

Extension menerima `expectedProductKind`, `previewMustIncludeAny`, dan `previewMustNotInclude` daripada ThreadsMe.

Sebelum submit schedule, extension akan semak teks halaman/preview:

- Jika preview tidak nampak sepadan dengan produk, schedule ditahan.
- Jika preview mengandungi kategori bercanggah, schedule ditahan.
- Error dihantar semula ke ThreadsMe supaya status boleh diaudit.

Contoh guard penting:

- Link `https://s.shopee.com.my/5q5mTxqz8i` ditanda sebagai produk pressure cooker/DESSINI, bukan Sambal.
- Story sambal tidak boleh menggunakan link pressure cooker.
- Story Flexi Marble tidak boleh menggunakan link sambal atau pressure cooker.

## Keselamatan

- Extension tidak menyimpan password Threads.
- Token pairing disimpan local dalam Chrome storage.
- Endpoint extension memerlukan bearer token.
- CORS `chrome-extension://...` hanya dibuka untuk `/api/extension/*`.
- Pairing token penuh hanya dipaparkan apabila Akmal klik `Dapatkan pairing`.

## Fail Berkaitan

| Fail | Tujuan |
| --- | --- |
| `threadsme-extension/manifest.json` | Manifest Chrome MV3. |
| `threadsme-extension/src/background.js` | API bridge dan command orchestration. |
| `threadsme-extension/src/content.js` | Scan/fill/schedule di halaman Threads. |
| `threadsme-extension/src/popup.*` | UI popup extension. |
| `work/private/extension-bridge.json` | Token dan status private runtime. Tidak di-commit. |

## Nota Production

Extension ini ialah automasi UI. Jika Threads mengubah UI composer/scheduler, extension akan berhenti dengan error, bukan submit senyap. Itu lebih selamat untuk affiliate posting kerana salah link atau salah akaun lebih mahal daripada slot lambat diisi.
