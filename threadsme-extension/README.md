# ThreadsMe Extension

Extension ini menjadi bridge antara ThreadsMe local dan akaun Threads yang sudah login dalam Chrome.

## Fungsi

- Scan jumlah scheduled post sebenar dalam Threads.
- Sync count dan bukti ringkas ke ThreadsMe.
- Ambil siri seterusnya daripada `/api/extension/next`.
- Guard preview link supaya story tidak bercanggah dengan produk affiliate.
- Hantar proof ke ThreadsMe selepas schedule berjaya.

## Cara pasang

1. Buka Chrome `chrome://extensions`.
2. Aktifkan `Developer mode`.
3. Klik `Load unpacked`.
4. Pilih folder `threadsme-extension`.
5. Di ThreadsMe, buka `Automasi Live` > `ThreadsMe Extension` > `Dapatkan pairing`.
6. Salin token pairing dan paste dalam popup extension.
7. Buka [Threads](https://www.threads.com/?hl=en) dengan akaun Akmal yang sudah login.
8. Klik `Scan Threads`, kemudian `Sync ke ThreadsMe`.

## Nota keselamatan

- Extension tidak simpan username atau password Threads.
- Extension hanya guna sesi Chrome yang sudah login.
- Semua request ke ThreadsMe perlu token pairing.
- Kalau preview link nampak tidak sepadan dengan story, extension akan tahan schedule.

## Had

UI Threads boleh berubah. Jika butang Schedule atau composer berubah, extension akan berhenti dengan error dan tidak submit post secara senyap.
