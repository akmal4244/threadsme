# Runbook Operasi ThreadsMe

Runbook ini menerangkan cara menjalankan, menyemak, dan memulihkan ThreadsMe.

## URL Penting

| Tujuan | URL |
| --- | --- |
| GUI rasmi | `http://localhost/threadsme/` |
| AI health | `http://127.0.0.1:8788/api/health` |
| Node dev fallback | `http://localhost:8791/threadsme/` |

## Arahan Harian

Jalankan semakan asas:

```bash
npm run check
npm run qa:smoke
```

Semak JSON utama:

```bash
node -e "for (const f of ['threads_flexi_marble_schedule.json','story-runs.json','status.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); console.log(f + ' ok'); }"
```

Hidupkan AI server:

```bash
npm run ai:hidden
```

Deploy semula ke XAMPP:

```bash
npm run deploy:xampp
```

## Semak AI Server

Health endpoint patut pulang `ok:true`. Dalam mode single-user local, `hasKey` dipaparkan terus supaya status DeepSeek jelas.

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8788/api/health -TimeoutSec 10
```

Jika `hasKey:false`, semak salah satu pilihan ini:

- Env var `DEEPSEEK_API_KEY`.
- Fail private `work/private/deepseek.key`.

Jangan commit fail key ke repo.

Jika mahu Product Intelligence cuba endpoint Shopee yang memerlukan sesi login, simpan cookie login sebagai salah satu pilihan berikut:

- Env var `SHOPEE_COOKIE`.
- Fail private `work/private/shopee-cookie.txt`.

Jangan commit cookie Shopee. Jika `hasShopeeCookie:false`, ThreadsMe masih akan cuba redirect metadata + DeepSeek. Label `story_inferred` boleh lulus autopilot jika confidence cukup.

## Admin Auth dan CORS

Default local:

- `THREADSME_AUTH_REQUIRED=false`.
- Dashboard dan API automation jalan terus tanpa login kerana sistem ini digunakan oleh Akmal seorang di PC sendiri.

Jika mahu public deploy:

- Set `THREADSME_AUTH_REQUIRED=true`.
- Login pertama melalui GUI akan setup username/password admin dan simpan hash di `work/private/admin-auth.json`.
- Alternatif: set `THREADSME_ADMIN_PASSWORD` melalui env/server config.
- `Ingat saya` menyimpan username/password di browser localStorage hanya bila ditick; untick akan padam storage dan kosongkan field selepas logout.
- Semua API selain `health` dan auth endpoint memerlukan session admin.
- Semua `POST` protected memerlukan CSRF token session.
- `THREADSME_ALLOWED_ORIGINS` mesti mengandungi domain GUI sebenar sahaja.

Contoh local:

```text
THREADSME_ALLOWED_ORIGINS=http://localhost,http://localhost:80,http://127.0.0.1,http://127.0.0.1:80,http://localhost:8791,http://127.0.0.1:8791
```

Jika deploy ke hosting/domain, tambah domain production dan jangan guna `*`.

Jika lupa password file-based semasa local dev, hentikan server dan reset fail private berikut secara manual:

```text
work/private/admin-auth.json
work/private/admin-sessions.json
```

Jangan commit dua fail ini.

## Workflow Jana Story Produk

1. Isi link affiliate produk.
2. Masukkan link gambar atau upload/paste gambar jika ada.
3. Klik `Auto semak produk Shopee` jika mahu semak sebelum generate, atau terus klik `Auto cipta & jadualkan`.
4. ThreadsMe akan cuba isi `Tajuk produk` dan `Kategori / kegunaan produk` daripada link Shopee, metadata, dan DeepSeek.
5. Edit tajuk/kategori hanya jika mahu override manual.
6. Pilih jumlah posting sehari, default semasa ialah `25 posting / hari`.
7. Klik `Auto cipta & jadualkan`.
8. Semak output dan status di Jadual Threads.

Jika produk masih tidak dapat dikenal pasti dengan yakin, sistem akan guard generate supaya story tidak lari. Jika produk `story_inferred` tetapi confidence cukup, DeepSeek/Product Intel boleh sahkan sendiri tanpa tindakan Akmal.

## Product Audit dan Quality Gate

- `Auto Audit Produk` berjalan bersama sync automation 60 saat. Ia re-check metadata, Quality Gate, auto-regenerate story yang tidak selari, dan guard siri yang confidence rendah.
- Auto Audit cuba auto isi metadata produk daripada link affiliate Shopee dan DeepSeek tanpa meminta tindakan manual.
- Auto Audit anggap produk sah jika `link_verified`, `manual_verified`, atau `story_inferred` dengan confidence cukup.
- Guna menu `Tindakan Saya` untuk lihat ringkasan autopilot dan akses edit pilihan, bukan semua log automation.
- Siri yang tidak cukup relevan akan ditahan sebagai `Perlu Semak`.
- Sebelum kekal `Perlu Semak`, ThreadsMe cuba auto-regenerate sehingga had `THREADSME_AUTO_REGENERATE_LIMIT` supaya Akmal tidak perlu buat tindakan manual.
- `Perlu Semak` tidak patut masuk Pending atau publisher live.
- Guna menu `Audit Produk` untuk pilih batch seperti `26-35` jika mahu override, kemudian klik `Simpan metadata` atau `Regenerate story`.
- Bila pilih satu siri, semak panel `Ayat semasa untuk semakan` dahulu. Panel ini memaparkan `[POST UTAMA]`, `[REPLY 1]`, dan `[REPLY 2]` bersama kiraan aksara supaya copywriting lama boleh dinilai sebelum regenerate.
- Selepas story dibaiki, automation sync seterusnya akan kira semula slot Pending.

## Runtime Data

Runtime aktif berada dalam `work/runtime/`:

```text
work/runtime/threads-schedule.json
work/runtime/status.json
work/runtime/story-runs.json
work/runtime/publish-log.json
work/runtime/product-intel-cache.json
```

Fail root `threads_flexi_marble_schedule.json`, `status.json` dan `story-runs.json` kekal sebagai snapshot/fallback static. Jangan risau jika `work/runtime/` berubah ketika server hidup; folder itu diabaikan git.

## Product Intel Cache

Product Intel cache mengurangkan semakan Shopee/DeepSeek berulang untuk link affiliate yang sama.

Tetapan:

```text
THREADSME_PRODUCT_INTEL_CACHE_FILE=work/runtime/product-intel-cache.json
THREADSME_PRODUCT_INTEL_CACHE_DAYS=14
THREADSME_PRODUCT_INTEL_CACHE_MAX=250
```

Jika cache nampak stale, padam fail `work/runtime/product-intel-cache.json` semasa server berhenti. Server akan cipta semula fail kosong.

## Backup Runtime

Backup runtime boleh dibuat melalui:

- GUI: `Tindakan Saya` -> `Backup runtime`.
- API protected: `POST /api/runtime-backup/snapshot`.

Fail backup disimpan di:

```text
work/backups/
```

Backup mengandungi jadual, status, story runs, config publisher yang disanitasi, dan indikator sama ada key/token/cookie tersimpan. Backup tidak menyimpan nilai secret sebenar.

## Status Queue

- `Pending`: queue aktif.
- `Blocked`: belum gagal, menunggu slot kosong.
- `Perlu Semak`: story ditahan Quality Gate dan perlu audit produk.
- `Lulus`: posted/passed.
- `Gagal`: gagal diproses atau ditanda gagal.

Queue aktif maksimum ialah `25`. Jika ada lebih banyak siri, baki akan kekal `Blocked` sehingga slot kosong.

## Pulihkan Blocked

ThreadsMe patut auto promote `Blocked` kepada `Pending` bila slot scheduled kosong. Jika tidak berlaku:

1. Semak AI server masih hidup.
2. Semak `work/runtime/status.json` valid jika server sudah pernah hidup.
3. Semak `automationMode:true`.
4. Semak `automationLimit:25`.
5. Jalankan semula AI server.

## Publisher Threads

Default publisher mesti kekal `Dry-run`.

Sebelum live:

- Login admin sah.
- Threads User ID diisi.
- Threads access token sah.
- `Dry-run` telah diuji.
- Siri due sudah jelas.
- User faham tindakan live boleh menghantar post public.
- Runtime backup sudah dibuat sebelum automation besar.

Token boleh disimpan melalui GUI Publisher atau env `THREADS_ACCESS_TOKEN`.

## Checklist Sebelum Commit

```bash
npm run check
npm run qa:smoke
git diff --check
```

Pastikan fail private tidak staged:

```bash
git status --short
```

Nota: runtime yang berubah setiap 60 saat sepatutnya berada dalam `work/runtime/`, bukan root repo.
