# Ingatan Sistem ThreadsMe

Fail ini ialah rujukan tetap untuk ThreadsMe. Tujuannya supaya tetapan, keputusan terdahulu, dan prinsip operasi tidak hilang apabila kerja disambung semula.

## Identiti Sistem

| Item | Tetapan |
| --- | --- |
| Nama rasmi | ThreadsMe |
| Repo slug | `threadsme` |
| Localhost rasmi | `http://localhost/threadsme/` |
| Bahasa UI | Bahasa Melayu Malaysia |
| Zon masa | `Asia/Kuala_Lumpur` |
| Kredit | Sistem Dibangunkan Sepenuhnya Oleh Akmal Marvis |
| Stack | Vanilla HTML, CSS, JavaScript, Node.js |
| Data storage | JSON file database |

## Tetapan Operasi Semasa

- Default jadual ialah `25 posting / hari`.
- Had queue aktif ialah maksimum `25` siri `Pending`.
- Siri selebihnya kekal `Blocked` atau `Remaining` sehingga slot kosong.
- Auto sync server berjalan setiap `60 saat`.
- Auto Audit boleh auto-regenerate sehingga `25` siri review dalam satu batch melalui `THREADSME_AUTO_REGENERATE_LIMIT`.
- AI server berjalan di `http://127.0.0.1:8788`.
- Model AI semasa ialah `deepseek-v4-flash`.
- Publisher Threads default mesti kekal `Dry-run` sehingga token dan User ID disahkan.
- Token dan API key tidak boleh di-commit ke repo.
- Cookie Shopee jika digunakan mesti disimpan sebagai env `SHOPEE_COOKIE` atau `work/private/shopee-cookie.txt`, tidak boleh di-commit.
- Runtime JSON aktif berada dalam `work/runtime/` dan tidak di-commit.
- Product Intel cache aktif berada di `work/runtime/product-intel-cache.json`; cache metadata sahaja, bukan secret.
- Dashboard/API automation default kepada single-user local mode melalui `THREADSME_AUTH_REQUIRED=false`.
- Jika mahu public deploy, set `THREADSME_AUTH_REQUIRED=true`; semua POST API protected perlukan CSRF token daripada session admin.
- Login admin ada `Ingat saya`: bila tick, username/password kekal di browser localStorage walaupun logout; bila untick, logout kosongkan field dan padam storage.
- CORS mesti dikunci kepada `THREADSME_ALLOWED_ORIGINS`; jangan guna wildcard bila public deploy.
- Runtime backup disimpan di `work/backups/` dan tidak di-commit.

## Peraturan Story Produk

- ThreadsMe mesti cuba auto kenal produk daripada link affiliate Shopee dahulu sebelum minta input manual.
- Flow product intel: resolve redirect Shopee, simpan `shopid/itemid`, cuba metadata/API Shopee, kemudian gunakan DeepSeek untuk cadangan tajuk/kategori dan semakan alignment.
- Jika cookie Shopee private tersedia, request Shopee boleh cuba endpoint login; jika tiada/expired, fallback kepada metadata redirect + DeepSeek.
- Jika produk `link_verified`, siri boleh terus ikut flow Quality Gate dan jadual.
- Jika produk `story_inferred` tetapi confidence DeepSeek/Product Intel cukup, ThreadsMe boleh sahkan secara autopilot dan teruskan ke Quality Gate.
- Jika confidence rendah atau tajuk kosong, ThreadsMe guard siri secara automatik; Akmal tidak perlu sahkan manual kecuali mahu edit/override.
- Jika produk sudah sah tetapi story tidak cukup relevan, ThreadsMe mesti cuba auto-regenerate dahulu sebelum menganggapnya isu manual.
- `Tajuk produk` masih boleh diedit manual sebagai pilihan; simpan/regenerate daripada Product Audit dianggap `manual_verified`.
- Link gambar Shopee sahaja tidak cukup untuk kenal produk kerana URL imej tidak semestinya membawa nama produk.
- Setiap siri mesti ada tiga bahagian:
  - `[POST UTAMA]`
  - `[REPLY 1]`
  - `[REPLY 2]`
- Setiap bahagian maksimum `300 aksara`.
- `Reply 2` mesti berakhir dengan link affiliate yang tepat.
- Gaya copywriting: santai, personal, deep storytelling, Bahasa Melayu Malaysia, sesuai dengan netizen Malaysia di Threads.
- Elakkan claim berlebihan, ayat terlalu iklan, typo keterlaluan, dan manfaat yang tidak berkaitan dengan produk sebenar.

## Makna Status

| Status UI | Makna Sistem |
| --- | --- |
| `Pending` | Siri sudah masuk queue aktif dan menunggu slot publish. |
| `Lulus` | Siri sudah dianggap posted/passed oleh sistem. |
| `Blocked` | Siri belum gagal; ia cuma menunggu slot queue kosong. |
| `Gagal` | Siri gagal diproses atau ditanda gagal. |
| `Disediakan` | Siri disimpan tetapi belum aktif dalam queue. |
| `Perlu Semak` | Siri ditahan Quality Gate kerana metadata/relevansi/CTA/format perlu dibaiki sebelum publish. |

## Fail Data Penting

| Fail | Fungsi |
| --- | --- |
| `threads_flexi_marble_schedule.json` | Snapshot jadual contoh/legacy untuk fallback static. |
| `status.json` | Snapshot status queue contoh/legacy untuk fallback static. |
| `story-runs.json` | Snapshot rekod output AI contoh/legacy untuk fallback static. |
| `work/runtime/threads-schedule.json` | Runtime jadual aktif untuk semua siri posting, slot, copy, affiliate link, dan metadata produk. |
| `work/runtime/status.json` | Runtime status queue aktif yang dikemas kini automasi. |
| `work/runtime/story-runs.json` | Runtime story run aktif. |
| `work/runtime/publish-log.json` | Runtime log publisher aktif. |
| `work/runtime/product-intel-cache.json` | Cache metadata produk untuk link Shopee/affiliate yang sudah dikenal pasti. |
| `work/backups/*.json` | Snapshot backup runtime daripada butang/API backup. |
| `publish-log.json` | Log publisher legacy; tidak di-commit. |
| `work/private/` | Lokasi private untuk API key, token, admin auth, session, dan Shopee cookie; tidak di-commit. |

## Snapshot Audit Terakhir

Snapshot ini dibuat pada `2026-06-14` dan boleh berubah apabila automasi berjalan.

- Total siri dalam jadual: `121`.
- Pending aktif: `25`.
- Posted/Lulus: `9`.
- Failed/Gagal: `0`.
- Remaining/Blocked: `87`.
- Batch terbaru `#97-#121` ditetapkan kepada produk `Sambal Nyet Berapi by Khairulaming 180g`.
- Batch terbaru sudah bawah `300 aksara` untuk setiap post.
- Ada siri generated lama yang belum ada metadata `productTitle`; Auto Audit v0.9.7 patut cuba isi daripada link Shopee/DeepSeek secara berperingkat.

## Prinsip Design

- UI mesti profesional, tenang, dan tidak sakit mata.
- Font tidak perlu besar-besar; keutamaan ialah kebolehbacaan dan density yang kemas.
- Gunakan sidebar seperti sistem pentadbir, bukan landing page.
- Modul mesti dipisahkan: Ringkasan, Jana Story, Jadual Threads, Audit Produk, Automasi Live.
- Status automation mesti sentiasa jelas pada pengguna.
- Audit Produk mesti paparkan ayat semasa `[POST UTAMA]`, `[REPLY 1]`, dan `[REPLY 2]` supaya user boleh semak copywriting sebelum regenerate.
- Auto Audit Produk mesti berjalan bersama sync automation. Default ialah autopilot penuh; user hanya guna edit/override bila diminta sendiri oleh Akmal.
- Gunakan gaya Kumo UI dan taste-skill sebagai arah visual: surface hierarchy, token warna semantik, spacing kemas, dan micro-motion ringan.

## Keutamaan Naik Taraf Seterusnya

1. Pantau Product Audit untuk siri lama yang masih `auto_guarded_low_confidence`.
2. Tambah import/restore backup terpilih untuk `work/runtime/`.
3. Tambah pilihan tone rewrite dalam Preview Netizen: lebih soft sell, lebih deep story, atau lebih direct CTA.
4. Tambah dashboard usage DeepSeek per run dan anggaran kos.
5. Tambah role permission jika ThreadsMe nanti ada lebih daripada seorang admin.

## Larangan Penting

- Jangan commit API key, Threads token, atau data private.
- Jangan palsukan status `Pending`; status itu hanya sah selepas sistem benar-benar masukkan siri ke queue aktif.
- Jangan jadikan `Blocked` sebagai gagal. Ia cuma menunggu slot.
- Jangan publish live ke Threads tanpa confirmation dan tanpa semakan token/User ID.
- Jangan expose AI server ke public tanpa `THREADSME_AUTH_REQUIRED=true`, locked CORS, dan reverse proxy yang sesuai.
