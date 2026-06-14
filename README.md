# ThreadsMe

**ThreadsMe** ialah sistem automasi kandungan Threads untuk affiliate marketing. Sistem ini membantu jana story produk dalam Bahasa Melayu Malaysia, susun jadual 25 posting sehari, pantau status queue, dan sediakan publisher automatik melalui Threads API.

Nama rasmi sistem:

| Item | Maklumat |
| --- | --- |
| Nama sistem | ThreadsMe |
| Repo slug | threadsme |
| Versi | v0.9.4 |
| Bahasa UI | Bahasa Melayu Malaysia |
| Zon masa | Asia/Kuala_Lumpur |
| Kredit | Sistem Dibangunkan Sepenuhnya Oleh Akmal Marvis |
| Localhost rasmi | `http://localhost/threadsme/` |

## Fail Ingatan dan Operasi

Fail berikut menjadi rujukan utama bila kerja ThreadsMe disambung semula:

| Fail | Tujuan |
| --- | --- |
| `SYSTEM_MEMORY.md` | Ingatan sistem: tetapan rasmi, peraturan story, status queue, prinsip design, dan larangan penting. |
| `docs/OPERATION_RUNBOOK.md` | Cara menjalankan, menyemak, deploy, dan memulihkan ThreadsMe. |
| `docs/IMPROVEMENT_BACKLOG.md` | Senarai cadangan tambah baik yang sudah dikenal pasti dan boleh dibuat selepas ini. |

## Fungsi Utama

- Jana siri 3 post Threads: `[POST UTAMA]`, `[REPLY 1]`, `[REPLY 2]`.
- Storytelling deep storyline untuk netizen Malaysia.
- Input produk melalui tajuk produk wajib, kategori/kegunaan produk, gambar upload, paste gambar, link gambar, nota produk, dan link affiliate.
- Pilihan posting sehari termasuk `25 posting / hari`.
- Auto cipta story dan terus masukkan ke jadual ThreadsMe.
- Kalendar jadual harian dengan semakan 25 slot sehari.
- Status posting: `Lulus`, `Pending`, `Blocked`, `Gagal`, `Disediakan`, dan `Perlu Semak`.
- Auto promote `Blocked` kepada `Pending` bila slot schedule kosong.
- Auto Audit Produk berjalan bersama sync automation untuk tahan story yang belum sah produk dan ringkaskan tindakan penting.
- Pusat `Tindakan Saya` memaparkan kerja minimum yang benar-benar perlukan input Akmal.
- Product Audit untuk baiki siri lama yang tiada tajuk produk atau story tidak relevan.
- Product Audit memaparkan ayat semasa `[POST UTAMA]`, `[REPLY 1]`, dan `[REPLY 2]` untuk semakan sebelum regenerate.
- Quality Gate sebelum story masuk jadual: relevansi produk, hook, BM Malaysia, claim, CTA, dan had 300 aksara.
- Product Intelligence untuk cuba ekstrak tajuk/kategori daripada link Shopee, affiliate, gambar, atau nota.
- Automation Health untuk semak AI server, DeepSeek key, Pending 25/25, Blocked, publisher, dan audit issue.
- Preview Netizen untuk semak rasa manusia sebelum publish.
- Publisher Threads API dengan mode `Dry-run` dan mode live apabila token rasmi sudah diset.
- UI refresh gaya Kumo UI dan `gpt-taste`: semantic color token, surface hierarchy, sidebar premium, table compact, focus state jelas, dan motion GSAP yang ringan.

## Workflow Produk Tepat

Untuk elak story lari daripada produk sebenar, `Tajuk produk wajib` mesti diisi sebelum jana story. Link gambar Shopee sahaja tidak cukup kerana URL imej selalunya tidak membawa nama produk, dan kadang-kadang imej yang diberi ialah banner promosi, bukan gambar produk.

Cadangan input minimum:

- `Tajuk produk wajib`: nama produk sebenar di Shopee, contoh `Sambal Nyet Berapi by Khairulaming 180g`.
- `Kategori / kegunaan produk`: fungsi ringkas produk, contoh `sambal ready-to-eat, lauk cepat, penambah selera`.
- `Nota gambar / produk`: konteks emosi atau situasi, contoh `sesuai untuk nasi panas, telur, ayam goreng, hari malas masak`.
- `Link affiliate produk`: link CTA wajib yang akan diletakkan di akhir Reply 2.

ThreadsMe akan tolak proses generate jika tajuk produk kosong. Prompt DeepSeek juga dikunci supaya AI tidak tukar kategori produk atau reka manfaat yang tidak berkaitan.

## Cara Jalankan

Keperluan:

- Node.js 18 atau lebih baru.
- Akaun DeepSeek jika mahu jana story AI.
- Threads API user ID dan access token jika mahu publish live.

Pasang dan jalan:

```bash
npm install
npm run start
```

URL rasmi localhost pada PC ini menggunakan Apache/XAMPP:

```text
http://localhost/threadsme/
```

Untuk deploy semula fail static ke XAMPP:

```bash
npm run deploy:xampp
```

Jika mahu jalan terus dengan Node tanpa XAMPP, guna fallback dev:

```bash
npm run start:dev
```

```text
http://localhost:8791/threadsme/
```

Jalankan server AI dalam terminal lain:

```bash
npm run ai
```

Atau hidupkan server AI secara background:

```bash
npm run ai:hidden
```

Server AI default:

```text
http://127.0.0.1:8788
```

## API Key

ThreadsMe tidak commit API key ke repo.

Pilihan DeepSeek:

```bash
set DEEPSEEK_API_KEY=sk-...
npm run ai
```

Atau simpan dalam fail private:

```text
work/private/deepseek.key
```

Threads access token pula boleh disimpan melalui GUI Publisher atau melalui env:

```bash
set THREADS_ACCESS_TOKEN=...
```

Fail private yang diabaikan git:

```text
work/private/
work/runtime/
publish-log.json
.env
```

## Struktur Sistem

```text
threadsme/
|-- assets/
|   |-- flexi-marble-sheet.png
|   |-- threadsme-favicon.svg
|   `-- threadsme-logo.svg
|-- docs/
|   |-- IMPROVEMENT_BACKLOG.md
|   `-- OPERATION_RUNBOOK.md
|-- scripts/
|   `-- deploy-xampp.ps1
|-- ai-server.mjs
|-- app.js
|-- index.html
|-- server.mjs
|-- SYSTEM_MEMORY.md
|-- status.json
|-- story-runs.json
|-- styles.css
|-- threads_flexi_marble_schedule.json
|-- package.json
|-- .env.example
|-- .gitignore
`-- README.md
```

## Database JSON

ThreadsMe menggunakan JSON file database supaya ringan dan mudah audit.

| Fail | Fungsi |
| --- | --- |
| `threads_flexi_marble_schedule.json` | Snapshot jadual contoh/legacy untuk fallback static. Runtime sebenar kini disalin ke `work/runtime/threads-schedule.json`. |
| `work/runtime/threads-schedule.json` | Jadual aktif untuk siri posting, slot, CTA, affiliate link, dan metadata produk. Fail ini tidak di-commit. |
| `status.json` | Snapshot status queue contoh/legacy untuk fallback static. Runtime sebenar kini disalin ke `work/runtime/status.json`. |
| `story-runs.json` | Snapshot rekod output AI contoh/legacy untuk fallback static. Runtime sebenar kini disalin ke `work/runtime/story-runs.json`. |
| `work/runtime/*.json` | Runtime database aktif untuk status, story runs, dan publish log. Fail ini tidak di-commit. |
| `publish-log.json` | Log publisher legacy. Runtime aktif ialah `work/runtime/publish-log.json`. Fail ini tidak di-commit. |
| `work/private/*.json` dan `work/private/*.txt` | Token/API key private. Fail ini tidak di-commit. |

## Workflow Automation

```mermaid
flowchart TD
  A["Input produk / gambar / link affiliate"] --> B["Jana story AI"]
  B --> C["Validasi format Threads"]
  C --> D["Masuk jadual 25 posting sehari"]
  D --> E["Pending maksimum 25 aktif"]
  E --> F["Blocked menunggu slot kosong"]
  F --> G["Auto promote kepada Pending"]
  E --> H["Publisher dry-run atau live Threads API"]
  H --> I["Status Lulus atau Gagal"]
```

## Prinsip Reka Bentuk

ThreadsMe kini mengambil inspirasi daripada Kumo UI tanpa menukar stack vanilla:

- Semantic token untuk warna, teks, border, status dan surface.
- Surface hierarchy yang jelas untuk sidebar, dashboard, calendar, queue, preview dan publisher.
- Komponen gaya resource-list dan compact table untuk status posting.
- Focus state dan hover state yang lebih jelas untuk penggunaan harian.
- Motion GSAP ringan untuk reveal dan hover, bukan animasi berat.

## Nota Had Threads

ThreadsMe mengekalkan queue aktif maksimum 25 siri Pending untuk mengelakkan jadual bertindih. Baki siri akan kekal `Blocked` sehingga slot kosong. Status hanya patut dianggap `Pending` selepas ThreadsMe berjaya memasukkan siri ke queue automation.

## Version Log

### v0.9.4

- Tambah `Auto Audit Produk` yang berjalan bersama sync automation dan boleh dipaksa melalui UI.
- Tambah halaman/menu `Tindakan Saya` untuk mengurangkan penglibatan manual dan fokus pada isu produk yang paling penting.
- Redesign UI ke arah minimal premium: warna lebih warm, surface lebih flat, action ledger lebih jelas, dan responsive action cards.

### v0.9.3

- Tukar logo utama dan favicon kepada identiti ThreadsMe baharu berasaskan monogram `T`.
- Bump cache favicon/CSS supaya `http://localhost/threadsme/` memaparkan aset logo terbaru.

### v0.9.2

- Tambah preview ayat semasa dalam `Audit Produk` supaya siri lama boleh disemak sebelum metadata disimpan atau story regenerated.
- API Product Audit kini memulangkan `main`, `reply1`, dan `reply2` penuh untuk semakan copywriting dalam GUI.
- Kekalkan render preview audit menggunakan DOM selamat dan `textContent` supaya teks AI/user tidak memecahkan layout.

### v0.9.1

- Pindahkan schedule aktif ke `work/runtime/threads-schedule.json` supaya generate story tidak mengubah fail tracked repo.
- Kalendar kini mengira `Perlu Semak` sebagai isu harian.
- Product Audit tidak lagi double-count review item yang sama antara schedule dan story-runs.

### v0.9.0

- Tukar nama sistem rasmi kepada ThreadsMe di UI, docs, env, aset, dan route localhost.
- Tukar URL rasmi kepada `http://localhost/threadsme/`.
- Tambah modul `Audit Produk` untuk batch metadata dan regenerate story.
- Tambah `Quality Gate` sebelum story masuk jadual supaya output yang tidak relevan ditahan sebagai `Perlu Semak`.
- Tambah `Product Intelligence` untuk cuba kenal pasti tajuk/kategori produk daripada link Shopee/affiliate/gambar/nota.
- Tambah panel `Automation Health` dan `Preview Netizen`.
- Pindahkan runtime JSON aktif termasuk schedule ke `work/runtime/` supaya repo tidak kerap dirty kerana automation.
- Tukar render dinamik frontend kepada DOM builder + `textContent` untuk elak layout rosak oleh teks AI/user.

### v0.8.0

- Tambah field wajib `Tajuk produk` dan `Kategori / kegunaan produk` di Jana Story supaya AI tidak meneka produk daripada URL gambar.
- Prompt DeepSeek kini mengunci storytelling kepada produk sebenar dan melarang tukar kategori produk.
- Story run kini simpan `productTitle` dan `productCategory` untuk audit semula.

### v0.7.9

- Betulkan metrik dashboard supaya `Pending` ikut queue rasmi `scheduled` dan kekal 25/25 apabila automasi penuh.
- Nota status table kini papar `Pending aktif 25/25` berdasarkan queue automation, bukan kiraan paparan slot.

### v0.7.8

- Fix fungsi Jana Story apabila AI server offline atau DeepSeek key tiada.
- Tambah fallback story generator tempatan supaya output masih dijana dan terus masuk Jadual Threads.
- Tambah endpoint `/api/system-data` supaya GUI XAMPP baca jadual/status dinamik dari AI server.
- Tambah script `npm run ai:hidden` untuk hidupkan ThreadsMe AI server di background.
- Update mesej error frontend supaya tidak hanya papar `Failed to fetch`.

### v0.7.7

- Guna prinsip Kumo UI pada ThreadsMe tanpa menukar stack vanilla: semantic tokens, surface hierarchy, table/resource-list pattern, focus states, dan badges status yang lebih jelas.
- Ganti CSS lama yang bertindih dengan design system lebih kecil, konsisten, dan mudah dibaca.
- Kemas cache CSS kepada `styles.css?v=10` dan tambah `data-mode="light"` serta `data-theme="kumo"` pada HTML.

### v0.7.6

- Tukar default ThreadsMe kepada `25 posting / hari`.
- Tambah option `25 posting / hari` di Jana Story dan `25 siri` di automasi publisher.
- Kalendar Jadual Threads kini menyemak sasaran 25 slot sehari.

### v0.7.5

- Guna `redesign-skill` untuk audit dan polish targeted pada sistem ThreadsMe.
- Tambah skip-link, meta description, OG metadata, state kosong yang lebih kemas, dan busy state untuk butang AI.
- Buang pautan palsu apabila affiliate link tiada dan kemaskan surface visual supaya dashboard lebih profesional.

### v0.7.4

- Kunci responsive mobile supaya panel ThreadsMe tidak melebar keluar viewport.
- Topbar dan metrik dipaksa kepada satu kolum pada skrin kecil untuk bacaan lebih selesa.

### v0.7.3

- Tambah option `20 posting / hari` dan jadual kalendar harian.
- Auto schedule story yang dijana supaya fungsi Jana Story, Jadual Threads, dan status berkait.

### v0.7.2

- Tambah status story dijana.
- Sambungkan output AI kepada jadual tempatan ThreadsMe.

### v0.7.1

- Kemaskan GUI dengan side menu dan modul berasingan.

### v0.7.0

- Release awal ThreadsMe.
