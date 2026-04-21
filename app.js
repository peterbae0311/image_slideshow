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
  selectAlbum(albumId);
  await new Promise(r => setTimeout(r, 80));
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

  // AI 패널: 저장된 분석 결과 로드 또는 빈 상태 표시
  const aiPanel = document.getElementById('pano-ai-panel');
  if (aiPanel) {
    if (album.ai_analysis) {
      renderAiPanel(album.ai_analysis, null);
    } else {
      aiPanel.innerHTML = `<div class="pano-ai-empty">
        <div class="pano-ai-empty-icon">🤖</div>
        <p>좋은 글 버튼을<br>눌러주세요</p>
      </div>`;
    }
  }

  // Build panorama strip
  buildPanoramaStrip(album.photos);

  // Music
  if (album.music_list?.length > 0) {
    startBgMusic(album);
  } else {
    stopBgMusic();
  }
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
let bgTrackList = [];
let bgTrackIdx  = 0;

function startBgMusic(album) {
  stopBgMusic();
  bgTrackList = album.music_list || [];
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
    bgTrackIdx = (bgTrackIdx + 1) % bgTrackList.length;
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
  // Show prev/next only when multiple tracks exist
  const multi = bgTrackList.length > 1;
  document.getElementById('btn-music-prev').style.display = multi ? '' : 'none';
  document.getElementById('btn-music-next').style.display = multi ? '' : 'none';
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
    bgTrackIdx = (bgTrackIdx - 1 + bgTrackList.length) % bgTrackList.length;
    playBgTrack(bgTrackIdx);
  });
  document.getElementById('btn-music-next').addEventListener('click', () => {
    if (bgTrackList.length < 2) return;
    bgTrackIdx = (bgTrackIdx + 1) % bgTrackList.length;
    playBgTrack(bgTrackIdx);
  });

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
  '오늘 하루도 당신은 충분히 잘하고 있어요.',
  '꽃이 피는 데 이유가 없듯, 당신이 웃는 데도 이유가 필요 없어요.',
  '작은 것들을 소중히 여기는 마음이 큰 행복을 만들어요.',
  '지금 이 순간이 나중에 당신이 그리워할 '그때'가 될 거예요.',
  '완벽하지 않아도 괜찮아요. 당신은 이미 충분해요.',
  '햇살이 구름 사이로 나오듯, 좋은 날은 반드시 와요.',
  '당신의 존재 자체가 누군가에게 위로가 돼요.',
  '천천히 가도 괜찮아요. 멈추지 않으면 반드시 도착해요.',
  '오늘의 작은 용기가 내일의 큰 변화를 만들어요.',
  '사랑받고 싶다면, 먼저 자신을 사랑하세요.',
  '봄은 언제나 겨울 다음에 와요. 지금은 당신의 겨울일 뿐이에요.',
  '눈물은 마음이 맑아지는 비예요.',
  '당신이 걷는 길이 곧 길이 돼요.',
  '가장 아름다운 것은 보이지 않는 것에 있어요.',
  '한 번의 친절이 하루를 바꾸고, 하루가 인생을 바꿔요.',
  '지금 느끼는 감정은 틀리지 않아요. 당신의 마음은 언제나 옳아요.',
  '별은 가장 어두운 밤에 가장 밝게 빛나요.',
  '오늘 심은 씨앗이 언젠가 그늘이 되어 돌아와요.',
  '좋은 사람 곁에 있는 것만으로 이미 행복이에요.',
  '바람이 불어도 흔들릴 뿐, 뿌리는 남아 있어요.',
  '당신의 하루하루가 누군가의 기억 속에 빛나고 있어요.',
  '넘어지는 것을 두려워하지 마세요. 일어나는 힘이 더 강해지니까요.',
  '잔잔한 강이 바다에 닿듯, 꾸준함이 꿈에 닿아요.',
  '지금 이 순간, 숨 한 번 깊이 쉬어요. 괜찮아요.',
  '예쁜 마음을 가진 사람은 보면 알 수 있어요.',
  '당신의 웃음은 세상을 조금 더 따뜻하게 만들어요.',
  '작은 행복들이 모여 삶이 빛나요.',
  '오래된 친구처럼, 좋은 말 한마디가 마음을 녹여요.',
  '힘들 때일수록 더 많이 자신을 칭찬해주세요.',
  '당신이 지나온 모든 순간이 지금의 당신을 만들었어요.',
  '꽃은 비를 맞아야 더 예쁘게 피어요.',
  '오늘도 무사히 하루를 마친 당신, 정말 수고했어요.',
  '매일 조금씩 나아지는 것으로 충분해요.',
  '사랑한다는 말은 백 번을 해도 모자라요.',
  '인생에서 가장 좋은 날들은 아직 오지 않았어요.',
  '당신의 꿈은 당신이 포기하지 않는 한 살아 있어요.',
  '고요한 아침처럼, 마음에 평화가 찾아오길 바라요.',
  '좋은 일은 예상치 못한 순간에 찾아와요.',
  '세상에 당신 같은 사람은 단 하나뿐이에요.',
  '비 온 뒤 땅이 굳듯, 힘든 시간이 당신을 단단하게 해요.',
  '오늘 하루도 감사한 것 하나만 찾아보세요. 분명 있어요.',
  '당신의 속도로 걸어가도 돼요.',
  '작은 미소 하나가 세상을 바꿀 수 있어요.',
  '어제보다 오늘이 조금 더 나은 당신을 응원해요.',
  '마음이 따뜻한 사람은 어디에서나 봄을 만들어요.',
  '길을 잃었다면, 그게 새로운 길의 시작이에요.',
  '당신이 있어 세상이 더 아름다워요.',
  '가장 먼 여행은 마음 속으로의 여행이에요.',
  '오늘도 숨을 쉬고 있다는 것, 그것으로 충분해요.',
  '사랑은 늘 가장 가까운 곳에 있어요.',
  '당신의 진심은 언제나 상대방에게 닿아요.',
  '느리게 걷는 사람도 결국 산 정상에 올라요.',
  '좋아하는 것을 하는 오늘이 최고의 날이에요.',
  '웃음은 마음의 햇살이에요.',
  '당신이 베푼 작은 선함이 세상 어딘가서 꽃이 되어 피어요.',
  '지금 이 자리에서 빛나고 있어요, 당신은요.',
  '마음껏 꿈꾸세요. 꿈꾸는 사람에게 기회는 더 많이 와요.',
  '당신의 하루가 따뜻한 빛으로 가득하길 바라요.',
  '설레는 마음을 잃지 마세요. 그게 살아있다는 증거예요.',
  '좋은 인연은 언제나 생각지도 못한 순간에 시작돼요.',
];

const GOOD_TEXT_PALETTES = [
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#6d28d9' },
  { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fefce8', border: '#fde68a', text: '#92400e' },
  { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  { bg: '#fdf2f8', border: '#f5d0fe', text: '#a21caf' },
];

function generateGoodTexts() {
  const panel = document.getElementById('pano-ai-panel');
  if (!panel) return;

  panel.innerHTML = `<div class="pano-ai-loading">
    <div class="loading-ring" style="width:28px;height:28px;border-width:3px"></div>
    <span style="font-size:12px">좋은 글 모으는 중...</span>
  </div>`;

  setTimeout(() => {
    const shuffled = [...GOOD_TEXTS].sort(() => Math.random() - 0.5).slice(0, 30);
    const cards = shuffled.map((text, i) => {
      const p = GOOD_TEXT_PALETTES[i % GOOD_TEXT_PALETTES.length];
      return `<div class="good-text-card" style="
        background:${p.bg};
        border-color:${p.border};
        color:${p.text};
        animation-delay:${i * 40}ms
      ">${escHtml(text)}</div>`;
    }).join('');

    panel.innerHTML = `
      <div class="good-text-header">
        <span class="good-text-title">🌸 좋은 글</span>
        <button class="good-text-refresh" onclick="generateGoodTexts()" title="새로 보기">↻</button>
      </div>
      <div class="good-text-list">${cards}</div>`;
  }, 500);
}

document.addEventListener('DOMContentLoaded', init);
