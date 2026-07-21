'use strict';
const BASE_TITLE = 'WikiJelajah';

// ========================================================================
// KAMUS ATURAN (DATA-DRIVEN CONFIGURATION)
// Mengatur label prefix di antarmuka dan blok kueri apa yang harus ditarik
// ========================================================================
const KategoriAturan = {
  "umum":          { prefixLokasi: "Letak", prefixTahun: "Tahun", blokSPARQL: [] },
  "bangunan":      { prefixLokasi: "Letak", prefixTahun: "Didirikan", blokSPARQL: ["bangunan"] },
  "wilayah_admin": { prefixLokasi: "Provinsi", prefixTahun: "Hari jadi", blokSPARQL: ["wilayah"] },
  "tokoh":         { prefixLokasi: "Tempat lahir", prefixTahun: "Lahir", blokSPARQL: ["tokoh"] },
  "latar_karya":   { prefixLokasi: "Latar", prefixTahun: "Terbit perdana", blokSPARQL: ["karya"] },
  "publikasi":     { prefixLokasi: "Tempat terbit", prefixTahun: "Terbit perdana", blokSPARQL: ["karya"] },
  "media_massa":   { prefixLokasi: "Tempat terbit", prefixTahun: "Terbit perdana", blokSPARQL: ["karya", "media"] },
  "lukisan":       { prefixLokasi: "Koleksi", prefixTahun: "Dilukis", blokSPARQL: ["karya", "koleksi", "karya_fisik"] },
  "naskah":        { prefixLokasi: "Koleksi", prefixTahun: "Ditulis", blokSPARQL: ["karya", "koleksi", "karya_fisik"] },
  "bencana":       { prefixLokasi: "Pusat kejadian/terdampak", prefixTahun: "Pada", blokSPARQL: ["korban", "bagian_dari"] },
  "peristiwa":     { prefixLokasi: "Pusat kejadian/terdampak", prefixTahun: "Pada", blokSPARQL: ["korban", "bagian_dari"] },
  "artefak":       { prefixLokasi: "Lokasi sekarang", prefixTahun: "Tarikh", blokSPARQL: ["karya_fisik", "penemuan", "koleksi", "bagian_dari"] },
  "situs_ark":     { prefixLokasi: "Letak", prefixTahun: "Era/periode", blokSPARQL: ["penemuan", "agama", "bagian_dari", "karya_fisik"] },
  "stasiun":       { prefixLokasi: "Letak", prefixTahun: "Didirikan", blokSPARQL: ["bangunan", "stasiun"] },
  "museum":        { prefixLokasi: "Letak", prefixTahun: "Didirikan", blokSPARQL: ["bangunan", "museum"] },
  "hidangan":      { prefixLokasi: "Hidangan khas", prefixTahun: "Diciptakan", blokSPARQL: ["hidangan"] },
  "bahasa":        { prefixLokasi: "Wilayah penutur utama", prefixTahun: "Tahun", blokSPARQL: ["bahasa"] },
  "gunung":        { prefixLokasi: "Letak", prefixTahun: "Tahun", blokSPARQL: ["gunung"] },
  "budaya":        { prefixLokasi: "Khas", prefixTahun: "Tahun", blokSPARQL: [] }
};

const KUMPULAN_KUERI_0 = {
'universal': `SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?LQ ?lLabel ?tM ?tP
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
  BIND(SUBSTR(STR(?l), 32) AS ?LQ)
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
}`,

'apapun': `SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?LQ ?lLabel ?tM ?tP
WHERE {
  {
    SELECT DISTINCT ?s ?p ?l WHERE {
      <PLACEHOLDER_KURUNG_BUKA>
      <PLACEHOLDER_WILAYAH_1>
      
      # Syarat Mutlak: Di Indonesia, Punya Koordinat, Punya Gambar
      ?s wdt:P17 wd:Q252 ;
         wdt:P625 [] ;
         wdt:P18 [] ;
         wdt:P131 ?l .
         
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
  BIND(SUBSTR(STR(?l), 32) AS ?LQ)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id". }
}`,
'luar_negeri': `SELECT DISTINCT ?SQ ?sLabel ?PQ ?pLabel ?LQ ?lLabel ?tM ?tP
WHERE {
  {
    SELECT DISTINCT ?s ?p ?l WHERE {
      VALUES ?j { <PLACEHOLDER_JENIS> }
      
      # 1. WAJIB: Cari entitas yang negaranya adalah terpilih, dan catat lokasi spesifiknya di ?l
      ?s wdt:P17 <PLACEHOLDER_NEGARA> ;
         wdt:P31 ?j ;
         wdt:<PLACEHOLDER_PROP_LOKASI> ?l .
         
      # 2. OPSIONAL: Evaluasi Bottom-Up (Lokasi ke Negara)
      OPTIONAL {
        ?l wdt:P131* ?p .
        ?p wdt:P131 <PLACEHOLDER_NEGARA> .
      }
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
  BIND(SUBSTR(STR(?l), 32) AS ?LQ)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en". }
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

// ========================================================================
// REPOSITORI BLOK SPARQL (LEGO BLOCKS)
// ========================================================================
const SPARQL_BLOCKS = {
  bangunan: {
    select: `(SAMPLE(?kapasitasVal) AS ?kapasitas) (SAMPLE(?kondisiLabel) AS ?kondisi) (SAMPLE(?webVal) AS ?lamanResmi) (SAMPLE(?arsitekLabel) AS ?arsitek) (GROUP_CONCAT(DISTINCT ?fasilitasLabel; separator=", ") AS ?fasilitasList) (GROUP_CONCAT(DISTINCT ?gayaLabel; separator=", ") AS ?gayaList)`,
    where: `
      OPTIONAL { ?site wdt:P1083 ?kapasitasVal . }
      OPTIONAL { ?site wdt:P5817 ?kondisiItem . ?kondisiItem rdfs:label ?kondisiLabel . FILTER(LANG(?kondisiLabel) = "id") }
      OPTIONAL { ?site wdt:P856 ?webVal . }
      OPTIONAL { ?site wdt:P84 ?arsitekItem . ?arsitekItem rdfs:label ?arsitekLabel . FILTER(LANG(?arsitekLabel) = "id") }
      OPTIONAL { ?site wdt:P912 ?fasilitasItem . ?fasilitasItem rdfs:label ?fasilitasLabel . FILTER(LANG(?fasilitasLabel) = "id") }
      OPTIONAL { ?site wdt:P149 ?gayaItem . ?gayaItem rdfs:label ?gayaLabel . FILTER(LANG(?gayaLabel) = "id") }
    `
  },
  wilayah: {
    select: `(SAMPLE(?popData) AS ?populasi) (SAMPLE(?govData) AS ?kepalaDaerah) (SAMPLE(?webVal) AS ?lamanResmi)`,
    where: `
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
        OPTIONAL { ?govWiki schema:about ?govItem ; schema:isPartOf <https://id.wikipedia.org/> . }
        BIND(CONCAT(STR(?govLabel), "|", STR(YEAR(?govDate)), "|", IF(BOUND(?govWiki), STR(?govWiki), "kosong")) AS ?govData)
      }
    `
  },
  stasiun: {
    select: `(GROUP_CONCAT(DISTINCT ?jalurLabel; separator=", ") AS ?jalurList)`,
    where: `OPTIONAL { ?site wdt:P81 ?jalurItem . ?jalurItem rdfs:label ?jalurLabel . FILTER(LANG(?jalurLabel) = "id") }`
  },
  museum: {
    select: `(SAMPLE(?koleksiData) AS ?jumlahKoleksi) (GROUP_CONCAT(DISTINCT ?spesialisasiLabel; separator=", ") AS ?spesialisasiList)`,
    where: `
      OPTIONAL {
        ?site p:P1436 ?koleksiStmt . ?koleksiStmt psv:P1436 ?koleksiNode . ?koleksiNode wikibase:quantityAmount ?koleksiVal .
        OPTIONAL { ?koleksiNode wikibase:quantityUnit ?koleksiUnitItem . ?koleksiUnitItem rdfs:label ?koleksiUnitLabel . FILTER(LANG(?koleksiUnitLabel) = "id") }
        BIND(CONCAT(STR(?koleksiVal), "|", IF(BOUND(?koleksiUnitLabel), ?koleksiUnitLabel, "")) AS ?koleksiData)
      }
      OPTIONAL { ?site wdt:P101 ?spesialisasiItem . ?spesialisasiItem rdfs:label ?spesialisasiLabel . FILTER(LANG(?spesialisasiLabel) = "id") }
    `
  },
  penemuan: {
    select: `(SAMPLE(?tglTemuData) AS ?tglTemu) (SAMPLE(?tempatTemuLabel) AS ?tempatTemu)`,
    where: `
      OPTIONAL {
        ?site p:P575 ?tglTemuStmt . ?tglTemuStmt psv:P575 ?tglTemuNode .
        ?tglTemuNode wikibase:timeValue ?tglTemuVal ; wikibase:timePrecision ?tglTemuPrec .
        BIND(CONCAT(STR(?tglTemuVal), "|", STR(?tglTemuPrec)) AS ?tglTemuData)
      }
      OPTIONAL { ?site wdt:P189 ?tempatTemuItem . ?tempatTemuItem rdfs:label ?tempatTemuLabel . FILTER(LANG(?tempatTemuLabel) = "id") }
    `
  },
  agama: {
    select: `(GROUP_CONCAT(DISTINCT ?agamaLabel; separator=", ") AS ?agamaList)`,
    where: `OPTIONAL { ?site wdt:P140 ?agamaItem . ?agamaItem rdfs:label ?agamaLabel . FILTER(LANG(?agamaLabel) = "id") }`
  },
  bagian_dari: {
    select: `(SAMPLE(?bagianDariLabel) AS ?bagianDari)`,
    where: `OPTIONAL { ?site wdt:P361 ?bagianDariItem . ?bagianDariItem rdfs:label ?bagianDariLabel . FILTER(LANG(?bagianDariLabel) = "id") }`
  },
  karya: {
    select: `(GROUP_CONCAT(DISTINCT ?bhsLabel; separator=", ") AS ?bahasaList) (GROUP_CONCAT(DISTINCT ?bentukLabel; separator=", ") AS ?bentukList) (GROUP_CONCAT(DISTINCT ?genreLabel; separator=", ") AS ?genreList) (GROUP_CONCAT(DISTINCT ?penulisLabel; separator=", ") AS ?penulisList) (GROUP_CONCAT(DISTINCT ?subjekLabel; separator=", ") AS ?subjekList)`,
    where: `
      OPTIONAL { ?site wdt:P407 ?bhsItem . ?bhsItem rdfs:label ?bhsLabel . FILTER(LANG(?bhsLabel) = "id") }
      OPTIONAL { ?site wdt:P7937 ?bentukItem . ?bentukItem rdfs:label ?bentukLabel . FILTER(LANG(?bentukLabel) = "id") }
      OPTIONAL { ?site wdt:P136 ?genreItem . ?genreItem rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "id") }
      OPTIONAL { ?site wdt:P50 ?penulisItem . ?penulisItem rdfs:label ?penulisLabel . FILTER(LANG(?penulisLabel) = "id") }
      OPTIONAL { ?site wdt:P921 ?subjekItem . ?subjekItem rdfs:label ?subjekLabel . FILTER(LANG(?subjekLabel) = "id") }
    `
  },
  koleksi: {
    select: `(GROUP_CONCAT(DISTINCT ?kolektorLabel; separator=", ") AS ?kolektorList)`,
    where: `OPTIONAL { ?site wdt:P195 ?kolektorItem . ?kolektorItem rdfs:label ?kolektorLabel . FILTER(LANG(?kolektorLabel) = "id") }`
  },
  karya_fisik: {
    select: `(SAMPLE(?penciptaLabel) AS ?pencipta) (SAMPLE(?panjangData) AS ?panjang) (SAMPLE(?lebarData) AS ?lebar) (SAMPLE(?tinggiData) AS ?tinggi) (GROUP_CONCAT(DISTINCT ?bahanLabel; separator=", ") AS ?bahanList) (GROUP_CONCAT(DISTINCT ?aksaraLabel; separator=", ") AS ?aksaraList)`,
    where: `
      OPTIONAL { ?site wdt:P170 ?penciptaItem . ?penciptaItem rdfs:label ?penciptaLabel . FILTER(LANG(?penciptaLabel) = "id") }
      OPTIONAL { ?site p:P2043 ?pjgStmt . ?pjgStmt psv:P2043 ?pjgNode . ?pjgNode wikibase:quantityAmount ?pjgVal . OPTIONAL { ?pjgNode wikibase:quantityUnit ?pjgUnitItem . ?pjgUnitItem rdfs:label ?pjgUnitLabel . FILTER(LANG(?pjgUnitLabel) = "id") } BIND(CONCAT(STR(?pjgVal), "|", IF(BOUND(?pjgUnitLabel), ?pjgUnitLabel, "")) AS ?panjangData) }
      OPTIONAL { ?site p:P2049 ?lbrStmt . ?lbrStmt psv:P2049 ?lbrNode . ?lbrNode wikibase:quantityAmount ?lbrVal . OPTIONAL { ?lbrNode wikibase:quantityUnit ?lbrUnitItem . ?lbrUnitItem rdfs:label ?lbrUnitLabel . FILTER(LANG(?lbrUnitLabel) = "id") } BIND(CONCAT(STR(?lbrVal), "|", IF(BOUND(?lbrUnitLabel), ?lbrUnitLabel, "")) AS ?lebarData) }
      OPTIONAL { ?site p:P2048 ?tgStmt . ?tgStmt psv:P2048 ?tgNode . ?tgNode wikibase:quantityAmount ?tgVal . OPTIONAL { ?tgNode wikibase:quantityUnit ?tgUnitItem . ?tgUnitItem rdfs:label ?tgUnitLabel . FILTER(LANG(?tgUnitLabel) = "id") } BIND(CONCAT(STR(?tgVal), "|", IF(BOUND(?tgUnitLabel), ?tgUnitLabel, "")) AS ?tinggiData) }
      OPTIONAL { ?site wdt:P186 ?bahanItem . ?bahanItem rdfs:label ?bahanLabel . FILTER(LANG(?bahanLabel) = "id") }
      OPTIONAL { ?site wdt:P282 ?aksaraItem . ?aksaraItem rdfs:label ?aksaraLabel . FILTER(LANG(?aksaraLabel) = "id") }
    `
  },
  media: {
    select: `(GROUP_CONCAT(DISTINCT ?pemredLabel; separator=", ") AS ?pemredList) (GROUP_CONCAT(DISTINCT ?pendiriLabel; separator=", ") AS ?pendiriList) (SAMPLE(?penerbitLabel) AS ?penerbit) (SAMPLE(?berakhirData) AS ?berakhirPada)`,
    where: `
      OPTIONAL { ?site wdt:P5769 ?pemredItem . ?pemredItem rdfs:label ?pemredLabel . FILTER(LANG(?pemredLabel) = "id") }
      OPTIONAL { ?site wdt:P112 ?pendiriItem . ?pendiriItem rdfs:label ?pendiriLabel . FILTER(LANG(?pendiriLabel) = "id") }
      OPTIONAL { ?site wdt:P123 ?penerbitItem . ?penerbitItem rdfs:label ?penerbitLabel . FILTER(LANG(?penerbitLabel) = "id") }
      OPTIONAL { ?site p:P582 ?berakhirStmt . ?berakhirStmt psv:P582 ?berakhirNode . ?berakhirNode wikibase:timeValue ?berakhirVal ; wikibase:timePrecision ?berakhirPrec . BIND(CONCAT(STR(?berakhirVal), "|", STR(?berakhirPrec)) AS ?berakhirData) }
    `
  },
  hidangan: {
    select: `(GROUP_CONCAT(DISTINCT ?bahanLabel; separator=", ") AS ?bahanList) (GROUP_CONCAT(DISTINCT ?caraLabel; separator=", ") AS ?caraList) (SAMPLE(?wikibooksUrl) AS ?wikibooks)`,
    where: `
      OPTIONAL { ?site wdt:P186 ?bahanItem . ?bahanItem rdfs:label ?bahanLabel . FILTER(LANG(?bahanLabel) = "id") }
      OPTIONAL { ?site wdt:P2079 ?caraItem . ?caraItem rdfs:label ?caraLabel . FILTER(LANG(?caraLabel) = "id") }
      OPTIONAL { ?wikibooksUrl schema:about ?site ; schema:isPartOf <https://id.wikibooks.org/> . }
    `
  },
  bahasa: {
    select: `(SAMPLE(?penuturData) AS ?penutur)`,
    where: `OPTIONAL { ?site p:P1098 ?penuturStmt . ?penuturStmt ps:P1098 ?penuturVal . OPTIONAL { ?penuturStmt pq:P585 ?penuturDate . } BIND(CONCAT(STR(?penuturVal), "|", STR(YEAR(?penuturDate))) AS ?penuturData) }`
  },
  tokoh: {
    select: `(SAMPLE(?wafatData) AS ?tglWafat) (GROUP_CONCAT(DISTINCT ?kerjaLabel; separator=", ") AS ?pekerjaanList) (GROUP_CONCAT(DISTINCT ?ahliLabel; separator=", ") AS ?spesialisasiList) (GROUP_CONCAT(DISTINCT ?koleksiKaryaLabel; separator=", ") AS ?koleksiKaryaList)`,
    where: `
      OPTIONAL { ?site p:P570 ?wafatStmt . ?wafatStmt psv:P570 ?wafatNode . ?wafatNode wikibase:timeValue ?wafatVal ; wikibase:timePrecision ?wafatPrec . BIND(CONCAT(STR(?wafatVal), "|", STR(?wafatPrec)) AS ?wafatData) }
      OPTIONAL { ?site wdt:P106 ?kerjaItem . ?kerjaItem rdfs:label ?kerjaLabel . FILTER(LANG(?kerjaLabel) = "id") }
      OPTIONAL { ?site wdt:P101 ?ahliItem . ?ahliItem rdfs:label ?ahliLabel . FILTER(LANG(?ahliLabel) = "id") }
      OPTIONAL { ?site wdt:P6379 ?koleksiKaryaItem . ?koleksiKaryaItem rdfs:label ?koleksiKaryaLabel . FILTER(LANG(?koleksiKaryaLabel) = "id") }
    `
  },
  gunung: {
    select: `(SAMPLE(?gunungLabel) AS ?pegunungan)`,
    where: `OPTIONAL { ?site wdt:P4552 ?gunungItem . ?gunungItem rdfs:label ?gunungLabel . FILTER(LANG(?gunungLabel) = "id") }`
  },
  korban: {
    select: `(SAMPLE(?korbanVal) AS ?korban)`,
    where: `OPTIONAL { ?site wdt:P1120 ?korbanVal . }`
  }
};

// ========================================================================
// GENERATOR KUERI DINAMIS BERDASARKAN KAMUS
// ========================================================================
function getSparqlQuery6(qid) {
  // 1. Ambil ID Kategori dari variabel global yang di-set di JS 3, fallback ke 'umum'
  let dataId = (typeof window.currentDataId !== 'undefined' && KategoriAturan[window.currentDataId]) 
               ? window.currentDataId : 'umum';
               
  let daftarBlok = KategoriAturan[dataId].blokSPARQL;

  // 2. Kueri Dasar Universal (Selalu ada di semua kategori)
  let selectClauses = new Set([
    `SELECT ?siteQid`,
    `(GROUP_CONCAT(DISTINCT ?tipeLabel; SEPARATOR=", ") AS ?tipeList)`,
    `(SAMPLE(?ketinggianVal) AS ?ketinggian)`,
    `(SAMPLE(?luasData) AS ?luas)`
  ]);

  let whereClauses = new Set([
    `VALUES ?site { wd:${qid} }`,
    `OPTIONAL { ?site wdt:P31 ?tipeVal . OPTIONAL { ?tipeVal rdfs:label ?tipeLabelId . FILTER(LANG(?tipeLabelId) = "id") } BIND(COALESCE(?tipeLabelId, REPLACE(STR(?tipeVal), "^.*/", "")) AS ?tipeLabel) }`,
    `OPTIONAL { ?site wdt:P2044 ?ketinggianVal . }`,
    `OPTIONAL { ?site p:P2046 ?luasStmt . ?luasStmt psv:P2046 ?luasNode . ?luasNode wikibase:quantityAmount ?luasVal . OPTIONAL { ?luasNode wikibase:quantityUnit ?luasUnitItem . ?luasUnitItem rdfs:label ?luasUnitLabel . FILTER(LANG(?luasUnitLabel) = "id") } OPTIONAL { ?luasStmt pq:P518 ?luasBagianItem . ?luasBagianItem rdfs:label ?luasBagianLabel . FILTER(LANG(?luasBagianLabel) = "id") } BIND(CONCAT(STR(?luasVal), "|", IF(BOUND(?luasUnitLabel), ?luasUnitLabel, ""), "|", IF(BOUND(?luasBagianLabel), ?luasBagianLabel, "")) AS ?luasData) }`
  ]);

  // 3. Merakit Kepingan Puzzle Kueri secara Aman & Otomatis
  daftarBlok.forEach(namaBlok => {
    if (SPARQL_BLOCKS[namaBlok]) {
      selectClauses.add(SPARQL_BLOCKS[namaBlok].select);
      whereClauses.add(SPARQL_BLOCKS[namaBlok].where);
    }
  });

  // 4. Menggabungkan Semuanya
  let finalSelect = Array.from(selectClauses).join(' ');
  let finalWhere  = Array.from(whereClauses).join('\n') + '\nBIND (SUBSTR(STR(?site), 32) AS ?siteQid)';

  return `${finalSelect} WHERE { ${finalWhere} } GROUP BY ?siteQid`;
}

const ABOUT_SPARQL_QUERY = ``;
