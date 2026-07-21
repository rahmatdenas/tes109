'use strict';

const CHUNK_SIZE = 35;
var currentRenderIndex = 0;
var currentFilteredRecords = [];
var isFilterEventAttached = false; 

// Fungsi pembelah array menjadi potongan kecil (Batching)
function potongJadiKelompok(array, ukuran) {
  let hasilPotongan = [];
  for (let i = 0; i < array.length; i += ukuran) {
    hasilPotongan.push(array.slice(i, i + ukuran));
  }
  return hasilPotongan;
}

// =========================================================
// FUNGSI BARU: Sanitasi Input Q-ID Otomatis
// Mengubah "Q1 Q2" menjadi "wd:Q1 wd:Q2"
// =========================================================
function formatQIDs(inputStr, batasiSatu = false) {
  if (!inputStr) return '';
  // Pecah berdasarkan spasi atau koma, bersihkan karakter aneh
  let parts = inputStr.split(/[\s,]+/).filter(p => p.trim() !== '');
  if (batasiSatu && parts.length > 0) parts = [parts[0]]; // Paksa hanya 1 untuk lokasi
  
  return parts.map(p => {
    let bersih = p.trim().toUpperCase();
    if (bersih.startsWith('WD:')) return bersih.toLowerCase(); // Jika user sudah ketik wd:
    if (bersih.startsWith('Q')) return 'wd:' + bersih;
    return bersih; // Biarkan jika bentuknya aneh (akan gagal di kueri, tapi aman)
  }).join(' ');
}

function formatWikidataDate(dateString, precision) {
  if (!dateString) return null;  
  let cleanStr = dateString.replace(/^[+-]/, '');   
  let yearStr  = cleanStr.substring(0, 4);
  let monthStr = cleanStr.substring(5, 7);
  let dayStr   = cleanStr.substring(8, 10);
  let yearNum  = parseInt(yearStr);
  const bulanIndo = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  let prec = parseInt(precision) || 9; 
  
  if (prec === 11) return `${parseInt(dayStr)} ${bulanIndo[parseInt(monthStr)]} ${yearStr}`;
  else if (prec === 10) return `${bulanIndo[parseInt(monthStr)]} ${yearStr}`;
  else if (prec === 9) return yearStr;
  else if (prec === 8) return `${yearStr}-an`;
  else if (prec === 7) return `abad ke-${Math.ceil(yearNum / 100)}`;
  else return yearStr;
}

function loadPrimaryData() {
  let tiketPencarianIni = currentSearchToken;
  
  doPreProcessing();

  populateProvinceTypesData() 
    .then(() => {
      if (currentSearchToken !== tiketPencarianIni) throw 'ABORTED';
      if (globalFetchController && globalFetchController.signal.aborted && !window.hentikanPencarian) throw 'ABORTED';
      
      return populateCoordinatesData().then(() => {
         if (currentSearchToken !== tiketPencarianIni) throw 'ABORTED';
         if (globalFetchController && globalFetchController.signal.aborted && !window.hentikanPencarian) throw 'ABORTED';
         populateMapAndIndex();
      });
    })
    .then(() => {
      if (currentSearchToken !== tiketPencarianIni) throw 'ABORTED';
      if (globalFetchController && globalFetchController.signal.aborted && !window.hentikanPencarian) throw 'ABORTED';
      
      enableApp(); 
      applyIntersectionFilter(); 

      let btnAll = document.getElementById('btn-all');
      if (btnAll) {
        btnAll.classList.remove('disabled'); 
        btnAll.classList.add('active');      
      }

      populateImageAndWikipediaData();
    })
    .catch(error => {
       if (error === 'ABORTED' || (error && error.name === 'AbortError')) {
         console.log("Pencarian dibatalkan atau diganti. Data kadaluarsa dibuang.");
         return; 
       }

       isFetching = false;
       PrimaryDataIsLoaded = false;

       let indexList = document.getElementById('index-list');
       if (indexList) {         
         indexList.innerHTML = `
           <div style="padding: 40px 20px; text-align: center; line-height: 1.6;">
             <h3 style="margin-bottom: 10px; margin-top:0; color: #cc0000;">Gagal Menarik Data</h3>
             <p style="color: #666; font-size:14px; margin-bottom: 25px;">Pastikan internet stabil atau tutup dan coba lagi nanti.</p>
             <a href="#" onclick="window.location.href = window.location.pathname; return false;" style="background-color: #7b0d0c; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: 600; display: inline-block;">Kembali</a>
           </div>
         `;
       }
  
       loadingTimeoutToken = setTimeout(() => {
         let loadingDesc = document.querySelector('#index-list p'); 
         if (loadingDesc && isFetching) {
           loadingDesc.innerHTML = `Data yang ditarik terlalu banyak. Harap menunggu, 3-5 menit...`;
         }
       }, 5000);
       
       console.error("Data utama gagal dimuat.", error);
    }); 
}

function doPreProcessing() {
  let anchorElem = document.getElementById('wdqs-link');
  if (anchorElem) {
    anchorElem.href = 'https://query.wikidata.org/#' + encodeURIComponent(ABOUT_SPARQL_QUERY);
  }
  processHashChange();
}

// Variabel Global Data
var currentKategoriUtama = 'umum'; 
var currentNamaKlaster = 'Objek';     
var currentNamaWilayah = 'Semua Wilayah'; 
window.currentDataId = 'umum'; 

function populateProvinceTypesData() {
  // ==========================================
  // 1. TENTUKAN OBJEK (JENIS) DARI HTML
  // ==========================================
  let jenisDropdown = document.getElementById('jenis-dropdown');
  let inputTxtRaw = document.getElementById('jenis-input').value.trim();
  let opsiTerpilihJenis = jenisDropdown.options[jenisDropdown.selectedIndex];

  // Sanitasi Q-ID Objek (Bisa lebih dari 1, dipisah spasi)
  let inputTxt = formatQIDs(inputTxtRaw, false);

  if (jenisDropdown.value === 'custom') {
    currentNamaKlaster = 'Objek'; 
    window.currentDataId = 'umum';
  } else {
    currentNamaKlaster = opsiTerpilihJenis.text; 
    window.currentDataId = opsiTerpilihJenis.getAttribute('data-id') || 'umum';
  }

  // Tarik properti
  currentKategoriUtama = opsiTerpilihJenis.getAttribute('data-kategori') || 'umum';
  let propLokasi = opsiTerpilihJenis.getAttribute('data-lokasi') || 'P131';
  let propTahun = opsiTerpilihJenis.getAttribute('data-tahun') || 'P571';
  
  // ==========================================
  // 2. TENTUKAN LOKASI (WILAYAH) DARI HTML
  // ==========================================
  let lokasiUtama = document.getElementById('lokasi-utama-input');
  let modeWilayah = lokasiUtama ? lokasiUtama.value : 'indonesia';
  let provInput = 'all'; // Default (Semua Indonesia)
  
  if (modeWilayah === 'indonesia') {
    let provDropdown = document.getElementById('provinsi-input');
    provInput = provDropdown.value;
    currentNamaWilayah = provDropdown.options[provDropdown.selectedIndex].text;
  } 
  else if (modeWilayah === 'luar_negeri') {
    provInput = 'luar_negeri';
    let negaraDropdown = document.getElementById('negara-input');
    currentNamaWilayah = negaraDropdown.options[negaraDropdown.selectedIndex].text;
  } 
  else if (modeWilayah === 'custom') {
    let customInput = document.getElementById('lokasi-custom-input');
    provInput = formatQIDs(customInput.value.trim(), true); // Wajib dibatasi 1 Q-ID!
    currentNamaWilayah = 'Wilayah Spesifik (Kustom)';
  }

  // ==========================================
  // 3. PERBARUI TAMPILAN
  // ==========================================
  let brandingDesc = document.getElementById('branding-desc');
  if (brandingDesc) {
    brandingDesc.textContent = `${currentNamaKlaster} di ${currentNamaWilayah}`;
  }

  let indexList = document.getElementById('index-list');
  if (indexList) {
    indexList.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; line-height: 1.6;">
        <h3 id="loading-text" style="margin-bottom: 10px; margin-top:0; color: #333;">
          Sedang Menarik Data<br/>${currentNamaKlaster} di ${currentNamaWilayah}
        </h3>
        <p style="color: #666; font-size:14px; margin-bottom: 25px;">Harap menunggu sebentar...</p>
        <div class="loader" style="margin: 0 auto; width: 40px; height: 40px; border-width: 4px;"></div>
        <div id="wadah-tombol-berhenti" style="margin-top: 42px;"></div>
      </div>
    `;
  }
  
  // ==========================================
  // 4. FUNGSI PEMBANTU EKSEKUSI KUERI
  // ==========================================
  function eksekusiKueriKeWikidata(kueriFinal) {
    console.log("Kueri yang dikirim:", kueriFinal);
    return queryWdqsPaginated(
      kueriFinal,
      function(result) {
        let qid = result.SQ.value;
        
        if (!(qid in Records)) Records[qid] = new SimpleRecord(); 
        
        let record = Records[qid];
        record.id = qid;
        record.title = ('sLabel' in result && result.sLabel.value) ? result.sLabel.value : '[ERROR: No title]';

        let provQid = result.PQ ? result.PQ.value : 'Q_UNKNOWN';
        let provLabel = result.pLabel ? result.pLabel.value : 'Wilayah Lainnya/Tidak Spesifik';

        if (!(provQid in ProvinceIndex)) {
          ProvinceIndex[provQid] = new ProvinceIndexEntry();
          ProvinceIndex[provQid].name = provLabel; 
        }
        if (!(provQid in record.designations)) record.designations[provQid] = provLabel; 
        
        record.areaTags.add(provQid);
        
        if ('lLabel' in result && result.lLabel.value) record.lokasiSpesifik = result.lLabel.value;
        
        if (!record.tahunBerdiri && result.tM && result.tM.value) {
          let precision = result.tP ? result.tP.value : 9;
          record.tahunBerdiri = formatWikidataDate(result.tM.value, precision);        
          record.rawTahunBerdiri = result.tM.value.replace(/^[+-]/, '');
        }
      },
      function() {
        populateProvinceIndex(); 
        Object.values(Records).forEach(record => { record.indexTitle = record.title });
      },
      5000 
    );
  }

  // ==========================================
  // 5. LOGIKA PEMILIHAN TEMPLATE KUERI
  // ==========================================
  let baseQuery = KUMPULAN_KUERI_0['universal'];
  
  if (inputTxtRaw.toLowerCase() === 'apapun') {
    baseQuery = KUMPULAN_KUERI_0['apapun'];
    currentNamaKlaster = 'Objek'; 
  }

  let wilayahClause1 = '';
  let unionEkstra = ''; 
  let hierarkiLokasi = '?l wdt:P131* ?p .'; 
  let kurungBuka = '';
  let kurungTutup = '';
  
  // Konfigurasi Khusus Nasional
  const klasterKhususNasional = ['kabupaten', 'bencana', 'peristiwa', 'publikasi', 'lukisan'];
  let isKhususNasional = klasterKhususNasional.includes(window.currentDataId);
  let filterNasional = '?s wdt:P17 wd:Q252 .';
  
  if (window.currentDataId === 'publikasi') {
    filterNasional = '?s wdt:P407 wd:Q9240 .';
  }

  // --- CABANG LUAR NEGERI ---
  if (provInput === 'luar_negeri') {
    let negaraDropdown = document.getElementById('negara-input');
    let negaraValue = negaraDropdown.value; 
    
    baseQuery = KUMPULAN_KUERI_0['luar_negeri'];
    let dynamicQuery = baseQuery;

    if (inputTxtRaw.toLowerCase() === 'apapun') {
      dynamicQuery = dynamicQuery.replace(/VALUES \?j \{ <PLACEHOLDER_JENIS> \}/g, '');
    } else {
      dynamicQuery = dynamicQuery.replace(/<PLACEHOLDER_JENIS>/g, inputTxt);
    }
    
    dynamicQuery = dynamicQuery
      .replace(/<PLACEHOLDER_NEGARA>/g, negaraValue)
      .replace(/<PLACEHOLDER_PROP_LOKASI>/g, propLokasi)
      .replace(/<PLACEHOLDER_PROP_TAHUN>/g, propTahun);
      
    return eksekusiKueriKeWikidata(dynamicQuery); 
  }
  
  // --- CABANG INDONESIA & CUSTOM ---
  if (provInput === 'all') {
    wilayahClause1 = '?p wdt:P31 wd:Q5098 .';
    
    if (isKhususNasional && inputTxtRaw.toLowerCase() !== 'apapun') {
      baseQuery = KUMPULAN_KUERI_0['khusus_negara_all'];
    }
  } else {
    // Berlaku untuk Provinsi Spesifik ATAU Lokasi Custom
    wilayahClause1 = `?p wdt:P131 ${provInput}.`;
    let wilayahClause2 = `BIND(${provInput} AS ?p) BIND(${provInput} AS ?l)`; 
    
    kurungBuka = '{';
    kurungTutup = '}';
    
    unionEkstra = `
    UNION {
      ${wilayahClause2}
      ?s wdt:P31 ?j ;
         wdt:${propLokasi} ?l .
    }`;
    
    if (inputTxtRaw.toLowerCase() === 'apapun') {
       unionEkstra = `
       UNION {
         ${wilayahClause2}
         ?s wdt:P17 wd:Q252 ;
            wdt:P625 [] ;
            wdt:P18 [] ;
            wdt:P131 ?l .
       }`;
    }
  }
  
  let dynamicQuery = baseQuery
    .replace(/<PLACEHOLDER_FILTER_NASIONAL>/g, filterNasional)
    .replace(/<PLACEHOLDER_KURUNG_BUKA>/g, kurungBuka)  
    .replace(/<PLACEHOLDER_KURUNG_TUTUP>/g, kurungTutup)  
    .replace(/<PLACEHOLDER_WILAYAH_1>/g, wilayahClause1)
    .replace(/<PLACEHOLDER_PROP_LOKASI>/g, propLokasi)
    .replace(/<PLACEHOLDER_PROP_TAHUN>/g, propTahun)
    .replace(/<PLACEHOLDER_HIERARKI_LOKASI>/g, hierarkiLokasi)
    .replace(/<PLACEHOLDER_UNION_EKSTRA>/g, unionEkstra) 
    .replace(/<PLACEHOLDER_JENIS>/g, inputTxt);

  return eksekusiKueriKeWikidata(dynamicQuery);
}


async function populateCoordinatesData() {
  let daftarQid = Object.keys(Records).map(id => 'wd:' + id);
  if (daftarQid.length === 0) return;

  // Tarik parameter dari HTML secara langsung
  let jenisDropdown = document.getElementById('jenis-dropdown');
  let opsiTerpilih = jenisDropdown.options[jenisDropdown.selectedIndex];
  let namaKlaster = (jenisDropdown.value === 'custom') ? 'Objek' : opsiTerpilih.text;
  let propLokasi = opsiTerpilih.getAttribute('data-lokasi') || 'P131';

  let templateKueri = KUMPULAN_KUERI_1['universal'];

  const klasterTanpaKoordinatLangsung = [
    'Hidangan', 'Pakaian', 'Tari dan pertunjukan', 'Ritual dan upacara',  'Artefak',
    'Budaya rakyat', 'Lukisan', 'Lontar', 'Naskah', 'Perang & konflik',
    'Tempat lahir tokoh', 'Bahasa', 'Publikasi', 'Media massa', 'Latar karya sastra'
  ];

  let klausaKoordinat = !klasterTanpaKoordinatLangsung.includes(namaKlaster) 
    ? `?site p:P625 ?coordStatement .` 
    : `?site wdt:${propLokasi} ?p131Lokasi . FILTER(?p131Lokasi != wd:Q252) ?p131Lokasi p:P625 ?coordStatement .`;

  let kelompokCicilan = potongJadiKelompok(daftarQid, 1000);
  
  let batchSize = 4; 
  let tiketPencarianIni = currentSearchToken;
  for (let i = 0; i < kelompokCicilan.length; i += batchSize) {
    if (currentSearchToken !== tiketPencarianIni) break;
    let potonganBatch = kelompokCicilan.slice(i, i + batchSize);
    
    let progressText = document.querySelector('#index-list p');
    if (progressText) {
      let persentase = Math.round((i / kelompokCicilan.length) * 100);
      progressText.innerHTML = `Menyusun koordinat... (${persentase}%)`;
    }

    let daftarJanji = potonganBatch.map(cicilan => {
      let kueriFinal = templateKueri
        .replace(/<PLACEHOLDER_QIDS>/g, cicilan.join(' '))
        .replace(/<PLACEHOLDER_KLAUSA_KOORDINAT>/g, klausaKoordinat);

      return queryWdqsThenProcess(kueriFinal, function(result) {
        let record = Records[result.siteQid.value];
        if (!record) return; 
        let wktBits = result.coord.value.split(/\(|\)| /);
        record.lat = parseFloat(wktBits[2]);
        record.lon = parseFloat(wktBits[1]);
      });
    });

    try {
      await Promise.all(daftarJanji);
    } catch (error) {
      if (error === 'ABORTED') throw error;
      console.warn("Gagal tarik sebagian koordinat, lanjut ke batch berikutnya...", error);
    }
  }

  BootstrapDataIsLoaded = true;
}

async function populateImageAndWikipediaData() {
  let daftarQid = Object.values(Records)
    .sort((a, b) => a.indexTitle.localeCompare(b.indexTitle))
    .map(record => 'wd:' + record.id);
  
  if (daftarQid.length === 0) return;

  let kelompokCicilan = potongJadiKelompok(daftarQid, 1000);
  
  let btnImg = document.getElementById('btn-image') || document.querySelector('[data-filter="image"]');
  let btnArt = document.getElementById('btn-article') || document.querySelector('[data-filter="article"]');
  
  let totalData = daftarQid.length;
  let signal = typeof globalFetchController !== 'undefined' ? globalFetchController.signal : null;

  if (btnImg) btnImg.classList.remove('disabled');
  if (btnArt) btnArt.classList.remove('disabled');

  const tarikSatuKloter = async (cicilan) => {
    let kueriFinal = SPARQL_QUERY_3_TEMPLATE.replace('<PLACEHOLDER_QIDS>', cicilan.join(' '));
    
    return queryWdqsThenProcess(kueriFinal, function(result) {
      let rawQid = result.siteQid.value;
      let cleanQid = rawQid.includes('entity/') ? rawQid.split('entity/')[1] : rawQid;
      let record = Records[cleanQid];      
      
      if (!record) return; 

      if ('image' in result) {
        record.imageFilename = extractImageFilename(result.image);
      }

      if ('wikipediaUrlTitle' in result) {
        let rawArt = result.wikipediaUrlTitle.value;
        record.articleTitle = decodeURIComponent(rawArt.substring(rawArt.lastIndexOf('/') + 1));
      }
    }, null, signal);
  };

  const evaluasiHasilKloter = (hasilKloter) => {
    for (let hasil of hasilKloter) {
      if (hasil.status === 'rejected') {
        if (hasil.reason === 'ABORTED' || (hasil.reason && hasil.reason.name === 'AbortError')) {
          throw 'ABORTED';
        }
        console.warn("Sebagian kloter gambar/artikel gagal ditarik. Sistem mengabaikan dan berlanjut...", hasil.reason);
      }
    }
  };

  try {
    if (totalData <= 20000) {
      let daftarJanji = kelompokCicilan.map(cicilan => tarikSatuKloter(cicilan));
      let hasilKloter = await Promise.allSettled(daftarJanji);
      
      evaluasiHasilKloter(hasilKloter);
      if (signal && signal.aborted) throw 'ABORTED';

      Object.values(Records).forEach(r => {
        if (r.id !== currentDisplayedQid) {
          r.panelElem = undefined;
        }
      });
      if (activeFeatures.has('image') || activeFeatures.has('article')) {
        applyIntersectionFilter(true); 
      }

    } else {
      let batchSize = 3; 
      let chunksCompleted = 0;

      for (let i = 0; i < kelompokCicilan.length; i += batchSize) {
        if (signal && signal.aborted) throw 'ABORTED'; 

        let potonganBatch = kelompokCicilan.slice(i, i + batchSize);
        let daftarJanji = potonganBatch.map(cicilan => tarikSatuKloter(cicilan));
        
        let hasilKloter = await Promise.allSettled(daftarJanji);
        evaluasiHasilKloter(hasilKloter);

        chunksCompleted += potonganBatch.length;
        let persentase = Math.round((chunksCompleted / kelompokCicilan.length) * 100);
        
        if (btnImg) btnImg.textContent = `Gambar (${persentase}%)`;
        if (btnArt) btnArt.textContent = `Artikel (${persentase}%)`;

        Object.values(Records).forEach(r => {
          if (r.id !== currentDisplayedQid) {
            r.panelElem = undefined;
          }
        });
        if (activeFeatures.has('image') || activeFeatures.has('article')) {
          applyIntersectionFilter(true); 
        }
      }
      
      // +++ DIPINDAHKAN KE SINI +++
      // Hanya mengembalikan teks tombol setelah perulangan persentase untuk data > 20.000 selesai
      // Catatan: Jika tombol Anda memiliki ikon HTML (misalnya <i>), Anda bisa mengganti
      // .textContent di bawah menjadi .innerHTML = '<i class="..."></i> Memiliki Gambar'
      if (btnImg) btnImg.textContent = 'Memiliki Gambar';
      if (btnArt) btnArt.textContent = 'Memiliki Artikel';
      // +++++++++++++++++++++++++++
    }
  } catch (error) {
    if (error === 'ABORTED' || (error && error.name === 'AbortError')) {
      console.log('Penarikan gambar/artikel dihentikan dengan rapi (AbortController).');
    } else {
      console.error("Proses penarikan gambar terhenti akibat fatal error:", error);
    }
  }

  if (signal && signal.aborted) return;
}

function populateImportantEventsData(qid) {
  let record = Records[qid];
  let queryStr = getSparqlQuery4(qid);

  record.events = []; 

  const ALLOWED_EVENTS = [
    'konstruksi', 
    'dibuka untuk umum', 
    'upacara pembukaan', 
    'renovasi', 
    'pembangunan kembali'
  ];

  return queryWdqsThenProcess(
    queryStr,
    function(result) {
      if ('eventLabel' in result && result.eventLabel.value) {
        let labelKecil = result.eventLabel.value.toLowerCase();
        
        if (ALLOWED_EVENTS.includes(labelKecil)) {
          let rawDateStr = (result.pointInTime ? result.pointInTime.value : null) || 
                           (result.startTime ? result.startTime.value : null) || 
                           (result.endTime ? result.endTime.value : null);
          let extractYear = rawDateStr ? parseInt(rawDateStr.match(/([+-]?\d{4,})/)[0]) : 9999;

          let eventObj = { label: result.eventLabel.value, time: '', sortYear: extractYear };
          
          let pt = result.pointInTime ? formatWikidataDate(result.pointInTime.value, result.ptPrecision ? result.ptPrecision.value : 9) : null;
          let st = result.startTime ? formatWikidataDate(result.startTime.value, result.stPrecision ? result.stPrecision.value : 9) : null;
          let et = result.endTime ? formatWikidataDate(result.endTime.value, result.etPrecision ? result.etPrecision.value : 9) : null;

          if (pt) {
            eventObj.time = pt;
          } else if (st && et) {
            eventObj.time = `${st}–${et}`;
          } else if (st) {
            eventObj.time = `${st} (dimulai)`; 
          } else if (et) {
            eventObj.time = `${et} (diselesaikan)`; 
          }

          let isDuplicate = record.events.some(e => e.label === eventObj.label && e.time === eventObj.time);
          if (!isDuplicate) record.events.push(eventObj);
        }
      }
    },
    function() {
      populateStatusAndCapacityData(qid); 
    }
  ).catch(error => {
    console.warn("Gagal menarik data peristiwa historis (offline).", error);
    record._gagalOffline = true;
    populateStatusAndCapacityData(qid);
  });
}

function populateStatusAndCapacityData(qid) {
  let record = Records[qid];
  let queryStr = getSparqlQuery6(qid); 

  record.dynamicProps = {};

  return queryWdqsThenProcess(
    queryStr,
    function(result) {
      Object.keys(result).forEach(key => {
        if (key !== 'siteQid' && result[key].value) {
          record.dynamicProps[key] = result[key].value;
        }
      });
    },
    function() {
      renderDynamicDataInPanel(qid); 
    }
  ).catch(error => {
    console.warn("Gagal menarik data kapasitas/status (offline).", error);
    record._gagalOffline = true;
    renderDynamicDataInPanel(qid);
  });
}

function renderDynamicDataInPanel(qid) {
  let record = Records[qid];
  
  if (!record.panelElem) return;
  let container = record.panelElem.querySelector(`#events-container-${qid}`);
  if (!container) return; 

  let html = '';
  let wikiBaseUrl = `https://www.wikidata.org/wiki/${qid}`;

  if (record.events && record.events.length > 0) {
    const EVENT_ORDER = {
      'konstruksi': 1, 'dibuka untuk umum': 2,
      'upacara pembukaan': 3, 'renovasi': 4,
      'pembangunan kembali': 5
    };

    record.events.sort((a, b) => {
      if (a.sortYear !== b.sortYear) {
        return a.sortYear - b.sortYear;
      }
      let orderA = EVENT_ORDER[a.label.toLowerCase()] || 99;
      let orderB = EVENT_ORDER[b.label.toLowerCase()] || 99;
      return orderA - orderB;
    });

    record.events.forEach(ev => {
      let capLabel = ev.label.charAt(0).toUpperCase() + ev.label.slice(1);
      let timeText = ev.time ? ev.time : ''; 
      html += `<p>${capLabel}: ${timeText}</p>`;
    });
  }

  const labelKamus = {
    ketinggian: 'Ketinggian', luas: 'Luas', kapasitas: 'Kapasitas',
    kondisi: 'Kondisi', lamanResmi: 'Laman resmi', fasilitasList: 'Fasilitas',
    arsitek: 'Arsitek', gayaList: 'Gaya arsitektur', populasi: 'Jumlah penduduk',
    kepalaDaerah: 'Kepala daerah', jalurList: 'Jalur penghubung', jumlahKoleksi: 'Jumlah koleksi',
    spesialisasiList: 'Spesialisasi', tglTemu: 'Tanggal penemuan', tempatTemu: 'Lokasi penemuan',
    bahasaList: 'Bahasa', bentukList: 'Bentuk karya', penulisList: 'Penulis/pencipta',
    subjekList: 'Subjek utama', kolektorList: 'Koleksi dari', pemredList: 'Pimpinan redaksi',
    pendiriList: 'Pendiri', penerbit: 'Penerbit', bahanList: 'Bahan utama',
    caraList: 'Cara pembuatan', penutur: 'Jumlah penutur', tglWafat: 'Wafat',
    pekerjaanList: 'Pekerjaan', pegunungan: 'Bagian dari', korban: 'Korban jiwa',
    agamaList: 'Agama', bagianDari: 'Bagian dari', berakhirPada: 'Berhenti terbit',
    pencipta: 'Pencipta', genreList: 'Genre',
    panjang: 'Panjang', koleksiKaryaList: 'Tempat koleksi karya disimpan',
    tinggi: 'Tinggi', lebar: 'Lebar',
    aksaraList: 'Sistem penulisan'
  };

  let urlWikibooks = null;

  if (record.dynamicProps && Object.keys(record.dynamicProps).length > 0) {
    
    if (record.dynamicProps.wikibooks) {
      urlWikibooks = record.dynamicProps.wikibooks;
      delete record.dynamicProps.wikibooks;
    }

    if (record.dynamicProps.tipeList) {
      let headerTextElem = record.panelElem.querySelector(`#header-text-${qid}`);
      if (headerTextElem && record.dynamicProps.tipeList.trim() !== '') {
        let tipeRapi = record.dynamicProps.tipeList
          .split(', ')
          .map(kata => kata.charAt(0).toUpperCase() + kata.slice(1))
          .join(', ');
          
        headerTextElem.textContent = tipeRapi;
      }
      delete record.dynamicProps.tipeList;
    }

    for (let key in record.dynamicProps) {
      let rawValue = record.dynamicProps[key];
      let formattedValue = rawValue;
      let titleLabel = labelKamus[key] || key; 

      if (key === 'populasi' || key === 'penutur') {
        let [angka, tahun] = rawValue.split('|');
        let angkaRapi = parseInt(angka).toLocaleString('id-ID');
        formattedValue = tahun !== 'null' ? `${angkaRapi} jiwa (${tahun})` : `${angkaRapi} jiwa`;
      } 
      else if (key === 'kepalaDaerah') {
        let [nama, tahun, wikiUrl] = rawValue.split('|');
        let teksNama = nama;
        if (wikiUrl && wikiUrl !== 'kosong') {
          teksNama = `<span class="koordinat-link"><a href="${wikiUrl}" target="_blank" rel="noopener noreferrer">${nama}</a></span>`;
        }
        formattedValue = tahun !== 'null' ? `${teksNama} (sejak ${tahun})` : teksNama;
      }
      else if (key === 'luas') {
        let [angka, satuan, bagian] = rawValue.split('|');
        let angkaRapi = parseFloat(angka).toLocaleString('id-ID');
        let teksLuas = satuan ? `${angkaRapi} ${satuan}` : angkaRapi;
        formattedValue = bagian ? `${teksLuas} (untuk ${bagian})` : teksLuas;
      }
      else if (key === 'jumlahKoleksi') {
        let [angka, satuan] = rawValue.split('|');
        let angkaRapi = parseInt(angka).toLocaleString('id-ID');
        formattedValue = satuan ? `${angkaRapi} ${satuan}` : angkaRapi;
      }
      else if (key === 'kapasitas' || key === 'korban') {
        formattedValue = parseInt(rawValue).toLocaleString('id-ID');
      }
      else if (key === 'panjang' || key === 'tinggi' || key === 'lebar') { 
        let [angka, satuan] = rawValue.split('|');
        let angkaRapi = parseFloat(angka).toLocaleString('id-ID');
        formattedValue = satuan ? `${angkaRapi} ${satuan}` : angkaRapi;
      }
      else if (key === 'ketinggian') {
        formattedValue = parseInt(rawValue).toLocaleString('id-ID') + " mdpl";
      }
      else if (key === 'lamanResmi') {
        const displayUrl = rawValue.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        formattedValue = `<span class="koordinat-link"><a href="${rawValue}" target="_blank" rel="noopener noreferrer" style="word-break: break-all;">${displayUrl}</a></span>`;
      }
      else if (key === 'tglTemu' || key === 'tglWafat' || key === 'berakhirPada'){
        let [waktu, presisi] = rawValue.split('|');
        formattedValue = formatWikidataDate(waktu, presisi);
      }
      else if (key === 'bahanList' || key === 'caraList') {
        formattedValue = formattedValue.toLowerCase();
      }
      else if (key === 'bahasaList') {
        formattedValue = formattedValue.replace(/\bbahasa\s+/gi, '');
      }

      html += `<p>${titleLabel}: ${formattedValue}</p>`;
    }
  }

  let tautanTambah = `<p><a href="${wikiBaseUrl}" target="_blank" class="sunting-linktambah" title="Tambahkan data di Wikidata" style="font-style: italic;">Lengkapi data di Wikidata!</a></p>`;
  html += tautanTambah;

  container.insertAdjacentHTML('beforebegin', html);
  container.remove();

  if (urlWikibooks) {
    let arsipContainer = record.panelElem.querySelector(`#arsip-container-${qid}`);
    
    if (arsipContainer) {
      let wikibooksHtml = `
        <div style="margin-top:10px;">
          <h2 style="margin-bottom: 7px;">Resep & Panduan</h2>
          <p class="wikipedia-link">
            <a href="${urlWikibooks}" target="_blank">
              <img src="img/wikibook_tiny_logo.png" alt="" />
              <span>Lihat di Wikibuku</span>
            </a>
          </p>
        </div>
      `;
      arsipContainer.insertAdjacentHTML('beforebegin', wikibooksHtml);
    }
  }
}

function populateProvinceIndex() {
  if (!ProvinceIndex['all']) ProvinceIndex['all'] = new ProvinceIndexEntry();

  Object.values(Records).forEach(record => {
    ProvinceIndex['all'].total++;
    Object.keys(record.designations).forEach(provQid => {
      if (ProvinceIndex[provQid]) {
        ProvinceIndex[provQid].total++;
      }
    });
  });
}

function populateMapAndIndex() {
  let listIndex = document.getElementById('index-list');
  let mapMarkers = [];
  
  Object.entries(Records).forEach(entry => {
    let qid = entry[0], record = entry[1];
    
    if (!record.isCompound && record.lat && record.lon) {
      let mapMarker = L.marker(
        [record.lat, record.lon],
        { icon: ikonTetesanAir }
      );
      record.mapMarker = mapMarker;
      
      mapMarker.bindPopup(record.title, { 
        closeButton: false,
        maxWidth: 200 
      });

      mapMarker.togglePopup = function() {
        if (!this.isPopupOpen()) {
          this.openPopup();
        }
      };

      mapMarker.on('mousedown touchstart', function() {
        this._bukaSaatDisentuh = this.isPopupOpen();
      });

      mapMarker.on('click', function() {
        if (this._bukaSaatDisentuh) {
          if (typeof window.setMobilePanelExpanded === 'function') {
            window.setMobilePanelExpanded(true, true);
          }
        }
      });
      mapMarker.on('dblclick', function(e) {
        L.DomEvent.stopPropagation(e);
        if (typeof window.setMobilePanelExpanded === 'function') {
          window.setMobilePanelExpanded(true, true);
        }
      });
      
      let popup = mapMarker.getPopup();
      popup._qid = qid;
      record.popup = popup;
      mapMarkers.push(mapMarker);
    }
    
    let li = document.createElement('li');
    let a = document.createElement('a');
    a.href = '#' + qid;
    a.textContent = record.indexTitle; 
    
    li.appendChild(a);
    record.indexLi = li;
  });
  
  populateProvinceIndexNodes(); 
  generateFilterSelect();
}

function populateProvinceIndexNodes() {
  Object.values(Records).forEach(record => {
    if (record.mapMarker) ProvinceIndex['all'].mapMarkers.push(record.mapMarker);
    ProvinceIndex['all'].indexLis.push(record.indexLi);
    
    Object.keys(record.designations).forEach(provQid => {
      if (record.mapMarker && ProvinceIndex[provQid]) {
        ProvinceIndex[provQid].mapMarkers.push(record.mapMarker);
      }
      if (ProvinceIndex[provQid]) {
        ProvinceIndex[provQid].indexLis.push(record.indexLi);
      }
    });
  });
  
  Object.values(ProvinceIndex).forEach(indexItem => {
    indexItem.indexLis = indexItem.indexLis
      .map(li => [li, li.textContent])
      .sort((a, b) => a[1] > b[1] ? 1 : -1)
      .map(item => item[0]);
  });
}

var currentRegionFilter = 'all';
var currentUsiaFilter = 'all';
var activeFeatures = new Set(); 
var currentSearchQuery = '';
var userLocation = null;
var userRadiusCircle = null;

function generateFilterSelect() {
  currentRegionFilter = 'all';
  currentUsiaFilter = 'all';
  activeFeatures.clear();
  currentSearchQuery = '';

  let selectKombinasi = document.getElementById('filter-sort-kombinasi');
  if (selectKombinasi) {
    selectKombinasi.value = 'default';
    
    if (currentKategoriUtama === 'alam') {
      selectKombinasi.style.display = 'none';
    } else {
      selectKombinasi.style.display = ''; 
    }
  }

  let searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  let btnAll = document.getElementById('btn-all');
  if (btnAll) btnAll.classList.add('active');
  document.querySelectorAll('.feat-btn:not(#btn-all)').forEach(b => b.classList.remove('active'));

  let selectRegion = document.getElementById('filter-region');

  selectRegion.innerHTML = `<option value="all">Semua Wilayah – ${ProvinceIndex['all'].total}</option>`;
  selectRegion.innerHTML += `<option value="terdekat">Sekitar Anda (10 km)</option>`;
  
  Object.keys(ProvinceIndex)
    .filter(qid => qid !== 'all')
    .map(qid => { return { qid: qid, name: ProvinceIndex[qid].name, total: ProvinceIndex[qid].total }; })
    .sort((a, b) => {
      if (a.name === 'Wilayah Lainnya/Tidak Spesifik') return 1;
      if (b.name === 'Wilayah Lainnya/Tidak Spesifik') return -1;
      return a.name.localeCompare(b.name);
    })
    .forEach(prov => {
      let option = document.createElement('option');
      option.value = prov.qid;
      option.textContent = `${prov.name} – ${prov.total}`;
      selectRegion.appendChild(option);
    });

  applyIntersectionFilter();
  
  if (!isFilterEventAttached) {
    selectRegion.addEventListener('change', function() {
      if (this.value === 'terdekat') {
        jalankanFilterGPS(this);
      } else {
        currentRegionFilter = this.value;
        userLocation = null; 
        applyIntersectionFilter();
      }
    });

    if (selectKombinasi) {
   selectKombinasi.addEventListener('change', function() {
  let pilihan = this.value;
  currentUsiaFilter = 'all'; 

  if (pilihan === 'filter-usia-muda-50') {
    currentUsiaFilter = 'muda_50';          // BARU
  } else if (pilihan === 'filter-usia-50') {
    currentUsiaFilter = 'usia_50'; 
  } else if (pilihan === 'filter-usia-100') {
    currentUsiaFilter = 'usia_100'; 
  } else if (pilihan === 'filter-usia-200') {
    currentUsiaFilter = 'usia_200'; 
  } else if (pilihan === 'filter-usia-300') {
    currentUsiaFilter = 'usia_300'; 
  }
  applyIntersectionFilter();
});
    }

    if (btnAll) {
      btnAll.addEventListener('click', function() {
        userLocation = null;
        if (window.TombolGPSMap) window.TombolGPSMap.stop();
        
        if (userRadiusCircle) Map.removeLayer(userRadiusCircle);
        
        activeFeatures.clear();
        btnAll.classList.add('active');
        document.querySelectorAll('.feat-btn:not(#btn-all)').forEach(b => b.classList.remove('active'));

        currentRegionFilter = 'all';
        if (selectRegion) selectRegion.value = 'all';

        currentUsiaFilter = 'all';
        if (selectKombinasi) selectKombinasi.value = 'default';

        currentSearchQuery = '';
        if (searchInput) searchInput.value = '';

        applyIntersectionFilter();
      });
    }

    document.querySelectorAll('.feat-btn:not(#btn-all)').forEach(btn => {
      btn.addEventListener('click', function() {
        let filterType = this.getAttribute('data-filter');

        if (activeFeatures.has(filterType)) {
          activeFeatures.delete(filterType);
          this.classList.remove('active');
        } else {
          activeFeatures.add(filterType);
          this.classList.add('active');
        }

        if (activeFeatures.size === 0) {
          if (btnAll) btnAll.classList.add('active');
        } else {
          if (btnAll) btnAll.classList.remove('active');
        }

        applyIntersectionFilter();
      });
    });

    if (searchInput) {
      searchInput.addEventListener('input', function() {
        currentSearchQuery = this.value.toLowerCase();
        
        if (searchDebounceToken) {
          clearTimeout(searchDebounceToken);
        }
        
        searchDebounceToken = setTimeout(() => {
          applyIntersectionFilter(); 
        }, 300);
      });
    }

    isFilterEventAttached = true; 
  }
}

function updateFeatureCounts(totalValidRecords) {
  let btnAll = document.getElementById('btn-all');
  let btnImg = document.getElementById('btn-image') || document.querySelector('[data-filter="image"]');
  let btnArt = document.getElementById('btn-article') || document.querySelector('[data-filter="article"]');
  let searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.placeholder = `Menampilkan ${totalValidRecords} hasil (atau ketik yang ingin dicari)`;
  }
}

function applyIntersectionFilter(preventZoom = false) {
  if (!PrimaryDataIsLoaded) return;

  Cluster.clearLayers();
  let ol = document.getElementById('index-list');
  ol.innerHTML = '';

  let validMarkers = [];
  
  let btnAll = document.getElementById('btn-all');
  if (btnAll) {
    if (currentSearchQuery.trim() === '' && 
        currentRegionFilter === 'all' && 
        currentUsiaFilter === 'all' && 
        activeFeatures.size === 0) {
      btnAll.classList.add('active');
      btnAll.textContent = 'Semua Hasil'; 
    } else {
      btnAll.classList.remove('active');
      btnAll.textContent = 'Pulihkan'; 
    }
  }

  let validRecords = Object.values(Records).filter(record => {
    
    let matchRegion = false;
    
    if (currentRegionFilter === 'all') {
      matchRegion = true;
    } 
    else if (currentRegionFilter === 'terdekat') {
      if (userLocation && record.lat && record.lon) {
        let jarakMeter = Map.distance([userLocation.lat, userLocation.lon], [record.lat, record.lon]);
        if (jarakMeter <= 10000) { 
          record.jarakDariUser = (jarakMeter / 1000).toFixed(1); 
          matchRegion = true;
        }
      }
    } 
    else {
      matchRegion = record.areaTags.has(currentRegionFilter);
    }

    let matchFeature = true;
    
    if (activeFeatures.size > 0) {
      if (activeFeatures.has('image') && !record.imageFilename) matchFeature = false;
      if (activeFeatures.has('article') && record.articleTitle === undefined) matchFeature = false;
    }

    let matchSearch = true;
    if (currentSearchQuery.trim() !== '') {
      let cleanQuery = currentSearchQuery.replace(/[-'\s]/g, '');
      if (record.indexTitle) {
        let cleanTitle = record.indexTitle.toLowerCase().replace(/[-'\s]/g, '');
        matchSearch = cleanTitle.includes(cleanQuery);
      } else {
        matchSearch = false;
      }
    }

  let matchUsia = true;
if (currentUsiaFilter !== 'all') {                 // ganti dari .startsWith('usia_')
  if (record.rawTahunBerdiri) {
    let tahunBangunan = parseInt(record.rawTahunBerdiri.substring(0, 4));
    let [tipeFilter, umurStr] = currentUsiaFilter.split('_');
    let batasUmur = parseInt(umurStr);
    let batasTahun = new Date().getFullYear() - batasUmur;

    if (tipeFilter === 'muda') {
      matchUsia = tahunBangunan > batasTahun;      // lebih muda dari X tahun
    } else {
      matchUsia = tahunBangunan <= batasTahun;     // perilaku lama: lebih tua dari X tahun
    }
  } else {
    matchUsia = false; 
  }
}
    
    return matchRegion && matchFeature && matchSearch && matchUsia;

  }).sort((a, b) => {
    if (currentUsiaFilter !== 'all') {
      let aHasYear = !!a.rawTahunBerdiri;
      let bHasYear = !!b.rawTahunBerdiri;

      if (aHasYear && bHasYear) {
        return a.rawTahunBerdiri.localeCompare(b.rawTahunBerdiri);
      } else if (aHasYear && !bHasYear) {
        return -1; 
      } else if (!aHasYear && bHasYear) {
        return 1;  
      }
    }
    return a.indexTitle.localeCompare(b.indexTitle);    
  });

  currentFilteredRecords = validRecords;
  currentRenderIndex = 0; 

  renderNextChunk();
  updateFeatureCounts(validRecords.length);

  // +++ KUNCI PENGAMAN (Debounce) +++
  if (renderTimeoutToken) {
    clearTimeout(renderTimeoutToken);
  }

  renderTimeoutToken = setTimeout(() => {
    validRecords.forEach(record => {
      if (record.mapMarker) validMarkers.push(record.mapMarker);
    });

    if (validMarkers.length > 0) {
      Cluster.addLayers(validMarkers);
      if (!preventZoom) {
        Map.flyToBounds(Cluster.getBounds(), { duration: 0.5 });
      }
    }
    
    renderTimeoutToken = null; 
  }, 150); 
}

function generateRecordDetails(qid) {
  let record = Records[qid];
  let titleHtml = `<h1>${record.title}</h1>`;
  let figureHtml = generateFigure(record.imageFilename, record.title);

  if (record.imageFilename) {
    figureHtml = figureHtml.replace('<figure class="', '<figure class="gambar-utama ');
  }

  let articleHtml;
  if (record.articleTitle) {
    articleHtml = '<div class="article main-text loading"><div class="loader"></div></div>';
  } else {
    let namaAmanURL = encodeURIComponent(record.title);
    let gFormUrl = `https://docs.google.com/forms/d/e/1FAIpQLSeHMSn6cwcgbZ0xx1CJ5tGXDQacYgzRZUG51STByKUROWXgmg/viewform?usp=pp_url&entry.2138396049=${namaAmanURL}`;
    articleHtml = `<div class="article main-text nodata"><p>${currentNamaKlaster} ini belum memiliki artikel. <a href="${gFormUrl}" target="_blank" rel="noopener noreferrer" class="sunting-linktambah">Tambahkan!</a></p></div>`;
  }
  
  let wikiUrlUtama = `https://www.wikidata.org/wiki/${qid}`;
  let tautanSuntingRingkasan = `<a href="${wikiUrlUtama}" target="_blank" class="sunting-link" title="Sunting data di Wikidata" aria-label="Sunting data di Wikidata"></a>`;

  let designationsHtml = `<h2 style="margin-top:10px;display: flex;align-items: flex-start; justify-content: space-between;">
                             <div><span id="header-text-${qid}" style="margin-right:7px;">Informasi</span>${tautanSuntingRingkasan}</div>
                          </h2>`;

  designationsHtml += '<ul class="designations">';

  let arrayProvinsi = Object.values(record.designations);
  let isTidakSpesifik = arrayProvinsi.includes('Wilayah Lainnya/Tidak Spesifik') || arrayProvinsi.length === 0;
  let spesifik = record.lokasiSpesifik; 
  if (spesifik === 'Wilayah Lainnya/Tidak Spesifik') spesifik = null;
  let namaLokasi = '';

  if (isTidakSpesifik) {
    if (spesifik) namaLokasi = spesifik;
    else namaLokasi = 'Belum ada data';
  } else {
    let arrayProvinsiBersih = arrayProvinsi.filter(p => p !== 'Wilayah Lainnya/Tidak Spesifik');
    let teksDaftarProvinsi = arrayProvinsiBersih.join(', '); 
    if (spesifik && !arrayProvinsiBersih.map(p => p.toLowerCase()).includes(spesifik.toLowerCase())) {
      namaLokasi = `${spesifik}, ${teksDaftarProvinsi}`; 
    } else {
      namaLokasi = teksDaftarProvinsi;
    }
  }

  // ==========================================
  // LOGIKA BARU: Teks 'Lokasi' & 'Tahun' Cerdas dari KategoriAturan
  // ==========================================
  let referensi = (typeof KategoriAturan !== 'undefined' && KategoriAturan[window.currentDataId]) 
                  ? KategoriAturan[window.currentDataId] : { prefixLokasi: "Letak", prefixTahun: "Tahun" };
                  
  let prefixLokasi = referensi.prefixLokasi;
  let prefixTahun  = referensi.prefixTahun;
  let showTahun    = currentKategoriUtama !== 'alam'; 

  let infoLokasiHtml = '';
  if (record.lat && record.lon) {
    let mapsUrl = `https://www.google.com/maps?q=${record.lat},${record.lon}`;
    infoLokasiHtml = `<p class="koordinat-link">${prefixLokasi}: <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" title="Buka di Google Maps">${namaLokasi}</a></p>`;
  } else {
    infoLokasiHtml = 
      `<p class="koordinat-link">${prefixLokasi}: ${namaLokasi}</p>` +
      `<p>Koordinat: <span style="font-style: italic; color: #888;">Data belum tersedia</span></p>`;
  }

  let infoTahunHtml = '';
  if (showTahun) {
    if (record.tahunBerdiri) {
      infoTahunHtml = `<p>${prefixTahun}: ${record.tahunBerdiri}</p>`;
    } else {
      infoTahunHtml = `<p>${prefixTahun}: <span style="font-style: italic; color: #888;">Data belum tersedia</span></p>`;
    }
  }

  let eventsHtmlPlaceholder = `
   <div id="events-container-${qid}" class="loading">
     <div class="loader" style="width: 20px; height: 20px; border-width: 2px; margin-top: 2px;"></div>
   </div>`;

  designationsHtml += '<li>' + infoLokasiHtml + infoTahunHtml + eventsHtmlPlaceholder + '</li></ul>';
  let arsipHtml = `<div id="arsip-container-${qid}" class="loading"><div class="loader" style="width: 20px; height: 20px; border-width: 2px; margin-top: 8px;"></div></div>`;

  let panelElem = document.createElement('div');
  if (window.currentDataId === 'tokoh') panelElem.classList.add('mode-tokoh');
  
  panelElem.innerHTML = titleHtml + figureHtml + articleHtml + designationsHtml + arsipHtml;
  record.panelElem = panelElem;

  if (record.articleTitle) displayArticleExtract(record.articleTitle, panelElem.querySelector('.article'));
  queryOsm(qid);
}

// =========================================================
// SISTEM FILTER PENGURUTAN USIA BARU (< 50, < 100, dst)
// =========================================================
var currentRegionFilter = 'all';
var currentUsiaFilter = 'all';
var activeFeatures = new Set(); 
var currentSearchQuery = '';
var userLocation = null;
var userRadiusCircle = null;

function generateFilterSelect() {
  currentRegionFilter = 'all';
  currentUsiaFilter = 'all';
  activeFeatures.clear();
  currentSearchQuery = '';

  let selectKombinasi = document.getElementById('filter-sort-kombinasi');
  if (selectKombinasi) {
    selectKombinasi.value = 'default';
    if (currentKategoriUtama === 'alam') selectKombinasi.style.display = 'none';
    else selectKombinasi.style.display = ''; 
  }

  let searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  let btnAll = document.getElementById('btn-all');
  if (btnAll) btnAll.classList.add('active');
  document.querySelectorAll('.feat-btn:not(#btn-all)').forEach(b => b.classList.remove('active'));

  let selectRegion = document.getElementById('filter-region');
  selectRegion.innerHTML = `<option value="all">Semua Wilayah – ${ProvinceIndex['all'].total}</option>`;
  selectRegion.innerHTML += `<option value="terdekat">Sekitar Anda (10 km)</option>`;
  
  Object.keys(ProvinceIndex)
    .filter(qid => qid !== 'all')
    .map(qid => { return { qid: qid, name: ProvinceIndex[qid].name, total: ProvinceIndex[qid].total }; })
    .sort((a, b) => {
      if (a.name === 'Wilayah Lainnya/Tidak Spesifik') return 1;
      if (b.name === 'Wilayah Lainnya/Tidak Spesifik') return -1;
      return a.name.localeCompare(b.name);
    })
    .forEach(prov => {
      let option = document.createElement('option');
      option.value = prov.qid;
      option.textContent = `${prov.name} – ${prov.total}`;
      selectRegion.appendChild(option);
    });

  applyIntersectionFilter();
  
  if (!isFilterEventAttached) {
    selectRegion.addEventListener('change', function() {
      if (this.value === 'terdekat') jalankanFilterGPS(this);
      else {
        currentRegionFilter = this.value;
        userLocation = null; 
        applyIntersectionFilter();
      }
    });

    if (selectKombinasi) {
      selectKombinasi.addEventListener('change', function() {
        // Opsi-opsinya: muda_50, usia_50, muda_100, usia_100, usia_400, usia_500
        currentUsiaFilter = this.value === 'default' ? 'all' : this.value;
        applyIntersectionFilter();
      });
    }

    // (Salin event listener untuk btnAll, searchInput, dll dari JS 3 Anda yang lama)
    // ...
    isFilterEventAttached = true; 
  }
}

// BARU: fungsi terpisah, supaya bisa dipanggil dari debounce ATAU dipaksa langsung
function renderMarkerSekarang(validRecords, preventZoom) {
  let validMarkers = [];
  validRecords.forEach(record => {
    if (record.mapMarker) validMarkers.push(record.mapMarker);
  });

  if (validMarkers.length > 0) {
    Cluster.addLayers(validMarkers);
    if (!preventZoom) {
      Map.flyToBounds(Cluster.getBounds(), { duration: 0.5 });
    }
  }
  renderTimeoutToken = null;
}

// BARU: dipanggil dari activateMapMarker (JS 1) kalau ada timer yang masih menggantung.
// Ini SATU-SATUNYA jalan marker masuk cluster di luar alur normal — tidak ada jalur kedua lagi.
window.paksaRenderMarkerSekarang = function() {
  if (renderTimeoutToken) {
    clearTimeout(renderTimeoutToken);          // batalkan timer lama
    renderMarkerSekarang(currentFilteredRecords, true); // jalankan SEKARANG, tanpa flyToBounds
  }
};

function applyIntersectionFilter(preventZoom = false) {
  if (!PrimaryDataIsLoaded) return;

  Cluster.clearLayers();
  let ol = document.getElementById('index-list');
  ol.innerHTML = '';

  let validRecords = Object.values(Records).filter(record => {
    // Filter Wilayah
    let matchRegion = false;
    if (currentRegionFilter === 'all') matchRegion = true;
    else if (currentRegionFilter === 'terdekat') {
      if (userLocation && record.lat && record.lon) {
        let jarakMeter = Map.distance([userLocation.lat, userLocation.lon], [record.lat, record.lon]);
        if (jarakMeter <= 10000) matchRegion = true;
      }
    } 
    else {
      matchRegion = record.areaTags.has(currentRegionFilter);
    }

    // Filter Fitur
    let matchFeature = true;
    if (activeFeatures.size > 0) {
      if (activeFeatures.has('image') && !record.imageFilename) matchFeature = false;
      if (activeFeatures.has('article') && record.articleTitle === undefined) matchFeature = false;
    }

    // Filter Pencarian
    let matchSearch = true;
    if (currentSearchQuery.trim() !== '') {
      let cleanQuery = currentSearchQuery.replace(/[-'\s]/g, '');
      if (record.indexTitle) {
        matchSearch = record.indexTitle.toLowerCase().replace(/[-'\s]/g, '').includes(cleanQuery);
      } else matchSearch = false;
    }

    // Filter Usia (Muda / Tua)
    let matchUsia = true;
    if (currentUsiaFilter !== 'all') {                 
      if (record.rawTahunBerdiri) {
        let tahunBangunan = parseInt(record.rawTahunBerdiri.substring(0, 4));
        let [tipeFilter, umurStr] = currentUsiaFilter.split('_'); // misal: "muda_50" atau "usia_400"
        let batasUmur = parseInt(umurStr);
        let tahunSekarang = new Date().getFullYear();
        let batasTahun = tahunSekarang - batasUmur;

        if (tipeFilter === 'muda') {
          matchUsia = tahunBangunan > batasTahun;      // Lebih muda dari batasUmur
        } else {
          matchUsia = tahunBangunan <= batasTahun;     // Lebih tua dari batasUmur
        }
      } else {
        matchUsia = false; 
      }
    }
    
    return matchRegion && matchFeature && matchSearch && matchUsia;

  }).sort((a, b) => {
    // Logika Pengurutan
    if (currentUsiaFilter !== 'all') {
      let aHasYear = !!a.rawTahunBerdiri;
      let bHasYear = !!b.rawTahunBerdiri;

      if (aHasYear && bHasYear) {
        // Jika filter "muda", urutkan descending (paling muda di atas)
        if (currentUsiaFilter.startsWith('muda_')) {
          return b.rawTahunBerdiri.localeCompare(a.rawTahunBerdiri);
        }
        // Jika filter "tua", urutkan ascending (paling tua di atas)
        return a.rawTahunBerdiri.localeCompare(b.rawTahunBerdiri);
      } else if (aHasYear && !bHasYear) return -1;  
      else if (!aHasYear && bHasYear) return 1;   
    }
    return a.indexTitle.localeCompare(b.indexTitle);    
  });

  currentFilteredRecords = validRecords;
  currentRenderIndex = 0; 
  renderNextChunk();
  updateFeatureCounts(validRecords.length);

  if (renderTimeoutToken) {
    clearTimeout(renderTimeoutToken);
  }
  renderTimeoutToken = setTimeout(() => {
    renderMarkerSekarang(validRecords, preventZoom);   // ← pindah ke fungsi terpisah
  }, 150);
}
