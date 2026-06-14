# Backlog Tambah Baik ThreadsMe

Fail ini menyimpan cadangan tambah baik yang sudah dikenal pasti supaya kerja seterusnya boleh disambung dengan jelas.

## P0 - Kualiti Produk dan Story

Status v0.9.7: asas `Auto Audit Produk`, `Tindakan Saya`, `Product Audit`, preview ayat semasa, `Quality Gate`, `Product Intelligence`, auto product resolver Shopee/DeepSeek, Product Intel runtime cache, `Automation Health`, `Preview Netizen`, runtime `work/runtime/`, render DOM selamat, single-user local mode, optional admin auth untuk public deploy, locked CORS, CSRF, runtime backup, local GSAP, WebP preview, dan smoke test sudah dibina. Backlog ini kini fokus kepada penambahbaikan selepas modul asas stabil.

### Product Audit

Masalah:

- Ada siri generated lama yang belum ada metadata `productTitle` atau confidence produk masih rendah.
- Story lama boleh tersasar daripada produk sebenar.

Cadangan:

- Tambah bulk select yang lebih selesa.
- Tambah diff preview sebelum regenerate menggantikan story lama.
- Tambah log audit per siri supaya perubahan metadata boleh dijejak.

### Quality Gate

Masalah:

- Story yang lulus format belum tentu sedap dibaca atau relevan.

Cadangan:

- Perketat skor minimum:
  - relevan dengan produk,
  - hook kuat,
  - BM Malaysia natural,
  - tidak claim berlebihan,
  - Reply 2 ada link,
  - semua bahagian bawah 300 aksara.
- Jika gagal, status kekal `Perlu Semak` dan jangan publish live.

## P1 - Automasi Produk Shopee

### Auto Product Intelligence

Masalah:

- Link gambar Shopee tidak cukup untuk AI tahu produk.
- Kadang imej ialah banner promosi, bukan gambar produk.

Cadangan:

- Tambah wizard cookie/login Shopee yang lebih mesra daripada textarea private semasa.
- Tambah butang clear/refresh Product Intel cache untuk link tertentu.
- Paparkan beberapa calon tajuk produk untuk user pilih.

## P1 - Keselamatan Frontend

### Ganti Render `innerHTML`

Masalah:

- Beberapa bahagian UI render data dinamik menggunakan `innerHTML`.
- Ini boleh merosakkan layout jika teks AI/user mengandungi HTML.

Cadangan:

- Tambah ujian frontend kecil untuk pastikan teks `<script>` dipapar sebagai teks, bukan HTML.

## P2 - Data dan Repo Hygiene

### Runtime Data dan Backup

Masalah:

- Backup runtime sudah ada, tetapi restore/import belum ada.
- Log runtime boleh membesar jika automation berjalan lama.

Cadangan:

- Tambah import/restore backup melalui GUI dengan confirmation.
- Tambah button `Compact runtime` untuk archive log lama.

## P2 - Dashboard Operasi

### Automation Health

Cadangan panel:

- Tambah last error dan next due yang lebih terperinci.
- Tambah signal uptime worker.
- Tambah button restart AI server jika integrasi desktop membenarkan.

### Usage Dashboard

Cadangan panel:

- Token DeepSeek per run.
- Jumlah story dijana hari ini.
- Anggaran kos AI.
- Jumlah siri dijadualkan hari ini.
- Nota manual untuk usage Codex jika user mahu rekod sendiri.

## P3 - Pengalaman Pengguna

### Preview Netizen

Cadangan:

- Tambah butang `Baiki tone`, `Lebih deep story`, `Lebih soft sell`, dan `Lebih direct CTA`.
- Tambah preview visual seperti Threads sebenar dengan avatar dan reply chain.

### Mobile Navigation

Status:

- v0.9.6 sudah tukar menu mobile kepada horizontal compact nav supaya content utama tidak turun terlalu jauh.

Cadangan seterusnya:

- Pada skrin kecil, sidebar boleh jadi collapsible atau bottom nav.
- Matlamat: lebih ruang untuk form Jana Story dan Jadual Threads.
