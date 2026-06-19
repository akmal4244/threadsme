# Changelog ThreadsMe

## 0.10.3 - 2026-06-19

### Kesinambungan flow

- Betulkan extension scheduler yang sebelum ini gagal pada langkah confirmation kerana payload composer tidak diteruskan.
- Benarkan Bridge URL production rasmi melalui HTTPS sambil mengekalkan localhost untuk operasi local.
- Gunakan `THREADSME_PUBLIC_URL` dalam pairing extension dan aktifkan cookie `Secure` untuk deployment HTTPS.
- Pastikan siri hanya bertukar kepada `Lulus` selepas ada proof khusus bagi siri tersebut; sync count global sahaja tidak mencukupi.
- Selaraskan metadata Product Audit antara schedule, story run dan version serta bersihkan sebab Quality Gate lama.
- Pastikan refresh Product Intel tanpa cache benar-benar menyemak semula link tanpa tajuk manual lama mempengaruhi keputusan.
- Betulkan default localhost supaya menggunakan AI server local, bukan API production.

### Keselamatan dan operasi

- Kunci static route AI server kepada fail frontend public sahaja.
- Tambah validasi restore bagi status bertindih dan nombor status di luar julat schedule.
- Selaraskan contoh env production untuk public URL, HTTPS, CORS, preflight dan host API.
- Pisahkan launcher AI server daripada core supaya guard kesinambungan gagal secara jelas apabila struktur berubah.
- Tambah QA end-to-end untuk auth, generation, queue 25, Auto Audit, Product Audit, extension proof, publisher dry-run, backup dan restart persistence.

## 0.10.2 - 2026-06-18

### UI dan pengalaman pengguna

- Navigation drawer dan bottom navigation khas untuk paparan mobile.
- Header mobile dengan ringkasan Pending dan Blocked.
- Panduan tiga langkah pada halaman Jana Story.
- Mod ringkas untuk menyembunyikan input optional/lanjutan.
- Filter status pantas berbentuk chips pada Jadual Threads.
- Butang `Semak tanpa cache` untuk refresh Product Intel bagi link semasa.
- Penambahbaikan focus state, tap target, reduced motion dan layout responsif.

### Operasi dan pemulihan

- Restore runtime CLI dengan dry-run sebagai default.
- Validasi struktur schedule, status, story runs, publish log dan Product Intel cache.
- Backup `runtime-pre-restore-*` dicipta secara automatik sebelum apply.
- Snapshot yang mengandungi secret ditolak.
- QA automatik untuk UI enhancement dan proses restore.
