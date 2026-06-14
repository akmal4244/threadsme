# Backlog Tambah Baik ThreadsMe

Fail ini menyimpan cadangan tambah baik yang sudah dikenal pasti supaya kerja seterusnya boleh disambung dengan jelas.

## P0 - Kualiti Produk dan Story

Status v0.9.2: asas `Product Audit`, preview ayat semasa, `Quality Gate`, `Product Intelligence`, `Automation Health`, `Preview Netizen`, runtime `work/runtime/` termasuk schedule aktif, dan render DOM selamat sudah dibina. Backlog ini kini fokus kepada penambahbaikan selepas modul asas stabil.

### Product Audit

Masalah:

- Ada siri generated lama yang belum ada metadata `productTitle`.
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

- Tingkatkan ekstraksi produk untuk Shopee redirect/affiliate yang tidak expose HTML biasa.
- Tambah cache product intel supaya semakan link sama tidak ulang network call.
- Paparkan beberapa calon tajuk produk untuk user pilih.

## P1 - Keselamatan Frontend

### Ganti Render `innerHTML`

Masalah:

- Beberapa bahagian UI render data dinamik menggunakan `innerHTML`.
- Ini boleh merosakkan layout jika teks AI/user mengandungi HTML.

Cadangan:

- Tambah ujian frontend kecil untuk pastikan teks `<script>` dipapar sebagai teks, bukan HTML.

## P2 - Data dan Repo Hygiene

### Pisahkan Runtime Data

Masalah:

- `status.json` berubah setiap 60 saat bila automation hidup.
- Git worktree jadi dirty walaupun sistem normal.

Cadangan:

- Tambah export/import backup melalui GUI.
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

Cadangan:

- Pada skrin kecil, sidebar boleh jadi collapsible atau bottom nav.
- Matlamat: lebih ruang untuk form Jana Story dan Jadual Threads.
