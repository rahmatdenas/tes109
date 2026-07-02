'use strict';

const BASE_TITLE = 'WikiJelajah';

const KUMPULAN_KUERI_0 = {
'universal': `Merancang strategi paginasi SPARQL dengan retry logic dan ORDER BY
Merancang strategi paginasi SPARQL dengan retry logic dan ORDER BY
Baik, saya kasih kode konkretnya. Ini butuh perubahan di dua tempat: (1) tambah fungsi baru di file pertama Anda (dekat queryWdqsThenProcess), dan (2) ubah cara pemanggilan query di fungsi-fungsi populateProvinceTypesData, populateCoordinatesData, dll.

1. Tambahkan fungsi baru — taruh tepat setelah queryWdqsThenProcess
javascript
// FUNGSI BARU #1: Fetch mentah satu halaman, HANYA kembalikan bindings + parsing aman
function fetchWdqsRaw(query) {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    activeXhrs.push(xhr);

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== xhr.DONE) return;

      let idx = activeXhrs.indexOf(xhr);
      if (idx > -1) activeXhrs.splice(idx, 1);

      if (xhr.status === 200) {
        try {
          let data = JSON.parse(xhr.responseText); // dibungkus try/catch — kunci fix error JSON Anda
          resolve(data.results.bindings);
        } catch (e) {
          reject('PARSE_ERROR');
        }
      } else if (xhr.status === 0) {
        reject(xhr.isAbortedManually ? 'ABORTED' : 'NETWORK_ERROR');
      } else {
        reject(xhr.status); // termasuk 502 tertangkap di sini
      }
    };

    xhr.open('POST', WDQS_API_URL, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.setRequestHeader('Accept', 'application/sparql-results+json');

    if (SparqlValuesClause) query = query.replace('<SPARQLVALUESCLAUSE>', SparqlValuesClause);
    xhr.send('format=json&query=' + encodeURIComponent(query));
  });
}

// FUNGSI BARU #2: Retry otomatis kalau kena PARSE_ERROR / NETWORK_ERROR / 502
async function fetchWdqsRawWithRetry(query, maxRetry = 3) {
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      return await fetchWdqsRaw(query);
    } catch (error) {
      if (error === 'ABORTED') throw error; // batal sengaja -> jangan retry
      console.warn(`Percobaan ${attempt}/${maxRetry} gagal (${error}), mencoba lagi...`);
      if (attempt === maxRetry) throw error;
      await new Promise(r => setTimeout(r, 1500 * attempt)); // jeda 1.5s, 3s, 4.5s...
    }
  }
}

// FUNGSI BARU #3: Loop LIMIT/OFFSET per 5000 baris, panggil processEachResult tiap baris
async function queryWdqsPaginated(queryTemplate, processEachResult, chunkSize = 5000) {
  let offset = 0;
  while (true) {
    let pagedQuery = `${queryTemplate}\nLIMIT ${chunkSize} OFFSET ${offset}`;
    let bindings = await fetchWdqsRawWithRetry(pagedQuery);

    bindings.forEach(processEachResult);

    if (bindings.length < chunkSize) break; // halaman terakhir, kurang dari 5000 -> selesai
    offset += chunkSize;
  }
}
2. ⚠️ Syarat wajib di query SPARQL Anda
LIMIT/OFFSET hanya aman kalau query punya ORDER BY yang stabil. Tanpa ini, Blazegraph (mesin WDQS) tidak menjamin urutan baris tetap sama antar-request — akibatnya bisa ada baris yang terlewat atau terduplikasi antar halaman. Cek query Anda (biasanya di ABOUT_SPARQL_QUERY atau di dalam populateProvinceTypesData), pastikan ada baris seperti:

sparql
ORDER BY ?item
di akhir query, sebelum LIMIT/OFFSET ditempel. Kalau belum ada, tambahkan itu dulu.

3. Ubah pemanggilan di fungsi populate...Data
Contoh sebelum:

javascript
function populateCoordinatesData() {
  let query = COORDINATES_SPARQL_QUERY; // template query Anda
  return queryWdqsThenProcess(query, processCoordinateRow);
}
Sesudah:

javascript
function populateCoordinatesData() {
  let query = COORDINATES_SPARQL_QUERY; // JANGAN ada LIMIT manual di sini lagi
  return queryWdqsPaginated(query, processCoordinateRow, 5000);
}
Pola yang sama berlaku untuk populateProvinceTypesData, populateImageAndWikipediaData, dan query besar lainnya — cukup ganti queryWdqsThenProcess(query, fn) menjadi queryWdqsPaginated(query, fn, 5000).

Karena saya tidak melihat isi asli populateProvinceTypesData / populateCoordinatesData / query SPARQL-nya (tidak ada di dokumen yang Anda kirim), kalau Anda paste isi fungsi-fungsi itu beserta teks query SPARQL-nya, saya bisa tunjukkan edit persis baris mana yang diganti, termasuk cek apakah ORDER BY-nya sudah benar.

jadi ini hasilnya bakal apa, limt 5000 saya mau tes di WQS


Menyiapkan kueri SPARQL dengan parameter limit untuk pengujian langsung
Menyiapkan kueri SPARQL dengan parameter limit untuk pengujian langsung
Baik, ini hasil final kalau semua placeholder Anda diisi nilai kosong/paling sederhana (tanpa filter wilayah tambahan) dan <PLACEHOLDER_LIMIT_OFFSET> diganti LIMIT 5000 OFFSET 0. Ini yang bisa langsung Anda paste ke https://query.wikidata.org untuk tes:

sparql
SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?lLabel ?tM ?tP
WHERE {
  {
    SELECT DISTINCT ?s ?p ?l WHERE {
      VALUES ?j { wd:Q839954 }
      ?s wdt:P31 ?j ;
         wdt:P131 ?l .
    }
    ORDER BY ?s
    LIMIT 5000 OFFSET 0
  }
  OPTIONAL {
    ?s p:P571 ?iS .
    ?iS psv:P571 ?iN .
    ?iN wikibase:timeValue ?tM ;
        wikibase:timePrecision ?tP .
  }
  BIND(SUBSTR(STR(?s), 32) AS ?SQ) .
  BIND(SUBSTR(STR(?p), 32) AS ?PQ) .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id". }
}
Catatan tentang nilai yang saya isi (silakan ganti sesuai punya Anda):

wd:Q839954 = contoh "candi" (Anda ganti dengan ?j sesuai kategori situs cagar budaya yang Anda pakai — bisa lebih dari satu item di dalam VALUES)
wdt:P131 = "terletak di entitas administratif" (ganti dengan PLACEHOLDER_PROP_LOKASI asli Anda — bisa jadi P276 "lokasi" tergantung skema data Anda)
wdt:P571 = "tanggal berdiri/inception" (ganti dengan PLACEHOLDER_PROP_TAHUN asli Anda)
Saya hilangkan <PLACEHOLDER_WILAYAH_1>, <PLACEHOLDER_HIERARKI_LOKASI>, <PLACEHOLDER_UNION_EKSTRA> karena isinya tidak saya ketahui — kalau Anda tempel itu ke saya, saya masukkan supaya query tes ini persis sama dengan kondisi produksi Anda.
Yang harus Anda perhatikan saat menekan "Run" di WDQS:
Cek jumlah baris hasil di pojok kanan bawah editor WDQS. Kalau hasilnya persis 5000 baris → berarti masih ada halaman berikutnya, lanjut tes dengan OFFSET 5000. Kalau kurang dari 5000 → itu halaman terakhir.
Cek waktu eksekusi (ditampilkan WDQS di bagian bawah, biasanya dalam ms/detik). Ini angka penting: kalau versi LIMIT 5000 ini butuh, misalnya, 2 detik — bandingkan dengan versi tanpa LIMIT (32rb baris) yang mungkin butuh 40-50 detik. Itu pembuktian langsung bahwa subquery LIMIT/OFFSET benar-benar memotong beban kerja, bukan cuma memotong hasil di akhir.
Tes juga OFFSET 30000 (dekat baris terakhir) — pastikan waktunya tidak jadi lambat lagi di halaman-halaman belakang. Kadang OFFSET besar di Blazegraph tetap agak lebih lambat dari OFFSET kecil karena server tetap harus "melompati" baris-baris sebelumnya, tapi harusnya masih jauh di bawah 60 detik.
Kalau mau bandingkan sisi-ke-sisi, jalankan versi asli Anda (tanpa subquery, tanpa LIMIT) sekali lagi di tab WDQS lain dan lihat apakah waktu eksekusinya jauh lebih lama dari total 7 kali LIMIT 5000 (32rb ÷ 5000 ≈ 7 halaman) — ini akan menunjukkan apakah subquery ini benar memberi manfaat performa.
Kalau Anda tempel isi asli dari ketiga placeholder yang saya kosongkan tadi (WILAYAH_1, HIERARKI_LOKASI, UNION_EKSTRA), saya bisa susunkan versi tes yang 100% identik dengan query produksi Anda, supaya hasil tesnya benar-benar mewakili kondisi nyata.

kalau pake     LIMIT 5000
sedangkan datanya 35000, hasilnya nanti tetap 35000 data berbeda atau cuma 5000?


Diuraikan mekanisme LIMIT dan strategi pagination untuk mengambil semua data
Diuraikan mekanisme LIMIT dan strategi pagination untuk mengambil semua data
Satu request LIMIT 5000 sendirian hanya mengembalikan 5000 baris, titik — bukan otomatis 35.000. LIMIT di SPARQL cara kerjanya sama seperti di SQL: dia memotong hasil, bukan mengulang.

Supaya total dapat 35.000 data (semua berbeda, tidak dobel), Anda perlu memanggil query itu berkali-kali dengan OFFSET yang bergeser, lalu menggabungkan hasilnya di JavaScript — persis yang dilakukan fungsi queryWdqsPaginated yang saya buatkan sebelumnya:

Panggilan ke-	Query	Hasil
1	LIMIT 5000 OFFSET 0	baris 1–5000
2	LIMIT 5000 OFFSET 5000	baris 5001–10000
3	LIMIT 5000 OFFSET 10000	baris 10001–15000
4	LIMIT 5000 OFFSET 15000	baris 15001–20000
5	LIMIT 5000 OFFSET 20000	baris 20001–25000
6	LIMIT 5000 OFFSET 25000	baris 25001–30000
7	LIMIT 5000 OFFSET 30000	baris 30001–35000
8 (cek)	LIMIT 5000 OFFSET 35000	0 baris → tanda berhenti
Jadi totalnya 7 request kecil (bukan 1 request besar) untuk dapat 35.000 baris yang sama persis dengan versi tanpa LIMIT — asalkan ORDER BY ?s ada di query (seperti yang saya tambahkan), supaya urutan baris konsisten dan tidak ada yang terlewat/dobel antar halaman.

Fungsi queryWdqsPaginated yang saya buat sudah otomatis melakukan loop ini untuk Anda — dia berhenti sendiri ketika satu halaman hasilnya kurang dari 5000 (pertanda itu halaman terakhir). Anda tidak perlu hitung manual berapa kali OFFSET harus diulang; itu otomatis mengikuti jumlah data aktual di Wikidata, jadi kalau minggu depan datanya bertambah jadi 36.000, kode ini tetap otomatis menariknya sampai habis (8 halaman).

Kalau mau tes manual di WDQS dulu sebelum pasang ke kode: coba jalankan OFFSET 30000 (halaman terakhir) dan OFFSET 35000 (harus 0 baris) untuk pastikan angka 35.000 itu tepat — kadang jumlah data berubah sedikit karena orang lain sedang edit Wikidata.

dia wqs, dia dapat 5100 data, meski sudah pake limit 5000, lalu apakah tidaka da redundan/bentrok/data hilang di offset berikutnya


Menganalisis penyebab hasil melebihi limit dan stabilitas paginasi data
Menganalisis penyebab hasil melebihi limit dan stabilitas paginasi data
Bagus, ini pertanyaan penting — dan jawabannya: kemungkinan ada, tapi bukan karena bug LIMIT, melainkan karena struktur query Anda. Saya jelaskan akar masalahnya, lalu solusinya.

Kenapa LIMIT 5000 bisa hasilkan 5100 baris
LIMIT 5000 di query Anda berada di dalam subquery, membatasi jumlah kombinasi ?s ?p ?l (distinct) menjadi tepat 5000. Tapi di query luar, ada OPTIONAL yang join ke p:P571/psv:P571 untuk ambil tanggal (?tM, ?tP). Kalau ada entitas ?s yang punya lebih dari satu pernyataan tanggal (misalnya statement dengan qualifier berbeda, atau rank preferred+normal), satu ?s itu bisa menghasilkan 2+ baris di output akhir — masing-masing dengan ?tM/?tP berbeda.

Jadi: 5000 itu jumlah entitas unik yang diambil dari subquery, sedangkan 5100 itu jumlah baris hasil akhir setelah di-expand oleh tanggal ganda. Ini bukan redundansi acak — 100 baris ekstra itu memang representasi sah dari entitas yang sama dengan tanggal berbeda, bukan duplikat identik (kalau identik persis, DISTINCT di query luar akan otomatis menghapusnya).

Apakah ini bikin masalah di paginasi (offset berikutnya)?
Aman dari sisi jumlah entitas — karena OFFSET bekerja di level subquery (yang membatasi ?s,?p,?l), bukan di level output 5100 baris. Jadi halaman berikutnya (OFFSET 5000) akan mengambil 5000 kombinasi ?s,?p,?l berikutnya, bukan "5000 baris setelah 5100 baris pertama" — tidak ada entitas yang tertinggal karena salah hitung offset.

Tapi ada satu celah nyata: ORDER BY ?s saja tidak cukup menjamin urutan deterministik kalau satu ?s punya beberapa baris ?p/?l berbeda (misalnya situs dengan multi-hierarki lokasi). SPARQL tidak menjamin urutan yang konsisten di antara baris-baris yang "seri" (tie) pada key sorting yang sama — di titik potong antar-halaman (misal baris ke-5000 dan 5001 kebetulan sama ?s-nya tapi beda ?p), ada risiko kecil baris itu tertukar urutan antar-eksekusi query, yang berpotensi menyebabkan duplikasi atau baris hilang tepat di batas halaman.

Perbaikan: tambahkan secondary sort key
sparql
ORDER BY ?s ?p ?l
Ini memastikan urutan sepenuhnya deterministik sampai ke level ?p dan ?l, jadi titik potong OFFSET selalu jatuh di tempat yang sama persis setiap kali dipanggil — tidak ada celah tie-breaking.

Satu hal lagi yang perlu Anda tangani di kode JS
Karena satu entitas (?SQ) bisa muncul di beberapa baris (akibat multi-tanggal), fungsi processEachResult Anda (yang mengisi Records[qid]) perlu siap menghadapi ini — misalnya:

javascript
function processCoordinateRow(row) {
  let qid = row.SQ.value;
  
  // Kalau entitas ini sudah pernah diproses (baris tanggal ganda), 
  // jangan timpa data yang sudah lebih baik dengan data yang lebih buruk
  if (Records[qid] && Records[qid].tahunPrecision !== undefined) {
    // sudah ada tanggal tersimpan — putuskan mana yang mau dipakai
    // misal: prioritaskan presisi tahun (YEAR_PRECISION) yang lebih tinggi/spesifik
    if (row.tP && parseInt(row.tP.value) <= Records[qid].tahunPrecision) {
      return; // data lama sudah cukup baik, skip baris ini
    }
  }
  
  // ... proses seperti biasa, simpan/timpa Records[qid]
}
Tanpa penanganan ini, entitas dengan tanggal ganda bisa membuat Records[qid] tertimpa berkali-kali dalam urutan yang tidak Anda kontrol (baris terakhir yang diproses "menang" begitu saja), yang bisa membuat tanggal yang tampil di UI Anda tidak konsisten tiap kali data ditarik ulang.

Ringkasnya: tidak ada data yang hilang dari sisi jumlah entitas selama ORDER BY sudah lengkap (?s ?p ?l), tapi Anda perlu logika de-duplikasi di sisi client karena satu entitas sah menghasilkan >1 baris.


'use strict'; const CHUNK_SIZE = 35; var currentRenderIndex = 0; var currentFilteredRecords = []; var isFilterEventAttached = false; // Fungsi pembelah array menjadi potongan kecil (Batching) function potongJadiKelompok(array, ukuran) { let hasilPotongan = []; for (let i = 0; i < ar

pasted

Ulang lagi SPARQL yang saya sudah perbarui, fungsi baru yang harus di tambahkan di JS 1, dan apa yang harus saya ubah/sinkronkan disini:


Merancang ulang SPARQL dengan paginasi dan sinkronisasi fungsi JavaScript
Merancang ulang SPARQL dengan paginasi dan sinkronisasi fungsi JavaScript
Baik, saya susun ulang semuanya secara lengkap dan sinkron dengan kode JS 2 (yang barusan Anda kirim) — sekaligus saya perbaiki satu bug baru yang saya temukan di logika berhenti (stopping condition) pagination, terkait masalah 5100-baris yang kita bahas sebelumnya.

1. SPARQL final (ganti KUMPULAN_KUERI_0['universal'])
sparql
SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?lLabel ?tM ?tP
WHERE {
  {
    SELECT DISTINCT ?s ?p ?l WHERE {
      VALUES ?j { <PLACEHOLDER_JENIS> }
      <PLACEHOLDER_KURUNG_BUKA>
      <PLACEHOLDER_WILAYAH_1>
      ?s wdt:P31 ?j ;
         wdt:<PLACEHOLDER_PROP_LOKASI> ?l .
      <PLACEHOLDER_HIERARKI_LOKASI>
      <PLACEHOLDER_KURUNG_TUTUP>
      <PLACEHOLDER_UNION_EKSTRA>
    }
    ORDER BY ?s ?p ?l
    <PLACEHOLDER_LIMIT_OFFSET>
  }
  OPTIONAL {
    ?s p:<PLACEHOLDER_PROP_TAHUN> ?iS .
    ?iS psv:<PLACEHOLDER_PROP_TAHUN> ?iN .
    ?iN wikibase:timeValue ?tM ;
        wikibase:timePrecision ?tP .
  }
  BIND(SUBSTR(STR(?s), 32) AS ?SQ) .
  BIND(SUBSTR(STR(?p), 32) AS ?PQ) .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id". }
}`,

'khusus_negara_all': `SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?lLabel ?tM ?tP
WHERE {
<PLACEHOLDER_FILTER_NASIONAL>
?s wdt:P31 ?j .
VALUES ?j { <PLACEHOLDER_JENIS> }
OPTIONAL {
?p wdt:P31 wd:Q5098 .
?s wdt:<PLACEHOLDER_PROP_LOKASI> ?l .
?l wdt:P131* ?p .
}
OPTIONAL {
?s p:<PLACEHOLDER_PROP_TAHUN> ?iS .
?iS psv:<PLACEHOLDER_PROP_TAHUN> ?iN .
?iN wikibase:timeValue ?tM ;
    wikibase:timePrecision ?tP .
}
BIND(SUBSTR(STR(?s), 32) AS ?SQ) .
BIND(SUBSTR(STR(?p), 32) AS ?PQ) .
SERVICE wikibase:label { bd:serviceParam wikibase:language "id". }
}`
};

const KUMPULAN_KUERI_1 = {
'universal': `SELECT DISTINCT ?siteQid ?coord WHERE {
VALUES ?site { <PLACEHOLDER_QIDS> }
<PLACEHOLDER_KLAUSA_KOORDINAT>
?coordStatement ps:P625 ?coord .
FILTER NOT EXISTS { ?coordStatement pq:P518 ?x }
BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
}`
};

const SPARQL_QUERY_3_TEMPLATE =
`SELECT ?siteQid (SAMPLE(?imgUtama) AS ?image) (SAMPLE(?wikiTitle) AS ?wikipediaUrlTitle) WHERE {
  VALUES ?site { <PLACEHOLDER_QIDS> }
  OPTIONAL {
    ?site p:P18 ?imageStatement .
    ?imageStatement ps:P18 ?imgUtama .
    FILTER NOT EXISTS { ?imageStatement pq:P3831 wd:Q16189205 }
    FILTER NOT EXISTS { ?imageStatement pq:P180 wd:Q192630 }
  }
  OPTIONAL {
    ?wikipedia schema:about ?site ;
               schema:isPartOf <https://id.wikipedia.org/> .
    BIND (SUBSTR(STR(?wikipedia), 31) AS ?wikiTitle) .
  }
  BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
} GROUP BY ?siteQid`;

function getSparqlQuery4(qid) {
return `SELECT ?siteQid ?eventLabel ?pointInTime ?ptPrecision ?startTime ?stPrecision ?endTime ?etPrecision WHERE {
VALUES ?site { wd:${qid} }
?site p:P793 ?eventStatement .
?eventStatement ps:P793 ?event .
?event rdfs:label ?eventLabel . 
FILTER(LANG(?eventLabel) = "id") .
OPTIONAL { 
?eventStatement pqv:P585 ?ptNode .
?ptNode wikibase:timeValue ?pointInTime ;
        wikibase:timePrecision ?ptPrecision .
}
OPTIONAL { 
?eventStatement pqv:P580 ?stNode .
?stNode wikibase:timeValue ?startTime ;
        wikibase:timePrecision ?stPrecision .
}
OPTIONAL { 
?eventStatement pqv:P582 ?etNode .
?etNode wikibase:timeValue ?endTime ;
        wikibase:timePrecision ?etPrecision .
}
BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
}`;
}

function getSparqlQuery5(qid) {
return `SELECT ?siteQid ?vicinityImage ?vicinityCaption ?pastImage ?pastCaption ?interiorImage ?interiorCaption ?commonsCat WHERE {
VALUES ?site { wd:${qid} }
OPTIONAL { ?site wdt:P373 ?commonsCat . }
OPTIONAL {
?site p:P18 ?vicinityStatement .
?vicinityStatement ps:P18 ?vicinityImage .
FILTER EXISTS { ?vicinityStatement pq:P3831 wd:Q16189205 }
OPTIONAL {
?vicinityStatement pq:P2096 ?vicinityCaption .
FILTER(LANG(?vicinityCaption) = "id")
}
}
OPTIONAL {
?site p:P18 ?pastImgStmt .
?pastImgStmt ps:P18 ?pastImage .
?pastImgStmt pq:P180 wd:Q192630 .
OPTIONAL {
?pastImgStmt pq:P2096 ?pastCaption .
FILTER(LANG(?pastCaption) = "id")
}
}
OPTIONAL {
?site p:P5775 ?interiorStmt .
?interiorStmt ps:P5775 ?interiorImage .
OPTIONAL {
?interiorStmt pq:P2096 ?interiorCaption .
FILTER(LANG(?interiorCaption) = "id")
}
}
BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
} LIMIT 1`;
}

function getSparqlQuery6(qid) {
  let klaster = typeof currentNamaKlaster !== 'undefined' ? currentNamaKlaster : 'Objek';

  // 1. Data Universal (Semua Klaster Bisa Punya)
  // Perhatikan ?luasData sekarang berupa gabungan "Angka|Satuan|KeteranganP518"
let selectClause = `SELECT ?siteQid (GROUP_CONCAT(DISTINCT ?tipeLabel; SEPARATOR=", ") AS ?tipeList) (SAMPLE(?ketinggianVal) AS ?ketinggian) (SAMPLE(?luasData) AS ?luas) `;
let whereClause = `
  VALUES ?site { wd:${qid} }
  OPTIONAL {
    ?site wdt:P31 ?tipeVal .
    ?tipeVal rdfs:label ?tipeLabel .
    FILTER(LANG(?tipeLabel) = "id")
  }
  OPTIONAL { ?site wdt:P2044 ?ketinggianVal . }
  OPTIONAL {
    ?site p:P2046 ?luasStmt .
    ?luasStmt psv:P2046 ?luasNode .
    ?luasNode wikibase:quantityAmount ?luasVal .
    OPTIONAL { 
      ?luasNode wikibase:quantityUnit ?luasUnitItem . 
      ?luasUnitItem rdfs:label ?luasUnitLabel . 
      FILTER(LANG(?luasUnitLabel) = "id") 
    }
    OPTIONAL { 
      ?luasStmt pq:P518 ?luasBagianItem . 
      ?luasBagianItem rdfs:label ?luasBagianLabel . 
      FILTER(LANG(?luasBagianLabel) = "id") 
    }
    BIND(CONCAT(STR(?luasVal), "|", IF(BOUND(?luasUnitLabel), ?luasUnitLabel, ""), "|", IF(BOUND(?luasBagianLabel), ?luasBagianLabel, "")) AS ?luasData)
  }
`;

  // 2. KLASTER BANGUNAN & FASILITAS
  const klasterBangunan = [
    'Masjid', 'Bangunan bersejarah', 'Gereja & katedral', 'Vihara & kelenteng', 
    'Rumah sakit', 'Universitas & kampus', 'Perpustakaan', 'Istana', 'Bandar udara', 
    'Terminal bus', 'Stadion & lapangan olahraga', 'Kuil & candi', 'Benteng dan bunker', 
    'Pasar dan mall', 'Hotel dan resor', 'Monumen, patung, & memorial', 'Museum', 'Stasiun kereta api'
  ];
  
  if (klasterBangunan.includes(klaster)) {
    selectClause += `(SAMPLE(?kapasitasVal) AS ?kapasitas) (SAMPLE(?kondisiLabel) AS ?kondisi) (SAMPLE(?webVal) AS ?lamanResmi) (SAMPLE(?arsitekLabel) AS ?arsitek) (GROUP_CONCAT(DISTINCT ?fasilitasLabel; separator=", ") AS ?fasilitasList) (GROUP_CONCAT(DISTINCT ?gayaLabel; separator=", ") AS ?gayaList) `;
    whereClause += `
      OPTIONAL { ?site wdt:P1083 ?kapasitasVal . }
      OPTIONAL { ?site wdt:P5817 ?kondisiItem . ?kondisiItem rdfs:label ?kondisiLabel . FILTER(LANG(?kondisiLabel) = "id") }
      OPTIONAL { ?site wdt:P856 ?webVal . }
      OPTIONAL { ?site wdt:P84 ?arsitekItem . ?arsitekItem rdfs:label ?arsitekLabel . FILTER(LANG(?arsitekLabel) = "id") }
      OPTIONAL { ?site wdt:P912 ?fasilitasItem . ?fasilitasItem rdfs:label ?fasilitasLabel . FILTER(LANG(?fasilitasLabel) = "id") }
      OPTIONAL { ?site wdt:P149 ?gayaItem . ?gayaItem rdfs:label ?gayaLabel . FILTER(LANG(?gayaLabel) = "id") }
    `;
  }

  // 3. KONDISI KHUSUS PER KLASTER
if (klaster === 'Wilayah Administratif') {
    selectClause += `(SAMPLE(?popData) AS ?populasi) (SAMPLE(?govData) AS ?kepalaDaerah) (SAMPLE(?webVal) AS ?lamanResmi) `;
    whereClause += `
      OPTIONAL { ?site wdt:P856 ?webVal . }
      OPTIONAL {
        ?site p:P1082 ?popStmt . ?popStmt ps:P1082 ?popVal .
        OPTIONAL { ?popStmt pq:P585 ?popDate . }
        BIND(CONCAT(STR(?popVal), "|", STR(YEAR(?popDate))) AS ?popData)
      }
      OPTIONAL {
        ?site p:P6 ?govStmt . ?govStmt ps:P6 ?govItem . 
        ?govItem rdfs:label ?govLabel . FILTER(LANG(?govLabel) = "id")
        OPTIONAL { ?govStmt pq:P580 ?govDate . }
        
        # Lacak artikel Wikipedia Bahasa Indonesia untuk tokoh ini
        OPTIONAL {
          ?govWiki schema:about ?govItem ;
                   schema:isPartOf <https://id.wikipedia.org/> .
        }
        
        # Gabungkan Data: Nama | Tahun | URL (Jika tidak ada URL, isi dengan kata "kosong")
        BIND(CONCAT(STR(?govLabel), "|", STR(YEAR(?govDate)), "|", IF(BOUND(?govWiki), STR(?govWiki), "kosong")) AS ?govData)
      }
    `;
  }
  else if (klaster === 'Stasiun kereta api') {
    selectClause += `(GROUP_CONCAT(DISTINCT ?jalurLabel; separator=", ") AS ?jalurList) `;
    whereClause += `OPTIONAL { ?site wdt:P81 ?jalurItem . ?jalurItem rdfs:label ?jalurLabel . FILTER(LANG(?jalurLabel) = "id") }`;
  }
  else if (klaster === 'Museum') {
    selectClause += `(SAMPLE(?koleksiData) AS ?jumlahKoleksi) (GROUP_CONCAT(DISTINCT ?spesialisasiLabel; separator=", ") AS ?spesialisasiList) `;
    whereClause += `
      OPTIONAL {
        ?site p:P1436 ?koleksiStmt .
        ?koleksiStmt psv:P1436 ?koleksiNode .
        ?koleksiNode wikibase:quantityAmount ?koleksiVal .
        OPTIONAL { 
          ?koleksiNode wikibase:quantityUnit ?koleksiUnitItem . 
          ?koleksiUnitItem rdfs:label ?koleksiUnitLabel . 
          FILTER(LANG(?koleksiUnitLabel) = "id") 
        }
        BIND(CONCAT(STR(?koleksiVal), "|", IF(BOUND(?koleksiUnitLabel), ?koleksiUnitLabel, "")) AS ?koleksiData)
      }
      OPTIONAL { ?site wdt:P101 ?spesialisasiItem . ?spesialisasiItem rdfs:label ?spesialisasiLabel . FILTER(LANG(?spesialisasiLabel) = "id") }
    `;
  }

  // ==========================================
  // BLOK 1: PENEMUAN ARKEOLOGI
  // ==========================================
  if (['Prasasti', 'Situs arkeologi', 'Artefak'].includes(klaster)) {
    selectClause += `(SAMPLE(?tglTemuData) AS ?tglTemu) (SAMPLE(?tempatTemuLabel) AS ?tempatTemu) `;
    whereClause += `
      OPTIONAL {
        ?site p:P575 ?tglTemuStmt .
        ?tglTemuStmt psv:P575 ?tglTemuNode .
        ?tglTemuNode wikibase:timeValue ?tglTemuVal ; 
                     wikibase:timePrecision ?tglTemuPrec .
        BIND(CONCAT(STR(?tglTemuVal), "|", STR(?tglTemuPrec)) AS ?tglTemuData)
      }
      OPTIONAL { ?site wdt:P189 ?tempatTemuItem . ?tempatTemuItem rdfs:label ?tempatTemuLabel . FILTER(LANG(?tempatTemuLabel) = "id") }
    `;
  }

  if (['Situs arkeologi'].includes(klaster)) {
    selectClause += `(GROUP_CONCAT(DISTINCT ?agamaLabel; separator=", ") AS ?agamaList) `;
    whereClause += `
      OPTIONAL { ?site wdt:P140 ?agamaItem . ?agamaItem rdfs:label ?agamaLabel . FILTER(LANG(?agamaLabel) = "id") }
    `;
  }

  // ==========================================
  // BLOK BARU: BAGIAN DARI (P361)
  // ==========================================
  if (['Pulau', 'Peristiwa lainnya', 'Perang & konflik', 'Bencana lainnya', 'Situs arkeologi', 'Prasasti', 'Artefak'].includes(klaster)) {
    selectClause += `(SAMPLE(?bagianDariLabel) AS ?bagianDari) `;
    whereClause += `
      OPTIONAL { ?site wdt:P361 ?bagianDariItem . ?bagianDariItem rdfs:label ?bagianDariLabel . FILTER(LANG(?bagianDariLabel) = "id") }
    `;
  }
  
  // ==========================================
  // BLOK 2: KARYA & LITERATUR
  // ==========================================
if (['Prasasti', 'Lontar', 'Naskah', 'Media massa', 'Publikasi', 'Latar karya sastra', 'Lukisan'].includes(klaster)) {
    selectClause += `(GROUP_CONCAT(DISTINCT ?bhsLabel; separator=", ") AS ?bahasaList) (GROUP_CONCAT(DISTINCT ?bentukLabel; separator=", ") AS ?bentukList) (GROUP_CONCAT(DISTINCT ?genreLabel; separator=", ") AS ?genreList) (GROUP_CONCAT(DISTINCT ?penulisLabel; separator=", ") AS ?penulisList) (GROUP_CONCAT(DISTINCT ?subjekLabel; separator=", ") AS ?subjekList) `;
    whereClause += `
      OPTIONAL { ?site wdt:P407 ?bhsItem . ?bhsItem rdfs:label ?bhsLabel . FILTER(LANG(?bhsLabel) = "id") }
      OPTIONAL { ?site wdt:P7937 ?bentukItem . ?bentukItem rdfs:label ?bentukLabel . FILTER(LANG(?bentukLabel) = "id") }
      # Genre (P136)
      OPTIONAL { ?site wdt:P136 ?genreItem . ?genreItem rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "id") }
      OPTIONAL { ?site wdt:P50 ?penulisItem . ?penulisItem rdfs:label ?penulisLabel . FILTER(LANG(?penulisLabel) = "id") }
      OPTIONAL { ?site wdt:P921 ?subjekItem . ?subjekItem rdfs:label ?subjekLabel . FILTER(LANG(?subjekLabel) = "id") }
    `;
  }

  // ==========================================
  // BLOK 3: KHUSUS KOLEKSI
  // ==========================================
  if (['Prasasti', 'Artefak', 'Lontar', 'Naskah', 'Lukisan'].includes(klaster)) {
    selectClause += `(GROUP_CONCAT(DISTINCT ?kolektorLabel; separator=", ") AS ?kolektorList) `;
    whereClause += `
      OPTIONAL { ?site wdt:P195 ?kolektorItem . ?kolektorItem rdfs:label ?kolektorLabel . FILTER(LANG(?kolektorLabel) = "id") }
    `;
  }

  // ==========================================
  // BLOK 4: ATRIBUT FISIK, MATERIAL & PENCIPTA (BARU)
  // ==========================================
if (['Prasasti', 'Situs arkeologi', 'Artefak', 'Lontar', 'Naskah', 'Lukisan'].includes(klaster)) {
    // Tambahkan ?lebar pada selectClause
    selectClause += `(SAMPLE(?penciptaLabel) AS ?pencipta) (SAMPLE(?panjangData) AS ?panjang) (SAMPLE(?lebarData) AS ?lebar) (SAMPLE(?tinggiData) AS ?tinggi) (GROUP_CONCAT(DISTINCT ?bahanLabel; separator=", ") AS ?bahanList) (GROUP_CONCAT(DISTINCT ?aksaraLabel; separator=", ") AS ?aksaraList) `;
    
    whereClause += `
      # Pencipta (P170)
      OPTIONAL { ?site wdt:P170 ?penciptaItem . ?penciptaItem rdfs:label ?penciptaLabel . FILTER(LANG(?penciptaLabel) = "id") }
      
      # Panjang (P2043) + Satuan
      OPTIONAL {
        ?site p:P2043 ?pjgStmt .
        ?pjgStmt psv:P2043 ?pjgNode .
        ?pjgNode wikibase:quantityAmount ?pjgVal .
        OPTIONAL { 
          ?pjgNode wikibase:quantityUnit ?pjgUnitItem . 
          ?pjgUnitItem rdfs:label ?pjgUnitLabel . 
          FILTER(LANG(?pjgUnitLabel) = "id") 
        }
        BIND(CONCAT(STR(?pjgVal), "|", IF(BOUND(?pjgUnitLabel), ?pjgUnitLabel, "")) AS ?panjangData)
      }

      # Lebar (P2049) + Satuan
      OPTIONAL {
        ?site p:P2049 ?lbrStmt .
        ?lbrStmt psv:P2049 ?lbrNode .
        ?lbrNode wikibase:quantityAmount ?lbrVal .
        OPTIONAL { 
          ?lbrNode wikibase:quantityUnit ?lbrUnitItem . 
          ?lbrUnitItem rdfs:label ?lbrUnitLabel . 
          FILTER(LANG(?lbrUnitLabel) = "id") 
        }
        BIND(CONCAT(STR(?lbrVal), "|", IF(BOUND(?lbrUnitLabel), ?lbrUnitLabel, "")) AS ?lebarData)
      }

      # Tinggi (P2048) + Satuan
      OPTIONAL {
        ?site p:P2048 ?tgStmt .
        ?tgStmt psv:P2048 ?tgNode .
        ?tgNode wikibase:quantityAmount ?tgVal .
        OPTIONAL { 
          ?tgNode wikibase:quantityUnit ?tgUnitItem . 
          ?tgUnitItem rdfs:label ?tgUnitLabel . 
          FILTER(LANG(?tgUnitLabel) = "id") 
        }
        BIND(CONCAT(STR(?tgVal), "|", IF(BOUND(?tgUnitLabel), ?tgUnitLabel, "")) AS ?tinggiData)
      }

      # Bahan yang digunakan (P186)
      OPTIONAL { ?site wdt:P186 ?bahanItem . ?bahanItem rdfs:label ?bahanLabel . FILTER(LANG(?bahanLabel) = "id") }

      # Sistem penulisan (P282)
      OPTIONAL { ?site wdt:P282 ?aksaraItem . ?aksaraItem rdfs:label ?aksaraLabel . FILTER(LANG(?aksaraLabel) = "id") }
    `;
  }

  // ==========================================
  // BLOK LAINNYA
  // ==========================================
if (klaster === 'Media massa') {
    selectClause += `(GROUP_CONCAT(DISTINCT ?pemredLabel; separator=", ") AS ?pemredList) (GROUP_CONCAT(DISTINCT ?pendiriLabel; separator=", ") AS ?pendiriList) (SAMPLE(?penerbitLabel) AS ?penerbit) (SAMPLE(?berakhirData) AS ?berakhirPada) `;
    whereClause += `
      OPTIONAL { ?site wdt:P5769 ?pemredItem . ?pemredItem rdfs:label ?pemredLabel . FILTER(LANG(?pemredLabel) = "id") }
      OPTIONAL { ?site wdt:P112 ?pendiriItem . ?pendiriItem rdfs:label ?pendiriLabel . FILTER(LANG(?pendiriLabel) = "id") }
      OPTIONAL { ?site wdt:P123 ?penerbitItem . ?penerbitItem rdfs:label ?penerbitLabel . FILTER(LANG(?penerbitLabel) = "id") }
      
      # Berakhir pada (P582)
      OPTIONAL {
        ?site p:P582 ?berakhirStmt .
        ?berakhirStmt psv:P582 ?berakhirNode .
        ?berakhirNode wikibase:timeValue ?berakhirVal ; 
                      wikibase:timePrecision ?berakhirPrec .
        BIND(CONCAT(STR(?berakhirVal), "|", STR(?berakhirPrec)) AS ?berakhirData)
      }
    `;
  }
  else if (klaster === 'Hidangan') {
    selectClause += `(GROUP_CONCAT(DISTINCT ?bahanLabel; separator=", ") AS ?bahanList) (GROUP_CONCAT(DISTINCT ?caraLabel; separator=", ") AS ?caraList) (SAMPLE(?wikibooksUrl) AS ?wikibooks) `;
    whereClause += `
      OPTIONAL { ?site wdt:P186 ?bahanItem . ?bahanItem rdfs:label ?bahanLabel . FILTER(LANG(?bahanLabel) = "id") }
      OPTIONAL { ?site wdt:P2079 ?caraItem . ?caraItem rdfs:label ?caraLabel . FILTER(LANG(?caraLabel) = "id") }
      OPTIONAL {
        ?wikibooksUrl schema:about ?site ;
                      schema:isPartOf <https://id.wikibooks.org/> .
      }
    `;
  }
  else if (klaster === 'Bahasa') {
    selectClause += `(SAMPLE(?penuturData) AS ?penutur) `;
    whereClause += `
      OPTIONAL {
        ?site p:P1098 ?penuturStmt . ?penuturStmt ps:P1098 ?penuturVal .
        OPTIONAL { ?penuturStmt pq:P585 ?penuturDate . }
        BIND(CONCAT(STR(?penuturVal), "|", STR(YEAR(?penuturDate))) AS ?penuturData)
      }
    `;
  }
else if (klaster === 'Tokoh') {
    selectClause += `(SAMPLE(?wafatData) AS ?tglWafat) (GROUP_CONCAT(DISTINCT ?kerjaLabel; separator=", ") AS ?pekerjaanList) (GROUP_CONCAT(DISTINCT ?ahliLabel; separator=", ") AS ?spesialisasiList) (GROUP_CONCAT(DISTINCT ?koleksiKaryaLabel; separator=", ") AS ?koleksiKaryaList) `;
    whereClause += `
      OPTIONAL {
        ?site p:P570 ?wafatStmt .
        ?wafatStmt psv:P570 ?wafatNode .
        ?wafatNode wikibase:timeValue ?wafatVal ; 
                   wikibase:timePrecision ?wafatPrec .
        BIND(CONCAT(STR(?wafatVal), "|", STR(?wafatPrec)) AS ?wafatData)
      }
      OPTIONAL { ?site wdt:P106 ?kerjaItem . ?kerjaItem rdfs:label ?kerjaLabel . FILTER(LANG(?kerjaLabel) = "id") }
      OPTIONAL { ?site wdt:P101 ?ahliItem . ?ahliItem rdfs:label ?ahliLabel . FILTER(LANG(?ahliLabel) = "id") }
      
      # Memiliki karya yang disimpan dalam koleksi (P6379)
      OPTIONAL { ?site wdt:P6379 ?koleksiKaryaItem . ?koleksiKaryaItem rdfs:label ?koleksiKaryaLabel . FILTER(LANG(?koleksiKaryaLabel) = "id") }
    `;
  }
  else if (klaster === 'Gunung') {
    selectClause += `(SAMPLE(?gunungLabel) AS ?pegunungan) `;
    whereClause += `OPTIONAL { ?site wdt:P4552 ?gunungItem . ?gunungItem rdfs:label ?gunungLabel . FILTER(LANG(?gunungLabel) = "id") }`;
  }
  
  if (['Gempa bumi', 'Bencana lainnya', 'Peristiwa lainnya', 'Perang & konflik'].includes(klaster)) {
    selectClause += `(SAMPLE(?korbanVal) AS ?korban) `;
    whereClause += `OPTIONAL { ?site wdt:P1120 ?korbanVal . }`;
  }

  return `${selectClause} WHERE { ${whereClause} BIND (SUBSTR(STR(?site), 32) AS ?siteQid) } GROUP BY ?siteQid`;
}

const ABOUT_SPARQL_QUERY = ``;
