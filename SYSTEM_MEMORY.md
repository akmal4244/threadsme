# Ingatan Sistem ThreadsMe

Fail ini ialah rujukan tetap untuk ThreadsMe. Tujuannya supaya tetapan, keputusan terdahulu, dan prinsip operasi tidak hilang apabila kerja disambung semula.

## Identiti Sistem

| Item | Tetapan |
| --- | --- |
| Nama rasmi | ThreadsMe |
| Repo slug | `threadsme` |
| Localhost rasmi | `http://localhost/threadsme/` |
| Domain production | `https://threadsme.akmalmarvis.com` |
| Bahasa UI | Bahasa Melayu Malaysia |
| Zon masa | `Asia/Kuala_Lumpur` |
| Kredit | Sistem Dibangunkan Sepenuhnya Oleh Akmal Marvis |
| Stack | Vanilla HTML, CSS, JavaScript, Node.js |
| Data storage | JSON file database |

## Tetapan Operasi Semasa

- Versi flow semasa ialah `0.10.3`.
- Default jadual ialah `25 posting / hari`.
- Had queue aktif ialah maksimum `25` siri `Pending`.
- Siri selebihnya kekal `Blocked` atau `Remaining` sehingga slot kosong.
- Auto sync server berjalan setiap `60 saat`.
- Auto Audit boleh auto-regenerate sehingga `25` siri review dalam satu batch melalui `THREADSME_AUTO_REGENERATE_LIMIT`.
- Auto Audit mesti auto-normalize semua siri kepada `250-295 aksara` setiap bahagian sebelum Quality Gate dan Publisher Preflight.
- AI server local berjalan di `http://127.0.0.1:8788`.
- Production menggunakan `THREADSME_PUBLIC_URL=https://threadsme.akmalmarvis.com` dan reverse proxy HTTPS.
- Model AI semasa ialah `deepseek-v4-flash`.
- Publisher Preflight mesti aktif sebelum posting live. Strategi: Quality Gate tempatan, Product Intel, kemudian DeepSeek final QA.
- Minimum score Publisher Preflight DeepSeek ialah `82` secara default melalui `THREADSME_PUBLISH_PREFLIGHT_MIN_SCORE`.
- Publisher Threads default mesti kekal `Dry-run` sehingga token dan User ID disahkan.
- Status `Pending` ialah queue automation ThreadsMe. Ia perlu dibandingkan dengan Threads native schedule jika posting dibuat melalui UI Threads/Chrome, bukan API.
- Status `Lulus` mesti ada bukti khusus bagi siri: publish live Threads API, manual proof, atau proof native schedule bagi nombor siri tersebut selepas slot lepas.
- Kiraan native global atau masa slot lepas sahaja tidak boleh menukar siri kepada `Lulus`.
- Token dan API key tidak boleh di-commit ke repo.
- Cookie Shopee jika digunakan mesti disimpan sebagai env `SHOPEE_COOKIE` atau fail private, tidak boleh di-commit.
- Runtime JSON aktif berada dalam `work/runtime/` atau lokasi `THREADSME_RUNTIME_DIR` dan tidak di-commit.
- Product Intel cache aktif berada di runtime; cache metadata sahaja, bukan secret.
- Dashboard/API automation default kepada admin-protected mode melalui `THREADSME_AUTH_REQUIRED=true`.
- Untuk public deploy, kekalkan `THREADSME_AUTH_REQUIRED=true`, locked CORS, secure session cookie, dan reverse proxy HTTPS.
- CORS mesti dikunci kepada `THREADSME_ALLOWED_ORIGINS`; jangan guna wildcard bila public deploy.
- Runtime backup disimpan di folder backup private dan tidak di-commit.
- Restore mesti dry-run dahulu, menolak status bertindih/nombor di luar schedule, dan mencipta pre-restore backup sebelum apply.

## Flow Utama Berterusan

1. Admin login atau setup sesi.
2. Product Intel membaca link/gambar/nota dan mengesahkan produk.
3. Story dijana dalam tiga bahagian dan melalui Quality Gate.
4. Siri lulus masuk queue maksimum 25 `Pending`; selebihnya `Blocked`.
5. Auto Audit membaiki metadata, panjang dan story review tanpa mengganggu siri yang sudah `Gagal`/`Lulus`.
6. Laluan publish dipilih:
   - Threads API dengan Publisher Preflight, atau
   - Threads Extension dengan pairing token dan proof native.
7. Siri hanya menjadi `Lulus` apabila bukti khusus wujud.
8. Status, story runs, publish log dan cache disimpan semula ke runtime.
9. Backup/restore mengekalkan kesinambungan data dan tidak memulihkan secret.

## Peraturan Story Produk

- ThreadsMe mesti cuba auto kenal produk daripada link affiliate Shopee dahulu sebelum minta input manual.
- Flow product intel: resolve redirect Shopee, simpan `shopid/itemid`, cuba metadata/API Shopee, kemudian gunakan DeepSeek untuk cadangan tajuk/kategori dan semakan alignment.
- Jika produk `link_verified`, siri boleh terus ikut flow Quality Gate dan jadual.
- Jika produk `story_inferred` tetapi confidence cukup, ThreadsMe boleh sahkan secara autopilot.
- Jika confidence rendah atau tajuk kosong, ThreadsMe guard siri secara automatik.
- Jika produk sudah sah tetapi story tidak relevan, ThreadsMe mesti cuba auto-regenerate dahulu.
- Refresh tanpa cache mesti menilai link semasa tanpa tajuk manual lama mempengaruhi keputusan; tajuk manual pada borang dikekalkan sehingga user memilih untuk menggantinya.
- Setiap siri mesti ada `[POST UTAMA]`, `[REPLY 1]`, dan `[REPLY 2]`.
- Setiap bahagian maksimum `300 aksara` dan sasaran `250-295 aksara`.
- `Reply 2` mesti berakhir dengan link affiliate yang tepat.
- Gaya copywriting: santai, personal, deep storytelling, Bahasa Melayu Malaysia, sesuai dengan netizen Malaysia di Threads.
- Elakkan claim berlebihan, ayat terlalu iklan, typo keterlaluan, dan manfaat yang tidak berkaitan dengan produk sebenar.

## Makna Status

| Status UI | Makna Sistem |
| --- | --- |
| `Pending` | Siri sudah masuk queue aktif dan menunggu slot/publish; belum semestinya scheduled dalam akaun Threads. |
| `Lulus` | Siri mempunyai proof publish/live/native yang sah. |
| `Blocked` | Siri belum gagal; ia menunggu slot queue kosong. |
| `Gagal` | Siri gagal diproses atau ditanda gagal. |
| `Disediakan` | Siri disimpan tetapi belum aktif dalam queue. |
| `Perlu Semak` | Siri ditahan Quality Gate sebelum publish. |

## Fail Data Penting

| Fail | Fungsi |
| --- | --- |
| `threads_flexi_marble_schedule.json` | Snapshot jadual contoh/legacy untuk fallback static. |
| `status.json` | Snapshot status contoh/legacy; bukan runtime production. |
| `story-runs.json` | Snapshot rekod output contoh/legacy. |
| `work/runtime/threads-schedule.json` | Runtime jadual aktif. |
| `work/runtime/status.json` | Runtime status queue aktif. |
| `work/runtime/story-runs.json` | Runtime story run aktif. |
| `work/runtime/publish-log.json` | Runtime log publisher aktif. |
| `work/runtime/product-intel-cache.json` | Cache metadata produk. |
| `work/backups/` | Snapshot backup runtime. |
| `work/private/` | API key, token, auth, session dan cookie private. |
| `ai-server.mjs` | Launcher AI server dengan guard kesinambungan. |
| `ai-server-core.mjs` | Business logic API dan automasi utama. |

## Prinsip Design

- UI mesti profesional, tenang, dan tidak sakit mata.
- Font sederhana; keutamaan ialah kebolehbacaan dan density kemas.
- Gunakan sidebar/admin navigation dan bottom navigation pada mobile.
- Modul dipisahkan: Ringkasan, Jana Story, Jadual Threads, Audit Produk, Automasi Live.
- Status automation mesti sentiasa jelas.
- Audit Produk mesti paparkan ayat semasa sebelum regenerate.
- Auto Audit default kepada autopilot penuh; user edit/override hanya bila perlu.
- Gunakan surface hierarchy, warna semantik, spacing kemas dan micro-motion ringan.

## QA Wajib

- `npm run check`
- `npm run qa:smoke`
- `npm run qa:production`
- `npm run qa:static`
- `npm run qa:ui`
- `npm run qa:restore`
- `npm run qa:flow`
- `npm run audit:stories`

`qa:flow` mesti menguji login, generation, queue 25, Auto Audit, Product Audit, extension proof, publisher dry-run, backup dan persistence selepas restart.

## Larangan Penting

- Jangan commit API key, Threads token atau data private.
- Jangan palsukan status `Pending` atau `Lulus`.
- Jangan jadikan `Blocked` sebagai gagal.
- Jangan menanda siri `Lulus` hanya kerana masa slot sudah lepas atau kiraan native global berubah.
- Jangan publish live ke Threads tanpa token/User ID lengkap dan Publisher Preflight.
- Jangan expose AI server ke public tanpa auth, CORS terkunci dan HTTPS reverse proxy.
