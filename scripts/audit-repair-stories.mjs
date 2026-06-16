import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const runtimeRoot = process.env.THREADSME_RUNTIME_DIR || path.join(root, "work", "runtime");
const backupRoot = process.env.THREADSME_BACKUP_DIR || path.join(root, "work", "backups");
const scheduleFile = process.env.THREADSME_SCHEDULE_FILE || path.join(runtimeRoot, "threads-schedule.json");
const storyRunsFile = process.env.THREADSME_STORY_RUNS_FILE || path.join(runtimeRoot, "story-runs.json");
const statusFile = process.env.THREADSME_STATUS_FILE || path.join(runtimeRoot, "status.json");
const apply = process.argv.includes("--apply");
const targetMin = 250;
const targetMax = 295;
const hardMax = 300;
const shortFillers = [
  " Benda kecil pun cukup untuk mula rasa lebih teratur.",
  " Dari situ, mood harian rasa kurang berat.",
  " Yang penting, ia dekat dengan rutin sebenar.",
  " Simple, tapi kesannya tetap terasa.",
];
const danglingPhraseRe = /(sebelum mula tampal|boleh survey|boleh tengok|kalau nak|boleh check|boleh mula)$/i;

const productConfigs = {
  marble: {
    label: "Flexi Marble Sheet",
    category: "dekorasi rumah, kemasan dinding, projek DIY",
    links: ["https://s.shopee.com.my/7VDqSOoKf3"],
    terms: ["marble", "dinding", "ruang", "rumah", "sheet", "tampal", "deko"],
    forbidden: [/sambal|nyet|khairulaming|pedas|lauk|telur\s+goreng|ayam\s+goreng|ikan\s+goreng|nasi\s+panas|bekal\s+cepat/i],
    fillers: [
      " Perubahan kecil macam ni buat ruang rasa lebih dijaga tanpa perlu ubah semua benda.",
      " Bila sudut yang selalu dipandang nampak kemas, mood balik rumah pun rasa lain.",
      " Yang penting, mula dari satu bahagian dulu supaya tak rasa berat sangat.",
    ],
    reply2Fillers: [
      " Boleh survey corak dan ukuran dulu sebelum mula tampal perlahan-lahan.",
      " Sesuai untuk ruang TV, bilik atau sudut kosong yang selalu nampak hambar.",
      " Kalau tengah cari upgrade kecil untuk rumah, ini pilihan yang masuk akal.",
    ],
    scenes: [
      {
        main: "Aku pernah ingat rumah nampak cantik sebab barang mahal. Rupanya yang buat mata penat kadang satu dinding kosong yang hari-hari kita pandang. Bila balik kerja, sudut tu macam ikut sekali bawa rasa serabut masuk rumah.",
        reply1: "Mula-mula aku biar je sebab fikir nanti ada bajet renovate. Tapi makin lama, ruang tu rasa macam belum siap walaupun rumah dah kemas. Benda kecil macam dinding kusam boleh buat mood jatuh diam-diam.",
        reply2: "Flexi Marble Sheet ni masuk akal untuk mula kecil. Tampal pada satu dinding, ruang terus ada focal point dan nampak lebih clean. Bukan nak mewah berlebihan, cuma nak rumah rasa lebih dijaga.",
      },
      {
        main: "Kadang tetamu belum datang pun kita dah malu sendiri tengok ruang tamu. Sofa dah elok, lantai dah sapu, tapi belakang TV masih nampak kosong dan hambar. Rasa macam rumah tu belum ada jiwa.",
        reply1: "Yang penatnya, kita selalu fikir kena buat makeover besar. Padahal yang kita perlukan cuma satu sudut yang nampak siap. Bila mata nampak kemas, hati pun rasa kurang terbeban.",
        reply2: "Flexi Marble Sheet boleh bantu jadikan dinding biasa nampak lebih premium tanpa kerja renovate berat. Sesuai untuk feature wall kecil, ruang TV atau bilik yang perlukan rasa baru.",
      },
      {
        main: "Rumah sewa ni selalu buat kita serba salah. Nak cantikkan, takut berlebihan. Nak biar kosong, kita pula yang rasa tak puas hati. Setiap hari pandang dinding sama, rasa macam duduk sementara saja.",
        reply1: "Aku suka mula dengan benda yang tak buat rumah jadi projek besar. Satu sudut yang nampak lebih kemas pun cukup untuk buat kita rasa ruang tu milik kita, bukan sekadar tempat singgah.",
        reply2: "Flexi Marble Sheet ni sesuai untuk perubahan lembut macam tu. Corak marble buat ruang nampak clean, dan kita boleh mula dari bahagian kecil dulu ikut bajet serta keberanian sendiri.",
      },
    ],
  },
  fairy_light: {
    label: "Lampu Dawai LED Fairy Light",
    category: "lampu dekorasi, suasana bilik, pencahayaan kecil",
    links: ["https://s.shopee.com.my/5q5lqSXkro"],
    terms: ["lampu", "cahaya", "bilik", "malam", "led", "warm", "suasana"],
    forbidden: [/solar|street\s*lamp|lampu\s+jalan|waterproof|ip68|pagar|porch|laman|jalan\s+gelap/i],
    fillers: [
      " Cahaya kecil macam ni tak bising, tapi cukup untuk buat ruang rasa lebih lembut.",
      " Bila suasana bilik kena, kepala pun lebih mudah reda selepas hari yang panjang.",
      " Tak perlu hias banyak benda, cukup satu cahaya yang buat sudut tu hidup.",
    ],
    reply2Fillers: [
      " Boleh letak dekat kepala katil, meja kerja, rak kecil atau tepi cermin.",
      " Pilih panjang yang sesuai dengan ruang supaya susunan nampak kemas.",
      " Kalau bilik rasa kosong, ini antara cara paling ringan untuk mula.",
    ],
    scenes: [
      {
        main: "Ada malam, bilik rasa terlalu kosong walaupun semua barang cukup. Lampu siling terang sangat, tapi hati masih rasa penat. Kadang kita cuma perlukan cahaya lembut yang buat ruang rasa kurang keras.",
        reply1: "Aku perasan bila bilik ada suasana sikit, mood nak rehat pun berubah. Bukan sebab bilik jadi mewah, tapi sebab mata tak lagi rasa letih tengok ruang yang hambar dan terlalu kosong.",
        reply2: "Lampu dawai LED macam ni sesuai untuk bagi glow kecil yang cozy. Letak dekat meja, kepala katil atau rak pun dah cukup buat sudut biasa rasa lebih hidup tanpa deco yang berat.",
      },
      {
        main: "Bilik kecil kadang cepat rasa sempit, terutama bila balik kerja dengan kepala penuh. Kita buka pintu, nampak ruang sama, rasa macam hari belum habis. Cahaya yang salah pun boleh buat badan susah reda.",
        reply1: "Aku suka benda yang tak makan ruang tapi boleh tukar mood. Lampu kecil bukan sekadar hiasan, dia macam isyarat untuk badan perlahan sikit, duduk diam, dan tarik nafas.",
        reply2: "Fairy light LED ni boleh jadi sentuhan simple untuk bilik atau meja kerja. Cahaya lembutnya bantu ruang rasa warm, sesuai kalau nak suasana malam yang lebih tenang.",
      },
    ],
  },
  solar: {
    label: "Lampu Solar Outdoor LED",
    category: "lampu solar outdoor, pencahayaan luar rumah, laman, jalan kecil, kawasan gelap",
    links: ["https://s.shopee.com.my/902oCbnlhL"],
    terms: ["lampu", "solar", "luar", "malam", "terang", "porch", "laman", "pagar"],
    forbidden: [/fairy|string\s*light|lampu\s+dawai|kepala\s+katil|bilik\s+cozy|rak\s+kecil|tepi\s+cermin/i],
    fillers: [
      " Bila luar rumah jelas, rasa nak keluar masuk malam pun kurang risau.",
      " Kawasan yang terang sikit buat rumah nampak lebih terjaga.",
      " Kadang rasa selamat bermula dari sudut kecil yang selalu kita abaikan.",
    ],
    reply2Fillers: [
      " Sesuai untuk porch, pagar, laman atau laluan kecil yang selalu gelap.",
      " Semak saiz dan cara pemasangan supaya kena dengan kawasan rumah.",
      " Kalau ada sudut gelap, boleh mula dengan satu unit dulu sebelum tambah lain.",
    ],
    scenes: [
      {
        main: "Balik malam, kawasan depan rumah gelap boleh buat hati tak sedap. Bukan nak fikir bukan-bukan, tapi bila lampu tak cukup, setiap bunyi kecil pun rasa macam besar. Rumah sendiri pun rasa kurang menyambut.",
        reply1: "Aku rasa benda luar rumah selalu kita abaikan sebab jarang duduk lama di situ. Tapi sebenarnya itulah tempat pertama kita lalu bila balik penat. Kalau gelap sangat, mood pun boleh jatuh sebelum masuk rumah.",
        reply2: "Lampu solar outdoor ni relevan untuk porch, pagar atau laluan kecil yang selalu gelap. Tak perlu fikir wayar rumit, cuma bantu kawasan luar nampak lebih terang dan terjaga.",
      },
      {
        main: "Kadang kita kemas dalam rumah, tapi luar pagar tetap nampak suram waktu malam. Bila ada tetamu datang, baru terasa kawasan depan macam tak bersedia. Benda kecil, tapi kesan pada rasa rumah tu besar.",
        reply1: "Yang aku suka, pencahayaan luar bukan sekadar cantik. Ia buat kita nampak anak tangga, laluan dan sudut yang selalu gelap. Rasa rumah lebih dijaga walaupun perubahan tu sederhana.",
        reply2: "Lampu solar LED boleh jadi permulaan untuk kawasan luar yang perlukan cahaya tambahan. Sesuai untuk laman, pagar atau jalan kecil, terutama bila nak pilihan yang praktikal.",
      },
    ],
  },
  pressure_cooker: {
    label: "DESSINI Italy Pressure Cooker",
    category: "periuk tekanan, memasak cepat, dapur keluarga",
    links: ["https://s.shopee.com.my/5q5mTxqz8i"],
    terms: ["pressure", "cooker", "periuk", "tekanan", "dapur", "masak", "sup"],
    forbidden: [
      /sambal|nyet|khairulaming|pedas|telur\s+goreng|nasi\s+panas\s+dengan\s+sambal/i,
      /marble|flexi\s*marble|wallpaper|feature\s*wall|dinding\s+kosong|renovate|deko/i,
    ],
    fillers: [
      " Bila kerja dapur jadi lebih cepat, malam pun rasa kurang mengejar.",
      " Untuk rumah yang selalu sibuk, alat dapur yang praktikal memang terasa nilainya.",
      " Bukan semua hari kita ada tenaga lama-lama di dapur, jadi cara mudah macam ni membantu.",
    ],
    reply2Fillers: [
      " Sesuai untuk masak sup, rebusan, lauk keluarga atau meal prep yang nak cepat empuk.",
      " Semak kapasiti dan detail produk dulu supaya kena dengan rutin dapur sendiri.",
      " Kalau selalu rasa masa memasak terlalu panjang, ini boleh jadi pilihan untuk survey.",
    ],
    scenes: [
      {
        main: "Ada hari kita balik rumah dengan kepala penuh, tapi keluarga tetap tunggu makan malam. Yang paling penat bukan masak itu saja, tapi menunggu lauk lambat empuk sampai rasa malam habis di dapur.",
        reply1: "Aku faham sangat rasa nak sediakan makanan elok, tapi badan dah tak banyak tenaga. Bila proses masak boleh dipendekkan, kita masih boleh jaga rumah tanpa rasa diri sendiri tertinggal.",
        reply2: "Pressure cooker DESSINI ni relevan untuk dapur yang selalu sibuk. Ia bantu proses rebusan dan lauk berkuah jadi lebih praktikal, terutama bila nak makanan panas tanpa tunggu terlalu lama.",
      },
      {
        main: "Kadang kita bukan malas masak, cuma masa yang sempit. Balik kerja, kemas rumah, fikir menu, kemudian tunggu daging atau sup empuk. Dalam diam, rutin dapur boleh jadi benda yang paling menguras tenaga.",
        reply1: "Bila ada alat yang bantu cepatkan kerja berat, rasa memasak jadi kurang menakutkan. Kita masih boleh hidang makanan rumah, cuma tidak perlu berdiri terlalu lama sampai hilang mood.",
        reply2: "DESSINI pressure cooker boleh jadi pembantu untuk lauk yang perlukan masa. Sesuai survey kalau selalu masak sup, rebusan atau meal prep keluarga dan nak kerja dapur lebih lancar.",
      },
    ],
  },
  sambal: {
    label: "Sambal Nyet Berapi by Khairulaming",
    category: "sambal ready-to-eat, lauk cepat, penambah selera",
    links: ["https://s.shopee.com.my/2g8lFhByWQ"],
    terms: ["sambal", "pedas", "nasi", "lauk", "makan", "selera", "dapur", "telur"],
    forbidden: [
      /marble|flexi\s*marble|wallpaper|feature\s*wall|dinding\s+(kosong|putih|kusam)|renovate|deko|hiasan|sofa|rak\s+senget|bilik\s+tidur|tanaman\s+hiasan/i,
      /meja\s+(lusuh|calar)|sudut\s+kopi|instagrammable|background\s+rumah/i,
    ],
    fillers: [
      " Kadang lauk simple pun cukup, asalkan ada rasa yang buat selera terbuka.",
      " Bila perut dah lapar dan badan penat, benda mudah macam ni terasa sangat membantu.",
      " Tak semua hari kita rajin masak penuh, tapi kita masih nak makan yang puas.",
    ],
    reply2Fillers: [
      " Sesuai simpan untuk hari malas masak tapi tetap nak makan sedap.",
      " Boleh makan dengan nasi panas, telur, ayam goreng, ikan atau bekal cepat.",
      " Kalau suka sambal ready-to-eat, boleh survey dulu sebelum tambah stok dapur.",
    ],
    scenes: [
      {
        main: "Lepas balik kerja, badan dah rasa macam nak rebah. Tapi perut pula bunyi, dan bila buka dapur cuma nampak nasi dengan telur. Masa macam ni, kita bukan nak lauk hebat pun. Kita cuma nak makan yang ada rasa.",
        reply1: "Aku selalu kalah dekat waktu malam macam ni. Nak masak lauk penuh memang tak larat, tapi kalau makan kosong rasa macam sedih pula. Satu benda pedas yang kena tekak boleh selamatkan mood makan.",
        reply2: "Sambal Nyet Berapi ni masuk akal untuk stok dapur. Cedok sikit atas nasi panas, makan dengan telur atau ayam goreng, terus rasa hidangan tu hidup balik tanpa perlu masak panjang.",
      },
      {
        main: "Pernah tak buka peti ais penuh barang, tapi tetap rasa tak ada apa nak dimakan? Itu rasa paling penat. Bukan tak ada makanan, cuma tak ada satu lauk yang buat kita rasa berselera nak duduk makan betul-betul.",
        reply1: "Hari macam ni, aku cari benda yang cepat tapi tak hambar. Nasi panas dengan lauk ringkas pun boleh jadi cukup kalau ada rasa pedas, masin dan wangi yang kena. Baru rasa makan tu puas.",
        reply2: "Sambal Nyet Berapi boleh jadi jalan tengah untuk hari malas masak. Simpan satu balang, guna bila perlu, dan padankan dengan telur, ayam, ikan atau nasi kosong pun dah terasa lengkap.",
      },
      {
        main: "Kadang lapar tengah malam bukan sebab mengada. Siang tadi kita sibuk sangat sampai makan pun ala kadar. Bila malam datang, perut minta benda yang warm, pedas, dan buat rasa macam akhirnya dapat jaga diri sendiri.",
        reply1: "Aku suka makanan yang tak banyak syarat. Tak perlu potong bawang, tak perlu fikir lauk besar. Cukup nasi panas, sesuatu yang pedas, dan lima minit untuk duduk diam sambil makan perlahan.",
        reply2: "Sambal Nyet Berapi ni sesuai untuk moment macam tu. Rasa pedasnya jadi penambah selera, praktikal untuk rumah bujang, bekal kerja, atau hari yang memang tak ada tenaga nak masak.",
      },
      {
        main: "Rumah bujang atau rumah keluarga, soalan paling susah tetap sama: nak makan apa hari ni? Kadang bukan tak tahu masak, cuma kepala dah penuh. Kita nak pilihan cepat yang tak buat makan rasa sekadar kenyang.",
        reply1: "Bila ada satu sambal yang memang sedia di dapur, keputusan makan jadi lebih mudah. Telur goreng pun rasa cukup, nasi kosong pun ada kawan. Kecil je, tapi mood makan boleh berubah.",
        reply2: "Sambal Nyet Berapi boleh jadi stok penyelamat untuk hari sibuk. Bukan ganti semua lauk, tapi cukup sebagai penambah rasa bila nak makan cepat, pedas, dan masih terasa puas.",
      },
    ],
  },
  gold: {
    label: "POH KONG 999.9/24K Gold Bunga Raya Gold Bar (1.5G)",
    category: "emas 24K, gold bar kecil, hadiah bernilai, simpanan fizikal",
    links: ["https://s.shopee.com.my/9zvMgGgvG7"],
    terms: ["emas", "gold", "24k", "999", "simpanan", "hadiah", "bunga raya"],
    forbidden: [/sambal|nyet|pedas|lauk|nasi\s+panas|marble|wallpaper|feature\s*wall|dinding\s+kosong|renovate/i],
    fillers: [
      " Yang penting, beli ikut kemampuan dan faham tujuan sendiri.",
      " Nilainya bukan untuk menunjuk, tapi untuk rasa ada sesuatu yang tersimpan.",
      " Mula kecil pun tetap mula, asalkan keputusan tu dibuat dengan sedar.",
    ],
    reply2Fillers: [
      " Semak detail produk, berat, seller dan harga semasa sebelum buat keputusan.",
      " Ini bukan janji untung, cuma pilihan untuk yang suka simpan aset fizikal.",
      " Sesuai juga dipertimbangkan sebagai hadiah kecil yang terasa bernilai.",
    ],
    scenes: [
      {
        main: "Ada masa kita penat sebab duit keluar macam air, tapi tak nampak apa yang betul-betul tinggal. Bukan nak kaya mendadak, cuma nak rasa ada satu benda kecil yang boleh disimpan dan mengingatkan kita supaya lebih tersusun.",
        reply1: "Aku suka idea mula kecil sebab tak semua orang mampu terus simpan besar. Bila ada sesuatu yang fizikal di tangan, rasa disiplin tu lain. Kita jadi lebih sedar sebelum belanja benda yang cepat habis.",
        reply2: "Gold bar kecil POH KONG 24K ni sesuai untuk yang nak mula kenal simpanan emas secara perlahan. Semak berat, seller dan harga semasa dulu, kemudian buat keputusan ikut kemampuan.",
      },
      {
        main: "Kadang hadiah paling kita ingat bukan yang paling besar, tapi yang terasa ada makna. Barang boleh rosak, trend boleh hilang, tapi sesuatu yang disimpan lama rasa macam ada cerita sendiri.",
        reply1: "Aku suka hadiah yang tak terlalu bising tapi tetap nampak dihargai. Bila bentuknya kecil dan kemas, orang boleh simpan, bukan sekadar guna sekejap lepas tu lupa di laci.",
        reply2: "POH KONG 999.9 Gold Bar Bunga Raya ni boleh dipertimbangkan untuk hadiah bernilai atau simpanan kecil. Baca detail produk dan harga semasa dulu sebelum beli.",
      },
    ],
  },
};

const variantBanks = {
  marble: {
    main: [
      " Paling terasa bila malam, sebab waktu itulah ruang tu paling banyak kita pandang.",
      " Yang buat berat bukan kos besar, tapi rasa ruang sendiri macam tidak selesai.",
      " Kadang kita cuma mahu satu sudut yang buat hati rasa rumah ini dijaga.",
      " Bila sudut itu berubah, rasa penat balik rumah pun turun sedikit.",
      " Ia bukan pasal menunjuk, cuma pasal mahu rasa selesa dengan ruang sendiri.",
      " Mula kecil pun cukup, asalkan mata berhenti rasa serabut setiap hari.",
      " Dari satu dinding, keseluruhan ruang boleh rasa lebih kemas.",
    ],
    reply1: [
      " Aku suka perubahan yang tidak perlu buat rumah berhabuk atau bersepah lama.",
      " Bila mula dari satu sudut, bajet dan tenaga rasa lebih terkawal.",
      " Rasa puas itu datang bila ruang yang selalu kosong akhirnya nampak ada niat.",
      " Tak perlu tunggu rumah sempurna untuk mula jaga rasa dalam rumah.",
      " Kadang satu background kemas sudah cukup buat kita rajin duduk di situ.",
      " Yang penting, perubahan tu tidak menyusahkan rutin harian.",
      " Perlahan-lahan, rumah rasa kurang sementara dan lebih milik sendiri.",
    ],
    reply2: [
      " Boleh survey corak, saiz dan cara tampal dulu supaya sesuai dengan ruang.",
      " Mulakan di ruang TV, bilik atau sudut kosong yang paling selalu dipandang.",
      " Kalau takut berlebihan, cuba satu panel dahulu dan tengok rasa ruang itu.",
      " Pilih corak yang kena dengan warna rumah supaya hasilnya tidak nampak paksa.",
      " Sesuai untuk orang yang mahu perubahan visual tanpa renovate besar.",
      " Baca ukuran dan permukaan yang sesuai sebelum mula tampal.",
      " Simpan link ini kalau sedang kumpul idea untuk kemas semula dinding.",
    ],
  },
  fairy_light: {
    main: [
      " Cahaya kecil macam ni selalunya buat bilik rasa kurang keras.",
      " Bila malam lebih lembut, kepala pun tidak rasa dipaksa berjaga.",
      " Kadang suasana bilik yang tenang lebih penting daripada deco banyak.",
      " Lampu kecil boleh jadi tanda bahawa masa rehat sudah bermula.",
      " Sudut biasa pun boleh rasa hidup bila cahayanya kena.",
    ],
    reply1: [
      " Yang best, ia tidak ambil banyak ruang dan boleh dialih ikut mood.",
      " Aku suka sebab perubahan dia lembut, bukan jenis yang menjerit.",
      " Bila letak di tempat betul, bilik kecil pun rasa lebih cozy.",
      " Rutin malam jadi lebih perlahan bila mata tidak kena cahaya kasar.",
      " Cukup satu garisan cahaya untuk buat ruang nampak ada jiwa.",
    ],
    reply2: [
      " Sesuai kalau nak mula dengan cahaya warm yang mudah disusun.",
      " Boleh cuba dekat kepala katil, meja kecil atau rak yang selalu kosong.",
      " Semak panjang lampu dulu supaya susunan nampak kemas.",
      " Kalau bilik selalu rasa kosong, ini permulaan yang ringan.",
      " Pilih mod cahaya yang paling kena dengan mood ruang.",
    ],
  },
  solar: {
    main: [
      " Bila luar rumah gelap, rasa selamat pun ikut berkurang.",
      " Kawasan depan yang terang sikit boleh ubah cara kita rasa bila balik malam.",
      " Kadang rumah nampak lebih terjaga bila laluan kecil tidak lagi gelap.",
      " Perkara kecil di luar rumah pun boleh bagi lega setiap hari.",
      " Bukan nak mewah, cuma nak nampak jelas dan rasa kurang risau.",
    ],
    reply1: [
      " Paling terasa bila hujan atau balik lewat, waktu semua sudut nampak samar.",
      " Bila laluan jelas, anak tangga dan pagar pun senang nampak.",
      " Tetamu yang datang malam pun rasa rumah lebih bersedia.",
      " Aku suka perubahan yang praktikal dan nampak manfaatnya terus.",
      " Luar rumah yang terang buat keseluruhan rumah rasa lebih dijaga.",
    ],
    reply2: [
      " Sesuai untuk porch, pagar, laman atau laluan kecil.",
      " Semak kawasan yang paling gelap dulu sebelum pilih jumlah lampu.",
      " Kalau mahu mula kecil, satu lampu di laluan utama pun cukup.",
      " Pilih tempat yang dapat cahaya siang supaya fungsi solar lebih masuk akal.",
      " Boleh survey spesifikasi dan cara pasang sebelum beli.",
    ],
  },
  pressure_cooker: {
    main: [
      " Paling terasa bila lauk jenis rebusan ambil masa lebih lama daripada tenaga yang kita ada.",
      " Yang buat letih bukan masak semata-mata, tapi menunggu dapur siap ketika badan sudah penat.",
      " Kadang alat dapur yang betul boleh jadi beza antara makan rumah dan terus beli luar.",
      " Bila masa memasak lebih terkawal, malam di rumah rasa kurang kelam-kabut.",
      " Kita masih mahu hidang makanan panas, cuma tidak semestinya perlu berdiri lama.",
      " Untuk rutin keluarga yang sibuk, dapur yang praktikal memang terasa membantu.",
      " Ada lega kecil bila lauk berat boleh siap tanpa rasa seluruh malam habis di dapur.",
      " Memasak jadi kurang menakutkan bila proses paling lama boleh dipendekkan sedikit.",
    ],
    reply1: [
      " Aku suka alat yang bantu rutin sebenar, bukan sekadar nampak cantik atas kabinet.",
      " Bila lauk cepat empuk, kita ada ruang untuk mandi, rehat, dan makan dengan lebih tenang.",
      " Bukan semua hari sesuai untuk masak perlahan, tapi makanan rumah tetap kita cari.",
      " Yang penting, kerja dapur rasa lebih tersusun dan tidak menelan semua tenaga malam.",
      " Untuk orang yang selalu kejar masa, bantuan kecil di dapur boleh rasa besar.",
      " Meal prep pun lebih masuk akal bila proses rebusan tidak makan masa terlalu panjang.",
      " Kadang kita cuma perlukan cara yang buat memasak rasa boleh diteruskan.",
      " Bila alat dapur kena dengan rutin, rasa nak masak di rumah pun datang balik.",
    ],
    reply2: [
      " Sesuai disemak kalau selalu masak sup, rebusan, lauk berkuah atau bahan yang lambat empuk.",
      " Boleh tengok kapasiti dan cara guna dulu supaya kena dengan saiz keluarga dan rutin dapur.",
      " Kalau selalu rasa masa memasak terlalu panjang, pressure cooker begini memang wajar disurvey.",
      " Pilih ikut kapasiti, bahan masakan biasa, dan ruang dapur supaya pembelian lebih masuk akal.",
      " Untuk dapur yang sibuk, alat macam ni boleh bantu kurangkan masa menunggu lauk siap.",
      " Semak detail produk, kapasiti dan kesesuaian dapur dahulu sebelum buat keputusan.",
      " Ini lebih kepada bantu kerja dapur harian, terutama bila mahu lauk panas tanpa menunggu lama.",
      " Simpan link ini kalau sedang cari cara praktikal untuk pendekkan rutin memasak di rumah.",
    ],
  },
  sambal: {
    main: [
      " Rasa lapar macam ni biasanya datang bila tenaga sudah habis.",
      " Yang kita mahu cuma makanan cepat yang tetap rasa macam dijaga.",
      " Kadang satu suapan pedas boleh buat hari yang hambar rasa hidup balik.",
      " Bila nasi panas ada kawan, makan simple pun boleh rasa cukup.",
      " Waktu penat, keputusan makan yang mudah terasa macam pertolongan kecil.",
      " Dapur tidak perlu meriah, cukup ada sesuatu yang buka selera.",
      " Selera yang hilang boleh datang balik bila rasa pedasnya kena.",
      " Makan seorang pun tidak terasa kosong kalau lauk ringkas ada rasa.",
    ],
    reply1: [
      " Aku suka benda yang boleh guna tanpa fikir panjang selepas hari berat.",
      " Telur goreng biasa pun rasa lain bila ada sambal yang cukup rasa.",
      " Kadang kita cuma perlukan lima minit untuk duduk dan makan betul-betul.",
      " Bila tidak perlu masak panjang, rasa nak makan di rumah jadi lebih mudah.",
      " Stok kecil di dapur boleh selamatkan banyak malam yang serabut.",
      " Yang penting, ia sesuai dengan rutin orang yang selalu kejar masa.",
      " Bekal kerja pun rasa kurang bosan bila ada rasa pedas yang kena.",
      " Bukan setiap hari kita rajin masak, tapi selera tetap minta dilayan.",
    ],
    reply2: [
      " Sesuai jadi stok dapur untuk hari lapar tapi tidak larat masak.",
      " Boleh padankan dengan nasi panas, telur, ayam atau ikan goreng.",
      " Kalau suka sambal ready-to-eat, semak dulu dan tengok kalau kena selera.",
      " Simpan satu balang boleh bantu waktu menu harian rasa terlalu kosong.",
      " Praktikal untuk rumah bujang, bekal kerja atau makan malam cepat.",
      " Baca detail produk dulu, kemudian pilih ikut selera pedas sendiri.",
      " Link ini sesuai disimpan kalau selalu buntu nak makan apa.",
      " Mula dengan satu stok kecil pun cukup untuk hari malas masak.",
    ],
  },
  gold: {
    main: [
      " Rasa mahu simpan sesuatu itu kadang datang selepas penat belanja benda yang cepat hilang.",
      " Bukan semua orang mula dengan jumlah besar, dan itu tidak apa.",
      " Ada lega kecil bila kita pilih sesuatu yang boleh disimpan lama.",
      " Kadang hadiah yang kecil pun terasa besar bila ada nilai dan niat.",
      " Simpanan fizikal buat kita lebih sedar tentang keputusan sendiri.",
      " Bukan pasal menunjuk, tapi pasal mahu mula lebih tersusun.",
      " Mula kecil boleh jadi cara lembut untuk latih disiplin.",
      " Yang penting, kita faham tujuan sebelum membeli.",
    ],
    reply1: [
      " Aku suka benda yang tidak perlu dijelaskan panjang untuk nampak maknanya.",
      " Bila pegang sesuatu yang fizikal, rasa simpanan itu lebih nyata.",
      " Hadiah macam ini boleh duduk lama dalam ingatan orang.",
      " Yang penting, semak kemampuan sendiri dan jangan ikut emosi semata-mata.",
      " Sedikit demi sedikit, rasa disiplin itu boleh dibina.",
      " Ia mengingatkan kita bahawa keputusan kecil pun ada arah.",
      " Beli dengan tenang lebih baik daripada beli kerana takut terlepas.",
      " Nilai sentimentalnya terasa kerana ia bukan barang pakai buang.",
    ],
    reply2: [
      " Semak berat, harga semasa dan seller sebelum buat keputusan.",
      " Ini bukan janji untung, cuma pilihan untuk yang suka simpan aset fizikal.",
      " Sesuai dipertimbangkan sebagai hadiah kecil yang nampak kemas.",
      " Baca detail produk dahulu supaya beli ikut kemampuan dan tujuan.",
      " Kalau baru mula, produk kecil begini lebih mudah difahami.",
      " Simpan link ini jika sedang bandingkan pilihan emas kecil.",
      " Pastikan keputusan dibuat dengan bajet yang selesa.",
      " Pilihan begini lebih sesuai bila dibeli dengan niat yang jelas.",
    ],
  },
};

function malaysiaStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function clean(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(value) {
  return clean(value)
    .replace(/\s+/g, " ")
    .replace(/\btakde\b/gi, "tak ada")
    .replace(/\btgok\b/gi, "tengok")
    .replace(/\bmmg\b/gi, "memang")
    .trim();
}

function limitAtWord(text, max = targetMax) {
  const value = oneLine(text);
  if (value.length <= max) return value;
  let cut = value.slice(0, max).trim();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(max * 0.72)) cut = cut.slice(0, lastSpace).trim();
  cut = cut.replace(/[,:;]+$/g, ".").replace(/\s+\./g, ".");
  if (!/[.!?]$/.test(cut)) {
    if (cut.length < max) cut += ".";
    else cut = `${cut.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/g, "")}.`;
  }
  return cut;
}

function appendSentence(base, sentence) {
  const body = oneLine(base).replace(/[,;]\s*$/g, ".");
  const extra = oneLine(sentence);
  if (!extra) return body;
  if (!body) return extra;
  return `${body}${/[.!?]$/.test(body) ? " " : ". "}${extra}`;
}

function fitBody(text, fillers, seed = 0, max = targetMax, min = targetMin) {
  let output = limitAtWord(text, max);
  const mergedFillers = [...fillers, ...shortFillers];
  const bank = [
    ...mergedFillers.slice(seed % Math.max(1, mergedFillers.length)),
    ...mergedFillers.slice(0, seed % Math.max(1, mergedFillers.length)),
  ];
  let guard = 0;
  while (output.length < min && guard < 10) {
    const candidate = bank[guard % bank.length] || "";
    const next = appendSentence(output, candidate);
    if (next.length <= max) output = next;
    else break;
    guard += 1;
  }
  return limitAtWord(output, max);
}

function attachLink(body, link, fillers, seed = 0) {
  const safeLink = String(link || "").trim();
  const suffix = safeLink ? `\n${safeLink}` : "";
  const maxBody = hardMax - suffix.length;
  const targetBodyMax = targetMax - suffix.length;
  let output = fitBody(body, fillers, seed, Math.max(80, targetBodyMax), Math.max(80, targetMin - suffix.length));
  let guard = 0;
  while (output.length + suffix.length < targetMin && guard < 10) {
    const candidate = fillers[(seed + guard) % fillers.length] || "";
    const next = appendSentence(output, candidate);
    if (next.length <= maxBody) output = next;
    else break;
    guard += 1;
  }
  if (output.length + suffix.length > targetMax) output = limitAtWord(output, Math.max(40, targetMax - suffix.length));
  if (output.length + suffix.length > hardMax) output = limitAtWord(output, maxBody);
  return `${output}${suffix}`.trim();
}

function inferKind(post) {
  const text = [post.productTitle, post.productCategory, post.affiliateLink].filter(Boolean).join(" ").toLowerCase();
  if (/7vdqsookf3|flexi\s*marble|marble|dinding|wallpaper/.test(text)) return "marble";
  if (/5q5lqsxkro|fairy|dawai|string\s*light/.test(text)) return "fairy_light";
  if (/902ocbnlhl|solar|outdoor|street|lampu jalan/.test(text)) return "solar";
  if (/5q5mtxqz8i|pressure\s*cooker|periuk\s+tekanan|dessini/.test(text)) return "pressure_cooker";
  if (/2g8lfhbywq|sambal|nyet|khairulaming/.test(text)) return "sambal";
  if (/9zvmgggvg7|poh\s*kong|gold|emas|24k|999/.test(text)) return "gold";
  return "";
}

function expectedLink(post, kind) {
  const current = String(post.affiliateLink || "").trim();
  const config = productConfigs[kind];
  if (!config) return current;
  if (kind === "sambal") {
    if (/180g/i.test(String(post.productTitle || ""))) return "https://s.shopee.com.my/2g8lFhByWQ";
    if (config.links.includes(current)) return current;
  }
  if (config.links.includes(current)) return current;
  return config.links[0] || current;
}

function extractLastLink(value) {
  const matches = String(value || "").match(/https?:\/\/\S+/g) || [];
  return matches.length ? matches[matches.length - 1].replace(/[),.;]+$/g, "") : "";
}

function hasAnyTerm(text, terms) {
  const value = String(text || "").toLowerCase();
  return terms.some((term) => value.includes(term));
}

function auditPost(post, number) {
  const kind = inferKind(post);
  const config = productConfigs[kind];
  const link = String(post.affiliateLink || "").trim();
  const lastLink = extractLastLink(post.reply2);
  const allText = [post.main, post.reply1, post.reply2].join(" ");
  const lengths = [post.main, post.reply1, post.reply2].map((part) => String(part || "").length);
  const issues = [];

  if (!kind || !config) issues.push("unknown_product_kind");
  if (lengths.some((length) => length <= 0 || length > hardMax)) issues.push("length_hard");
  if (lengths.some((length) => length < targetMin || length > targetMax)) issues.push("target_length");
  if (!lastLink) issues.push("missing_reply2_link");
  if (link && lastLink && link !== lastLink) issues.push("reply2_link_not_same_as_affiliateLink");

  if (config) {
    const expected = expectedLink(post, kind);
    if (expected && link && link !== expected) issues.push("affiliate_link_not_expected_for_product");
    if (kind === "pressure_cooker" && /sambal|nyet|khairulaming/i.test(String(post.productTitle || ""))) {
      issues.push("product_title_mismatch");
    }
    if (kind === "sambal" && /pressure\s*cooker|periuk\s+tekanan|dessini/i.test(String(post.productTitle || ""))) {
      issues.push("product_title_mismatch");
    }
    if (!hasAnyTerm(allText, config.terms)) issues.push("story_missing_product_terms");
    if (config.forbidden.some((pattern) => pattern.test(allText))) issues.push("story_leaks_wrong_product");
    if (!String(post.reply2 || "").includes(config.terms[0]) && !hasAnyTerm(post.reply2, config.terms.slice(1))) {
      issues.push("reply2_not_product_specific");
    }
  }

  if (/produk ni:\s|check:\s|boleh\.\s|Jom\.\s/i.test(allText)) issues.push("awkward_sales_phrase");
  for (const text of [post.main, post.reply1, post.reply2]) {
    const body = String(text || "").replace(/https?:\/\/\S+/g, "").trim();
    if (danglingPhraseRe.test(body)) issues.push("dangling_phrase");
  }
  if (!/(aku|kita|kadang|bila|pernah|rasa|penat|hari|malam|pagi|balik|dapur|rumah|simpan)/i.test(allText)) {
    issues.push("weak_story_voice");
  }

  return { number, kind, issues: [...new Set(issues)], lengths, link, lastLink };
}

function buildStory(post, number) {
  const kind = inferKind(post) || "marble";
  const config = productConfigs[kind];
  const scene = config.scenes[(number - 1) % config.scenes.length];
  const link = expectedLink(post, kind);
  const variants = variantBanks[kind] || {};
  const pick = (part, offset = 0) => {
    const bank = variants[part] || [];
    const multiplier = part === "main" ? 7 : part === "reply1" ? 11 : 17;
    return bank.length ? bank[(number * multiplier + Math.floor(number / 2) + Math.floor(number / 5) + offset) % bank.length] : "";
  };
  return {
    kind,
    productTitle: kind === "sambal" && /180g/i.test(String(post.productTitle || "")) ? "Sambal Nyet Berapi by Khairulaming 180g" : config.label,
    productCategory: config.category,
    affiliateLink: link,
    main: fitBody(appendSentence(scene.main, pick("main")), config.fillers, number),
    reply1: fitBody(appendSentence(scene.reply1, pick("reply1", 3)), config.fillers, number + 1),
    reply2: attachLink(appendSentence(scene.reply2, pick("reply2", 5)), link, config.reply2Fillers, number + 2),
  };
}

function qualityChecks(post) {
  const lengths = [post.main, post.reply1, post.reply2].map((part) => String(part || "").length);
  const report = auditPost(post, 0);
  return {
    status: report.issues.length ? "review" : "passed",
    score: report.issues.length ? Math.max(60, 100 - report.issues.length * 10) : 100,
    reasons: report.issues,
    checks: [
      { key: "length", label: `Setiap post <=${hardMax} aksara`, passed: lengths.every((length) => length > 0 && length <= hardMax) },
      { key: "target_length", label: `Manfaatkan ruang ${targetMin}-${targetMax} aksara`, passed: lengths.every((length) => length >= targetMin && length <= targetMax) },
      { key: "affiliate", label: "Reply 2 tamat dengan link affiliate", passed: Boolean(extractLastLink(post.reply2)) },
      { key: "link_product_match", label: "Link affiliate sepadan dengan produk dan story", passed: !report.issues.some((issue) => issue.includes("link") || issue.includes("leaks")) },
      { key: "relevance", label: "Story relevan dengan produk", passed: !report.issues.includes("story_missing_product_terms") },
      { key: "story", label: "Ada deep storytelling harian", passed: !report.issues.includes("weak_story_voice") },
    ],
    lengths,
  };
}

function syncRuns(runs, posts, updatedNumbers, stampText) {
  const updated = new Set(updatedNumbers);
  for (const run of runs) {
    let touched = false;
    for (const version of run.versions || []) {
      const number = Number(version.scheduleNumber);
      if (!updated.has(number)) continue;
      const post = posts[number - 1];
      if (!post) continue;
      version.main = post.main;
      version.reply1 = post.reply1;
      version.reply2 = post.reply2;
      version.mainLength = post.main.length;
      version.reply1Length = post.reply1.length;
      version.reply2Length = post.reply2.length;
      version.productTitle = post.productTitle;
      version.productCategory = post.productCategory;
      version.affiliateLink = post.affiliateLink;
      version.qualityStatus = post.qualityStatus;
      version.qualityScore = post.qualityScore;
      version.qualityChecks = post.qualityChecks;
      version.qualityReasons = post.qualityReasons;
      version.storyLogicAuditAt = stampText;
      version.updatedAt = stampText;
      touched = true;
    }
    if (touched) {
      const firstUpdatedNumber = (run.versions || [])
        .map((version) => Number(version.scheduleNumber))
        .find((number) => updated.has(number) && posts[number - 1]);
      const firstUpdatedPost = firstUpdatedNumber ? posts[firstUpdatedNumber - 1] : null;
      if (firstUpdatedPost) {
        run.productTitle = firstUpdatedPost.productTitle;
        run.productCategory = firstUpdatedPost.productCategory;
        run.affiliateLink = firstUpdatedPost.affiliateLink || run.affiliateLink;
      }
      run.storyLogicAuditAt = stampText;
      run.updatedAt = stampText;
    }
  }
}

function addGlobalStoryIssues(posts, reports) {
  const byNumber = new Map(reports.map((report) => [report.number, { ...report, issues: [...report.issues] }]));
  const ensure = (number) => {
    if (!byNumber.has(number)) byNumber.set(number, { ...auditPost(posts[number - 1], number), issues: [] });
    return byNumber.get(number);
  };
  const trioMap = new Map();
  posts.forEach((post, index) => {
    const trio = [post.main, post.reply1, post.reply2].map(oneLine).join("\n---\n");
    if (!trioMap.has(trio)) trioMap.set(trio, []);
    trioMap.get(trio).push(index + 1);
  });
  for (const numbers of trioMap.values()) {
    if (numbers.length < 2) continue;
    for (const number of numbers) {
      const report = ensure(number);
      report.issues.push("duplicate_story");
      report.issues = [...new Set(report.issues)];
    }
  }
  return [...byNumber.values()].filter((report) => report.issues.length).sort((a, b) => a.number - b.number);
}

async function main() {
  const schedule = await readJson(scheduleFile, { posts: [] });
  const status = await readJson(statusFile, {});
  const storyRunsData = await readJson(storyRunsFile, { runs: [] });
  const runs = Array.isArray(storyRunsData)
    ? storyRunsData
    : Array.isArray(storyRunsData.runs)
      ? storyRunsData.runs
      : [];
  const posts = Array.isArray(schedule.posts) ? schedule.posts : [];
  const before = addGlobalStoryIssues(posts, posts.map((post, index) => auditPost(post, index + 1)).filter((item) => item.issues.length));
  const updatedNumbers = [];
  const stamp = malaysiaStamp();
  const stampText = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} ${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)} GMT+8`;

  if (apply && before.length) {
    const backupDir = path.join(backupRoot, `story-logic-audit-${stamp}`);
    await mkdir(backupDir, { recursive: true });
    await copyFile(scheduleFile, path.join(backupDir, "threads-schedule.json"));
    await copyFile(storyRunsFile, path.join(backupDir, "story-runs.json"));
    await copyFile(statusFile, path.join(backupDir, "status.json"));

    for (const item of before) {
      const post = posts[item.number - 1];
      const story = buildStory(post, item.number);
      post.main = story.main;
      post.reply1 = story.reply1;
      post.reply2 = story.reply2;
      post.productTitle = story.productTitle;
      post.productCategory = story.productCategory;
      post.productVerified = true;
      post.productIntelEvidence = post.productIntelEvidence || "story_logic_verified";
      post.productIntelConfidence = Math.max(Number(post.productIntelConfidence || 0), 96);
      post.productIntelSource = "ThreadsMe Story Logic Audit";
      post.affiliateLink = story.affiliateLink;
      post.storyLogicAuditAt = stampText;
      post.storyLogicAuditNote = "Autopilot repair: story, produk dan link affiliate diselaraskan.";
      const quality = qualityChecks(post);
      post.qualityStatus = quality.status;
      post.qualityScore = quality.score;
      post.qualityChecks = quality.checks;
      post.qualityReasons = quality.reasons;
      post.threadLengthTarget = {
        min: targetMin,
        max: targetMax,
        hardMax,
        passed: quality.lengths.every((length) => length >= targetMin && length <= targetMax),
        lengths: quality.lengths,
      };
      updatedNumbers.push(item.number);
    }

    syncRuns(runs, posts, updatedNumbers, stampText);
    if (!Array.isArray(storyRunsData)) storyRunsData.runs = runs;
    schedule.posts = posts;
    schedule.lastStoryLogicAuditAt = stampText;
    schedule.lastStoryLogicAuditNote = `${updatedNumbers.length} siri dibaiki supaya story, produk dan link affiliate selari.`;
    status.lastStoryLogicAuditAt = stampText;
    status.lastStoryLogicAuditNote = schedule.lastStoryLogicAuditNote;
    await writeJson(scheduleFile, schedule);
    await writeJson(storyRunsFile, Array.isArray(storyRunsData) ? runs : storyRunsData);
    await writeJson(statusFile, status);
  }

  const afterPosts = apply && before.length ? (await readJson(scheduleFile, { posts: [] })).posts || [] : posts;
  const after = addGlobalStoryIssues(afterPosts, afterPosts.map((post, index) => auditPost(post, index + 1)).filter((item) => item.issues.length));
  const byIssue = after.reduce((acc, item) => {
    for (const issue of item.issues) acc[issue] = (acc[issue] || 0) + 1;
    return acc;
  }, {});
  const productLinks = afterPosts.reduce((acc, post, index) => {
    const kind = inferKind(post) || "unknown";
    const key = `${kind}|${post.productTitle || ""}|${post.affiliateLink || ""}`;
    if (!acc[key]) acc[key] = { kind, productTitle: post.productTitle || "", affiliateLink: post.affiliateLink || "", count: 0, first: index + 1, last: index + 1 };
    acc[key].count += 1;
    acc[key].last = index + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    total: posts.length,
    beforeIssueCount: before.length,
    updatedNumbers,
    afterIssueCount: after.length,
    remainingIssues: byIssue,
    remainingSamples: after.slice(0, 20),
    productLinks: Object.values(productLinks),
  }, null, 2));

  if (after.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
