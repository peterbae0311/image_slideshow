/* ============================================================
   PANORAMA PHOTO ALBUM - app.js
   ============================================================ */

'use strict';

// ============================================================
// 1. STATE
// ============================================================
let supabaseClient = null;
let config         = {};
let albums         = [];
let selectedAlbum  = null;
let pendingPhotos    = [];    // File[] in add modal (new uploads)
let pendingMusicList = [];   // [{id,name,artist,url,source,_file?}] in add/edit modal
let musicPickerMode  = 'file'; // 'file' | 'ai'
let editingAlbumId   = null; // null = create mode, uuid = edit mode
let removedPhotoIds  = [];   // existing photo IDs marked for deletion
let previewAudio   = null;
let previewTimer   = null;
let bgAudio        = null;
let goodTextsTimer = null;
let panoScrollAnim   = null; // legacy, unused
let isDragging       = false;
let dragStartX       = 0;
let dragScrollLeft   = 0;
// Slideshow state
let slideshowPhotos  = [];
let currentSlideIdx  = 0;
let slideshowTimer   = null;
let slideshowPlaying = true;
let slideshowSpeed   = 3000;
let slideshowEffect  = 'fade';
let activeLayer      = 'a'; // 'a' or 'b'
let slideTransitionMs = 600;
let slideCleanupTimer = null; // 이전 전환 cleanup 타이머
let aiModelsCache  = [];

// ============================================================
// 2. MUSIC CATALOG
// ============================================================
const MUSIC_DATA = {
  '클래식': [
    { id:'c1', name:'봄의 왈츠',      artist:'Classic Orchestra', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id:'c2', name:'달빛 소나타',     artist:'Piano Works',       url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id:'c3', name:'현악 4중주',      artist:'String Quartet',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  ],
  '재즈': [
    { id:'j1', name:'밤의 재즈 클럽', artist:'Jazz Trio',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
    { id:'j2', name:'카페 스윙',       artist:'Smooth Jazz',  url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
    { id:'j3', name:'블루 노트',       artist:'Blue Jazz Band',url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  ],
  '자연/힐링': [
    { id:'n1', name:'숲속의 아침', artist:'Nature Ambient', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
    { id:'n2', name:'빗소리 명상', artist:'Rain Ambient',   url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
    { id:'n3', name:'파도와 바람', artist:'Ocean Waves',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  ],
  '팝': [
    { id:'p1', name:'여름 드라이브',   artist:'Summer Pop',   url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
    { id:'p2', name:'인디 팝 컬렉션', artist:'Indie Artists', url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
    { id:'p3', name:'팝 앤 소울',      artist:'Pop Soul',     url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
  ],
  '명상': [
    { id:'m1', name:'마음의 고요', artist:'Meditation',    url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3' },
    { id:'m2', name:'깊은 호흡',   artist:'Breathe Deep',  url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3' },
    { id:'m3', name:'새벽 명상',   artist:'Dawn Meditation',url:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3' },
  ],
};

// ============================================================
// 3. AI MODEL FALLBACKS (free/public models)
// ============================================================
const FALLBACK_MODELS = {
  openrouter: [
    { id:'meta-llama/llama-3.1-8b-instruct:free',  name:'Llama 3.1 8B',      provider:'OpenRouter', vision:false },
    { id:'google/gemma-3-27b-it:free',              name:'Gemma 3 27B',        provider:'OpenRouter', vision:false },
    { id:'qwen/qwen-2.5-7b-instruct:free',          name:'Qwen 2.5 7B',        provider:'OpenRouter', vision:false },
    { id:'mistralai/mistral-7b-instruct:free',      name:'Mistral 7B',         provider:'OpenRouter', vision:false },
    { id:'google/gemma-2-9b-it:free',               name:'Gemma 2 9B',         provider:'OpenRouter', vision:false },
    { id:'microsoft/phi-3-mini-128k-instruct:free', name:'Phi-3 Mini 128K',   provider:'OpenRouter', vision:false },
  ],
  groq: [
    { id:'meta-llama/llama-4-scout-17b-16e-instruct',    name:'Llama 4 Scout 17B',    provider:'Groq', vision:true  },
    { id:'meta-llama/llama-4-maverick-17b-128e-instruct',name:'Llama 4 Maverick 17B', provider:'Groq', vision:true  },
    { id:'llama-3.2-11b-vision-preview',                 name:'Llama 3.2 11B Vision', provider:'Groq', vision:true  },
    { id:'llama-3.2-90b-vision-preview',                 name:'Llama 3.2 90B Vision', provider:'Groq', vision:true  },
    { id:'llama-3.3-70b-versatile',                      name:'Llama 3.3 70B',        provider:'Groq', vision:false },
    { id:'llama-3.1-8b-instant',                         name:'Llama 3.1 8B Instant', provider:'Groq', vision:false },
    { id:'gemma2-9b-it',                                 name:'Gemma 2 9B',           provider:'Groq', vision:false },
  ],
  huggingface: [
    { id:'Salesforce/blip-image-captioning-large', name:'BLIP Captioning Large', provider:'HuggingFace', vision:true },
    { id:'nlpconnect/vit-gpt2-image-captioning',   name:'ViT-GPT2 Captioning',  provider:'HuggingFace', vision:true },
    { id:'Salesforce/blip-image-captioning-base',  name:'BLIP Captioning Base', provider:'HuggingFace', vision:true },
    { id:'unum-cloud/uform-gen2-qwen-500m',        name:'UForm Gen2 500M',      provider:'HuggingFace', vision:true },
  ],
};

// ============================================================
// 4. CONFIG / SETTINGS
// ============================================================
const CFG_KEY = 'panorama_cfg_v1';

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }
  catch { return {}; }
}
function saveConfig(obj) {
  localStorage.setItem(CFG_KEY, JSON.stringify(obj));
}

function openSettings() {
  // config.js의 APP_CONFIG 값을 우선 병합 (설정 팝업 열 때마다 최신 preset 반영)
  const preset = window.APP_CONFIG || {};
  if (preset.supabaseUrl) config.supabaseUrl = preset.supabaseUrl;
  if (preset.supabaseKey) config.supabaseKey = preset.supabaseKey;

  const m = document.getElementById('settings-modal');
  m.style.display = 'flex';
  document.getElementById('cfg-supabase-url').value  = config.supabaseUrl  || '';
  document.getElementById('cfg-supabase-key').value  = config.supabaseKey  || '';
  document.getElementById('cfg-openrouter-key').value = config.openrouterKey || '';
  document.getElementById('cfg-groq-key').value       = config.groqKey      || '';
  document.getElementById('cfg-hf-token').value       = config.hfToken      || '';
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

// ============================================================
// 5. SUPABASE INIT & DB HELPERS
// ============================================================
async function initSupabase() {
  if (!config.supabaseUrl || !config.supabaseKey) return false;
  try {
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    // 버킷/테이블 확인은 non-fatal — 연결 자체가 되면 true 반환
    await ensureBucket().catch(e => console.warn('bucket check:', e.message));
    const ok = await checkTablesExist();
    return ok;
  } catch (e) {
    console.error('Supabase init error:', e);
    return false;
  }
}

function isPgrstTransient(error) {
  if (!error) return false;
  return (
    error.code === 'PGRST002' ||
    error.status === 503 ||
    String(error.message).includes('schema cache') ||
    String(error.message).includes('Service Unavailable') ||
    String(error.message).includes('503')
  );
}

async function checkTablesExist() {
  const MAX_RETRY = 30;   // 최대 120초 대기 (프로젝트 복원 후 충분히 기다림)
  const DELAY_MS  = 4000;

  for (let i = 1; i <= MAX_RETRY; i++) {
    const { error } = await supabaseClient.from('albums').select('id').limit(1);

    if (!error) {
      hideDbMissingBanner();
      return true;
    }

    console.warn(`[${i}/${MAX_RETRY}] albums 접근 오류 (${error.code}): ${error.message}`);

    // PGRST002 / 503 = PostgREST 스키마 캐시 재로딩 중 (일시적) → 계속 재시도
    if (isPgrstTransient(error)) {
      showRetryBanner(i, MAX_RETRY);
      await sleep(DELAY_MS);
      continue;
    }

    // relation 오류 등 = 테이블 자체가 없음
    showDbMissingBanner(error.message);
    return false;
  }

  // 재시도 초과 — 그래도 진행 시도
  console.error('재시도 한도 초과. 앱을 계속 시작합니다.');
  hideDbMissingBanner();
  return true;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function showRetryBanner(attempt, max) {
  let banner = document.getElementById('db-missing-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'db-missing-banner';
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:2000;
      background:#fffbeb; border-bottom:2px solid #fcd34d;
      padding:12px 20px; display:flex; align-items:center; gap:12px;
      font-size:13px; color:#92400e;
    `;
    document.body.prepend(banner);
  }
  banner.innerHTML = `
    <span style="font-size:18px">⏳</span>
    <div style="flex:1">
      <strong>Supabase 준비 중...</strong>
      DB 캐시 재로딩 중입니다. 잠시만 기다려주세요.
      (${attempt}/${max} 재시도)
    </div>
    <div style="width:120px;height:4px;background:#fde68a;border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${Math.round((attempt/max)*100)}%;
                  background:#f59e0b;border-radius:4px;transition:width .3s"></div>
    </div>
  `;
}

function showDbMissingBanner(detail = '') {
  let banner = document.getElementById('db-missing-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'db-missing-banner';
    banner.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:2000;
      background:#fef2f2; border-bottom:2px solid #fca5a5;
      padding:12px 20px; display:flex; align-items:center; gap:12px;
      font-size:13px; color:#991b1b;
    `;
    banner.innerHTML = `
      <span style="font-size:18px">⚠️</span>
      <div style="flex:1">
        <strong>DB 연결 오류:</strong> ${escHtml(detail)}
        — Supabase URL/Key를 확인하거나 새로고침 해주세요.
      </div>
      <button onclick="localStorage.clear();location.reload();"
        style="background:#ef4444;color:#fff;padding:6px 14px;border-radius:8px;
               font-weight:600;font-size:12px;border:none;cursor:pointer;">
        초기화 후 재시작
      </button>
    `;
    document.body.prepend(banner);
  }
}

function hideDbMissingBanner() {
  const b = document.getElementById('db-missing-banner');
  if (b) b.remove();
}

async function ensureBucket() {
  // anon 키는 listBuckets 불가 — upload 시도가 실패해도 bucket은 이미 서버에서 생성됨
  // 아무것도 하지 않음 (버킷은 MCP로 사전 생성 완료)
}

async function loadAlbums() {
  if (!supabaseClient) return;

  let albumRows = null;
  for (let i = 1; i <= 5; i++) {
    const { data, error } = await supabaseClient
      .from('albums')
      .select('*, photos(id, filename, url, sort_order)')
      .order('created_at', { ascending: false });

    if (!error) { albumRows = data; break; }

    console.warn(`loadAlbums 재시도 ${i}/5:`, error.message);
    if (isPgrstTransient(error)) {
      await sleep(4000);
      continue;
    }
    console.error('loadAlbums 오류:', error.message);
    return;
  }

  albums = (albumRows || []).map(a => {
    // Backward compat: synthesize music_list from legacy fields
    let ml = Array.isArray(a.music_list) ? a.music_list : [];
    if (ml.length === 0 && a.music_url) {
      ml = [{ id: a.music_id || null, name: a.music_name || '음악', artist: a.music_artist || '', url: a.music_url, source: a.music_id ? 'ai' : 'file' }];
    }
    return { ...a, music_list: ml, photos: (a.photos || []).sort((x, y) => x.sort_order - y.sort_order) };
  });
  renderAlbumList();
}

async function uploadMusicFile(albumId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `music/${albumId}/${Date.now()}_${safeName}`;
  const { error } = await supabaseClient.storage.from('photos').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('photos').getPublicUrl(path);
  return { url: data.publicUrl, name: file.name.replace(/\.[^.]+$/, '') };
}

async function uploadMusicItems(albumId, musicList) {
  const result = [];
  for (const item of musicList) {
    if (item._file) {
      const { url, name: trackName } = await uploadMusicFile(albumId, item._file);
      result.push({ id: null, name: trackName, artist: '음악 파일', url, source: 'file' });
    } else {
      result.push({ id: item.id || null, name: item.name, artist: item.artist, url: item.url, source: item.source || 'ai' });
    }
  }
  return result;
}

async function createAlbum(name, albumDate, musicList, photoFiles) {
  // 1. Upload any local music files first
  const finalMusicList = await uploadMusicItems('tmp', musicList); // tmp id, fix after insert
  const first = finalMusicList[0] || null;

  // 2. Insert album with legacy fields from first track + music_list
  const { data: album, error: ae } = await supabaseClient
    .from('albums')
    .insert({
      name,
      album_date:   albumDate || null,
      music_id:     first?.id     || null,
      music_name:   first?.name   || null,
      music_url:    first?.url    || null,
      music_artist: first?.artist || null,
      music_list:   finalMusicList,
    })
    .select().single();
  if (ae) throw ae;

  // 3. Re-upload any file-based music with real albumId
  const reUpload = musicList.filter(m => m._file);
  if (reUpload.length > 0) {
    const reFixed = await uploadMusicItems(album.id, reUpload);
    // Merge back into finalMusicList (replace tmp urls)
    let fi = 0;
    for (let i = 0; i < finalMusicList.length; i++) {
      if (musicList[i]?._file) { finalMusicList[i] = reFixed[fi++]; }
    }
    const f0 = finalMusicList[0] || null;
    await supabaseClient.from('albums').update({
      music_id: f0?.id || null, music_name: f0?.name || null,
      music_url: f0?.url || null, music_artist: f0?.artist || null,
      music_list: finalMusicList,
    }).eq('id', album.id);
  }

  // 4. Upload photos
  const photoRows = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const path = `${album.id}/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: ue } = await supabaseClient.storage.from('photos').upload(path, file, { upsert: false });
    if (ue) { console.warn('Upload error:', ue); continue; }
    const { data: urlData } = supabaseClient.storage.from('photos').getPublicUrl(path);
    photoRows.push({ album_id: album.id, filename: file.name, storage_path: path, url: urlData.publicUrl, sort_order: i });
  }
  if (photoRows.length > 0) {
    const { error: pe } = await supabaseClient.from('photos').insert(photoRows);
    if (pe) throw pe;
  }
  return album;
}

async function updateAlbum(albumId, name, albumDate, musicList, newPhotoFiles, removedIds) {
  // 1. Upload any new local music files
  const finalMusicList = await uploadMusicItems(albumId, musicList);
  const first = finalMusicList[0] || null;

  // 2. albums 테이블 업데이트
  const { error: ue } = await supabaseClient.from('albums').update({
    name,
    album_date:   albumDate || null,
    music_id:     first?.id     || null,
    music_name:   first?.name   || null,
    music_url:    first?.url    || null,
    music_artist: first?.artist || null,
    music_list:   finalMusicList,
  }).eq('id', albumId);
  if (ue) throw ue;

  // 2. 삭제 표시된 기존 사진 제거
  if (removedIds.length > 0) {
    const album = albums.find(a => a.id === albumId);
    const toRemove = (album?.photos || []).filter(p => removedIds.includes(p.id));
    if (toRemove.length > 0) {
      await supabaseClient.storage.from('photos').remove(toRemove.map(p => p.storage_path));
      const { error: de } = await supabaseClient.from('photos').delete().in('id', removedIds);
      if (de) console.warn('photo delete error:', de.message);
    }
  }

  // 3. 새 사진 업로드
  if (newPhotoFiles.length > 0) {
    const existingCount = (albums.find(a => a.id === albumId)?.photos || []).length - removedIds.length;
    const photoRows = [];
    for (let i = 0; i < newPhotoFiles.length; i++) {
      const file = newPhotoFiles[i];
      const path = `${albumId}/${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: se } = await supabaseClient.storage.from('photos').upload(path, file, { upsert: false });
      if (se) { console.warn('Upload error:', se); continue; }
      const { data: urlData } = supabaseClient.storage.from('photos').getPublicUrl(path);
      photoRows.push({ album_id: albumId, filename: file.name, storage_path: path, url: urlData.publicUrl, sort_order: existingCount + i });
    }
    if (photoRows.length > 0) {
      const { error: pe } = await supabaseClient.from('photos').insert(photoRows);
      if (pe) throw pe;
    }
  }
}

async function deleteAlbum(albumId) {
  // Delete storage files
  const album = albums.find(a => a.id === albumId);
  if (album?.photos?.length) {
    const paths = album.photos.map(p => p.storage_path);
    await supabaseClient.storage.from('photos').remove(paths);
  }
  const { error } = await supabaseClient.from('albums').delete().eq('id', albumId);
  if (error) throw error;
}

// ============================================================
// 6. ALBUM LIST RENDERING
// ============================================================
function renderAlbumList() {
  const list = document.getElementById('record-list');
  document.getElementById('record-count').textContent = `${albums.length}개`;

  if (albums.length === 0) {
    list.innerHTML = `<div class="list-empty">
      <div class="list-empty-icon">🗂️</div>
      <p>앨범이 없습니다</p>
      <p class="list-empty-sub">+ 추가 버튼으로 시작하세요</p>
    </div>`;
    return;
  }

  list.innerHTML = albums.map(album => {
    const thumbs = album.photos.slice(0, 3).map(p =>
      `<img class="record-card-thumb" src="${escHtml(p.url)}" alt="${escHtml(p.filename)}">`
    ).join('');
    const moreCount = album.photos.length > 3 ? album.photos.length - 3 : 0;
    const moreHtml  = moreCount > 0 ? `<div class="record-card-thumb-more">+${moreCount}</div>` : '';

    const datePfx = album.album_date ? album.album_date.slice(0, 7) + ', ' : '';
    return `<div class="record-card${selectedAlbum?.id === album.id ? ' active' : ''}"
                 data-id="${album.id}" onclick="selectAlbum('${album.id}')">
      <div class="record-card-name">${datePfx ? `<span class="record-date-prefix">${escHtml(datePfx)}</span>` : ''}${escHtml(album.name)}</div>
      <div class="record-card-meta">
        <span class="record-card-photo-count">📷 ${album.photos.length}장</span>
        ${album.music_list?.length > 0 ? (() => {
          const names = album.music_list.map(m => m.name || '제목 없음');
          const label = names.length === 1
            ? names[0]
            : `${names[0]} 외 ${names.length - 1}곡`;
          const full  = names.join(', ');
          const disp  = label.length > 18 ? label.slice(0, 18) + '…' : label;
          return `<span class="record-card-music" title="${escHtml(full)}">🎵 ${escHtml(disp)}</span>`;
        })() : ''}
      </div>
      ${thumbs || moreHtml ? `<div class="record-card-thumbs">${thumbs}${moreHtml}</div>` : ''}
      <button class="btn-card-ai" onclick="handleAiAnalyze(event,'${album.id}')">좋은 글</button>
      <div class="record-card-actions">
        <button class="record-card-edit"   onclick="handleEditAlbum(event,'${album.id}')"   title="수정">✏️</button>
        <button class="record-card-delete" onclick="handleDeleteAlbum(event,'${album.id}')" title="삭제">✕</button>
      </div>
    </div>`;
  }).join('');
}

function handleEditAlbum(event, albumId) {
  event.stopPropagation();
  const album = albums.find(a => a.id === albumId);
  if (!album) return;
  openEditModal(album);
}

async function handleAiAnalyze(event, albumId) {
  event.stopPropagation();
  if (selectedAlbum?.id !== albumId) {
    selectAlbum(albumId);
    await new Promise(r => setTimeout(r, 80));
  }
  // 버튼 클릭 시 항상 새 글로 새로고침 (슬라이드·음악은 그대로)
  generateGoodTexts();
}

async function handleDeleteAlbum(event, albumId) {
  event.stopPropagation();
  if (!confirm('앨범을 삭제하시겠습니까?')) return;
  try {
    await deleteAlbum(albumId);
    if (selectedAlbum?.id === albumId) {
      selectedAlbum = null;
      showEmptyRight();
    }
    await loadAlbums();
    showToast('앨범이 삭제되었습니다');
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}

// ============================================================
// 7. SELECT ALBUM → SHOW PANORAMA
// ============================================================
function selectAlbum(albumId) {
  selectedAlbum = albums.find(a => a.id === albumId) || null;
  renderAlbumList();

  document.getElementById('btn-generate').disabled = !selectedAlbum;

  if (!selectedAlbum) { showEmptyRight(); return; }
  renderPanoramaView();
}

function showEmptyRight() {
  stopSlideshow();
  document.getElementById('empty-right').style.display = 'flex';
  document.getElementById('panorama-view').style.display = 'none';
  stopBgMusic();
}

function renderPanoramaView() {
  document.getElementById('empty-right').style.display = 'none';
  document.getElementById('panorama-view').style.display = 'flex';

  const album = selectedAlbum;

  // Header
  document.getElementById('pano-title').textContent = album.name;
  document.getElementById('pano-photo-count').textContent = `${album.photos.length}장`;
  const dateEl = document.getElementById('pano-date');
  if (dateEl) dateEl.textContent = album.album_date ? album.album_date.slice(0, 7) : '';

  // Build panorama strip
  buildPanoramaStrip(album.photos);

  // Music
  if (album.music_list?.length > 0) {
    startBgMusic(album);
  } else {
    stopBgMusic();
  }

  // 좋은 글 자동 시작
  generateGoodTexts();
}

// ============================================================
// 8. SLIDESHOW ENGINE
// ============================================================
const _imgSizeCache = {}; // url → {w, h} natural dimensions

function preloadSlideImages(photos) {
  photos.forEach(photo => {
    if (_imgSizeCache[photo.url]) return;
    const img = new Image();
    img.onload = () => { _imgSizeCache[photo.url] = { w: img.naturalWidth, h: img.naturalHeight }; };
    img.src = photo.url;
  });
}

function _sizeSlideImg(img) {
  const dims = _imgSizeCache[img.src];
  if (!dims) return;
  const wrap = document.getElementById('pano-strip-wrap');
  if (!wrap) return;
  if (!wrap.clientWidth || !wrap.clientHeight) {
    requestAnimationFrame(() => _sizeSlideImg(img));
    return;
  }
  const maxW = wrap.clientWidth  * 0.88;
  const maxH = wrap.clientHeight * 0.88;
  const ratio = dims.w / dims.h;
  let w, h;
  if (dims.w / maxW >= dims.h / maxH) {
    w = Math.min(dims.w, maxW); h = w / ratio;
  } else {
    h = Math.min(dims.h, maxH); w = h * ratio;
  }
  img.style.width  = Math.round(w) + 'px';
  img.style.height = Math.round(h) + 'px';

  // Self-clip: clip the layer to only its own image bounds.
  // Prevents ghosting when adjacent slides have different orientations (portrait/landscape).
  const layer = img.parentElement;
  if (layer) {
    const lr = layer.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    if (lr.width && lr.height) {
      const t = Math.max(0, (ir.top    - lr.top)    / lr.height * 100).toFixed(2);
      const r = Math.max(0, (lr.right  - ir.right)  / lr.width  * 100).toFixed(2);
      const b = Math.max(0, (lr.bottom - ir.bottom) / lr.height * 100).toFixed(2);
      const l = Math.max(0, (ir.left   - lr.left)   / lr.width  * 100).toFixed(2);
      const clip = `inset(${t}% ${r}% ${b}% ${l}%)`;
      layer.dataset.imgClip = clip;
      layer.style.clipPath  = clip;
    }
  }
}

function setLayerImage(layerEl, url) {
  let img = layerEl.querySelector('.pano-slide-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'pano-slide-img';
    layerEl.appendChild(img);
  }
  img.style.width  = '';
  img.style.height = '';
  img.onload = () => {
    _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
    _sizeSlideImg(img);
  };
  img.src = url;
  if (_imgSizeCache[url]) _sizeSlideImg(img);
  else if (img.complete && img.naturalWidth) {
    _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
    _sizeSlideImg(img);
  }
}

function buildPanoramaStrip(photos) {
  clearInterval(slideshowTimer);
  slideshowTimer   = null;
  slideshowPhotos  = photos;
  currentSlideIdx  = 0;
  activeLayer      = 'a';
  slideshowPlaying = true;

  const controls   = document.getElementById('pano-controls');
  const layerA     = document.getElementById('pano-layer-a');
  const layerB     = document.getElementById('pano-layer-b');
  const thumbList  = document.getElementById('pano-thumb-list');

  // Reset layers
  layerA.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:opacity,transform;z-index:2;opacity:1;transform:none;transition:none;animation:none;';
  layerB.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;will-change:opacity,transform;z-index:1;opacity:0;transform:none;transition:none;animation:none;';
  if (thumbList) thumbList.innerHTML = '';

  if (photos.length === 0) {
    controls.style.display = 'none';
    layerA.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,.5)">
      <div style="font-size:48px;margin-bottom:12px">📷</div>
      <p style="font-size:14px">이 앨범에 사진이 없습니다</p></div>`;
    return;
  }
  layerA.innerHTML = '';
  layerB.innerHTML = '';
  layerA.style.display = '';

  // Preload all images into cache so transitions are always smooth
  preloadSlideImages(photos);

  controls.style.display = 'flex';
  document.getElementById('btn-pano-play').classList.remove('paused');
  document.getElementById('btn-pano-play').title = '자동재생 정지';
  document.getElementById('pano-slide-index').textContent = `1 / ${photos.length}`;

  // Init first slide on layer A
  setLayerImage(layerA, photos[0].url);

  // Build thumbnail list
  if (thumbList) {
    photos.forEach((photo, i) => {
      const btn = document.createElement('div');
      btn.className = 'pano-thumb-btn' + (i === 0 ? ' active' : '');
      btn.dataset.idx = i + 1;
      btn.style.backgroundImage = `url('${photo.url}')`;
      btn.title = photo.filename;
      btn.addEventListener('click', () => {
        goToSlide(i);
        if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
      });
      thumbList.appendChild(btn);
    });
  }

  // Auto-play
  if (photos.length > 1) startSlideshow();
}

function startSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = setInterval(() => goToSlide(currentSlideIdx + 1, 'next'), slideshowSpeed);
}

function stopSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = null;
}

function goToSlide(rawIdx, direction = 'next') {
  const n = slideshowPhotos.length;
  if (n < 2) return;
  const newIdx = ((rawIdx % n) + n) % n;
  if (newIdx === currentSlideIdx) return;

  const inId  = activeLayer === 'a' ? 'b' : 'a';
  const outId = activeLayer;
  const inEl  = document.getElementById(`pano-layer-${inId}`);
  const outEl = document.getElementById(`pano-layer-${outId}`);

  currentSlideIdx = newIdx;
  activeLayer = inId;

  // Update UI immediately
  document.getElementById('pano-slide-index').textContent = `${newIdx + 1} / ${n}`;
  document.querySelectorAll('.pano-thumb-btn').forEach((d, i) => {
    d.classList.toggle('active', i === newIdx);
    if (i === newIdx) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Fully reset inEl before sizing so _sizeSlideImg's getBoundingClientRect() is correct.
  // If a previous slide/push left a transform on this layer, the clip would be computed
  // from the off-screen position and ghosting would occur on the next transition.
  inEl.style.transition  = 'none';
  inEl.style.animation   = 'none';
  inEl.style.transform   = 'none';
  inEl.style.opacity     = '0';
  inEl.style.filter      = '';
  inEl.style.clipPath    = '';
  inEl.getBoundingClientRect(); // force reflow so transform:none is applied before sizing

  const url = slideshowPhotos[newIdx].url;
  setLayerImage(inEl, url);

  // Double-RAF: ensures _sizeSlideImg has run and layout is painted before transition starts
  const doTransition = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => applySlideTransition(inEl, outEl, direction)));

  if (_imgSizeCache[url]) {
    doTransition();
  } else {
    const img = inEl.querySelector('.pano-slide-img');
    if (img && img.complete && img.naturalWidth) {
      _imgSizeCache[url] = { w: img.naturalWidth, h: img.naturalHeight };
      doTransition();
    } else {
      img?.addEventListener('load', doTransition, { once: true });
    }
  }
}

function applySlideTransition(inEl, outEl, direction) {
  const dur = slideTransitionMs;
  const ease = 'cubic-bezier(.4,0,.2,1)';

  // 이전 cleanup 타이머 취소 (겹침 방지)
  if (slideCleanupTimer) { clearTimeout(slideCleanupTimer); slideCleanupTimer = null; }

  // Clear old transitions/animations on BOTH layers immediately
  [inEl, outEl].forEach(el => {
    el.style.transition = 'none';
    el.style.animation  = 'none';
    el.style.filter     = '';
    el.style.transformOrigin = '';
  });
  // Restore self-clips on BOTH layers (cleanup timer clears outEl's clip each transition)
  inEl.style.clipPath  = inEl.dataset.imgClip  || '';
  outEl.style.clipPath = outEl.dataset.imgClip || '';
  // Force reflow so CSS transitions animate from the set state
  inEl.getBoundingClientRect();

  switch (slideshowEffect) {
    case 'fade':
      inEl.style.opacity = '0';
      inEl.style.transform = 'none';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity  = '1';
      outEl.style.opacity = '0';
      break;

    case 'slide': {
      const sign = direction === 'next' ? 1 : -1;
      inEl.style.transform = `translateX(${sign * 100}%)`;
      inEl.style.opacity = '1';
      outEl.style.transform = 'translateX(0)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `transform ${dur}ms ${ease}`;
      outEl.style.transition = `transform ${dur}ms ${ease}`;
      inEl.style.transform  = 'translateX(0)';
      outEl.style.transform = `translateX(${-sign * 100}%)`;
      break;
    }

    case 'zoom':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.1)';
      outEl.style.opacity = '1';
      outEl.style.transform = 'scale(1)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = 'scale(.93)';
      break;

    case 'kenburns':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.04)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      outEl.style.opacity = '0';
      setTimeout(() => {
        inEl.style.transition = 'none';
        inEl.style.animation  = `kenBurns ${slideshowSpeed * 3}ms ease-in-out infinite`;
      }, dur + 50);
      break;

    case 'push': {
      const pushSign = direction === 'next' ? 1 : -1;
      inEl.style.opacity = '1';
      inEl.style.transform = `translateX(${pushSign * 100}%)`;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `transform ${dur}ms ${ease}`;
      outEl.style.transition = `transform ${dur}ms ${ease}`;
      inEl.style.transform  = 'translateX(0)';
      outEl.style.transform = `translateX(${-pushSign * 100}%)`;
      break;
    }

    case 'zoomout':
      inEl.style.opacity = '0';
      inEl.style.transform = 'scale(1.18)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = 'scale(0.8)';
      break;

    case 'rotate': {
      const rotSign = direction === 'next' ? 1 : -1;
      inEl.style.opacity = '0';
      inEl.style.transform = `rotate(${-8 * rotSign}deg) scale(0.85)`;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'rotate(0deg) scale(1)';
      outEl.style.opacity = '0';
      outEl.style.transform = `rotate(${8 * rotSign}deg) scale(0.85)`;
      break;
    }

    case 'flip':
      inEl.style.opacity = '1';
      inEl.style.transform = 'perspective(1400px) rotateY(90deg)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      outEl.style.transition = `transform ${dur / 2}ms ${ease}, opacity ${dur / 2}ms ${ease}`;
      outEl.style.transform = 'perspective(1400px) rotateY(-90deg)';
      outEl.style.opacity = '0';
      setTimeout(() => {
        inEl.getBoundingClientRect();
        inEl.style.transition = `transform ${dur / 2}ms ${ease}`;
        inEl.style.transform = 'perspective(1400px) rotateY(0deg)';
      }, dur / 2);
      break;

    case 'swing':
      inEl.style.opacity = '0';
      inEl.style.transform = 'perspective(1400px) rotateX(28deg) translateY(-8%)';
      inEl.style.transformOrigin = 'top center';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `opacity ${dur}ms ${ease}, transform ${dur}ms cubic-bezier(.34,1.56,.64,1)`;
      outEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.transform = 'perspective(1400px) rotateX(0deg) translateY(0)';
      outEl.style.opacity = '0';
      break;

    case 'wipe': {
      const wipeStart = direction === 'next' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
      inEl.style.opacity = '1';
      inEl.style.clipPath = wipeStart;
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `clip-path ${dur}ms ${ease}`;
      inEl.style.clipPath = 'inset(0 0% 0 0%)';
      break;
    }

    case 'blur':
      inEl.style.opacity = '0';
      inEl.style.filter = 'blur(28px)';
      inEl.style.transform = 'scale(1.04)';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition  = `opacity ${dur}ms ${ease}, filter ${dur}ms ${ease}, transform ${dur}ms ${ease}`;
      outEl.style.transition = `opacity ${dur}ms ${ease}, filter ${dur * 0.6}ms ${ease}`;
      inEl.style.opacity = '1';
      inEl.style.filter = 'blur(0px)';
      inEl.style.transform = 'scale(1)';
      outEl.style.opacity = '0';
      outEl.style.filter = 'blur(20px)';
      break;

    case 'glitch':
      inEl.style.opacity = '0';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      outEl.style.animation = `glitchShake ${Math.round(dur * 0.55)}ms steps(1) forwards`;
      setTimeout(() => {
        outEl.style.animation = 'none';
        inEl.getBoundingClientRect();
        inEl.style.transition  = `opacity ${Math.round(dur * 0.45)}ms linear`;
        outEl.style.transition = `opacity ${Math.round(dur * 0.45)}ms linear`;
        inEl.style.opacity = '1';
        outEl.style.opacity = '0';
      }, dur * 0.55);
      break;
  }

  // Cleanup outgoing layer after transition (타이머 참조 저장으로 충돌 방지)
  slideCleanupTimer = setTimeout(() => {
    slideCleanupTimer = null;
    outEl.style.transition      = 'none';
    outEl.style.animation       = 'none';
    outEl.style.opacity         = '0';
    outEl.style.transform       = 'none';
    outEl.style.filter          = '';
    outEl.style.clipPath        = '';
    outEl.style.transformOrigin = '';
    outEl.style.zIndex          = '1';
    // Restore inEl self-clip (wipe effect leaves a full-reveal clip with no rounding)
    if (inEl.dataset.imgClip) inEl.style.clipPath = inEl.dataset.imgClip;
  }, dur + 80);
}

// Swipe/drag to navigate slides
function initPanoDrag() {
  const wrap = document.getElementById('pano-strip-wrap');
  let startX = 0;

  wrap.addEventListener('mousedown', e => { isDragging = true; startX = e.pageX; });
  wrap.addEventListener('touchstart', e => { isDragging = true; startX = e.touches[0].pageX; }, { passive: true });

  document.addEventListener('mouseup', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.pageX - startX;
    if (Math.abs(diff) > 40) goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
  });
  wrap.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.changedTouches[0].pageX - startX;
    if (Math.abs(diff) > 40) goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
  });
  wrap.addEventListener('touchstart', e => {
    isDragging = true; dragStartX = e.touches[0].pageX; dragScrollLeft = wrap.scrollLeft;
  }, { passive: true });
  wrap.addEventListener('touchmove', e => {
    if (!isDragging) return;
    wrap.scrollLeft = dragScrollLeft - (e.touches[0].pageX - dragStartX);
  }, { passive: true });
  wrap.addEventListener('touchend', () => { isDragging = false; });
}

// ============================================================
// 9. MUSIC PLAYER
// ============================================================
let bgTrackList    = [];
let bgTrackIdx     = 0;
let bgShuffleOn    = false;
let bgShuffleQueue = []; // remaining indices for current shuffle cycle

function _nextShuffleIdx() {
  if (bgShuffleQueue.length === 0) {
    // refill: all indices except current
    bgShuffleQueue = Array.from({ length: bgTrackList.length }, (_, i) => i)
      .filter(i => i !== bgTrackIdx);
    // shuffle
    for (let i = bgShuffleQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bgShuffleQueue[i], bgShuffleQueue[j]] = [bgShuffleQueue[j], bgShuffleQueue[i]];
    }
    if (bgShuffleQueue.length === 0) bgShuffleQueue = [bgTrackIdx]; // single-track edge case
  }
  return bgShuffleQueue.shift();
}

function _prevShuffleIdx() {
  // For prev during shuffle: just go to a random different track
  const others = Array.from({ length: bgTrackList.length }, (_, i) => i).filter(i => i !== bgTrackIdx);
  if (others.length === 0) return bgTrackIdx;
  return others[Math.floor(Math.random() * others.length)];
}

function toggleShuffle() {
  bgShuffleOn = !bgShuffleOn;
  bgShuffleQueue = [];
  const btn = document.getElementById('btn-music-shuffle');
  if (btn) btn.classList.toggle('shuffle-active', bgShuffleOn);
}

function startBgMusic(album) {
  stopBgMusic();
  bgTrackList    = album.music_list || [];
  bgShuffleQueue = [];
  if (bgTrackList.length === 0) return;
  bgTrackIdx = 0;
  playBgTrack(bgTrackIdx);
}

function playBgTrack(idx) {
  if (bgAudio) { bgAudio.pause(); bgAudio = null; }
  const track = bgTrackList[idx];
  if (!track?.url) return;

  bgAudio = new Audio(track.url);
  bgAudio.volume = parseFloat(document.getElementById('volume-slider').value);
  bgAudio.play().catch(() => {});

  bgAudio.addEventListener('ended', () => {
    if (bgShuffleOn && bgTrackList.length > 1) {
      bgTrackIdx = _nextShuffleIdx();
    } else {
      bgTrackIdx = (bgTrackIdx + 1) % bgTrackList.length;
    }
    playBgTrack(bgTrackIdx);
  });
  bgAudio.addEventListener('timeupdate', updateMusicProgress);
  bgAudio.addEventListener('loadedmetadata', () => {
    document.getElementById('music-total-time').textContent = formatTime(bgAudio.duration);
  });

  document.getElementById('pano-music-inline').style.display = 'flex';
  document.getElementById('pano-music-divider').style.display = 'block';
  const rawName = track.name || '음악 재생 중';
  const npEl = document.getElementById('np-name');
  npEl.textContent = rawName.length > 20 ? rawName.slice(0, 20) + '…' : rawName;
  npEl.title = rawName.length > 20 ? rawName : '';
  document.getElementById('btn-play').textContent = '⏸';
  document.getElementById('music-icon-anim').classList.add('playing');
  // Show prev/next/shuffle only when multiple tracks exist
  const multi = bgTrackList.length > 1;
  document.getElementById('btn-music-prev').style.display    = multi ? '' : 'none';
  document.getElementById('btn-music-next').style.display    = multi ? '' : 'none';
  document.getElementById('btn-music-shuffle').style.display = multi ? '' : 'none';
  if (multi) {
    const shuffleBtn = document.getElementById('btn-music-shuffle');
    if (shuffleBtn) shuffleBtn.classList.toggle('shuffle-active', bgShuffleOn);
  }
}

function stopBgMusic() {
  if (bgAudio) { bgAudio.pause(); bgAudio = null; }
  const inline = document.getElementById('pano-music-inline');
  const divider = document.getElementById('pano-music-divider');
  if (inline)  inline.style.display  = 'none';
  if (divider) divider.style.display = 'none';
  const icon = document.getElementById('music-icon-anim');
  if (icon) icon.classList.remove('playing');
  const playBtn = document.getElementById('btn-play');
  if (playBtn) playBtn.textContent = '▶';
  const cur = document.getElementById('music-cur-time');
  if (cur) cur.textContent = '0:00';
  const tot = document.getElementById('music-total-time');
  if (tot) tot.textContent = '-:--';
  document.getElementById('btn-music-shuffle').style.display = 'none';
}

function toggleMusicPlay() {
  if (!bgAudio) return;
  if (bgAudio.paused) {
    bgAudio.play();
    document.getElementById('btn-play').textContent = '⏸';
    document.getElementById('music-icon-anim').classList.add('playing');
  } else {
    bgAudio.pause();
    document.getElementById('btn-play').textContent = '▶';
    document.getElementById('music-icon-anim').classList.remove('playing');
  }
}

function toggleMute() {
  if (!bgAudio) return;
  bgAudio.muted = !bgAudio.muted;
  document.getElementById('btn-mute').textContent = bgAudio.muted ? '🔇' : '🔊';
}

function setVolume(val) {
  if (bgAudio) bgAudio.volume = parseFloat(val);
}

function seekMusic(e) {
  if (!bgAudio || !bgAudio.duration) return;
  const rect = document.getElementById('music-progress-wrap').getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  bgAudio.currentTime = pct * bgAudio.duration;
}

function updateMusicProgress() {
  if (!bgAudio || !bgAudio.duration) return;
  const pct = (bgAudio.currentTime / bgAudio.duration) * 100;
  document.getElementById('music-progress-fill').style.width = pct + '%';
  document.getElementById('music-cur-time').textContent = formatTime(bgAudio.currentTime);
}

function formatTime(s) {
  if (!isFinite(s)) return '-:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ============================================================
// 10. MUSIC PREVIEW (10s)
// ============================================================
function previewMusicTrack(track) {
  stopMusicPreview();
  const btn = document.querySelector(`.btn-preview[data-id="${track.id}"]`);
  previewAudio = new Audio(track.url);
  previewAudio.volume = 0.5;
  previewAudio.play().catch(() => {});
  if (btn) btn.classList.add('playing');
  if (btn) btn.textContent = '⏹ 정지';

  previewTimer = setTimeout(() => stopMusicPreview(), 10000);

  previewAudio.onended = stopMusicPreview;
}

function stopMusicPreview() {
  clearTimeout(previewTimer);
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
  document.querySelectorAll('.btn-preview').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶ 미리 듣기';
  });
}

// ============================================================
// 11. ADD MODAL
// ============================================================

function resetAddModal() {
  pendingPhotos    = [];
  pendingMusicList = [];
  musicPickerMode  = 'file';
  editingAlbumId   = null;
  removedPhotoIds  = [];
  document.getElementById('input-album-name').value       = '';
  document.getElementById('input-album-date').value       = '';
  document.getElementById('name-char-count').textContent  = '0';
  document.getElementById('photo-preview-grid').innerHTML = '';
  renderModalMusicList();
}

function setModalMode(mode) {
  const isEdit = mode === 'edit';
  document.getElementById('add-modal-emoji').textContent    = isEdit ? '✏️' : '📁';
  document.getElementById('add-modal-title').textContent    = isEdit ? '앨범 수정' : '새 앨범 추가';
  document.getElementById('add-modal-subtitle').textContent = isEdit ? '내용을 수정한 후 저장하세요' : '사진과 배경 음악을 선택해주세요';
  document.getElementById('save-btn-label').textContent     = '저장';
}

function openAddModal() {
  resetAddModal();
  setModalMode('add');
  document.getElementById('add-modal').style.display = 'flex';
}

function openEditModal(album) {
  resetAddModal();
  setModalMode('edit');
  editingAlbumId = album.id;

  // 앨범 이름 + 일자 pre-fill
  const nameInput = document.getElementById('input-album-name');
  nameInput.value = album.name;
  document.getElementById('name-char-count').textContent = album.name.length;
  document.getElementById('input-album-date').value = album.album_date || '';

  // 기존 사진 썸네일 표시
  album.photos.forEach(photo => renderExistingPhotoThumb(photo));

  // 음악 목록 pre-fill
  pendingMusicList = (album.music_list || []).map(m => ({ ...m }));
  renderModalMusicList();

  document.getElementById('add-modal').style.display = 'flex';
}

function closeAddModal() {
  stopMusicPreview();
  editingAlbumId  = null;
  removedPhotoIds = [];
  document.getElementById('add-modal').style.display = 'none';
}

async function saveAlbum() {
  const name = document.getElementById('input-album-name').value.trim();
  if (!name) { showToast('앨범 명칭을 입력해주세요', 'error'); return; }
  const albumDate = document.getElementById('input-album-date').value || null;

  const saveBtn    = document.getElementById('btn-save-album');
  const saveLabel  = document.getElementById('save-btn-label');
  const saveSpinner= document.getElementById('save-spinner');
  saveBtn.disabled = true;
  saveLabel.style.display  = 'none';
  saveSpinner.style.display = 'block';

  try {
    if (editingAlbumId) {
      // ── 수정 모드 ──
      await updateAlbum(editingAlbumId, name, albumDate, pendingMusicList, pendingPhotos, removedPhotoIds);
      await loadAlbums();
      // 수정한 앨범이 선택 중이었으면 갱신
      if (selectedAlbum?.id === editingAlbumId) {
        selectedAlbum = albums.find(a => a.id === editingAlbumId) || null;
        if (selectedAlbum) renderPanoramaView();
      }
      closeAddModal();
      showToast('앨범이 수정되었습니다 ✨', 'success');
    } else {
      // ── 생성 모드 ──
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await createAlbum(name, albumDate, pendingMusicList, pendingPhotos);
          break;
        } catch (e) {
          if (isPgrstTransient(e) && attempt < 5) {
            showToast(`DB 준비 중... 재시도 중 (${attempt}/5)`, 'info');
            await sleep(4000);
            continue;
          }
          throw e;
        }
      }
      await loadAlbums();
      closeAddModal();
      showToast('앨범이 저장되었습니다 ✨', 'success');
    }
  } catch (e) {
    const isTransient = isPgrstTransient(e);
    const msg = isTransient
      ? 'Supabase 준비 중입니다. 잠시 후 다시 시도해주세요 (DB 캐시 로딩)'
      : e.message?.includes('relation') || e.message?.includes('does not exist')
        ? 'DB 테이블이 없습니다. supabase-schema.sql을 먼저 실행해주세요'
        : '저장 실패: ' + e.message;
    showToast(msg, 'error');
    console.error(e);
  } finally {
    saveBtn.disabled = false;
    saveLabel.style.display  = 'block';
    saveSpinner.style.display = 'none';
  }
}

// ============================================================
// 12. PHOTO UPLOAD
// ============================================================
function initDropZone() {
  const zone  = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    addPhotos([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
  });
  input.addEventListener('change', () => {
    addPhotos([...input.files]);
    input.value = '';
  });
}

function addPhotos(files) {
  files.forEach(file => {
    pendingPhotos.push(file);
    const reader = new FileReader();
    reader.onload = e => renderPhotoThumb(file, e.target.result);
    reader.readAsDataURL(file);
  });
}

function renderExistingPhotoThumb(photo) {
  const grid = document.getElementById('photo-preview-grid');
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';
  wrap.dataset.photoId = photo.id;
  wrap.innerHTML = `<img class="photo-thumb" src="${escHtml(photo.url)}" alt="${escHtml(photo.filename)}">
    <button class="photo-thumb-del" title="삭제">✕</button>`;
  wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
    removedPhotoIds.push(photo.id);
    wrap.remove();
  });
  grid.appendChild(wrap);
}

function renderPhotoThumb(file, dataUrl) {
  const grid = document.getElementById('photo-preview-grid');
  const wrap = document.createElement('div');
  wrap.className = 'photo-thumb-wrap';
  wrap.innerHTML = `<img class="photo-thumb" src="${dataUrl}" alt="${escHtml(file.name)}">
    <button class="photo-thumb-del" title="삭제">✕</button>`;
  wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
    pendingPhotos = pendingPhotos.filter(f => f !== file);
    wrap.remove();
  });
  grid.appendChild(wrap);
}

// ============================================================
// 13. MUSIC SELECTION — MODAL LIST + PICKER SUB-MODAL
// ============================================================

/* ── 메인 모달의 음악 목록 렌더링 ── */
function renderModalMusicList() {
  const el = document.getElementById('modal-music-list');
  if (!el) return;
  if (pendingMusicList.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = pendingMusicList.map((item, idx) => {
    const name = item.name || '제목 없음';
    const displayName = name.length > 20 ? name.slice(0, 20) + '…' : name;
    return `<div class="modal-music-item">
      <span class="modal-music-item-icon">🎵</span>
      <div class="modal-music-item-info">
        <div class="modal-music-item-name" title="${escHtml(name)}">${escHtml(displayName)}</div>
        <div class="modal-music-item-artist">${escHtml(item.artist || '')}</div>
      </div>
      <button class="modal-music-item-del" onclick="removeMusicFromList(${idx})" title="삭제">✕</button>
    </div>`;
  }).join('');
}

function removeMusicFromList(idx) {
  pendingMusicList.splice(idx, 1);
  renderModalMusicList();
}

function addMusicToList(item) {
  pendingMusicList.push(item);
  renderModalMusicList();
  closeMusicPicker();
}

/* ── 음악 선택 서브 팝업 ── */
function openMusicPicker() {
  musicPickerMode = 'file';
  switchMusicPickerTab('file');
  document.getElementById('mp-file-input').value = '';
  document.getElementById('mp-category-select').value = '';
  document.getElementById('mp-music-list').style.display = 'none';
  document.getElementById('mp-music-items').innerHTML = '';
  document.getElementById('music-picker-modal').style.display = 'flex';
}

function closeMusicPicker() {
  stopMusicPreview();
  document.getElementById('music-picker-modal').style.display = 'none';
}

function switchMusicPickerTab(mode) {
  musicPickerMode = mode;
  const isFile = mode === 'file';
  document.getElementById('mptab-file').classList.toggle('active', isFile);
  document.getElementById('mptab-ai').classList.toggle('active', !isFile);
  document.getElementById('mp-file-section').style.display = isFile ? '' : 'none';
  document.getElementById('mp-ai-section').style.display   = isFile ? 'none' : '';
}

function renderPickerAiList(category) {
  const tracks = MUSIC_DATA[category] || [];
  const listWrap = document.getElementById('mp-music-list');
  const items    = document.getElementById('mp-music-items');
  if (tracks.length === 0) { listWrap.style.display = 'none'; return; }
  items.innerHTML = tracks.map(t => `
    <div class="music-item" data-id="${t.id}"
         onclick="pickerSelectAiTrack('${t.id}','${escHtml(category)}')">
      <div class="music-item-info">
        <div class="music-item-name">${escHtml(t.name)}</div>
        <div class="music-item-artist">${escHtml(t.artist)}</div>
      </div>
      <button class="btn-preview" data-id="${t.id}"
              onclick="event.stopPropagation(); handlePickerPreview('${t.id}','${escHtml(category)}')">
        ▶ 미리 듣기
      </button>
    </div>`).join('');
  listWrap.style.display = 'block';
}

function handlePickerPreview(trackId, category) {
  const track = MUSIC_DATA[category]?.find(t => t.id === trackId);
  if (!track) return;
  if (previewAudio && !previewAudio.paused) { stopMusicPreview(); return; }
  previewMusicTrack(track);
}

function pickerSelectAiTrack(trackId, category) {
  const track = MUSIC_DATA[category]?.find(t => t.id === trackId);
  if (!track) return;
  stopMusicPreview();
  addMusicToList({ id: track.id, name: track.name, artist: track.artist, url: track.url, source: 'ai' });
}

function initMusicPickerModal() {
  document.getElementById('btn-add-music').addEventListener('click', openMusicPicker);
  document.getElementById('btn-close-music-picker').addEventListener('click', closeMusicPicker);

  document.getElementById('mptab-file').addEventListener('click', () => switchMusicPickerTab('file'));
  document.getElementById('mptab-ai').addEventListener('click',   () => switchMusicPickerTab('ai'));

  // 음악 파일 선택 → 즉시 추가 후 닫기
  const mpFileInput = document.getElementById('mp-file-input');
  document.getElementById('btn-mp-file').addEventListener('click', () => mpFileInput.click());
  mpFileInput.addEventListener('change', function () {
    Array.from(this.files).forEach(file => {
      const name = file.name.replace(/\.[^.]+$/, '');
      pendingMusicList.push({ id: null, name, artist: '음악 파일', url: null, source: 'file', _file: file });
    });
    renderModalMusicList();
    closeMusicPicker();
    this.value = '';
  });

  // AI 제공 카테고리 선택
  document.getElementById('mp-category-select').addEventListener('change', function () {
    stopMusicPreview();
    if (this.value) renderPickerAiList(this.value);
    else document.getElementById('mp-music-list').style.display = 'none';
  });

  // 피커 오버레이 클릭 → 닫기
  document.getElementById('music-picker-modal').addEventListener('click', function (e) {
    if (e.target === this) closeMusicPicker();
  });
}

// ============================================================
// 14. AI MODEL FETCHING
// ============================================================
async function fetchAiModels() {
  const all = [];

  // OpenRouter — fetch free models
  if (config.openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${config.openrouterKey}` }
      });
      if (res.ok) {
        const data = await res.json();
        const free = (data.data || []).filter(m =>
          parseFloat(m.pricing?.prompt || '1') === 0 ||
          (typeof m.pricing?.prompt === 'string' && m.pricing.prompt === '0')
        );
        free.forEach(m => all.push({
          id: m.id,
          name: m.name || m.id,
          provider: 'OpenRouter',
          vision: !!(m.architecture?.input_modalities?.includes('image') ||
                     m.architecture?.modality?.includes('image') ||
                     /vision|vl|multimodal/i.test(m.id)),
        }));
      }
    } catch (e) { console.warn('OpenRouter model fetch failed, using fallback'); }
  }
  // OpenRouter 폴백: 키가 있을 때만
  if (config.openrouterKey && all.filter(m => m.provider === 'OpenRouter').length === 0) {
    all.push(...FALLBACK_MODELS.openrouter);
  }

  // Groq — fetch available models
  if (config.groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${config.groqKey}` }
      });
      if (res.ok) {
        const data = await res.json();
        (data.data || []).forEach(m => all.push({
          id: m.id, name: m.id, provider: 'Groq',
          vision: /vision/i.test(m.id),
        }));
      }
    } catch (e) { console.warn('Groq model fetch failed, using fallback'); }
  }
  // Groq 폴백: 키가 있을 때만
  if (config.groqKey && all.filter(m => m.provider === 'Groq').length === 0) {
    all.push(...FALLBACK_MODELS.groq);
  }

  // HuggingFace — use known models
  if (config.hfToken) {
    all.push(...FALLBACK_MODELS.huggingface);
  }

  return all;
}

// ============================================================
// 15. AI IMAGE ANALYSIS
// ============================================================
async function generatePanorama() {
  if (!selectedAlbum) return;
  const photos = selectedAlbum.photos;
  if (photos.length === 0) { showToast('앨범에 사진이 없습니다', 'error'); return; }
  if (!config.openrouterKey && !config.groqKey) {
    document.getElementById('pano-ai-panel').innerHTML = `<div class="pano-ai-empty">
      <div class="pano-ai-empty-icon">🔑</div>
      <p style="font-size:12px;line-height:1.7">AI 분석을 사용하려면<br>설정(⚙️)에서<br><strong>OpenRouter</strong> 또는<br><strong>Groq API 키</strong>를<br>입력해주세요.</p>
    </div>`;
    document.getElementById('panorama-view').style.display = 'flex';
    document.getElementById('empty-right').style.display = 'none';
    showToast('설정에서 AI API 키를 입력해주세요', 'error');
    return;
  }

  const btn       = document.getElementById('btn-generate');
  const progressEl= document.getElementById('generate-progress');
  const fillEl    = document.getElementById('gen-progress-fill');
  const statusEl  = document.getElementById('gen-status-text');
  const aiPanel   = document.getElementById('pano-ai-panel');
  const loadingEl = document.getElementById('pano-loading');

  btn.disabled = true;
  progressEl.style.display = 'block';
  loadingEl.style.display = 'flex';

  aiPanel.innerHTML = `<div class="pano-ai-loading">
    <div class="loading-ring" style="width:32px;height:32px;border-width:3px"></div>
    <span>AI 분석 중...</span>
  </div>`;

  const setStatus  = msg => { statusEl.textContent = msg; };
  const setProgress= pct => { fillEl.style.width = pct + '%'; };

  const VISION_PROMPT = `이 사진들을 분석해서 반드시 아래 두 섹션으로 한국어로 작성해주세요.

[사실 분석]
사진에 보이는 인물, 장소, 사물, 분위기 등을 객관적으로 2~3문장으로 설명하세요.

[감성 스토리]
부드럽고 유머스럽고 에너지 넘치는 문체로 이 순간을 2~3문장으로 표현하세요.`;

  const makeTextPrompt = () =>
    `앨범 이름: "${selectedAlbum.name}"${selectedAlbum.album_date ? ', ' + selectedAlbum.album_date.slice(0, 7) : ''}
사진 ${photos.length}장이 포함된 가족 앨범입니다.

반드시 아래 두 섹션으로 한국어로 작성해주세요.

[사실 분석]
앨범 이름과 날짜를 바탕으로 어떤 사진들일지 2~3문장으로 설명하세요.

[감성 스토리]
부드럽고 유머스럽고 에너지 넘치는 문체로 이 순간을 2~3문장으로 표현하세요.`;

  try {
    setStatus('AI 모델 조회 중...');
    setProgress(15);

    const models = await fetchAiModels();
    aiModelsCache = models;

    const visionModels = models.filter(m => m.vision);
    const textModels   = models.filter(m => !m.vision);

    let resultText = null;
    let usedModel  = null;
    const errLog   = [];   // 에러 수집

    // ── 1단계: 비전 모델로 실제 사진 분석 ──
    if (visionModels.length > 0) {
      setStatus(`비전 모델 ${visionModels.length}개 시도 중...`);
      setProgress(30);
      for (const model of visionModels.slice(0, 5)) {
        try {
          setStatus(`${model.name} 분석 중...`);
          resultText = await requestAnalysis(model, photos, VISION_PROMPT);
          if (resultText && resultText.length > 30) { usedModel = model; break; }
          else errLog.push(`${model.name}: 응답 없음`);
        } catch (e) {
          const msg = e.message || String(e);
          errLog.push(`${model.name}: ${msg}`);
          console.warn('[Vision]', model.name, msg);
        }
        setProgress(Math.min(70, (fillEl.offsetWidth / fillEl.parentElement.offsetWidth * 100) + 10));
      }
    }

    // ── 2단계: 비전 실패 시 텍스트 모델로 폴백 ──
    if (!resultText && textModels.length > 0) {
      setStatus('텍스트 모델로 재시도 중...');
      setProgress(75);
      const textPrompt = makeTextPrompt();
      for (const model of textModels.slice(0, 5)) {
        try {
          setStatus(`${model.name} 분석 중...`);
          resultText = await requestAnalysis(model, [], textPrompt);
          if (resultText && resultText.length > 30) { usedModel = model; break; }
          else errLog.push(`${model.name}: 응답 없음`);
        } catch (e) {
          const msg = e.message || String(e);
          errLog.push(`${model.name}: ${msg}`);
          console.warn('[Text]', model.name, msg);
        }
      }
    }

    loadingEl.style.display = 'none';
    setProgress(100);
    setStatus(resultText ? '✅ 분석 완료' : '❌ 분석 실패');
    setTimeout(() => { progressEl.style.display = 'none'; }, 2000);

    if (resultText) {
      renderAiPanel(resultText, usedModel);
      await saveAiAnalysis(selectedAlbum.id, resultText);
    } else {
      const errDetail = errLog.length
        ? errLog.map(e => `• ${e}`).join('\n')
        : '모델 없음 (API 키 확인)';
      console.error('[AI 분석 실패]\n' + errDetail);
      aiPanel.innerHTML = `<div class="pano-ai-empty" style="align-items:flex-start;padding:4px">
        <div style="font-size:24px;align-self:center">😕</div>
        <p style="font-size:11.5px;font-weight:700;color:var(--primary);margin:4px 0 6px">분석 실패</p>
        <pre style="font-size:10px;color:var(--text-muted);line-height:1.6;white-space:pre-wrap;word-break:break-all;background:var(--surface-3);border-radius:6px;padding:8px;width:100%">${escHtml(errDetail)}</pre>
      </div>`;
    }

  } catch (e) {
    setStatus('❌ 오류: ' + e.message);
    loadingEl.style.display = 'none';
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

function renderAiPanel(text, model) {
  const aiPanel = document.getElementById('pano-ai-panel');

  // 두 섹션 파싱
  const factMatch  = text.match(/\[사실 분석\]([\s\S]*?)(?=\[감성 스토리\]|$)/);
  const storyMatch = text.match(/\[감성 스토리\]([\s\S]*?)$/);
  const factText   = factMatch  ? factMatch[1].trim()  : '';
  const storyText  = storyMatch ? storyMatch[1].trim() : text.trim();

  aiPanel.innerHTML = `
    ${factText ? `<div class="pano-ai-section">
      <div class="pano-ai-section-title">사실 분석</div>
      <div class="pano-ai-text pano-ai-editable" contenteditable="true" data-section="fact">${escHtml(factText)}</div>
    </div>` : ''}
    <div class="pano-ai-section">
      <div class="pano-ai-section-title">감성 스토리</div>
      <div class="pano-ai-text pano-ai-editable" contenteditable="true" data-section="story">${escHtml(storyText)}</div>
    </div>
    ${model ? `<div class="pano-ai-model-tag">🤖 ${escHtml(model.name)}</div>` : ''}
    <button class="pano-ai-save-btn" id="btn-ai-save" style="display:none" onclick="saveAiPanelEdits()">💾 저장</button>`;

  // 편집 시 저장 버튼 표시
  aiPanel.querySelectorAll('.pano-ai-editable').forEach(el => {
    el.addEventListener('input', () => {
      const saveBtn = document.getElementById('btn-ai-save');
      if (saveBtn) saveBtn.style.display = 'flex';
    });
  });
}

async function saveAiAnalysis(albumId, text) {
  if (!supabaseClient || !albumId) return;
  const { error } = await supabaseClient
    .from('albums')
    .update({ ai_analysis: text })
    .eq('id', albumId);
  if (error) { console.warn('AI 분석 저장 실패:', error.message); return; }
  // 로컬 캐시 업데이트
  const album = albums.find(a => a.id === albumId);
  if (album) album.ai_analysis = text;
  if (selectedAlbum?.id === albumId) selectedAlbum.ai_analysis = text;
}

async function saveAiPanelEdits() {
  if (!selectedAlbum) return;
  const factEl  = document.querySelector('.pano-ai-editable[data-section="fact"]');
  const storyEl = document.querySelector('.pano-ai-editable[data-section="story"]');

  const factText  = factEl?.innerText?.trim()  || '';
  const storyText = storyEl?.innerText?.trim() || '';

  // 섹션 마커 포함 원문 형식으로 재조합
  let raw = '';
  if (factText)  raw += `[사실 분석]\n${factText}\n\n`;
  if (storyText) raw += `[감성 스토리]\n${storyText}`;
  raw = raw.trim();

  const saveBtn = document.getElementById('btn-ai-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

  await saveAiAnalysis(selectedAlbum.id, raw);

  if (saveBtn) { saveBtn.disabled = false; saveBtn.style.display = 'none'; saveBtn.innerHTML = '💾 저장'; }
  showToast('AI 분석이 저장되었습니다 ✨', 'success');
}

async function requestAnalysis(model, photos, prompt) {
  if (model.provider === 'OpenRouter') return await callOpenRouter(model, photos, prompt);
  if (model.provider === 'Groq')       return await callGroq(model, photos, prompt);
  return null;
}

async function callOpenRouter(model, photos, prompt) {
  const content = model.vision && photos.length > 0
    ? [
        { type: 'text', text: prompt },
        ...photos.slice(0, 4).map(p => ({ type: 'image_url', image_url: { url: p.url } })),
      ]
    : prompt;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.href,
      'X-Title': '앨범',
    },
    body: JSON.stringify({ model: model.id, messages: [{ role: 'user', content }], max_tokens: 600 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function callGroq(model, photos, prompt) {
  const messages = model.vision && photos.length > 0
    ? [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: photos[0].url } },
      ]}]
    : [{ role: 'user', content: prompt }];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: model.id, messages, max_tokens: 600 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function callHuggingFace(model, photos) {
  if (photos.length === 0) return null;
  const imgRes = await fetch(photos[0].url);
  if (!imgRes.ok) throw new Error('Image fetch failed');
  const blob = await imgRes.blob();
  const res = await fetch(`https://api-inference.huggingface.co/models/${model.id}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.hfToken}` },
    body: blob,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data[0]?.generated_text || null;
  return data?.generated_text || null;
}

// ============================================================
// 16. AI RESULT RENDERING
// ============================================================
function renderAiModelGrid(models) {
  const grid = document.getElementById('ai-models-grid');
  const sec  = document.getElementById('ai-models-section');
  document.getElementById('ai-models-total').textContent = models.length;

  grid.innerHTML = models.map(m => {
    const cls = m.provider === 'OpenRouter' ? 'chip-openrouter' : m.provider === 'Groq' ? 'chip-groq' : 'chip-hf';
    return `<div class="ai-model-chip ${cls}">
      <span class="chip-provider">${m.provider}</span>
      <span>${escHtml(m.name)}</span>
      ${m.vision ? '<span class="chip-vision">👁 비전</span>' : ''}
    </div>`;
  }).join('');
  sec.style.display = 'block';
}

function appendAiResult(model, text) {
  const list = document.getElementById('ai-results-list');
  const card = document.createElement('div');
  card.className = 'ai-result-card';
  card.innerHTML = `
    <div class="ai-result-header">
      <span class="ai-result-model">${escHtml(model.name)}</span>
      <span class="ai-result-provider">${model.provider}</span>
      ${model.vision ? '<span class="chip-vision" style="font-size:10px;background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:3px">👁 비전</span>' : ''}
    </div>
    <div class="ai-result-text">${escHtml(text)}</div>`;
  list.appendChild(card);
  list.scrollTop = list.scrollHeight;
}

function toggleAiPanel(sectionId, btnId) {
  const sec = document.getElementById(sectionId);
  const isHidden = sec.style.maxHeight === '30px';
  sec.style.maxHeight = isHidden ? '' : '30px';
  document.getElementById(btnId).textContent = isHidden ? '접기' : '펼치기';
}

// ============================================================
// 17. TOAST
// ============================================================
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ============================================================
// 18. UTILITY
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// 19. EVENT BINDING
// ============================================================
function bindEvents() {
  // Settings modal
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const url = document.getElementById('cfg-supabase-url').value.trim();
    const key = document.getElementById('cfg-supabase-key').value.trim();
    if (!url || !key) { showToast('Supabase URL과 Anon Key는 필수입니다', 'error'); return; }

    config = {
      supabaseUrl:    url,
      supabaseKey:    key,
      openrouterKey:  document.getElementById('cfg-openrouter-key').value.trim(),
      groqKey:        document.getElementById('cfg-groq-key').value.trim(),
      hfToken:        document.getElementById('cfg-hf-token').value.trim(),
    };
    try { saveConfig(config); } catch(e) { console.warn('localStorage 저장 실패:', e); }
    closeSettings();
    showToast('설정이 저장되었습니다 ✨', 'success');

    const ok = await initSupabase();
    if (ok) await loadAlbums();
    else    showToast('Supabase 연결에 실패했습니다. URL/키를 확인해주세요.', 'error');
  });

  document.getElementById('btn-open-settings').addEventListener('click', openSettings);

  // Add album modal
  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('btn-close-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-save-album').addEventListener('click', saveAlbum);

  // Char counter
  document.getElementById('input-album-name').addEventListener('input', function () {
    document.getElementById('name-char-count').textContent = this.value.length;
  });

  // Panorama generate
  document.getElementById('btn-generate').addEventListener('click', generatePanorama);

  // Slideshow controls
  document.getElementById('btn-slide-prev').addEventListener('click', () => {
    goToSlide(currentSlideIdx - 1, 'prev');
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); } // reset timer
  });
  document.getElementById('btn-slide-next').addEventListener('click', () => {
    goToSlide(currentSlideIdx + 1, 'next');
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
  });
  document.getElementById('btn-pano-play').addEventListener('click', function () {
    slideshowPlaying = !slideshowPlaying;
    if (slideshowPlaying) {
      startSlideshow();
      this.textContent = '⏸';
      this.title = '자동재생 정지';
      this.classList.remove('paused');
    } else {
      stopSlideshow();
      this.textContent = '▶';
      this.title = '자동재생 시작';
      this.classList.add('paused');
    }
  });
  document.getElementById('pano-speed-select').addEventListener('change', function () {
    slideshowSpeed = parseInt(this.value, 10);
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
  });
  document.getElementById('pano-effect-select').addEventListener('change', function () {
    slideshowEffect = this.value;
  });

  // Left panel collapse toggle
  document.querySelector('.brand-icon').addEventListener('click', () => {
    document.querySelector('.left-panel').classList.toggle('collapsed');
  });

  // Music player controls (now in pano-controls inline)
  document.getElementById('btn-play').addEventListener('click', toggleMusicPlay);
  document.getElementById('btn-mute').addEventListener('click', toggleMute);
  document.getElementById('volume-slider').addEventListener('input', function () { setVolume(this.value); });
  document.getElementById('music-progress-wrap').addEventListener('click', seekMusic);
  document.getElementById('btn-music-prev').addEventListener('click', () => {
    if (bgTrackList.length < 2) return;
    bgTrackIdx = bgShuffleOn ? _prevShuffleIdx() : (bgTrackIdx - 1 + bgTrackList.length) % bgTrackList.length;
    playBgTrack(bgTrackIdx);
  });
  document.getElementById('btn-music-next').addEventListener('click', () => {
    if (bgTrackList.length < 2) return;
    bgTrackIdx = bgShuffleOn ? _nextShuffleIdx() : (bgTrackIdx + 1) % bgTrackList.length;
    playBgTrack(bgTrackIdx);
  });
  document.getElementById('btn-music-shuffle').addEventListener('click', toggleShuffle);

  // Music picker sub-modal
  initMusicPickerModal();

  // Toggle AI sections (elements may not exist in current layout)
  document.getElementById('btn-toggle-models')?.addEventListener('click', function () {
    const sec = document.getElementById('ai-models-section');
    const collapsed = sec.style.maxHeight === '48px';
    sec.style.maxHeight = collapsed ? '' : '48px';
    this.textContent = collapsed ? '접기' : '펼치기';
  });
  document.getElementById('btn-toggle-results')?.addEventListener('click', function () {
    const sec = document.getElementById('ai-results-section');
    const collapsed = sec.style.maxHeight === '48px';
    sec.style.maxHeight = collapsed ? '' : '48px';
    this.textContent = collapsed ? '접기' : '펼치기';
  });

  // Close modals on overlay click
  document.getElementById('settings-modal').addEventListener('click', function (e) {
    if (e.target === this && config.supabaseUrl) closeSettings();
  });

  // add-modal: 드래그 중이거나 드래그 직후 클릭은 닫기 무시
  let _addModalDragActive = false;
  const addModal = document.getElementById('add-modal');
  addModal.addEventListener('dragenter', e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragover',  e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragleave', e => {
    // relatedTarget 이 null 이면 화면 밖으로 나간 것
    if (!e.relatedTarget || !addModal.contains(e.relatedTarget)) _addModalDragActive = false;
  });
  addModal.addEventListener('drop', e => {
    e.preventDefault();
    _addModalDragActive = false;
  });
  addModal.addEventListener('click', function (e) {
    if (_addModalDragActive) return;
    if (e.target === this) closeAddModal();
  });
}

// ============================================================
// 20. INIT
// ============================================================
async function init() {
  // config.js 의 APP_CONFIG 값을 우선 적용, 없으면 localStorage 사용
  const saved = loadConfig();
  const preset = window.APP_CONFIG || {};
  config = {
    supabaseUrl:  preset.supabaseUrl  || saved.supabaseUrl  || '',
    supabaseKey:  preset.supabaseKey  || saved.supabaseKey  || '',
    openrouterKey: saved.openrouterKey || '',
    groqKey:       saved.groqKey       || '',
    hfToken:       saved.hfToken       || '',
  };
  // preset 값이 있으면 localStorage도 최신화
  if (preset.supabaseUrl) saveConfig(config);

  bindEvents();
  initDropZone();
  initPanoDrag();

  if (config.supabaseUrl && config.supabaseKey) {
    document.getElementById('settings-modal').style.display = 'none';
    const ok = await initSupabase();
    if (ok) await loadAlbums();
    else openSettings();
  } else {
    openSettings();
  }
}

// ============================================================
// 16. 좋은 글
// ============================================================
const GOOD_TEXTS = [
  { text: '봄비가 내리는 오후, 창문에 맺힌 빗방울들이 유리를 타고 천천히 흘러내렸다. 나는 그 물줄기를 눈으로 따라가며 아무 생각도 하지 않았고, 그 무심함이 오히려 마음을 맑게 씻어주는 것 같았다.', source: '박완서, 《그 많던 싱아는 누가 다 먹었을까》' },
  { text: '오래된 책장을 넘기면 어디선가 오래된 시간의 냄새가 풍긴다. 그것은 먼지와 종이와 누군가의 손길이 뒤섞인 냄새인데, 나는 그 냄새를 맡을 때마다 혼자가 아니라는 이상한 안도감을 느끼곤 했다.', source: '이청준, 《당신들의 천국》' },
  { text: '그녀가 떠난 자리에 찻잔 하나가 남겨져 있었다. 손잡이가 살짝 금 간 그 찻잔에는 아직 온기가 남아 있었고, 나는 한참을 그 자리에 서서 식어가는 그 온도를 바라보았다.', source: '김훈, 《남한산성》' },
  { text: '가을 저녁의 냄새는 설명하기가 어렵다. 낙엽과 흙과 멀리서 흘러오는 연기가 뒤섞인 그 냄새는, 이상하게도 슬프기보다는 안도에 가까운 감정을 건드린다. 돌아갈 곳이 있다는 느낌 같은 것.', source: '윤후명, 《돈황의 사랑》' },
  { text: '그는 말이 없는 사람이었다. 그러나 그의 곁에 있으면 세상이 조금 더 조용해지고, 그 조용함 속에서 오히려 더 많은 것들이 들려오는 것 같았다. 침묵에도 종류가 있다는 걸 그에게서 배웠다.', source: '최인호, 《별들의 고향》' },
  { text: '강물은 바위를 부수지 않는다. 다만 오랜 시간을 흘러 바위 곁을 스쳐 지나면서, 어느 날 문득 그것을 부드럽게 만들어버린다. 서두르지 않아도 닿을 수 있다는 것을 강은 언제나 조용히 보여준다.', source: '법정, 《무소유》' },
  { text: '첫눈이 내리던 밤, 우리는 아무 말도 없이 나란히 앉아 창밖을 바라보았다. 눈송이가 가로등 빛 아래 천천히 내려앉는 것을 보며, 이 순간이 기억 속에 오래 남겠다고 나는 생각했다.', source: '공지영, 《우리들의 행복한 시간》' },
  { text: '삶이란 완성된 그림이 아니라고 그녀는 말했다. 매일 조금씩 덧칠해 가는 수채화 같은 것이라서, 실수한 자리도 지우지 않고 그냥 그 위에 다시 색을 올리면 된다고. 그 말이 오래 마음에 남았다.', source: '신경숙, 《엄마를 부탁해》' },
  { text: '저녁 햇살이 부엌 창을 비스듬히 물들이는 순간이 있다. 겨우 몇 분밖에 되지 않는 그 시간에 나는 이상하게 멈추게 된다. 이 작은 일상이 사실은 얼마나 귀한 것인지를, 그 빛이 매번 일깨워준다.', source: '김애란, 《달려라, 아비》' },
  { text: '기억은 사진보다 정직하다. 사진은 찰나를 담지만 기억은 그때의 온도와 냄새와 바람의 방향까지 함께 보관한다. 그래서 어떤 기억은 꺼낼 때마다 그날로 데려다 놓는 것처럼 생생하게 살아난다.', source: '은희경, 《새의 선물》' },
  { text: '어머니의 손은 항상 내 이마보다 조금 더 차가웠다. 열이 날 때 그 손이 이마 위에 얹히면 세상이 잠시 멈추는 것 같았고, 나는 그 서늘함이 세상에서 가장 따뜻한 것이라는 걸 한참 후에야 알았다.', source: '박완서, 《나목》' },
  { text: '그해 여름, 우리는 선풍기 소리를 배경 삼아 오랜 이야기를 나눴다. 서로의 어린 시절과 부끄러운 기억들을 꺼내가며 웃었고, 그 이야기들은 지금도 바람이 부는 날이면 어딘가에서 살랑거리는 것 같다.', source: '성석제, 《황만근은 이렇게 말했다》' },
  { text: '소년은 별을 세다 잠들었다. 열일곱 번째 별에서 눈꺼풀이 무거워졌고, 꿈속에서도 별들은 그의 주변을 가만히 돌았다. 아무것도 바라지 않던 그 나이의 밤하늘이 어쩌면 가장 넓었을지도 모른다.', source: '이상, 《날개》' },
  { text: '우리가 나눈 가장 긴 대화는 말이 없었다. 마주 앉아 같은 음악을 들으며 각자의 생각 속에 잠겨 있던 그 오후가, 어떤 수많은 말들보다 더 깊이 서로를 이해한 시간이었다고 나는 지금도 믿는다.', source: '황석영, 《오래된 정원》' },
  { text: '낡은 골목에 접어들면 시간이 천천히 흐르는 것 같았다. 골목은 서두르는 법이 없었고, 거기 사는 고양이들도 마찬가지였다. 그곳만큼은 세상이 나에게 빨리 가라고 등을 밀지 않았다.', source: '조경란, 《혀》' },
  { text: '겨울 새벽의 공기는 날카롭지만 그래서 정직하다. 차가운 숨을 깊이 들이마시면 폐 속 구석까지 서늘하게 열리는 느낌이 나는데, 그 순간만큼은 내가 살아 있다는 사실이 아주 선명하게 느껴진다.', source: '김훈, 《칼의 노래》' },
  { text: '그녀는 편지를 쓸 때면 항상 창가에 앉았다. 빛이 있어야 글씨가 예뻐진다고, 그것이 단순한 습관이 아니라 자신이 오랜 시간 지켜온 의식 같은 것이라고 했다. 나는 그 진지함이 좋았다.', source: '박경리, 《토지》' },
  { text: '비가 그친 직후의 세계는 모든 것이 조금 더 또렷해 보인다. 빛도 다르고 냄새도 다르고, 젖은 아스팔트 위로 하늘이 반사되는 방식도 다르다. 그래서 나는 비 온 뒤의 세상을 유독 좋아한다.', source: '김연수, 《세계의 끝 여자친구》' },
  { text: '할머니의 손등에는 주름이 가득했다. 어릴 때는 그냥 지나쳤던 그 손을, 어른이 되어 다시 바라보니 주름 하나하나가 살아온 날들의 이야기였다. 그 손을 잡을 수 있을 때 더 많이 잡았어야 했다.', source: '신경숙, 《기차는 7시에 떠나네》' },
  { text: '음악이 끝나고 이어지는 짧은 침묵이 있다. 마지막 음이 공기 중에 잠시 머물다 사라지는 그 몇 초 동안, 나는 때때로 세상에서 가장 아름다운 소리를 듣는다. 여운이라는 것은 그런 것이다.', source: '이문열, 《우리들의 일그러진 영웅》' },
  { text: '늦은 밤 혼자 끓이는 라면의 온기는 배고픔보다 더 깊은 자리를 채워준다. 그것이 무엇인지 정확히 설명할 수는 없지만, 뜨거운 국물이 목을 타고 내려갈 때 마음 어딘가가 함께 녹는 기분이 든다.', source: '김애란, 《비행운》' },
  { text: '봄이 되면 강변에 나가 한참을 앉아 있곤 했다. 물이 흐르는 소리는 항상 같은데 매번 다르게 들렸고, 그 소리를 듣고 있으면 마음속에 쌓인 먼지 같은 것들이 조용히 씻겨 내려가는 것 같았다.', source: '법정, 《홀로 사는 즐거움》' },
  { text: '좋은 사람을 알아보는 방법은 의외로 간단하다. 그 사람과 함께 있을 때 내가 더 좋은 사람이 되고 싶어지는지를 보면 된다. 그런 사람이 곁에 있다는 것은 삶이 주는 가장 조용한 선물이다.', source: '공지영, 《도가니》' },
  { text: '등대는 폭풍 속에서도 자리를 지킨다. 흔들리지 않아서가 아니라, 흔들리면서도 불을 끄지 않기 때문이다. 그것이 존재의 이유를 아는 것과 모르는 것의 차이라고, 나는 그 불빛을 보며 생각했다.', source: '한강, 《채식주의자》' },
  { text: '새벽 네 시의 도시는 낮과 전혀 다른 얼굴을 하고 있다. 거리는 솔직해지고 가로등은 외로워 보이고, 드물게 지나가는 차들의 불빛은 왜인지 슬프다. 그 시간에 깨어 있다는 것은 특별한 목격이다.', source: '최승자, 《이 시대의 사랑》' },
  { text: '꽃이 지는 것을 슬퍼하지 않기로 했다. 꽃잎이 떨어지는 것은 끝이 아니라 다음 봄을 위한 가장 조용하고 성실한 준비라는 것을, 나는 해마다 봄이 올 때마다 다시 확인하고 또 잊는다.', source: '나태주, 《꽃을 보듯 너를 본다》' },
  { text: '어떤 문장은 오래전에 쓰였는데도 꼭 오늘의 나를 위해 쓰인 것처럼 읽힌다. 그럴 때 나는 글이란 시간을 건너는 일이라는 것을 실감한다. 죽은 사람의 목소리가 살아 있는 사람의 가슴에 닿는 일.', source: '이청준, 《서편제》' },
  { text: '사람이 사람에게 기댈 수 있다는 것, 그 단순하고 오래된 사실이 때로는 세상에서 가장 큰 위안이 된다. 특별한 말이 필요한 게 아니었다. 그냥 옆에 있어도 된다는 것을 알게 되는 순간이 있다.', source: '황석영, 《삼포 가는 길》' },
  { text: '그는 글을 쓸 때 항상 펜을 종이에 댄 채로 한참을 생각했다. 잉크가 살짝 번지도록 그 자리에 멈춰 있는 동안, 그는 무엇을 생각하고 있었을까. 나는 그 정직한 망설임의 흔적을 좋아했다.', source: '이상, 《종생기》' },
  { text: '두 사람이 같은 방향을 바라볼 때 사랑이 시작된다고 누군가 썼다. 서로를 바라보는 것이 아니라 나란히 서서 같은 것을 함께 보는 것. 그것이 어쩌면 가장 오래 지속되는 사랑의 형태일지 모른다.', source: '생텍쥐페리, 《어린 왕자》 (김현 역)' },
  { text: '겨울이 깊을수록 봄은 더 간절해진다. 그래서 봄꽃은 언제나 그토록 눈부시다. 오랜 추위를 견뎌낸 것들만이 낼 수 있는 그 화사함이, 단순한 아름다움이 아니라 하나의 증언처럼 느껴진다.', source: '도종환, 《접시꽃 당신》' },
  { text: '말하지 않아도 알아주는 사람이 곁에 있다는 것, 그것이 어쩌면 가장 오래되고 가장 무거운 형태의 사랑일지 모른다. 설명하지 않아도 된다는 안도감이 얼마나 큰 것인지, 잃고 나서야 알게 됐다.', source: '은희경, 《마지막 춤은 나와 함께》' },
  { text: '강은 굽어 흐르면서도 결국 바다에 닿는다. 돌아가는 것이 틀린 게 아님을 강은 온몸으로 보여준다. 지름길만이 정답이 아니라는 것을, 굽이굽이 흘러가는 물줄기가 묵묵히 증명하는 셈이다.', source: '법정, 《산에는 꽃이 피네》' },
  { text: '첫사랑이 아름다운 것은 돌아오지 않아서가 아니라, 그 시절의 우리가 그토록 순수했기 때문이다. 상처받을 것을 알면서도 뛰어들던 그 무모함이, 지금 생각하면 가장 용감한 순간이었는지도 모른다.', source: '최인호, 《고래사냥》' },
  { text: '글을 읽는다는 것은 타인의 마음속으로 잠시 이사 드는 일이다. 낯선 방에 앉아 그 사람의 창문으로 세상을 내다보다가, 돌아올 때 우리는 언제나 전과 조금 다른 사람이 되어 있다.', source: '이문열, 《젊은날의 초상》' },
  { text: '그 사람이 떠난 뒤에도 그 사람이 좋아하던 노래는 여전히 흘러나왔다. 음악은 사람보다 오래 남는다. 그것이 위로인지 아픔인지 한동안 알 수 없었지만, 결국 나는 그 노래를 끄지 않기로 했다.', source: '공지영, 《봉순이 언니》' },
  { text: '사랑한다는 말을 아끼는 사람들이 있다. 쉽게 꺼내지 않는 것은 냉정함이 아니라, 그 말이 얼마나 무거운지를 너무 잘 알기 때문이다. 그런 사람에게 그 말을 듣는다면 그것은 대단한 일이다.', source: '박완서, 《그 산이 정말 거기 있었을까》' },
  { text: '눈이 내리는 밤이면 세상이 한 겹 더 조용해진다. 그 고요 속에서 오래된 것들이 고개를 든다. 잊고 지냈던 얼굴들, 미처 하지 못한 말들, 그리고 아직도 마음 어딘가에 남아 있는 이름들이.', source: '김승옥, 《무진기행》' },
  { text: '삶의 아름다움은 완벽한 날들이 아니라 허술하고 평범한 날들 사이에서 문득 빛나는 순간들에 있다. 뜻밖의 웃음, 우연히 마신 따뜻한 커피, 퇴근길에 만난 석양. 그런 것들이 삶을 살게 한다.', source: '김애란, 《두근두근 내 인생》' },
  { text: '나는 그 사람의 발소리만 들어도 알 수 있었다. 현관에서 들려오는 걸음걸이만으로 오늘의 기분을 읽을 수 있었다. 사랑이란 그런 것이다. 말보다 먼저, 몸이 기억하는 것.', source: '신경숙, 《리진》' },
  { text: '하루가 끝날 때 오늘 나는 누구에게 친절했는가를 가만히 떠올려본다. 크지 않아도 된다. 문을 잡아주거나 눈을 마주치며 웃어주는 것으로 충분하다. 그것만으로도 하루를 정리하는 데 부족함이 없다.', source: '법정, 《아름다운 마무리》' },
  { text: '저녁 연기가 피어오르는 굴뚝을 보면 이상하게 마음이 놓인다. 저기 누군가 있다는 것, 그 사람이 지금 따뜻한 무언가를 만들고 있다는 것만으로, 세상이 아직 괜찮다는 생각이 들었다.', source: '이순원, 《은비령》' },
  { text: '여름밤 풀벌레 소리는 지구의 가장 오래된 자장가다. 그 소리를 들으며 누워 있으면 잠이 오기 전에 먼저 마음이 잠드는 것 같다. 복잡한 것들이 하나씩 자리를 비우고 고요함이 스며드는 시간.', source: '유안진, 《지란지교를 꿈꾸며》' },
  { text: '그녀가 남긴 마지막 편지는 짧았다. 그러나 그 짧음 속에 오랜 시간 하지 못했던 모든 말들이 눌려 있었다. 짧게 쓰인 문장이 어떻게 그렇게 오래 마음에 남을 수 있는지, 지금도 이해하지 못한다.', source: '한강, 《소년이 온다》' },
  { text: '오래된 장소에는 시간이 켜켜이 쌓인 냄새가 있다. 처음 온 곳인데도 낯설지 않은 그 기분은, 어쩌면 이 공간이 기억하는 수많은 사람들의 온기가 아직 남아 있기 때문인지도 모른다.', source: '황석영, 《바리데기》' },
  { text: '사계절이 바뀌어도 같은 자리에 서 있는 나무를 보면 이상하게 안심이 된다. 변하지 않는 것들이 있다는 사실이, 모든 것이 빠르게 달라지는 세상에서 어떤 위안이 된다. 뿌리가 깊은 것들의 고요함.', source: '이병률, 《끌림》' },
  { text: '꿈은 이루어지기 전까지 빛난다고 했지만, 이루어지지 않은 꿈도 제 나름의 빛을 낸다. 어떤 꿈들은 현실이 되지 않았기 때문에 오히려 더 오래, 더 아름다운 형태로 마음속에 남아 있기도 하니까.', source: '기형도, 《입 속의 검은 잎》' },
  { text: '그가 웃을 때 눈이 먼저 웃었다. 입술이 따라가기도 전에 눈가에 주름이 잡혔고, 그 순서가 나는 늘 좋았다. 가짜로는 흉내 낼 수 없는 그 순서가, 그 사람이 진심이라는 증거였다.', source: '박경리, 《김약국의 딸들》' },
  { text: '봄이 오는 소리는 눈에 보이기 전에 먼저 들린다. 겨우내 닫혀 있던 창문을 열었을 때 들어오는 공기의 온도, 이름 모를 새소리, 어딘가 젖은 흙 냄새. 봄은 언제나 그렇게 조용히 먼저 와 있다.', source: '나태주, 《너를 부르면 꽃이 핀다》' },
  { text: '나는 여행지에서 산 기념품보다 그곳의 공기와 골목과 낯선 언어의 소리를 더 오래 기억한다. 가져올 수 없는 것들이 오히려 더 깊이 남는다. 기억은 담을 수 없는 것들로 가득 차 있다.', source: '이병률, 《바람이 분다, 당신이 좋다》' },
  { text: '가장 오래된 나무는 뿌리가 가장 깊다. 폭풍이 지나간 뒤 그 자리에 남아 있는 것들은 대개 그런 것들이다. 오래 버틴 것들, 소리 없이 깊어진 것들, 보이지 않는 곳에서 자란 것들.', source: '법정, 《버리고 떠나기》' },
  { text: '그 골목을 다시 걸었다. 모든 것이 변해 있었지만 골목의 굽는 방식만큼은 그대로였다. 장소는 기억한다. 사람이 다 잊어버린 것들을, 돌과 흙과 시간이 대신 붙잡고 있다.', source: '김승옥, 《서울 1964년 겨울》' },
  { text: '어떤 인연은 처음 만나는 순간 이미 오래된 것 같은 느낌을 준다. 낯섦과 익숙함이 동시에 존재하는 그 이상한 감각이, 사람과 사람 사이에 전생이 있다는 믿음을 설명해줄지도 모른다.', source: '조정래, 《태백산맥》' },
  { text: '글을 쓴다는 것은 자신의 내면에 손을 뻗는 일이다. 무엇이 잡힐지 모른 채로 손을 넣고, 조심스럽게 꺼낸 것을 언어라는 그릇에 담는다. 그 과정에서 우리는 자신이 무엇인지를 조금씩 알게 된다.', source: '이청준, 《말하는 건축가》' },
  { text: '사람은 떠날 때보다 떠난 뒤에 더 많은 것을 남긴다. 빈 의자, 익숙한 냄새, 누군가가 그 사람처럼 웃을 때의 흠칫함. 존재는 사라지지 않는다. 다만 다른 형태로 남아 계속 살아간다.', source: '한강, 《흰》' },
  { text: '산길을 오르다 잠시 멈추어 아래를 내려다보면, 그제야 내가 얼마나 멀리 왔는지가 보인다. 올라가는 동안에는 보이지 않던 것들이 잠깐 서는 것만으로도 눈에 들어온다. 쉬는 것이 멈추는 게 아니다.', source: '법정, 《오두막 편지》' },
  { text: '그 사람 곁에 있으면 말을 하지 않아도 괜찮았다. 서로의 침묵이 불편하지 않다는 것을 알게 되던 날, 나는 이 사람과 오래 함께할 수 있겠다고 처음으로 생각했다. 침묵의 편안함은 신뢰에서 온다.', source: '공지영, 《별들의 들판》' },
  { text: '저녁 어스름이 내려앉는 시간, 하루가 접히는 그 짧은 순간이 나는 좋다. 아직 밤이 되지 않았고 이미 낮도 지나간 그 틈새에, 세상이 잠깐 숨을 고르는 것처럼 느껴지는 그 시간이 좋다.', source: '이상, 《오감도》' },
  { text: '기다린다는 것은 믿는다는 것이다. 반드시 올 것이라는 확신 없이는 기다릴 수 없다. 그래서 오래 기다린 것들이 마침내 왔을 때 우리는 그것을 기적이라 부르지 않고 당연한 것처럼 받아들인다.', source: '윤동주, 《하늘과 바람과 별과 시》' },
];

const GOOD_TEXT_COLORS = [
  '#6d28d9', // violet — 브랜드 메인
  '#4f46e5', // indigo — 차분한 깊이
  '#0e7490', // cyan   — 청아한 느낌
  '#0f766e', // teal   — 자연스러운 초록
  '#7c3aed', // violet-light
  '#1d4ed8', // blue   — 맑고 선명
  '#9333ea', // purple — 몽환적
  '#be185d', // pink   — 따뜻한 장미
  '#334155', // slate  — 절제된 품격
  '#0369a1', // sky    — 투명한 하늘
];

function generateGoodTexts() {
  const panel = document.getElementById('pano-ai-panel');
  if (!panel) return;

  if (goodTextsTimer) { clearInterval(goodTextsTimer); goodTextsTimer = null; }

  const shuffled = [...GOOD_TEXTS].sort(() => Math.random() - 0.5).slice(0, 30);
  let idx = 0;
  let paused = false;

  panel.innerHTML = `
    <div class="good-text-roller">
      <div class="good-text-roller-content">
        <div class="good-text-rolling-card">
          <p class="gt-body"></p>
          <p class="gt-source"></p>
        </div>
      </div>
      <div class="good-text-nav">
        <button class="good-text-nav-btn" id="gt-btn-prev" title="이전">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="good-text-nav-dots" id="gt-dots"></div>
        <button class="good-text-nav-btn" id="gt-btn-pause" title="일시정지">
          <svg id="gt-pause-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <svg id="gt-play-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="good-text-nav-btn" id="gt-btn-next" title="다음">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>`;

  const card    = panel.querySelector('.good-text-rolling-card');
  const dotsEl  = panel.querySelector('#gt-dots');
  const DOT_COUNT = Math.min(5, shuffled.length);

  // Build indicator dots
  for (let i = 0; i < DOT_COUNT; i++) {
    const d = document.createElement('div');
    d.className = 'good-text-nav-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(d);
  }

  function updateDots(i) {
    const dots = dotsEl.querySelectorAll('.good-text-nav-dot');
    dots.forEach((d, j) => d.classList.toggle('active', j === i % DOT_COUNT));
  }

  function show(item, color) {
    card.querySelector('.gt-body').textContent   = item.text;
    card.querySelector('.gt-source').textContent = '— ' + item.source;
    card.style.color = color;
    card.classList.remove('gt-out');
    void card.offsetWidth;
    card.classList.add('gt-in');
  }

  const OUT_MS  = 550;
  const SHOW_MS = 10000;

  function goTo(newIdx) {
    idx = ((newIdx % shuffled.length) + shuffled.length) % shuffled.length;
    card.classList.remove('gt-in');
    card.classList.add('gt-out');
    setTimeout(() => {
      show(shuffled[idx], GOOD_TEXT_COLORS[idx % GOOD_TEXT_COLORS.length]);
      updateDots(idx);
    }, OUT_MS);
  }

  function scheduleNext() {
    if (goodTextsTimer) clearInterval(goodTextsTimer);
    goodTextsTimer = setInterval(() => {
      if (!paused) goTo(idx + 1);
    }, SHOW_MS + OUT_MS);
  }

  // Controls
  panel.querySelector('#gt-btn-prev').addEventListener('click', () => {
    goTo(idx - 1);
    scheduleNext();
  });
  panel.querySelector('#gt-btn-next').addEventListener('click', () => {
    goTo(idx + 1);
    scheduleNext();
  });
  panel.querySelector('#gt-btn-pause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('gt-pause-icon').style.display = paused ? 'none' : '';
    document.getElementById('gt-play-icon').style.display  = paused ? ''     : 'none';
  });

  // Show first card immediately
  show(shuffled[0], GOOD_TEXT_COLORS[0]);
  updateDots(0);
  idx = 1;

  scheduleNext();
}

document.addEventListener('DOMContentLoaded', init);
