# ThreadsMe AI Server Architecture

`ai-server.mjs` ialah launcher stabil. Ia memuatkan `ai-server-core.mjs`, mengenakan guard kesinambungan yang eksplisit, menulis modul terjana ke folder runtime, kemudian menjalankan server.

Tujuan pemisahan ini:

- memastikan Bridge URL production/local konsisten,
- memastikan siri hanya menjadi `Lulus` apabila ada proof bagi siri tersebut,
- mengekalkan allowlist static yang selamat,
- mengesan perubahan struktur core melalui kegagalan jelas dalam CI.

Business logic utama kekal dalam `ai-server-core.mjs`. Sebarang perubahan besar pada core perlu dikemas kini bersama QA flow continuity.
