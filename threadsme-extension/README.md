# ThreadsMe Extension

Extension ini menjadi bridge antara ThreadsMe dan akaun Threads yang sudah login dalam Chrome. Bridge boleh menggunakan server local atau domain production rasmi.

## Fungsi

- Scan jumlah scheduled post sebenar dalam Threads.
- Sync count dan bukti ringkas ke ThreadsMe.
- Ambil siri seterusnya daripada `/api/extension/next`.
- Guard preview link supaya story tidak bercanggah dengan produk affiliate.
- Hantar proof ke ThreadsMe selepas schedule berjaya.
- Autopilot background setiap minit: sync Threads, semak target 25, dan isi satu slot yang lulus Quality Gate jika masih kurang.

## Bridge URL yang dibenarkan

- Production rasmi: `https://threadsme.akmalmarvis.com`
- Local: `http://127.0.0.1:8788` atau localhost

Domain lain ditolak supaya token pairing tidak dihantar ke server yang tidak dikenali.

## Cara pasang

1. Buka Chrome `chrome://extensions`.
2. Aktifkan `Developer mode`.
3. Jika guna download dari ThreadsMe, extract `threadsme-extension.zip` dahulu.
4. Klik `Load unpacked`.
5. Pilih folder `threadsme-extension` hasil extract.
6. Di ThreadsMe, buka `Automasi Live` > `ThreadsMe Extension` > `Dapatkan pairing`.
7. Salin Bridge URL dan token pairing, kemudian paste kedua-duanya dalam popup extension.
8. Buka [Threads](https://www.threads.com/?hl=en) dengan akaun Akmal yang sudah login.
9. Klik `Test connection`, `Scan Threads`, kemudian `Sync ke ThreadsMe`.
10. Jika autopilot bridge aktif, extension akan terus pantau dan isi slot kosong secara berkala. Butang `Isi sampai 25` kekal sebagai manual override.

## Nota keselamatan

- Extension tidak simpan username atau password Threads.
- Extension hanya guna sesi Chrome yang sudah login.
- Semua request ke ThreadsMe perlu token pairing.
- Bridge URL production wajib HTTPS dan mesti domain rasmi ThreadsMe.
- Kalau preview link nampak tidak sepadan dengan story, extension akan tahan schedule.
- Autopilot hanya berjalan selepas token pairing disimpan dan masih tertakluk kepada had 25 scheduled post.

## Had

UI Threads boleh berubah. Jika butang Schedule atau composer berubah, extension akan berhenti dengan error dan tidak submit post secara senyap.
