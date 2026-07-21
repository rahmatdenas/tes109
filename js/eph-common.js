'use strict';

const WDQS_API_URL            = 'https://query.wikidata.org/sparql';
const COMMONS_WIKI_URL_PREF   = 'https://commons.wikimedia.org/wiki/';
const COMMONS_API_URL         = 'https://commons.wikimedia.org/w/api.php';
const YEAR_PRECISION          = '9';
const OSM_LAYER_URL           = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_LAYER_ATTRIBUTION   = 'Base map © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';
const CARTO_LAYER_URL         = 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png';
const CARTO_LAYER_ATTRIBUTION = 'Base map © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> (data), <a href="https://carto.com/" target="_blank">CARTO</a> (style)';
const TILE_LAYER_MAX_ZOOM     = 18;

const MIN_PH_LAT              =   6.0;   
const MAX_PH_LAT              = -11.0;   
const MIN_PH_LON              =  95.0;   
const MAX_PH_LON              = 141.0;   

// Variabel Global
var Records = {};        
var ProvinceIndex = {};  
var SparqlValuesClause;  
var Map;                 
var Cluster;             
var BootstrapDataIsLoaded = false;  
var PrimaryDataIsLoaded   = false;  

var isAppInitialLoad      = true; 
var isFetching            = false; 
var currentSearchToken    = 0;     
var globalFetchController = new AbortController(); 
var currentActiveShapeLayer = null;
var currentDisplayedQid = null;
var lastValidHash   = 'landing';
var isRevertingHash = false;
var loadingTimeoutToken = null;
var searchDebounceToken = null;
var renderTimeoutToken = null;

// =========================================================
// FUNGSI DIALOG KUSTOM
// =========================================================
function tampilkanDialog(pesan, tipe = 'alert', judul = 'Perhatian') {
  return new Promise((resolve) => {
    let overlay = document.getElementById('eph-dialog-overlay');
    let titleElem = document.getElementById('eph-dialog-title');
    let msgElem = document.getElementById('eph-dialog-msg');
    let btnYes = document.getElementById('eph-dialog-btn-yes');
    let btnNo = document.getElementById('eph-dialog-btn-no');

    if (!overlay) return resolve(false);

    titleElem.textContent = judul;
    msgElem.innerHTML = pesan; 

    if (tipe === 'confirm') {
      btnNo.style.display = 'inline-block';
      btnYes.textContent = 'Ya';
    } else {
      btnNo.style.display = 'none'; 
      btnYes.textContent = 'Tutup'; 
    }

    overlay.classList.add('aktif');

    const tutupDanBersihkan = (nilai) => {
      overlay.classList.remove('aktif');
      btnYes.onclick = null;
      btnNo.onclick = null;
      overlay.onclick = null;
      resolve(nilai);
    };

    btnYes.onclick = () => tutupDanBersihkan(true);
    btnNo.onclick = () => tutupDanBersihkan(false);

    overlay.onclick = function(e) {
      if (e.target === overlay && tipe === 'alert') {
        tutupDanBersihkan(true);
      }
    };
  });
}

window.konfirmasiBerhenti = function() {
  tampilkanDialog("Anda yakin ingin mencukupkan penarikan? Data yang tertangkap sejauh ini akan segera disusun dan dirender ke peta.", "confirm", "Cukupkan Pencarian")
    .then(yakin => {
      if (yakin) {
        window.hentikanPencarian = true; 
        
        let progressText = document.querySelector('#index-list p');
        if (progressText) {
           progressText.innerHTML = `<span style="color:#7b0d0c; font-weight:bold;">Memutus koneksi... Menyiapkan data yang terselamatkan.</span><br><br>Mohon tunggu sebentar, sistem sedang membangun koordinat peta...`;
        }
        
        let wadahTombol = document.getElementById('wadah-tombol-berhenti');
        if (wadahTombol) wadahTombol.style.display = 'none';

        if (typeof globalFetchController !== 'undefined') {
          let oldController = globalFetchController;
          globalFetchController = new AbortController(); 
          oldController.abort(); 
        }
      }
    });
};

const ikonTetesanAir = L.divIcon({
  className: 'ikon-marker-ringan',
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -13 412 538" width="30" height="40" style="overflow: visible;">
           <ellipse cx="192" cy="510" rx="60" ry="15" fill="rgba(0,0,0,0.4)" />
           <path fill="#cc4444" fill-rule="evenodd" 
                 d="M172.3 501.7C27 291 0 269.4 0 192 0 86 86 0 192 0s192 86 192 192c0 77.4-27 99-172.3 309.7-9.5 13.8-29.9 13.8-39.5 0z 
                    M 192, 132 a 60,60 0 1,0 0,120 a 60,60 0 1,0 0,-120 z"/>
         </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 39],   
  popupAnchor: [0, -37]   
});

window.addEventListener('load', init);

function init() {
  initMap();
  setupLandingForm();
  window.addEventListener('hashchange', processHashChange);

  // LOGIKA BUKA-TUTUP MENU DROP-UP
  document.addEventListener('click', function(e) {
    let btnMenu = document.getElementById('btn-menu-induk');
    let subMenu = document.getElementById('submenu-atas');
    
    if (!btnMenu || !subMenu) return;

    if (e.target === btnMenu) {
      if (subMenu.style.display === 'none' || subMenu.style.display === '') {
        subMenu.style.display = 'flex';
        btnMenu.parentElement.classList.add('selected');
      } else {
        subMenu.style.display = 'none';
        btnMenu.parentElement.classList.remove('selected');
      }
    } 
    else if (!subMenu.contains(e.target)) {
      subMenu.style.display = 'none';
      btnMenu.parentElement.classList.remove('selected');
    } 
    else if (e.target.tagName === 'A') {
      subMenu.style.display = 'none';
      btnMenu.parentElement.classList.remove('selected');
    }
  });
  
  Map.on('popupopen', function(e) { 
    e.popup._sudahDiupdate = false;
    let qid = e.popup._qid;
    if (window.location.hash !== '#' + qid) {
      window.location.hash = qid; 
    }
    let record = Records[qid];
    
    if (record.imageFilename && !e.popup._hasImage) {
      let encodedFilename = encodeURIComponent(record.imageFilename);
      let imgUrl = `${COMMONS_WIKI_URL_PREF}Special:FilePath/${encodedFilename}?width=250`;
      let imgHtml = `
            <div style="text-align:center; margin-top:17px;margin-bottom: 5px;">
              <img src="${imgUrl}" 
                   draggable="false" 
                   style="width:100%; min-width:90px; height:130px; object-fit:cover; border-radius:4px;" 
                   alt="Thumbnail"
                   onload="let p = Records['${qid}'].popup; if (p && !p._sudahDiupdate) { p._sudahDiupdate = true; p.update(); }">
            </div>
          `;
      e.popup.setContent(imgHtml + `${record.title}`);      
      e.popup._hasImage = true; 
    }
  });

  processHashChange();
  setTimeout(() => {
    let preloader = document.getElementById('eph-preloader');
    if (preloader) {
      preloader.style.opacity = '0';
      preloader.style.visibility = 'hidden';
      setTimeout(() => preloader.remove(), 400); 
    }
  }, 150);
}

// =========================================================
// MANAJEMEN FORM BERANDA (Logika Dinamis Cascading & Q-ID)
// =========================================================
function setupLandingForm() {
  // 1. Kategori Objek
  let dropdownJenis = document.getElementById('jenis-dropdown');
  let inputTxtJenis = document.getElementById('jenis-input');

  if (dropdownJenis && inputTxtJenis) {
    dropdownJenis.addEventListener('change', function() {
      if (this.value === 'custom') {
        inputTxtJenis.value = ''; 
        inputTxtJenis.readOnly = false;
        inputTxtJenis.style.backgroundColor = '#ffffff';
        inputTxtJenis.placeholder = "Pisahkan spasi untuk >1 (Contoh: Q123 Q456)";
        inputTxtJenis.focus();
      } else {
        inputTxtJenis.value = this.value; // Sudah murni Q-ID dari HTML
        inputTxtJenis.readOnly = true;
        inputTxtJenis.style.backgroundColor = '#f5f5f5';
        inputTxtJenis.placeholder = "";
      }
    });
  }

// 2. Lokasi Berjenjang
  let lokasiUtama = document.getElementById('lokasi-utama-input');
  let wadahProvinsi = document.getElementById('wadah-provinsi');
  let wadahLuarNegeri = document.getElementById('wadah-luar-negeri');
  
  // Tangkap inputnya secara langsung karena div wadah sudah dihapus
  let lokasiCustomInput = document.getElementById('lokasi-custom-input');
  let petunjukLokasiCustom = document.getElementById('petunjuk-lokasi-custom');
  
  let benuaInput = document.getElementById('benua-input');
  let negaraInput = document.getElementById('negara-input');

  if (lokasiUtama) {
    lokasiUtama.addEventListener('change', function() {
      // Sembunyikan semuanya terlebih dahulu
      if (wadahProvinsi) wadahProvinsi.style.display = 'none';
      if (wadahLuarNegeri) wadahLuarNegeri.style.display = 'none';
      if (lokasiCustomInput) lokasiCustomInput.style.display = 'none';
      if (petunjukLokasiCustom) petunjukLokasiCustom.style.display = 'none';

      // Munculkan sesuai pilihan
      if (this.value === 'indonesia') {
        if (wadahProvinsi) wadahProvinsi.style.display = 'block';
      } else if (this.value === 'luar_negeri') {
        if (wadahLuarNegeri) wadahLuarNegeri.style.display = 'block';
        if (benuaInput) benuaInput.dispatchEvent(new Event('change')); // Paksa filter negara
      } else if (this.value === 'custom') {
        if (lokasiCustomInput) {
          lokasiCustomInput.style.display = 'inline-block'; // Agar tidak melebar
          if (petunjukLokasiCustom) petunjukLokasiCustom.style.display = 'block';
          lokasiCustomInput.focus();
        }
      }
    });
  }

  // 3. Filter Negara Berdasarkan Benua
  if (benuaInput && negaraInput) {
    benuaInput.addEventListener('change', function() {
      let benuaDipilih = this.value;
      let opsiNegara = negaraInput.querySelectorAll('option');
      let isFirstFound = false;

      opsiNegara.forEach(opt => {
        // Cek apakah option memiliki class yang sama dengan value benua
        if (opt.classList.contains(benuaDipilih)) {
          opt.style.display = '';
          opt.disabled = false;
          // Set otomatis ke negara pertama di benua tersebut
          if (!isFirstFound) {
            negaraInput.value = opt.value;
            isFirstFound = true;
          }
        } else {
          opt.style.display = 'none';
          opt.disabled = true;
        }
      });
    });
  }

  // 4. Tombol Mulai
  let btnMulai = document.getElementById('btn-mulai');
  if (btnMulai) {
    btnMulai.addEventListener('click', function() {
      
      // Validasi Kategori
      let finalJenis = inputTxtJenis.value.trim();
      if (finalJenis === '') {
        alert('Parameter Q-ID Kategori tidak boleh kosong.');
        return;
      }

      // Validasi Lokasi Custom
      if (lokasiUtama && lokasiUtama.value === 'custom') {
        let locCustom = document.getElementById('lokasi-custom-input');
        if (locCustom && locCustom.value.trim() === '') {
          alert('Q-ID Lokasi Anda tidak boleh kosong.');
          locCustom.focus();
          return;
        }
      }
      
      resetApp();
      
      isFetching = true; 
      currentSearchToken = Date.now();
      window.location.hash = 'hasil';
      
      loadingTimeoutToken = setTimeout(() => {
        let loadingDesc = document.querySelector('#index-list p'); 
        if (loadingDesc && isFetching) {
          loadingDesc.innerHTML = `Jika data mencapai ribuan, proses penarikan data membutuhkan waktu 3-7 menit...`;
        }
      }, 10000); 

      // Panggil ke JS 3
      if (typeof loadPrimaryData === 'function') {
        loadPrimaryData();
      }
    });
  }
}

// =========================================================
// PERBAIKAN RESET APP (Mencegah "Stale State / ID Nyangkut")
// =========================================================
function resetApp() {
  currentSearchToken = 0;
  window.hentikanPencarian = false;

  if (loadingTimeoutToken) {
    clearTimeout(loadingTimeoutToken);
    loadingTimeoutToken = null;
  }
  
  if (typeof globalFetchController !== 'undefined') {
    globalFetchController.abort(); 
    globalFetchController = new AbortController(); 
  }

  let brandingDesc = document.getElementById('branding-desc');
  if (brandingDesc) {
    brandingDesc.textContent = 'Ensiklopedia Interaktif Indonesia';
  }

  Records = {};
  ProvinceIndex = {};
  BootstrapDataIsLoaded = false;
  PrimaryDataIsLoaded = false;
  isFetching = false; 
  currentDisplayedQid = null;
  
  // Bersihkan Memori Variabel di JS 3 (Jika ada)
  if (typeof currentFilteredRecords !== 'undefined') currentFilteredRecords = [];
  if (typeof currentRenderIndex !== 'undefined') currentRenderIndex = 0;
  if (typeof activeFeatures !== 'undefined' && activeFeatures.clear) activeFeatures.clear();
  if (typeof currentRegionFilter !== 'undefined') currentRegionFilter = 'all';
  if (typeof currentUsiaFilter !== 'undefined') currentUsiaFilter = 'all';
  if (typeof currentSearchQuery !== 'undefined') currentSearchQuery = '';

  if (Cluster) Cluster.clearLayers();

  let indexList = document.getElementById('index-list');
  if (indexList) indexList.innerHTML = '';

  // Kembalikan Tampilan Filter Hasil
  let selectRegion = document.getElementById('filter-region');
  if (selectRegion) {
    selectRegion.innerHTML = '<option value="all">Semua Wilayah</option>';
    selectRegion.value = 'all';
  }

  let selectKombinasi = document.getElementById('filter-sort-kombinasi');
  if (selectKombinasi) selectKombinasi.value = 'default';
  
  let searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = '';
    searchInput.placeholder = 'Belum ada hasil...';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  let btnAll = document.getElementById('btn-all');
  document.querySelectorAll('.feat-btn:not(#btn-all)').forEach(b => {
    b.classList.remove('active');
  });

  let btnImg = document.getElementById('btn-image') || document.querySelector('[data-filter="image"]');
  let btnArt = document.getElementById('btn-article') || document.querySelector('[data-filter="article"]');
  
  if (btnImg) { 
    btnImg.textContent = 'Memiliki Gambar';
    btnImg.classList.add('disabled'); 
  }
  if (btnArt) { 
    btnArt.textContent = 'Memiliki Artikel';
    btnArt.classList.add('disabled'); 
  }
  if (btnAll) {
    btnAll.textContent = 'Semua Hasil';
    btnAll.classList.add('disabled');   
    btnAll.classList.remove('active');  
  }

  let subMenuAtas = document.getElementById('submenu-atas');
  if (subMenuAtas) subMenuAtas.style.display = 'none';
}

function initMap() {
  Map = new L.map('map', { 
    zoomControl: false, 
    attributionControl: false,
    zoomDelta: 2, 
    zoomSnap: 2   
  });
  Map.fitBounds([[MAX_PH_LAT, MAX_PH_LON], [MIN_PH_LAT, MIN_PH_LON]]);

  L.control.attribution({ position: 'topleft' }).addTo(Map);

  let cartoLayer = new L.tileLayer(CARTO_LAYER_URL, {
    attribution : CARTO_LAYER_ATTRIBUTION,
    maxZoom     : TILE_LAYER_MAX_ZOOM,
  }).addTo(Map);
  
  let osmLayer = new L.tileLayer(OSM_LAYER_URL, {
    attribution : OSM_LAYER_ATTRIBUTION,
    maxZoom     : TILE_LAYER_MAX_ZOOM,
  });
  
  let baseMaps = {
    'CARTO Voyager'       : cartoLayer,
    'OpenStreetMap Carto' : osmLayer,
  };
  
  L.control.layers(baseMaps, null, {position: 'topleft'}).addTo(Map);
  L.control.zoom({ position: 'bottomright' }).addTo(Map);

  window.TombolGPSMap = L.control.locate({ 
    position: 'bottomright', 
    showCompass: false, 
    showPopup: false,
    strings: { title: "Tunjukkan lokasi saya" },
    icon: 'ikon-gps-custom' 
  }).addTo(Map);  

  let powered = L.control({ position: 'bottomleft' });
  powered.onAdd = function(Map) {
    var divElem = L.DomUtil.create('div', 'powered');
    divElem.innerHTML = '<a><img src="img/powered_by_wikidata.png"></a>';
    return divElem;
  };
  powered.addTo(Map);
	
  Cluster = new L.markerClusterGroup({
    maxClusterRadius: function(zoom) {
      let z = Math.round(zoom);        
      if (z <= 15) return 50;
      if (z === 16) return 35;
      if (z === 17) return 20;
      return 10; 
    },
    zoomToBoundsOnClick: true, 
    spiderfyOnMaxZoom: true    
  }).addTo(Map);

  Cluster.on('clusterclick', function (a) {
    let cluster = a.layer;
    let count = cluster.getChildCount();
    let currentZoom = Map.getZoom();
    let maxZoom = TILE_LAYER_MAX_ZOOM;
    
    let bounds = cluster.getBounds();
    let isSamePoint = bounds.getSouthWest().equals(bounds.getNorthEast());

    if (currentZoom >= maxZoom || isSamePoint) {
      if (count > 60) {
        cluster.unspiderfy(); 
        
        tampilkanDialog(
          `Terlalu banyak data di titik ini (<b>${count} item</b>).<br><br>Untuk melihatnya, silakan buka daftar indeks dan persempit pencarian wilayah.`, 
          "alert", 
          "Titik Terlalu Padat"
        );
      }
    }
  });
}

function queryWdqsThenProcess(query, processEachResult, postprocessCallback, signal = null) {
  let promise = new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();
    
    if (signal) {
      if (signal.aborted) return reject('ABORTED');
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject('ABORTED');
      });
    }

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== xhr.DONE) return;

      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else if (xhr.status === 0) {
        reject((signal && signal.aborted) ? 'ABORTED' : 'NETWORK_ERROR');
      } else {
        reject(xhr.status);
      }
    };
    
    xhr.open('POST', WDQS_API_URL, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.setRequestHeader('Accept', 'application/sparql-results+json');
    
    if (SparqlValuesClause) query = query.replace('<SPARQLVALUESCLAUSE>', SparqlValuesClause);
    xhr.send('format=json&query=' + encodeURIComponent(query));
  });

  promise = promise.then(data => {
    data.results.bindings.forEach(processEachResult);
  });
  if (postprocessCallback) promise = promise.then(postprocessCallback);
  return promise;
}

function fetchWdqsRaw(query, signal = null) {
  return new Promise((resolve, reject) => {
    let xhr = new XMLHttpRequest();

    if (signal) {
      if (signal.aborted) return reject('ABORTED');
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject('ABORTED');
      });
    }

    xhr.onreadystatechange = function() {
      if (xhr.readyState !== xhr.DONE) return;

      if (xhr.status === 200) {
        try {
          let data = JSON.parse(xhr.responseText);
          resolve(data.results.bindings);
        } catch (e) {
          reject('PARSE_ERROR');
        }
      } else if (xhr.status === 0) {
        reject((signal && signal.aborted) ? 'ABORTED' : 'NETWORK_ERROR');
      } else {
        reject(xhr.status); 
      }
    };

    xhr.open('POST', WDQS_API_URL, true);
    xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    xhr.setRequestHeader('Accept', 'application/sparql-results+json');

    if (SparqlValuesClause) query = query.replace('<SPARQLVALUESCLAUSE>', SparqlValuesClause);
    xhr.send('format=json&query=' + encodeURIComponent(query));
  });
}

async function fetchWdqsRawWithRetry(query, maxRetry = 3, offsetLabel = '', signal = null) {
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
      if (signal && signal.aborted) throw 'ABORTED'; 
    try {
      if (attempt > 1) {
        let progressText = document.querySelector('#index-list p');
        if (progressText) {
          progressText.innerHTML = `Sedang melakukan percobaan ulang ke-${attempt}${offsetLabel}...`;
        }
      }
      
      let result = await fetchWdqsRaw(query, signal);
      
      if (attempt > 1) {
        console.log(`[${offsetLabel}] Berhasil setelah percobaan ke-${attempt}`);
      }
      return result;

    } catch (error) {
      if (error === 'ABORTED') throw error; 
      
      console.warn(`[${offsetLabel}] Percobaan ke-${attempt} gagal (${error}), mencoba lagi...`);
      
      let progressText = document.querySelector('#index-list p');
      if (progressText) {
        progressText.innerHTML = `<span style="color:#cc0000; font-weight:bold;">Percobaan ke-${attempt} gagal${offsetLabel}. Melakukan penarikan ulang.</span>`;
      }

      if (attempt === maxRetry) {
        if (signal && signal.aborted) throw 'ABORTED';
        throw error;
      }
      
      await new Promise(r => setTimeout(r, 1500 * attempt));
      
      if (signal && signal.aborted) throw 'ABORTED';
    }
  }
}

async function queryWdqsPaginated(queryTemplate, processEachResult, postprocessCallback, chunkSize = 5000) {
  let offset = 0;
  let halaman = 1;
  let totalDataTerkumpul = 0; 
  let signal = typeof globalFetchController !== 'undefined' ? globalFetchController.signal : null; 
  try {
    while (true) {
      if (window.hentikanPencarian) break;

      let pagedQuery = queryTemplate.replace('<PLACEHOLDER_LIMIT_OFFSET>', `LIMIT ${chunkSize} OFFSET ${offset}`);
      let offsetLabel = ` (data ${offset.toLocaleString('id-ID')}–${(offset + chunkSize).toLocaleString('id-ID')})`
      let bindings = await fetchWdqsRawWithRetry(pagedQuery, 3, offsetLabel, signal); 
      
      if (window.hentikanPencarian) break;
      
      if (halaman === 1 && loadingTimeoutToken) {
        clearTimeout(loadingTimeoutToken);
        loadingTimeoutToken = null;
      }
      
      bindings.forEach(processEachResult);
      let kombinasiUnik = new Set(
        bindings.map(b => `${b.SQ.value}|${b.PQ ? b.PQ.value : ''}|${b.LQ ? b.LQ.value : ''}`)
      ).size;
      
      totalDataTerkumpul += kombinasiUnik;
      console.log(`[Halaman ${halaman}] Kombinasi (s,p,l) unik:`, kombinasiUnik);
      
      if (kombinasiUnik < chunkSize) {
         break; 
      } else {
         let progressText = document.querySelector('#index-list p');
         
         if (progressText && !window.hentikanPencarian) {
           progressText.innerHTML = `Selesai menarik <b>${totalDataTerkumpul.toLocaleString('id-ID')}</b> data. Penarikan data masih berlanjut...`;
           
           if (totalDataTerkumpul >= 20000) {
             let wadahTombol = document.getElementById('wadah-tombol-berhenti');
             if (wadahTombol && wadahTombol.innerHTML === '') {
               wadahTombol.innerHTML = `<a href="#" onclick="window.konfirmasiBerhenti(); return false;" style="background-color: #7b0d0c; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: 600;">Cukupkan Pencarian?</a>`;
             }
           }
         }
      }
      offset += chunkSize;
      halaman++;
    }
  } catch (error) {
    if (error === 'ABORTED') {
      if (window.hentikanPencarian) {
         console.log('Penarikan dipotong paksa oleh pengguna. Melanjutkan ke render peta...');
      } else {
         console.log('Penarikan dibatalkan sepenuhnya karena reset/URL berubah.');
         return; 
      }
    } else {
      console.error('Proses paginasi gagal total:', error);
      
      if (totalDataTerkumpul > 0) {
        console.warn(`Koneksi terputus. Menyelamatkan ${totalDataTerkumpul} data yang ada...`);
        tampilkanDialog(
          `Koneksi internet tidak stabil saat menarik sisa data.<br><br>Sistem berhasil menyelamatkan <b>${totalDataTerkumpul.toLocaleString('id-ID')}</b> data. Peta akan dibangun berdasarkan data yang berhasil ditangkap.`, 
          "alert", 
          "Koneksi Terputus Sebagian"
        );
      } else {
        throw error;
      }
    }
  }
  
  if (postprocessCallback) postprocessCallback();
}

function enableApp() {
  PrimaryDataIsLoaded = true;
  isFetching = false; 
  processHashChange();
}

function processHashChange() {
  if (isRevertingHash) {
    isRevertingHash = false;
    return; 
  }

  let logoBranding = document.getElementById('branding-icon');
  if (logoBranding) {
    logoBranding.classList.add('nyala-sementara');
    setTimeout(() => {
      logoBranding.classList.remove('nyala-sementara');
    }, 300);
  }

  let fragment = window.location.hash.replace('#', '');

  if (typeof window.setMobilePanelExpanded === 'function') {
    isAppInitialLoad = false; 
  }

  if (fragment === '' && (PrimaryDataIsLoaded || isFetching)) {
    tampilkanDialog("Kembali ke beranda akan menghapus data yang sedang/sudah dimuat. Anda yakin ingin mereset pencarian?", "confirm", "Kembali ke Beranda")
      .then(yakin => {
        if (yakin) {
          lastValidHash = 'landing';
          history.replaceState(null, null, window.location.pathname);
          resetApp();
          document.title = 'Mulai – ' + BASE_TITLE;
          displayPanelContent('landing');
          updateNavigationUI(''); 
        } else {
          isRevertingHash = true;
          window.location.hash = lastValidHash === 'landing' ? '' : lastValidHash;
        }
      });
    return; 
  }

  updateNavigationUI(fragment);

  if (fragment === '') {
    lastValidHash = 'landing';
    history.replaceState(null, null, window.location.pathname); 
    resetApp(); 
    document.title = 'Mulai – ' + BASE_TITLE;
    displayPanelContent('landing');
  }
  else if (fragment === 'about') {
    lastValidHash = 'about'; 
    document.title = 'Tentang – ' + BASE_TITLE;
    displayPanelContent('about');
    currentDisplayedQid = null;
  }
  else {
    lastValidHash = fragment; 
    let isIndexPage = (fragment === 'hasil');

    if (!PrimaryDataIsLoaded) {
      if (fragment !== '') {
        if (!isIndexPage) window.location.hash = 'hasil'; 
        
        // Baca global UI state jika diakses via URL langsung
        let labelNama = typeof currentNamaKlaster !== 'undefined' ? currentNamaKlaster : 'Objek';
        
        if (isFetching) {
          document.title = `Memuat ${labelNama}... – ${BASE_TITLE}`;
        } else {
          document.title = 'Data Belum Ditarik – ' + BASE_TITLE;
        }

        displayPanelContent('index');

        let indexList = document.getElementById('index-list');          
        if (indexList && !isFetching) {
          indexList.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; line-height: 1.6;">
              <h3 style="margin-bottom: 10px; margin-top:0; color: #333;">Data Belum Ditarik</h3>
              <p style="color: #666; font-size:14px; margin-bottom: 25px;">
              Anda belum melakukan pencarian. Silakan kembali ke halaman Beranda untuk memilih entitas yang ingin dieksplorasi.</p>
              <a href="#" style="background-color: #7b0d0c; color: #fff; 
              padding: 10px 20px; text-decoration: none; border-radius: 5px; 
              font-weight: 600; display: inline-block;">Pilih Data</a>
            </div>
          `; 
        }
      }
    } 
    else {
      if (isIndexPage || !(fragment in Records)) {
        if (!isIndexPage) window.location.hash = 'hasil';  
        
        let labelKlaster = typeof currentNamaKlaster !== 'undefined' ? currentNamaKlaster : 'Objek';
        let labelWilayah = typeof currentNamaWilayah !== 'undefined' ? currentNamaWilayah : '';
        document.title = `${labelKlaster} di ${labelWilayah} – ${BASE_TITLE}`;
        
        displayPanelContent('index');
        currentDisplayedQid = null;
      }
      else {
        activateMapMarker(fragment);
        if (typeof displayRecordDetails === 'function') {
          displayRecordDetails(fragment);
        }
      }
    }
  }
}

function activateMapMarker(qid) {
  let record = Records[qid];
  if (!record.mapMarker) return; 

  if (record.popup && record.popup.isOpen()) {
    return;
  }

  try {
    Map.closePopup();

    if (!Cluster.hasLayer(record.mapMarker)) {
      Cluster.addLayer(record.mapMarker);
    }

    let countSameLocation = 0;
    if (typeof currentFilteredRecords !== 'undefined') {
      currentFilteredRecords.forEach(r => {
        if (r.lat === record.lat && r.lon === record.lon) {
          countSameLocation++;
        }
      });
    }

    if (countSameLocation > 60) {
      Map.setView([record.lat, record.lon], TILE_LAYER_MAX_ZOOM);
      setTimeout(() => {
        if (window.location.hash !== '#' + qid) return;
        let visibleParent = Cluster.getVisibleParent(record.mapMarker);
        if (visibleParent && visibleParent._icon) {
          visibleParent._icon.classList.add('cluster-efek-denyut');
          setTimeout(() => {
            if (visibleParent._icon) visibleParent._icon.classList.remove('cluster-efek-denyut');
          }, 4500);
        }
      }, 350);
    } else {
      Cluster.zoomToShowLayer(
        record.mapMarker,
        function() {
          if (window.location.hash !== '#' + qid) return;
          if (!record.popup.isOpen()) record.mapMarker.openPopup();
        }
      );
    }
  } catch (error) {
    console.warn("Interupsi animasi peta dicegat:", error);
  }
}

function displayPanelContent(id) {
  document.querySelectorAll('.panel-content').forEach(content => {
    content.style.display = (content.id === id) ? content.dataset.display : 'none';
  });
}

// STUBS untuk pemanggilan di JS 3 agar tidak error di Linter JS 1
function displayRecordDetails(qid) {}

function generateFigure(filename, title = "Situs", classNames = []) {
  if (filename) {
    let uniqueId = 'caption-' + Math.random().toString(36).substr(2, 9);
    let encodedFilename = encodeURIComponent(filename);
    
    tarikMetadataCaption(encodedFilename, uniqueId, null);

    return (
      `<figure class="${classNames.join(' ')}">` +
        `<a href="${COMMONS_WIKI_URL_PREF}File:${encodedFilename}" target="_blank">` +
          `<img class="loading" src="${COMMONS_WIKI_URL_PREF}Special:FilePath/${encodedFilename}?width=500" alt="" onload="this.className=''">` +
        '</a>' +
        `<figcaption id="${uniqueId}" data-filename="${encodedFilename}">(Memuat…)</figcaption>` +
      '</figure>'
    );
  } else {
    let namaAmanURL = encodeURIComponent(title);
    let gFormFotoUrl = `https://docs.google.com/forms/d/e/1FAIpQLSd7_u-7yCwDtXIkDO--bILry6mWGoRCnnfSumL_PEjfle0aLg/viewform?usp=pp_url&entry.2138396049=${namaAmanURL}`;
    return `<figure class="${classNames.join(' ')} nodata">Belum ada foto. <a href="${gFormFotoUrl}" target="_blank" rel="noopener noreferrer" style="border:none;" class="sunting-linktambah">Tambahkan!</a></figure>`;
  }
}

function extractImageFilename(image) {
  let regex = /https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//;
  return decodeURIComponent(image.value.replace(regex, ''));
}

function parseDate(result, keyName) {
  let dateVal = result[keyName].value;
  if (result[keyName + 'Precision'].value === YEAR_PRECISION) {
    return dateVal.substr(0, 4);
  } else {
    let date = new Date(dateVal);
    return date.toLocaleDateString('en-US', { month : 'long', day : 'numeric', year : 'numeric' });
  }
}

// ============================================================
// FITUR RADAR GPS
// ============================================================
function jalankanFilterGPS(selectElem) {
  selectElem.options[selectElem.selectedIndex].text = "⏳ Mencari satelit GPS...";

  let konfigurasiZoomAsli = window.TombolGPSMap.options.setView;
  window.TombolGPSMap.options.setView = false; 
  window.TombolGPSMap.start();

  Map.once('locationfound', function(e) {
    window.TombolGPSMap.options.setView = konfigurasiZoomAsli;

    userLocation = {
      lat: e.latlng.lat,
      lon: e.latlng.lng
    };

    selectElem.options[selectElem.selectedIndex].text = "Sekitar Anda (Radius 10 km)";
    if (typeof currentRegionFilter !== 'undefined') currentRegionFilter = 'terdekat';

    if (typeof userRadiusCircle !== 'undefined' && userRadiusCircle) {
        Map.removeLayer(userRadiusCircle);
    }

    window.userRadiusCircle = L.circle([userLocation.lat, userLocation.lon], {
      color: 'transparent',
      fillColor: '#882222',
      fillOpacity: 0.1,
      radius: 10000
    }).addTo(Map);

    Map.fitBounds(window.userRadiusCircle.getBounds());
    
    if (typeof applyIntersectionFilter === 'function') applyIntersectionFilter();
  });

  Map.once('locationerror', function(e) {
    window.TombolGPSMap.options.setView = konfigurasiZoomAsli;
    window.TombolGPSMap.stop(); 
    alert("Akses lokasi gagal atau ditolak. Pastikan GPS HP Anda menyala.");
    batalkanFilterGPS(selectElem);
  });
}

function batalkanFilterGPS(selectElem) {
  if (window.TombolGPSMap) window.TombolGPSMap.stop();

  Map.off('locationfound');
  Map.off('locationerror');

  if (typeof userRadiusCircle !== 'undefined' && userRadiusCircle) {
      Map.removeLayer(userRadiusCircle);
  }

  selectElem.value = 'all';
  if (typeof currentRegionFilter !== 'undefined') currentRegionFilter = 'all';
  userLocation = null;

  let opsi = Array.from(selectElem.options).find(opt => opt.value === 'terdekat');
  if (opsi) opsi.text = "Sekitar Anda (Radius 10 km)";

  if (typeof applyIntersectionFilter === 'function') applyIntersectionFilter();
}

function updateNavigationUI(fragment) {
  let navStandar = document.getElementById('nav-standar');
  let navDetail = document.getElementById('nav-detail');
  
  if (!navStandar || !navDetail) return;

  let subMenuAtas = document.getElementById('submenu-atas');
  let btnMenuInduk = document.getElementById('btn-menu-induk');
  
  if (subMenuAtas) subMenuAtas.style.display = 'none'; 
  
  if (btnMenuInduk && btnMenuInduk.parentElement) {
      btnMenuInduk.parentElement.classList.remove('selected', 'active');
  }

  let isDetailView = (fragment !== '' && fragment !== 'hasil' && fragment !== 'about' && fragment !== 'tutorial' && fragment !== 'medsos' && PrimaryDataIsLoaded && (fragment in Records));

  if (isDetailView) {
    navStandar.style.display = 'none';
    navDetail.style.display = 'flex';
    
    let btnPrev = document.getElementById('btn-prev');
    let btnNext = document.getElementById('btn-next');
    
    if (typeof currentFilteredRecords !== 'undefined') {
        let currentIndex = currentFilteredRecords.findIndex(r => r === Records[fragment]);
        
        if (currentIndex === -1) {
           let btnAll = document.getElementById('btn-all');
           if (btnAll) btnAll.click();
           currentIndex = currentFilteredRecords.findIndex(r => r === Records[fragment]);
        }
        
        let totalItems = currentFilteredRecords.length;
        if (totalItems > 1 && currentIndex !== -1) {
          let prevIndex = (currentIndex === 0) ? (totalItems - 1) : (currentIndex - 1);
          let nextIndex = (currentIndex === totalItems - 1) ? 0 : (currentIndex + 1);

          btnPrev.href = '#' + currentFilteredRecords[prevIndex].id;
          btnPrev.style.opacity = '1';
          btnPrev.style.pointerEvents = 'auto';

          btnNext.href = '#' + currentFilteredRecords[nextIndex].id;
          btnNext.style.opacity = '1';
          btnNext.style.pointerEvents = 'auto';
        } else {
          btnPrev.removeAttribute('href');
          btnPrev.style.opacity = '0.1';
          btnPrev.style.pointerEvents = 'none';

          btnNext.removeAttribute('href');
          btnNext.style.opacity = '0.1';
          btnNext.style.pointerEvents = 'none';
        }
    }
  } else {
    navStandar.style.display = 'flex';
    navDetail.style.display = 'none';
  }
  
  document.querySelectorAll('#nav-standar > li, #nav-detail > li').forEach(li => {
    li.classList.remove('selected', 'active');
  });

  document.querySelectorAll('#nav-standar > li, #nav-detail > li').forEach(li => {
    let link = li.querySelector('a'); 
    if (!link) return;
    let hrefVal = link.getAttribute('href');
    let linkId = link.getAttribute('id');
    
    if ((fragment === '' || fragment === 'landing') && hrefVal === '#') {
      li.classList.add('selected');
    } 
    else if (fragment === 'hasil' && hrefVal === '#hasil') {
      li.classList.add('selected');
    } 
    else if ((fragment === 'about' || fragment === 'tutorial' || fragment === 'medsos') && linkId === 'btn-menu-induk') {
      li.classList.add('selected');
    }
  });
}

function tarikMetadataCaption(filename, targetId, targetNode = null) {
  let url = new URL(COMMONS_API_URL);
  let params = {
    action: 'query', format: 'json', prop: 'imageinfo',
    iiprop: 'extmetadata', titles: 'File:' + decodeURIComponent(filename), origin: '*'
  };
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

  let fetchOptions = {};
  if (!targetNode && typeof globalFetchController !== 'undefined') {
    fetchOptions.signal = globalFetchController.signal;
  }

  fetch(url, fetchOptions)
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      let pages = data.query.pages;
      let page = Object.values(pages)[0];
      
      let targetCaption = targetNode || document.getElementById(targetId);
      if (!targetCaption) return;

      if (page.imageinfo && page.imageinfo[0].extmetadata) {
        let metadata = page.imageinfo[0].extmetadata;
        
        let artistHtml = metadata.Artist ? metadata.Artist.value.trim().replace(/<(?!\/?a ?)[^>]+>/g, '').replace(/Unknown authorUnknown author|UnknownUnknown/gi, 'Tak diketahui').replace(/AnonymousUnknown author/gi, 'Anonim') : '';
        if (artistHtml.includes('href="//')) artistHtml = artistHtml.replace(/href="(?:https?:)?\/\//g, 'href="https://');
        artistHtml = artistHtml.replace(/<a /gi, '<a target="_blank" ');

        let licenseHtml = '';
        if (metadata.AttributionRequired && metadata.AttributionRequired.value === 'true') {
          licenseHtml = metadata.LicenseShortName.value.replace(/ /g, ' ').replace(/-/g, '‑');
          licenseHtml = metadata.LicenseUrl ? ` <a href="${metadata.LicenseUrl.value}" target="_blank">[${licenseHtml}]</a>` : ` [${licenseHtml}]`;
        }
        
        targetCaption.innerHTML = artistHtml + licenseHtml;
      } else {
        targetCaption.innerHTML = 'Data lisensi tidak tersedia.';
      }
    })
    .catch(error => {
      if (error && error.name === 'AbortError') return;
      let targetCaption = targetNode || document.getElementById(targetId);
      if (targetCaption) targetCaption.innerHTML = 'Data gagal dimuat.';
    });
}

// ============================================================
// PINTASAN KEYBOARD (Kiri/Kanan)
// ============================================================
let isArrowLeftHeld = false;
let isArrowRightHeld = false;

window.addEventListener('keydown', function(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  let lightbox = document.getElementById('eph-lightbox');
  if (lightbox && lightbox.classList.contains('aktif')) return;

  if (e.key === 'ArrowLeft') {
    if (isArrowLeftHeld) return; 
    isArrowLeftHeld = true;
    
    let btnPrev = document.getElementById('btn-prev');
    if (btnPrev && btnPrev.hasAttribute('href') && btnPrev.style.pointerEvents !== 'none') {
      btnPrev.classList.add('active'); 
    }
  } 
  else if (e.key === 'ArrowRight') {
    if (isArrowRightHeld) return; 
    isArrowRightHeld = true;
    
    let btnNext = document.getElementById('btn-next');
    if (btnNext && btnNext.hasAttribute('href') && btnNext.style.pointerEvents !== 'none') {
      btnNext.classList.add('active'); 
    }
  }
});

window.addEventListener('keyup', function(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  let lightbox = document.getElementById('eph-lightbox');
  if (lightbox && lightbox.classList.contains('aktif')) return;

  if (e.key === 'ArrowLeft') {
    isArrowLeftHeld = false; 
    
    let btnPrev = document.getElementById('btn-prev');
    if (btnPrev && btnPrev.hasAttribute('href') && btnPrev.style.pointerEvents !== 'none') {
      btnPrev.classList.remove('active'); 
      window.location.hash = btnPrev.getAttribute('href'); 
    }
  } 
  else if (e.key === 'ArrowRight') {
    isArrowRightHeld = false; 
    
    let btnNext = document.getElementById('btn-next');
    if (btnNext && btnNext.hasAttribute('href') && btnNext.style.pointerEvents !== 'none') {
      btnNext.classList.remove('active'); 
      window.location.hash = btnNext.getAttribute('href'); 
    }
  }
});

// =======================================================
// LIGHTBOX GAMBAR (DUKUNGAN TOMBOL BACK)
// =======================================================
window.addEventListener('load', function() {
  let lightboxHtml = `
    <div id="eph-lightbox">
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <a id="lightbox-link" href="#" target="_blank">
          <img id="lightbox-img" src="" alt="Gambar Diperbesar">
        </a>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', lightboxHtml);

  let lightbox = document.getElementById('eph-lightbox');
  let backdrop = lightbox.querySelector('.lightbox-backdrop');
  let imgElem = document.getElementById('lightbox-img');
  let linkElem = document.getElementById('lightbox-link');

  document.addEventListener('click', function(e) {
    let targetImg = e.target.closest('#details figure img, .leaflet-popup-content img');
    
    if (targetImg) {
      e.preventDefault(); 

      let srcGambar = targetImg.src;
      let linkKeCommons = '';
      let parentLink = targetImg.closest('a');
      
      if (parentLink) {
        linkKeCommons = parentLink.href;
      } else {
        let namaFileRaw = srcGambar.split('Special:FilePath/')[1];
        if (namaFileRaw) {
          let namaFileBersih = namaFileRaw.split('?')[0]; 
          linkKeCommons = 'https://commons.wikimedia.org/wiki/File:' + namaFileBersih;
        }
      }

      if (srcGambar.includes('?width=')) {
        srcGambar = srcGambar.replace(/\?width=\d+/, '?width=500');
      }

      imgElem.src = srcGambar;
      linkElem.href = linkKeCommons || '#'; 
      lightbox.classList.add('aktif');

      window.history.pushState({ dalamLightbox: true }, null, window.location.href);
    }
  });

  backdrop.addEventListener('click', function() {
    lightbox.classList.remove('aktif');
    
    if (window.history.state && window.history.state.dalamLightbox) {
      window.history.back();
    }

    setTimeout(() => { 
      if (!lightbox.classList.contains('aktif')) imgElem.src = ''; 
    }, 300);
  });

  window.addEventListener('popstate', function(e) {
    if (lightbox.classList.contains('aktif')) {
      lightbox.classList.remove('aktif');
      
      setTimeout(() => { 
        if (!lightbox.classList.contains('aktif')) imgElem.src = ''; 
      }, 300);
    }
  });
});
