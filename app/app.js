/* ============================================================
   PANORAMA PHOTO ALBUM — app.js (Mobile PWA)
   Adapted from desktop version for Android PWA
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

// ── Mobile navigation ──────────────────────────────────────────
function navigateToViewer() {
  const list   = document.getElementById('view-list');
  const viewer = document.getElementById('view-viewer');
  if (!list || !viewer) return;
  list.style.transform   = 'translateX(-30%)';
  list.style.transition  = 'transform 350ms cubic-bezier(.4,0,.2,1)';
  viewer.style.transform = 'translateX(0)';
  viewer.style.transition = 'transform 350ms cubic-bezier(.4,0,.2,1)';
}

function navigateToList() {
  const list   = document.getElementById('view-list');
  const viewer = document.getElementById('view-viewer');
  if (!list || !viewer) return;
  viewer.style.transition = 'transform 350ms cubic-bezier(.4,0,.2,1)';
  viewer.style.transform  = 'translateX(100%)';
  list.style.transition   = 'transform 350ms cubic-bezier(.4,0,.2,1)';
  list.style.transform    = 'translateX(0)';
}

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
  const m = document.getElementById('settings-modal');
  m.style.display = 'flex';
  if (config.supabaseUrl)     document.getElementById('cfg-supabase-url').value  = config.supabaseUrl;
  if (config.supabaseKey)     document.getElementById('cfg-supabase-key').value  = config.supabaseKey;
  if (config.openrouterKey)   document.getElementById('cfg-openrouter-key').value = config.openrouterKey;
  if (config.groqKey)         document.getElementById('cfg-groq-key').value       = config.groqKey;
  if (config.hfToken)         document.getElementById('cfg-hf-token').value        = config.hfToken;
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
  const MAX_RETRY = 30;
  const DELAY_MS  = 4000;

  for (let i = 1; i <= MAX_RETRY; i++) {
    const { error } = await supabaseClient.from('albums').select('id').limit(1);

    if (!error) {
      hideDbMissingBanner();
      return true;
    }

    console.warn(`[${i}/${MAX_RETRY}] albums 접근 오류 (${error.code}): ${error.message}`);

    if (isPgrstTransient(error)) {
      showRetryBanner(i, MAX_RETRY);
      await sleep(DELAY_MS);
      continue;
    }

    showDbMissingBanner(error.message);
    return false;
  }

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
      position:fixed; top:env(safe-area-inset-top,0); left:0; right:0; z-index:2000;
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
    <div style="width:80px;height:4px;background:#fde68a;border-radius:4px;overflow:hidden">
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
      position:fixed; top:env(safe-area-inset-top,0); left:0; right:0; z-index:2000;
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
  // anon 키는 listBuckets 불가 — bucket은 서버에서 사전 생성
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
  const finalMusicList = await uploadMusicItems('tmp', musicList);
  const first = finalMusicList[0] || null;

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

  const reUpload = musicList.filter(m => m._file);
  if (reUpload.length > 0) {
    const reFixed = await uploadMusicItems(album.id, reUpload);
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
  const finalMusicList = await uploadMusicItems(albumId, musicList);
  const first = finalMusicList[0] || null;

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

  if (removedIds.length > 0) {
    const album = albums.find(a => a.id === albumId);
    const toRemove = (album?.photos || []).filter(p => removedIds.includes(p.id));
    if (toRemove.length > 0) {
      await supabaseClient.storage.from('photos').remove(toRemove.map(p => p.storage_path));
      const { error: de } = await supabaseClient.from('photos').delete().in('id', removedIds);
      if (de) console.warn('photo delete error:', de.message);
    }
  }

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
      `<img class="record-card-thumb" src="${escHtml(p.url)}" alt="${escHtml(p.filename)}" loading="lazy">`
    ).join('');
    const moreCount = album.photos.length > 3 ? album.photos.length - 3 : 0;
    const moreHtml  = moreCount > 0 ? `<div class="record-card-thumb-more">+${moreCount}</div>` : '';

    const datePfx = album.album_date ? album.album_date.slice(0, 7) + ', ' : '';
    return `<div class="record-card${selectedAlbum?.id === album.id ? ' active' : ''}"
                 data-id="${album.id}"
                 role="listitem"
                 onclick="selectAlbum('${album.id}')"
                 aria-label="${escHtml(album.name)} 앨범 열기">
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
      <button class="btn-card-ai" onclick="handleAiAnalyze(event,'${album.id}')" aria-label="${escHtml(album.name)} AI 분석">AI 분석</button>
      <div class="record-card-actions">
        <button class="record-card-edit"   onclick="handleEditAlbum(event,'${album.id}')"   aria-label="앨범 수정" title="수정">✏️</button>
        <button class="record-card-delete" onclick="handleDeleteAlbum(event,'${album.id}')" aria-label="앨범 삭제" title="삭제">✕</button>
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

// Mobile: navigate to viewer first, then trigger AI analysis after nav animation
async function handleAiAnalyze(event, albumId) {
  event.stopPropagation();
  selectAlbum(albumId);
  await new Promise(r => setTimeout(r, 400)); // wait for navigation animation
  generatePanorama();
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

  // btn-generate is hidden but kept for desktop JS compat
  const btnGen = document.getElementById('btn-generate');
  if (btnGen) btnGen.disabled = !selectedAlbum;

  if (!selectedAlbum) { showEmptyRight(); return; }
  renderPanoramaView();
}

// Mobile: go back to album list
function showEmptyRight() {
  stopSlideshow();
  stopBgMusic();
  selectedAlbum = null;
  renderAlbumList();
  navigateToList();
  document.getElementById('ai-panel-sheet')?.classList.remove('open');
}

function renderPanoramaView() {
  // Mobile: navigate to viewer screen first
  navigateToViewer();

  // Keep for desktop compat (panorama-view is always flex in mobile)
  document.getElementById('panorama-view').style.display = 'flex';
  const emptyRight = document.getElementById('empty-right');
  if (emptyRight) emptyRight.style.display = 'none';

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
        <p>AI 분석 버튼을<br>눌러주세요</p>
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

  // Self-clip: clip the layer to only its own image bounds
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
    layerA.innerHTML = `<div style="text-align:center;color:rgba(124,58,237,.4)">
      <div style="font-size:48px;margin-bottom:12px">📷</div>
      <p style="font-size:14px">이 앨범에 사진이 없습니다</p></div>`;
    return;
  }
  layerA.innerHTML = '';
  layerB.innerHTML = '';
  layerA.style.display = '';

  controls.style.display = 'flex';
  document.getElementById('btn-pano-play').classList.remove('paused');
  document.getElementById('btn-pano-play').title = '자동재생 정지';
  document.getElementById('btn-pano-play').textContent = '⏸';
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
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', `${i + 1}번 사진`);
      btn.setAttribute('tabindex', '0');
      btn.addEventListener('click', () => {
        goToSlide(i);
        if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
      });
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goToSlide(i);
          if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
        }
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

  inEl.style.animation = 'none';
  setLayerImage(inEl, slideshowPhotos[newIdx].url);

  applySlideTransition(inEl, outEl, direction);

  currentSlideIdx = newIdx;
  activeLayer = inId;

  // Update UI
  document.getElementById('pano-slide-index').textContent = `${newIdx + 1} / ${n}`;
  document.querySelectorAll('.pano-thumb-btn').forEach((d, i) => {
    d.classList.toggle('active', i === newIdx);
    if (i === newIdx) d.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}

function applySlideTransition(inEl, outEl, direction) {
  const dur = slideTransitionMs;
  const ease = 'cubic-bezier(.4,0,.2,1)';

  if (slideCleanupTimer) { clearTimeout(slideCleanupTimer); slideCleanupTimer = null; }

  [inEl, outEl].forEach(el => {
    el.style.transition = 'none';
    el.style.animation  = 'none';
    el.style.filter     = '';
    el.style.transformOrigin = '';
  });
  inEl.style.clipPath = '';
  inEl.getBoundingClientRect();
  if (inEl.dataset.imgClip) inEl.style.clipPath = inEl.dataset.imgClip;

  switch (slideshowEffect) {
    case 'fade':
      inEl.style.opacity = '0';
      inEl.style.transform = 'none';
      inEl.style.zIndex = '2';
      outEl.style.zIndex = '1';
      inEl.getBoundingClientRect();
      inEl.style.transition = `opacity ${dur}ms ${ease}`;
      inEl.style.opacity = '1';
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
    if (inEl.dataset.imgClip) inEl.style.clipPath = inEl.dataset.imgClip;
  }, dur + 80);
}

// Swipe/drag to navigate slides (touch-optimized)
function initPanoDrag() {
  const wrap = document.getElementById('pano-strip-wrap');
  if (!wrap) return;
  let startX = 0;
  let touchStarted = false;

  // Touch events (primary on mobile)
  wrap.addEventListener('touchstart', e => {
    touchStarted = true;
    isDragging = true;
    startX = e.touches[0].pageX;
    dragStartX = e.touches[0].pageX;
    dragScrollLeft = wrap.scrollLeft;
  }, { passive: true });

  wrap.addEventListener('touchend', e => {
    if (!isDragging) return;
    isDragging = false;
    touchStarted = false;
    const diff = e.changedTouches[0].pageX - startX;
    if (Math.abs(diff) > 50) {
      goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
    }
  });

  // Mouse events (desktop fallback)
  wrap.addEventListener('mousedown', e => {
    if (touchStarted) return;
    isDragging = true;
    startX = e.pageX;
  });

  document.addEventListener('mouseup', e => {
    if (!isDragging || touchStarted) return;
    isDragging = false;
    const diff = e.pageX - startX;
    if (Math.abs(diff) > 40) goToSlide(currentSlideIdx + (diff < 0 ? 1 : -1), diff < 0 ? 'next' : 'prev');
  });
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
  bgAudio.play().catch(() => {}); // autoplay may be blocked on mobile without user gesture

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
}

function stopBgMusic() {
  if (bgAudio) { bgAudio.pause(); bgAudio = null; }
  const inline  = document.getElementById('pano-music-inline');
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

  const nameInput = document.getElementById('input-album-name');
  nameInput.value = album.name;
  document.getElementById('name-char-count').textContent = album.name.length;
  document.getElementById('input-album-date').value = album.album_date || '';

  album.photos.forEach(photo => renderExistingPhotoThumb(photo));

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
      await updateAlbum(editingAlbumId, name, albumDate, pendingMusicList, pendingPhotos, removedPhotoIds);
      await loadAlbums();
      if (selectedAlbum?.id === editingAlbumId) {
        selectedAlbum = albums.find(a => a.id === editingAlbumId) || null;
        if (selectedAlbum) renderPanoramaView();
      }
      closeAddModal();
      showToast('앨범이 수정되었습니다 ✨', 'success');
    } else {
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
  wrap.innerHTML = `<img class="photo-thumb" src="${escHtml(photo.url)}" alt="${escHtml(photo.filename)}" loading="lazy">
    <button class="photo-thumb-del" aria-label="사진 삭제" title="삭제">✕</button>`;
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
    <button class="photo-thumb-del" aria-label="사진 삭제" title="삭제">✕</button>`;
  wrap.querySelector('.photo-thumb-del').addEventListener('click', () => {
    pendingPhotos = pendingPhotos.filter(f => f !== file);
    wrap.remove();
  });
  grid.appendChild(wrap);
}

// ============================================================
// 13. MUSIC SELECTION — MODAL LIST + PICKER SUB-MODAL
// ============================================================

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
      <button class="modal-music-item-del" onclick="removeMusicFromList(${idx})" aria-label="음악 삭제" title="삭제">✕</button>
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

  document.getElementById('mp-category-select').addEventListener('change', function () {
    stopMusicPreview();
    if (this.value) renderPickerAiList(this.value);
    else document.getElementById('mp-music-list').style.display = 'none';
  });

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
    const aiPanel = document.getElementById('pano-ai-panel');
    if (aiPanel) {
      aiPanel.innerHTML = `<div class="pano-ai-empty">
        <div class="pano-ai-empty-icon">🔑</div>
        <p style="font-size:13px;line-height:1.7;text-align:center">AI 분석을 사용하려면<br>설정(⚙️)에서<br><strong>OpenRouter</strong> 또는<br><strong>Groq API 키</strong>를<br>입력해주세요.</p>
      </div>`;
    }
    document.getElementById('ai-panel-sheet')?.classList.add('open');
    showToast('설정에서 AI API 키를 입력해주세요', 'error');
    return;
  }

  const btn       = document.getElementById('btn-generate');
  const progressEl= document.getElementById('generate-progress');
  const fillEl    = document.getElementById('gen-progress-fill');
  const statusEl  = document.getElementById('gen-status-text');
  const aiPanel   = document.getElementById('pano-ai-panel');
  const loadingEl = document.getElementById('pano-loading');

  if (btn) btn.disabled = true;
  if (progressEl) progressEl.style.display = 'block';
  if (loadingEl) loadingEl.style.display = 'flex';

  if (aiPanel) {
    aiPanel.innerHTML = `<div class="pano-ai-loading">
      <div class="loading-ring" style="width:28px;height:28px;border-width:3px"></div>
      <span>AI 분석 중...</span>
    </div>`;
  }
  // Open bottom sheet so user can see progress
  document.getElementById('ai-panel-sheet')?.classList.add('open');

  const setStatus  = msg => { if (statusEl) statusEl.textContent = msg; };
  const setProgress= pct => { if (fillEl) fillEl.style.width = pct + '%'; };

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
    const errLog   = [];

    // Stage 1: Vision models
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
        setProgress(Math.min(70, 30 + errLog.length * 8));
      }
    }

    // Stage 2: Text model fallback
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

    if (loadingEl) loadingEl.style.display = 'none';
    setProgress(100);
    setStatus(resultText ? '✅ 분석 완료' : '❌ 분석 실패');
    setTimeout(() => { if (progressEl) progressEl.style.display = 'none'; }, 2000);

    if (resultText) {
      renderAiPanel(resultText, usedModel);
      await saveAiAnalysis(selectedAlbum.id, resultText);
    } else {
      const errDetail = errLog.length
        ? errLog.map(e => `• ${e}`).join('\n')
        : '모델 없음 (API 키 확인)';
      console.error('[AI 분석 실패]\n' + errDetail);
      if (aiPanel) {
        aiPanel.innerHTML = `<div class="pano-ai-empty" style="align-items:flex-start;padding:4px">
          <div style="font-size:24px;align-self:center">😕</div>
          <p style="font-size:13px;font-weight:700;color:var(--primary);margin:4px 0 6px">분석 실패</p>
          <pre style="font-size:11px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;word-break:break-all;background:var(--surface-2);border-radius:6px;padding:8px;width:100%">${escHtml(errDetail)}</pre>
        </div>`;
        document.getElementById('ai-panel-sheet')?.classList.add('open');
      }
    }

  } catch (e) {
    setStatus('❌ 오류: ' + e.message);
    if (loadingEl) loadingEl.style.display = 'none';
    console.error(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderAiPanel(text, model) {
  const aiPanel = document.getElementById('pano-ai-panel');

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

  // Show bottom sheet
  document.getElementById('ai-panel-sheet')?.classList.add('open');

  // Show save button on edit
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
// 16. AI RESULT HELPERS (desktop compat — mostly hidden on mobile)
// ============================================================
function renderAiModelGrid(models) {
  const grid = document.getElementById('ai-models-grid');
  const sec  = document.getElementById('ai-models-section');
  const tot  = document.getElementById('ai-models-total');
  if (tot)  tot.textContent = models.length;
  if (grid) grid.innerHTML = '';
  if (sec)  sec.style.display = 'block';
}

function appendAiResult(model, text) {
  const list = document.getElementById('ai-results-list');
  if (!list) return;
  const card = document.createElement('div');
  card.className = 'ai-result-card';
  card.innerHTML = `
    <div class="ai-result-header">
      <span>${escHtml(model.name)}</span>
      <span>${model.provider}</span>
    </div>
    <div>${escHtml(text)}</div>`;
  list.appendChild(card);
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
    saveConfig(config);
    closeSettings();

    const ok = await initSupabase();
    if (ok) { await loadAlbums(); showToast('설정이 저장되었습니다 ✨', 'success'); }
    else     showToast('Supabase 연결 실패. URL/키를 확인해주세요', 'error');
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

  // Hidden generate button (desktop compat)
  document.getElementById('btn-generate').addEventListener('click', generatePanorama);

  // Slideshow controls
  document.getElementById('btn-slide-prev').addEventListener('click', () => {
    goToSlide(currentSlideIdx - 1, 'prev');
    if (slideshowPlaying) { stopSlideshow(); startSlideshow(); }
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

  // Music player controls
  document.getElementById('btn-play').addEventListener('click', toggleMusicPlay);
  document.getElementById('btn-mute').addEventListener('click', toggleMute);
  document.getElementById('volume-slider').addEventListener('input', function () { setVolume(this.value); });
  document.getElementById('music-progress-wrap').addEventListener('click', seekMusic);

  // Music picker sub-modal
  initMusicPickerModal();

  // Mobile: AI analyze button in viewer action bar
  document.getElementById('btn-ai-analyze')?.addEventListener('click', () => {
    if (selectedAlbum) generatePanorama();
  });

  // Bottom sheet: close when tapping backdrop
  const aiSheet = document.getElementById('ai-panel-sheet');
  if (aiSheet) {
    aiSheet.addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('open');
    });

    // Bottom sheet swipe down to close
    let sheetTouchStartY = 0;
    aiSheet.addEventListener('touchstart', e => {
      sheetTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    aiSheet.addEventListener('touchend', e => {
      const diff = e.changedTouches[0].clientY - sheetTouchStartY;
      if (diff > 80) aiSheet.classList.remove('open'); // swipe down 80px = close
    }, { passive: true });
  }

  // Sheet handle keyboard
  const sheetHandle = document.querySelector('.sheet-handle');
  if (sheetHandle) {
    sheetHandle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('ai-panel-sheet')?.classList.remove('open');
      }
    });
  }

  // Close settings modal on overlay click (only after configured)
  document.getElementById('settings-modal').addEventListener('click', function (e) {
    if (e.target === this && config.supabaseUrl) closeSettings();
  });

  // add-modal: drag support without closing on drag-end click
  let _addModalDragActive = false;
  const addModal = document.getElementById('add-modal');
  addModal.addEventListener('dragenter', e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragover',  e => { e.preventDefault(); _addModalDragActive = true; });
  addModal.addEventListener('dragleave', e => {
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
  // Initialize viewer view off-screen (translateX(100%))
  const viewViewer = document.getElementById('view-viewer');
  if (viewViewer) {
    viewViewer.style.transform = 'translateX(100%)';
    viewViewer.style.transition = 'transform 350ms cubic-bezier(.4,0,.2,1)';
  }

  // config.js APP_CONFIG values take priority over localStorage
  const saved  = loadConfig();
  const preset = window.APP_CONFIG || {};
  config = {
    supabaseUrl:   preset.supabaseUrl  || saved.supabaseUrl  || '',
    supabaseKey:   preset.supabaseKey  || saved.supabaseKey  || '',
    openrouterKey: saved.openrouterKey || '',
    groqKey:       saved.groqKey       || '',
    hfToken:       saved.hfToken       || '',
  };
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

document.addEventListener('DOMContentLoaded', init);
