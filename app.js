/**
 * Gwangju Bus Route OpenStreetMap Application
 * Author: Antigravity
 */

(function () {
  'use strict';

  // =========================================================================
  // State & Variables
  // =========================================================================
  let map = null;
  let currentTileLayer = null;
  let routeData = null; // Whole dataset { routes, stopIndex, ... }
  let currentRoute = null; // Currently selected route object
  let currentDirection = 'all'; // 'all' | '상행' | '하행'
  let currentCategory = 'all'; // 'all' | '급행' | '간선' | '지선' | '순환' | '맞춤'
  let searchMode = 'search'; // 'search' (1. 노선·정류소 검색) | 'path' (2. 길찾기)
  let activePathInputType = 'start'; // 'start' | 'end' for path autocomplete
  let currentPathSort = 'direct'; // 'direct' (직통 우선, 경유 정류장 적은 순) | 'stops' (최소 정류장 순)
  let currentPathResults = [];
  let selectedPathIndex = -1;

  // Map Layer Groups
  let routeLayerGroup = null;
  let stopsLayerGroup = null;
  let waypointsLayerGroup = null;
  let pathLayerGroup = null;
  let highlightMarker = null;
  let simulationMarker = null;

  // Settings
  let showStops = true;
  let showWaypoints = true;
  let showLabels = false;
  const osrmCache = window.OSRM_CACHE || {};
  let currentSimCoords = [];

  // Simulation State
  let simInterval = null;
  let simCurrentIndex = 0;
  let simIsPlaying = false;
  let simPoints = [];

  // Tile Providers (OpenStreetMap based)
  const TILE_PROVIDERS = {
    'osm': {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
      }
    },
    'carto-light': {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    'carto-dark': {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    'humanitarian': {
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles style by <a href="https://www.hotosm.org/" target="_blank">HOT</a>'
      }
    }
  };

  // Korean Chosung (Initial Consonant) Search Map
  const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  function getChosungString(str) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i) - 44032;
      if (code >= 0 && code <= 11171) {
        result += CHOSUNG_LIST[Math.floor(code / 588)];
      } else {
        result += str.charAt(i);
      }
    }
    return result;
  }

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const dom = {
    routeSearchWrapper: document.getElementById('routeSearchWrapper'),
    searchInputWrapper: document.querySelector('.search-input-wrapper'),
    routeSearchInput: document.getElementById('routeSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    searchResultsDropdown: document.getElementById('searchResultsDropdown'),
    btnRouteSearchSubmit: document.getElementById('btnRouteSearchSubmit'),
    btnGoToPath: document.getElementById('btnGoToPath'),
    btnBackToRouteSearch: document.getElementById('btnBackToRouteSearch'),
    modeSearchBtn: document.getElementById('modeSearchBtn'),
    modeRouteBtn: document.getElementById('modeRouteBtn'),
    modeStopBtn: document.getElementById('modeStopBtn'),
    modePathBtn: document.getElementById('modePathBtn'),
    quickRoutes: document.getElementById('quickRoutes'),
    layerMenuToggleBtn: document.getElementById('layerMenuToggleBtn'),
    mapSettingsMenu: document.getElementById('mapSettingsMenu'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    sidebar: document.getElementById('sidebar'),

    // Path Search Dual Input Elements
    pathSearchWrapper: document.getElementById('pathSearchWrapper'),
    pathStartInput: document.getElementById('pathStartInput'),
    clearStartBtn: document.getElementById('clearStartBtn'),
    pathEndInput: document.getElementById('pathEndInput'),
    clearEndBtn: document.getElementById('clearEndBtn'),
    pathSwapBtn: document.getElementById('pathSwapBtn'),
    pathSearchSubmitBtn: document.getElementById('pathSearchSubmitBtn'),

    // Map Floating Controls
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnResetGwangju: document.getElementById('btnResetGwangju'),
    btnFitRoute: document.getElementById('btnFitRoute'),

    // Settings
    chkShowStops: document.getElementById('chkShowStops'),
    chkShowWaypoints: document.getElementById('chkShowWaypoints'),
    chkShowLabels: document.getElementById('chkShowLabels'),
    btnExportGeoJSON: document.getElementById('btnExportGeoJSON'),

    // Panels
    panelRouteList: document.getElementById('panelRouteList'),
    panelRouteDetail: document.getElementById('panelRouteDetail'),
    panelStopDetail: document.getElementById('panelStopDetail'),
    panelPathResult: document.getElementById('panelPathResult'),
    totalRoutesBadge: document.getElementById('totalRoutesBadge'),
    routeCardList: document.getElementById('routeCardList'),

    // Route Detail Elements
    btnBackToRouteList: document.getElementById('btnBackToRouteList'),
    routeHeroCard: document.getElementById('routeHeroCard'),
    detailRouteType: document.getElementById('detailRouteType'),
    detailRouteName: document.getElementById('detailRouteName'),
    detailRouteId: document.getElementById('detailRouteId'),
    detailStartStop: document.getElementById('detailStartStop'),
    detailEndStop: document.getElementById('detailEndStop'),
    detailTurnWrap: document.getElementById('detailTurnWrap'),
    detailTurnStop: document.getElementById('detailTurnStop'),
    detailStopCount: document.getElementById('detailStopCount'),
    detailLength: document.getElementById('detailLength'),
    detailPointCount: document.getElementById('detailPointCount'),
    tabDirAll: document.getElementById('tabDirAll'),
    tabDirUp: document.getElementById('tabDirUp'),
    tabDirDown: document.getElementById('tabDirDown'),
    stopFilterInput: document.getElementById('stopFilterInput'),
    stopSequenceList: document.getElementById('stopSequenceList'),

    // Trajectory Status Indicator
    osrmStatusContainer: document.getElementById('osrmStatusContainer'),
    osrmDot: document.getElementById('osrmDot'),
    osrmStatusText: document.getElementById('osrmStatusText'),
    osrmCoordsCount: document.getElementById('osrmCoordsCount'),

    // Reverse Stop Detail Elements
    btnBackFromStop: document.getElementById('btnBackFromStop'),
    stopDetailName: document.getElementById('stopDetailName'),
    stopDetailArs: document.getElementById('stopDetailArs'),
    stopDetailCount: document.getElementById('stopDetailCount'),
    stopRoutesList: document.getElementById('stopRoutesList'),

    // Path Result Panel Elements
    btnBackFromPath: document.getElementById('btnBackFromPath'),
    summaryStartName: document.getElementById('summaryStartName'),
    summaryEndName: document.getElementById('summaryEndName'),
    sortDirectBtn: document.getElementById('sortDirectBtn'),
    sortStopsBtn: document.getElementById('sortStopsBtn'),
    pathResultsCount: document.getElementById('pathResultsCount'),
    pathResultsList: document.getElementById('pathResultsList'),

    // Simulation Bar
    simulationBar: document.getElementById('simulationBar'),
    simPlayBtn: document.getElementById('simPlayBtn'),
    simBtnText: document.getElementById('simBtnText'),
    simProgressBar: document.getElementById('simProgressBar'),
    simCurrentStop: document.getElementById('simCurrentStop'),
    simCloseBtn: document.getElementById('simCloseBtn')
  };

  // =========================================================================
  // Initialize Application
  // =========================================================================
  async function init() {
    initMap();
    bindEvents();
    await loadRouteData();
    renderRouteCardList();
  }

  // =========================================================================
  // Map Setup
  // =========================================================================
  function initMap() {
    // Center at Gwangju City Hall coordinates
    const gwangjuCenter = [35.1595, 126.8526];
    map = L.map('map', {
      center: gwangjuCenter,
      zoom: 12,
      zoomControl: false // Using custom buttons
    });

    // Default tile: OpenStreetMap
    setTileLayer('osm');

    // Layer groups for clean management
    routeLayerGroup = L.layerGroup().addTo(map);
    stopsLayerGroup = L.layerGroup().addTo(map);
    waypointsLayerGroup = L.layerGroup().addTo(map);
    pathLayerGroup = L.layerGroup().addTo(map);
  }

  function setTileLayer(type) {
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }
    const provider = TILE_PROVIDERS[type] || TILE_PROVIDERS['osm'];
    currentTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);

    // Update active class on buttons
    document.querySelectorAll('.tile-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tile === type);
    });
  }

  // =========================================================================
  // Data Loading
  // =========================================================================
  async function loadRouteData() {
    try {
      if (window.BUS_ROUTES_DATA) {
        routeData = window.BUS_ROUTES_DATA;
      } else {
        const resp = await fetch('routes_data.json');
        routeData = await resp.json();
      }

      const total = Object.keys(routeData.routes || {}).length;
      dom.totalRoutesBadge.textContent = `${total}개 노선`;
      console.log(`Loaded ${total} bus routes successfully.`);

      // Initialize BusRouter engine
      if (window.BusRouter) {
        window.BusRouter.init(routeData);
      }
    } catch (err) {
      console.error('Failed to load bus routes data:', err);
      alert('노선 데이터를 불러오는데 실패했습니다. 페이지를 새로고침 해주세요.');
    }
  }

  // =========================================================================
  // Route List Rendering & Filtering
  // =========================================================================
  // Get Routes in Excel Sheet Sequential Order
  // =========================================================================
  function getOrderedRoutes() {
    if (!routeData || !routeData.routes) return [];
    if (Array.isArray(routeData.routeList) && routeData.routeList.length > 0) {
      return routeData.routeList.map(name => routeData.routes[name]).filter(Boolean);
    }
    return Object.values(routeData.routes).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // =========================================================================
  // Render Route Card List (Sidebar)
  // =========================================================================
  function renderRouteCardList() {
    if (!routeData || !routeData.routes) return;
    const container = dom.routeCardList;
    container.innerHTML = '';

    const routes = getOrderedRoutes();
    const filtered = routes.filter(r => {
      if (currentCategory === 'all') return true;
      if (currentCategory === '맞춤') {
        return r.routeType === '맞춤' || r.routeType === '기념/특화';
      }
      return r.routeType === currentCategory;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="dropdown-empty">해당 분류의 노선이 없습니다.</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(route => {
      const card = document.createElement('div');
      card.className = `route-card ${currentRoute && currentRoute.routeName === route.routeName ? 'active' : ''}`;
      card.dataset.route = route.routeName;

      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${escapeHtml(route.routeName)}</span>
          <span class="route-badge badge-${route.routeBadge}">${route.routeType}</span>
        </div>
        <div class="card-terminals">
          <span>${escapeHtml(route.startStop)}</span>
          <span class="term-sep">⇄</span>
          <span>${escapeHtml(route.endStop)}</span>
        </div>
        <div class="card-bottom">
          <span>정류소 ${route.stopCount}개</span>
          <span>${route.lengthKm} km</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectRoute(route.routeName);
      });

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  // =========================================================================
  // Select & Display Route on Map
  // =========================================================================
  function selectRoute(routeName) {
    if (!routeData || !routeData.routes[routeName]) return;

    currentRoute = routeData.routes[routeName];
    currentDirection = 'all';

    // Reset simulation if active
    stopSimulation();

    // Show Detail Panel, Hide List Panel
    dom.panelRouteList.classList.add('hidden');
    dom.panelStopDetail.classList.add('hidden');
    dom.panelRouteDetail.classList.remove('hidden');

    // Populate Detail Hero
    dom.detailRouteType.textContent = currentRoute.routeType;
    dom.detailRouteType.className = `route-type-tag badge-${currentRoute.routeBadge}`;
    dom.detailRouteName.textContent = currentRoute.routeName;
    dom.detailRouteId.textContent = `ID ${currentRoute.routeId}`;
    dom.detailStartStop.textContent = currentRoute.startStop;
    dom.detailEndStop.textContent = currentRoute.endStop;

    if (currentRoute.turnStop) {
      dom.detailTurnStop.textContent = currentRoute.turnStop;
      dom.detailTurnWrap.style.display = 'flex';
    } else {
      dom.detailTurnWrap.style.display = 'none';
    }

    dom.detailStopCount.textContent = currentRoute.stopCount;
    dom.detailLength.textContent = currentRoute.lengthKm;
    dom.detailPointCount.textContent = currentRoute.totalPoints;

    // Reset Direction Tabs
    document.querySelectorAll('.dir-tab').forEach(t => t.classList.remove('active'));
    dom.tabDirAll.classList.add('active');
    dom.stopFilterInput.value = '';

    // Render Map Polylines & Markers
    drawRouteOnMap(currentRoute, currentDirection);

    // Render Vertical Timeline
    renderStopTimeline(currentRoute, currentDirection, '');

    // Show Simulation Bar
    dom.simulationBar.classList.remove('hidden');
    dom.simCurrentStop.textContent = `${currentRoute.startStop} (대기 중)`;

    // Update active highlight in route cards
    document.querySelectorAll('.route-card').forEach(c => {
      c.classList.toggle('active', c.dataset.route === routeName);
    });

    // Close search dropdown
    closeSearchDropdown();
    dom.routeSearchInput.value = routeName;
    dom.clearSearchBtn.style.display = 'flex';
  }

  // =========================================================================
  // Draw Route Polyline & Markers on OpenStreetMap
  // =========================================================================
  // =========================================================================
  // OSRM Routing Engine & Status
  // =========================================================================
  function updateOsrmStatus(type, text, countStr) {
    if (!dom.osrmStatusContainer) return;
    dom.osrmStatusContainer.className = `osrm-status-container ${type}`;
    if (text) dom.osrmStatusText.textContent = text;
    if (dom.osrmCoordsCount) dom.osrmCoordsCount.textContent = countStr || '';
  }

  async function getOrFetchOsrmCoords(route, direction, points) {
    // 1. Check if official BIS trajectory is available (High precision, 100% official)
    if (route) {
      if (direction === '상행' && route.upTrajectory && route.upTrajectory.length > 0) {
        return route.upTrajectory.map(c => [c[1], c[0]]); // return [lng, lat]
      }
      if (direction === '하행' && route.downTrajectory && route.downTrajectory.length > 0) {
        return route.downTrajectory.map(c => [c[1], c[0]]);
      }
      if (route.trajectory && route.trajectory.length > 0) {
        return route.trajectory.map(c => [c[1], c[0]]);
      }
    }

    const cacheKey = route.routeName + (direction !== 'all' ? `_${direction}` : '');

    // 2. Check in-memory / pre-generated OSRM cache
    if (osrmCache[cacheKey] && osrmCache[cacheKey].length > 0) {
      return osrmCache[cacheKey];
    }
    if (direction === 'all' && osrmCache[route.routeName] && osrmCache[route.routeName].length > 0) {
      return osrmCache[route.routeName];
    }

    // 3. Fallback to OSRM API if no trajectory
    const CHUNK_SIZE = 25;
    const roadCoords = [];
    const totalChunks = Math.ceil((points.length - 1) / (CHUNK_SIZE - 1));

    for (let i = 0; i < points.length; i += CHUNK_SIZE - 1) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) break;

      const currentChunkIdx = Math.floor(i / (CHUNK_SIZE - 1)) + 1;
      const pct = Math.round((currentChunkIdx / totalChunks) * 100);
      updateOsrmStatus('loading', `도로망 매칭 계산 중 (${pct}%)...`);

      const coordStr = chunk.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
          const c = data.routes[0].geometry.coordinates;
          if (roadCoords.length > 0) {
            roadCoords.push(...c.slice(1));
          } else {
            roadCoords.push(...c);
          }
        }
      } catch (err) {
        console.warn(`Chunk ${i} fetch error:`, err);
        chunk.forEach(p => roadCoords.push([p.lng, p.lat]));
      }
      await new Promise(res => setTimeout(res, 100));
    }

    if (roadCoords.length > 0) {
      osrmCache[cacheKey] = roadCoords;
    }
    return roadCoords;
  }

  // =========================================================================
  // Draw Route Polyline & Markers on OpenStreetMap
  // =========================================================================
  async function drawRouteOnMap(route, direction) {
    routeLayerGroup.clearLayers();
    stopsLayerGroup.clearLayers();
    waypointsLayerGroup.clearLayers();

    if (!route || !route.points || route.points.length === 0) return;

    let points = route.points;
    if (direction === '상행') {
      points = points.filter(p => p.direction === '상행');
    } else if (direction === '하행') {
      points = points.filter(p => p.direction === '하행');
    }

    if (points.length === 0) return;

    // Direct points LatLngs
    const directLatLngs = points.map(p => [p.lat, p.lng]);

    // Check if official BIS trajectory exists
    let officialTrajectory = null;
    if (direction === '상행' && route.upTrajectory && route.upTrajectory.length > 0) {
      officialTrajectory = route.upTrajectory;
    } else if (direction === '하행' && route.downTrajectory && route.downTrajectory.length > 0) {
      officialTrajectory = route.downTrajectory;
    } else if (route.trajectory && route.trajectory.length > 0) {
      officialTrajectory = route.trajectory;
    }

    // Determine initial line coords
    const initialLatLngs = (officialTrajectory && officialTrajectory.length > 0) ? officialTrajectory : directLatLngs;

    const casingPolyline = L.polyline(initialLatLngs, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(routeLayerGroup);

    const routePolyline = L.polyline(initialLatLngs, {
      color: route.routeColor,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(routeLayerGroup);

    // Initial fit bounds
    map.fitBounds(routePolyline.getBounds(), {
      padding: [60, 60],
      maxZoom: 15,
      animate: true,
      duration: 0.8
    });

    // 2. Render Markers for Stops & Intersections
    renderRouteMarkers(points, route);

    // 3. Apply Official BIS Trajectory or Fallback to OSRM / Coordinates
    if (officialTrajectory && officialTrajectory.length > 0) {
      casingPolyline.setLatLngs(officialTrajectory);
      routePolyline.setLatLngs(officialTrajectory);
      currentSimCoords = officialTrajectory.map(c => ({ lat: c[0], lng: c[1] }));
      updateOsrmStatus('success', '공식 도로망(BIS 궤적) 적용 완료', `${officialTrajectory.length.toLocaleString()}개 정밀 좌표`);
    } else {
      updateOsrmStatus('loading', '도로망 궤적 매칭 중...');
      try {
        const roadCoords = await getOrFetchOsrmCoords(route, direction, points);
        if (roadCoords && roadCoords.length > 0 && currentRoute && currentRoute.routeName === route.routeName) {
          const osrmLatLngs = roadCoords.map(c => [c[1], c[0]]);
          casingPolyline.setLatLngs(osrmLatLngs);
          routePolyline.setLatLngs(osrmLatLngs);
          currentSimCoords = roadCoords.map(c => ({ lat: c[1], lng: c[0] }));
          updateOsrmStatus('success', '실제 도로망 매칭 완료', `${roadCoords.length.toLocaleString()}개 도로 좌표`);
        }
      } catch (err) {
        console.warn('Routing matching failed, fallback to stop coordinates:', err);
        casingPolyline.setLatLngs(directLatLngs);
        routePolyline.setLatLngs(directLatLngs);
        updateOsrmStatus('success', '노선 경유지 연결 완료');
        currentSimCoords = points;
      }
    }
  }

  function renderRouteMarkers(points, route) {
    points.forEach((pt, idx) => {
      if (pt.type === '교차로') {
        if (showWaypoints) {
          const crossroadSvg = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20"></path>
              <path d="M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l3 3"></path>
            </svg>
          `;
          const customIcon = L.divIcon({
            className: '',
            html: `<div class="custom-intersection-marker" data-stop-seq="${pt.seq}" title="교차로"><div class="intersection-inner">${crossroadSvg}</div></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });

          const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });

          marker.bindTooltip(
            `<strong>🔀 ${escapeHtml(pt.name)}</strong> (교차로 #${pt.seq})`, 
            { direction: 'top', offset: [0, -10] }
          );

          const popupContent = `
            <div class="stop-popup-card">
              <span class="popup-tag intersection">
                🔀 교차로 (도로 경유지) ${pt.direction ? `• ${pt.direction}` : ''}
              </span>
              <h3 class="popup-title">${escapeHtml(pt.name)}</h3>
              <p class="popup-notice">⚠️ 승객 승하차가 불가능한 도로 교차점/경유지입니다.</p>
              <div class="popup-meta-row" style="margin-top: 10px;">
                <span>노선 순번: #${pt.seq}</span>
                <span>ID: ${pt.stopId}</span>
              </div>
            </div>
          `;
          marker.bindPopup(popupContent);

          marker.on('click', () => {
            highlightStopInTimeline(pt.seq);
          });

          marker.addTo(waypointsLayerGroup);
        }
      } else if (showStops) {
        // Bus Stop Marker (기점, 정류소, 회차지, 종점)
        let iconClass = 'custom-stop-marker';
        let iconInner = '🚏';

        if (pt.type === '기점') {
          iconClass += ' start';
          iconInner = '🚩';
        } else if (pt.type === '종점') {
          iconClass += ' end';
          iconInner = '🏁';
        } else if (pt.type === '회차지') {
          iconClass += ' turn';
          iconInner = '🔄';
        }

        const customIcon = L.divIcon({
          className: '',
          html: `<div class="${iconClass}" data-stop-seq="${pt.seq}">${iconInner}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });

        // Tooltip
        marker.bindTooltip(
          `<strong>${escapeHtml(pt.name)}</strong>${pt.arsId ? ` (${pt.arsId})` : ''}`, 
          { direction: 'top', offset: [0, -10], permanent: showLabels }
        );

        // Rich Popup Card
        const popupContent = `
          <div class="stop-popup-card">
            <span class="popup-tag" style="background:${route.routeColor}20; color:${route.routeColor};">
              ${pt.type} ${pt.direction ? `• ${pt.direction}` : ''}
            </span>
            <h3 class="popup-title">${escapeHtml(pt.name)}</h3>
            <p class="popup-ars">ARS 번호: <strong>${pt.arsId ? pt.arsId : '미부여'}</strong></p>
            <div class="popup-meta-row">
              <span>정류장 번호: #${pt.seq}</span>
              <span>ID: ${pt.stopId}</span>
            </div>
            <div class="popup-path-actions">
              <button class="btn-set-path start" onclick="window.setPathEndpoint('start', '${escapeHtml(pt.name)}')">🚩 출발</button>
              <button class="btn-set-path end" onclick="window.setPathEndpoint('end', '${escapeHtml(pt.name)}')">🏁 도착</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);

        // Marker click event
        marker.on('click', () => {
          highlightStopInTimeline(pt.seq);
        });

        marker.addTo(stopsLayerGroup);
      }
    });
  }

  // =========================================================================
  // Transit Timeline (Vertical Stop Sequence)
  // =========================================================================
  function renderStopTimeline(route, direction, query) {
    const container = dom.stopSequenceList;
    container.innerHTML = '';

    if (!route || !route.points) return;

    let points = route.points;
    if (direction === '상행') {
      points = points.filter(p => p.direction === '상행');
    } else if (direction === '하행') {
      points = points.filter(p => p.direction === '하행');
    }

    if (query) {
      const q = query.trim().toLowerCase();
      points = points.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.arsId && p.arsId.includes(q))
      );
    }

    if (points.length === 0) {
      container.innerHTML = `<div class="dropdown-empty">일치하는 정류소가 없습니다.</div>`;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'timeline-list';

    points.forEach(pt => {
      const li = document.createElement('li');
      let nodeClass = 'node-stop';
      let typeBadge = '';

      if (pt.type === '기점') {
        nodeClass = 'node-start';
        typeBadge = `<span class="timeline-type-badge" style="background:#dcfce7;color:#16a34a;">기점</span>`;
      } else if (pt.type === '종점') {
        nodeClass = 'node-end';
        typeBadge = `<span class="timeline-type-badge" style="background:#fee2e2;color:#dc2626;">종점</span>`;
      } else if (pt.type === '회차지') {
        nodeClass = 'node-turn';
        typeBadge = `<span class="timeline-type-badge" style="background:#fef3c7;color:#d97706;">회차</span>`;
      } else if (pt.type === '교차로') {
        nodeClass = 'node-intersection';
        typeBadge = `<span class="timeline-type-badge" style="background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;">🔀 교차로</span>`;
      }

      li.className = `timeline-item ${nodeClass}`;
      li.dataset.seq = pt.seq;

      const arsSubtext = pt.type === '교차로' 
        ? '<span style="font-size:0.72rem;color:#ea580c;font-weight:600;">도로 경유점</span>' 
        : (pt.arsId ? pt.arsId : '');

      li.innerHTML = `
        <div class="timeline-node"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-name">${escapeHtml(pt.name)} ${typeBadge}</span>
            <span class="timeline-ars">${arsSubtext}</span>
          </div>
        </div>
      `;

      // Click: pan map to stop & open popup
      li.addEventListener('click', () => {
        zoomToStop(pt);
        document.querySelectorAll('.timeline-item').forEach(el => el.classList.remove('active-stop'));
        li.classList.add('active-stop');
      });

      ul.appendChild(li);
    });

    container.appendChild(ul);
  }

  function zoomToStop(pt) {
    map.flyTo([pt.lat, pt.lng], 16, { animate: true, duration: 0.6 });

    // Open popup for this marker in either stopsLayerGroup or waypointsLayerGroup
    const openMatchingPopup = (group) => {
      group.eachLayer(layer => {
        if (layer.getLatLng && 
            Math.abs(layer.getLatLng().lat - pt.lat) < 0.0001 && 
            Math.abs(layer.getLatLng().lng - pt.lng) < 0.0001) {
          layer.openPopup();
        }
      });
    };
    openMatchingPopup(stopsLayerGroup);
    openMatchingPopup(waypointsLayerGroup);
  }

  function highlightStopInTimeline(seq) {
    document.querySelectorAll('.timeline-item').forEach(el => {
      if (parseInt(el.dataset.seq) === seq) {
        el.classList.add('active-stop');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('active-stop');
      }
    });
  }

  // =========================================================================
  // Unified Route & Stop Search (1. 노선, 정류소 통합 검색)
  // =========================================================================
  function handleSearchInput(e) {
    const rawVal = e.target.value.trim();
    if (!rawVal) {
      dom.clearSearchBtn.style.display = 'none';
      // 빈 검색창 클릭/포커스 시 엑셀 순서대로 전체 120개 노선 표출
      searchRoutes('');
      return;
    }
    dom.clearSearchBtn.style.display = 'flex';

    if (searchMode === 'path') {
      return;
    }

    // 1번 모드: 노선 및 정류소 통합 검색
    searchUnified(rawVal);
  }

  function searchUnified(query) {
    if (!routeData) return;

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      searchRoutes('');
      return;
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const chosungQuery = getChosungString(lowerQuery);
    const isNumQuery = /^\d+$/.test(trimmedQuery);
    const numVal = isNumQuery ? parseInt(trimmedQuery, 10) : null;

    // 1. 노선 매칭 (엑셀 순서)
    const routes = getOrderedRoutes();
    const routeMatches = routes.filter(r => {
      const name = r.routeName.toLowerCase();
      const chosungName = getChosungString(name);
      return name.includes(lowerQuery) || chosungName.includes(chosungQuery);
    });

    // 2. 정류소 & ARS 매칭
    const stopMatches = [];
    if (routeData.stopIndex) {
      const stopNames = Object.keys(routeData.stopIndex);
      for (const stopName of stopNames) {
        const servingRoutes = routeData.stopIndex[stopName];
        const lowerName = stopName.toLowerCase();
        const chosungName = getChosungString(lowerName);

        const arsList = Array.from(new Set(servingRoutes.map(r => r.arsId).filter(Boolean)));
        const nameMatch = lowerName.includes(lowerQuery) || chosungName.includes(chosungQuery);

        let matchedArs = null;
        let arsExact = false;
        let arsPrefix = false;
        let arsContains = false;

        for (const ars of arsList) {
          if (!ars) continue;
          if (ars === trimmedQuery || (numVal !== null && parseInt(ars, 10) === numVal)) {
            matchedArs = ars;
            arsExact = true;
            break;
          } else if (ars.startsWith(trimmedQuery)) {
            matchedArs = ars;
            arsPrefix = true;
          } else if (ars.includes(trimmedQuery) && !matchedArs) {
            matchedArs = ars;
            arsContains = true;
          }
        }

        if (nameMatch || matchedArs) {
          let priority = 10;
          if (arsExact) priority = 1;
          else if (lowerName === lowerQuery) priority = 2;
          else if (arsPrefix) priority = 3;
          else if (lowerName.startsWith(lowerQuery)) priority = 4;
          else if (arsContains) priority = 5;
          else if (nameMatch) priority = 6;

          stopMatches.push({
            stopName: stopName,
            routes: servingRoutes,
            arsList: arsList,
            matchedArs: matchedArs,
            priority: priority
          });
        }
      }

      stopMatches.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.stopName.localeCompare(b.stopName, 'ko');
      });
    }

    renderUnifiedDropdown(routeMatches, stopMatches.slice(0, 15), trimmedQuery);
  }

  function renderUnifiedDropdown(routeMatches, stopMatches, query) {
    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';

    if (routeMatches.length === 0 && stopMatches.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-empty">일치하는 노선 또는 정류소가 없습니다.</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();

    // 1. 노선 매칭 결과 섹션
    if (routeMatches.length > 0) {
      const routeHeader = document.createElement('div');
      routeHeader.className = 'dropdown-section-header';
      routeHeader.innerHTML = `<span>🚌 <strong>노선</strong> (${routeMatches.length}개)</span><span style="font-size:0.72rem; color:#94a3b8;">엑셀 순서 정렬</span>`;
      fragment.appendChild(routeHeader);

      routeMatches.slice(0, 15).forEach(r => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(r.routeName, query);
        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge badge-${r.routeBadge}">${r.routeType}</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals">${escapeHtml(r.startStop)} ⇄ ${escapeHtml(r.endStop)}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${r.stopCount}개 정류소</span>
        `;
        item.addEventListener('click', () => {
          selectRoute(r.routeName);
        });
        fragment.appendChild(item);
      });
    }

    // 2. 정류소 & ARS 매칭 결과 섹션
    if (stopMatches.length > 0) {
      const stopHeader = document.createElement('div');
      stopHeader.className = 'dropdown-section-header';
      stopHeader.innerHTML = `<span>🚏 <strong>정류소 · ARS</strong> (${stopMatches.length}개)</span><span style="font-size:0.72rem; color:#94a3b8;">경유 노선 조회</span>`;
      fragment.appendChild(stopHeader);

      stopMatches.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(s.stopName, query);
        const arsBadge = s.matchedArs
          ? `<span class="badge-ars highlight">ARS ${highlightMatch(s.matchedArs, query)}</span>`
          : (s.arsList.length > 0 ? `<span class="badge-ars">ARS ${escapeHtml(s.arsList[0])}</span>` : '');

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge" style="background:#f1f5f9; color:#475569;">정류소</span>
            <div>
              <div class="dropdown-route-name">${highlightedName} ${arsBadge}</div>
              <div class="dropdown-terminals">
                ${s.routes.length}개 노선 경유 (${escapeHtml(s.routes.slice(0, 3).map(r => r.routeName).join(', '))}${s.routes.length > 3 ? '…' : ''})
              </div>
            </div>
          </div>
          <span class="dropdown-stops-count">경유 노선 →</span>
        `;
        item.addEventListener('click', () => {
          selectStop(s.stopName, s.routes, s.matchedArs);
        });
        fragment.appendChild(item);
      });
    }

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function searchRoutes(query) {
    if (!routeData || !routeData.routes) return;

    const lowerQuery = (query || '').toLowerCase().trim();
    const chosungQuery = getChosungString(lowerQuery);
    const routes = getOrderedRoutes(); // 엑셀 파일 순서대로 정렬된 노선 목록

    let matches = [];
    if (!lowerQuery) {
      // 검색어가 없을 때는 엑셀 파일 순서 그대로 전체 120개 노선 표출
      matches = routes;
    } else {
      // 검색어가 있을 때도 엑셀 파일 순서대로 일치하는 전체 노선 표출 (15개 제한 제거)
      matches = routes.filter(r => {
        const name = r.routeName.toLowerCase();
        const chosungName = getChosungString(name);
        return name.includes(lowerQuery) || chosungName.includes(chosungQuery);
      });
    }

    renderSearchDropdown(matches, query, 'route');
  }

  function searchStops(query) {
    if (!routeData || !routeData.stopIndex) return;

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      closeSearchDropdown();
      return;
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const chosungQuery = getChosungString(lowerQuery);
    const isNumQuery = /^\d+$/.test(trimmedQuery);
    const numVal = isNumQuery ? parseInt(trimmedQuery, 10) : null;

    const stopNames = Object.keys(routeData.stopIndex);
    const matches = [];

    for (const stopName of stopNames) {
      const routes = routeData.stopIndex[stopName];
      const lowerName = stopName.toLowerCase();
      const chosungName = getChosungString(lowerName);

      // Collect all distinct ARS IDs for this stop
      const arsList = Array.from(new Set(routes.map(r => r.arsId).filter(Boolean)));

      // Matching criteria
      const nameMatch = lowerName.includes(lowerQuery) || chosungName.includes(chosungQuery);
      
      // ARS match: exact, prefix, contains, or numeric match (e.g., "123" matching "0123")
      let matchedArs = null;
      let arsExact = false;
      let arsPrefix = false;
      let arsContains = false;

      if (isNumQuery) {
        for (const ars of arsList) {
          if (ars === trimmedQuery) {
            matchedArs = ars;
            arsExact = true;
            break;
          } else if (numVal !== null && parseInt(ars, 10) === numVal) {
            matchedArs = ars;
            arsExact = true;
            break;
          } else if (ars.startsWith(trimmedQuery)) {
            if (!matchedArs) matchedArs = ars;
            arsPrefix = true;
          } else if (ars.includes(trimmedQuery)) {
            if (!matchedArs) matchedArs = ars;
            arsContains = true;
          }
        }
      } else {
        // Search if query is inside any ARS (e.g., partial)
        for (const ars of arsList) {
          if (ars.includes(lowerQuery)) {
            matchedArs = ars;
            arsContains = true;
            break;
          }
        }
      }

      if (nameMatch || matchedArs) {
        // Priority scoring:
        // 1: Exact ARS match
        // 2: Exact Stop name match
        // 3: ARS prefix match
        // 4: Stop name starts with query
        // 5: ARS contains match
        // 6: Stop name contains query / chosung
        let priority = 10;
        if (arsExact) priority = 1;
        else if (lowerName === lowerQuery) priority = 2;
        else if (arsPrefix) priority = 3;
        else if (lowerName.startsWith(lowerQuery)) priority = 4;
        else if (arsContains) priority = 5;
        else if (nameMatch) priority = 6;

        matches.push({
          stopName: stopName,
          routes: routes,
          arsList: arsList,
          matchedArs: matchedArs,
          priority: priority
        });
      }
    }

    // Sort by priority, then stopName
    matches.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.stopName.localeCompare(b.stopName, 'ko');
    });

    renderSearchDropdown(matches, trimmedQuery, 'stop');
  }

  function renderSearchDropdown(items, query, mode) {
    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';

    if (items.length === 0) {
      // Check if user is in route mode but typed digits that might be an ARS number
      if (mode === 'route' && /^\d+$/.test(query.trim())) {
        const potentialArs = query.trim();
        const hasStopArs = checkAnyStopHasArs(potentialArs);
        if (hasStopArs) {
          dropdown.innerHTML = `
            <div class="dropdown-empty">일치하는 노선이 없습니다.</div>
            <div class="dropdown-switch-prompt" id="btnSwitchToStopSearch">
              <span>💡 정류소 ARS 번호 <strong>${escapeHtml(potentialArs)}</strong> 결과가 있습니다.</span>
              <button type="button">정류소 검색으로 전환 →</button>
            </div>
          `;
          dropdown.classList.remove('hidden');
          const switchBtn = document.getElementById('btnSwitchToStopSearch');
          if (switchBtn) {
            switchBtn.addEventListener('click', () => {
              dom.modeStopBtn.click();
            });
          }
          return;
        }
      }

      dropdown.innerHTML = `<div class="dropdown-empty">일치하는 결과가 없습니다.</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();

    if (mode === 'route') {
      // 상단 결과 카운트 및 엑셀 순서 안내 헤더
      const header = document.createElement('div');
      header.className = 'dropdown-header-bar';
      header.style.cssText = 'padding: 6px 16px; font-size: 0.75rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; background: #f8fafc; position: sticky; top: -8px; z-index: 10;';
      header.innerHTML = `<span>노선 검색 결과 <strong>${items.length}개</strong></span><span>엑셀 순서 정렬</span>`;
      fragment.appendChild(header);

      items.forEach((r, idx) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';

        const highlightedName = highlightMatch(r.routeName, query);

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge badge-${r.routeBadge}">${r.routeType}</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals">${escapeHtml(r.startStop)} ⇄ ${escapeHtml(r.endStop)}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${r.stopCount}개 정류소</span>
        `;

        item.addEventListener('click', () => {
          selectRoute(r.routeName);
        });

        fragment.appendChild(item);
      });

      // If user typed digits in route mode, also suggest ARS if exists
      if (/^\d+$/.test(query.trim())) {
        const potentialArs = query.trim();
        const hasStopArs = checkAnyStopHasArs(potentialArs);
        if (hasStopArs) {
          const prompt = document.createElement('div');
          prompt.className = 'dropdown-switch-prompt';
          prompt.innerHTML = `
            <span>💡 정류소 ARS <strong>${escapeHtml(potentialArs)}</strong> 검색 결과도 있습니다.</span>
            <button type="button">정류소 보기 →</button>
          `;
          prompt.addEventListener('click', () => {
            dom.modeStopBtn.click();
          });
          fragment.appendChild(prompt);
        }
      }
    } else {
      // 상단 결과 카운트 헤더
      const header = document.createElement('div');
      header.className = 'dropdown-header-bar';
      header.style.cssText = 'padding: 6px 16px; font-size: 0.75rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; background: #f8fafc; position: sticky; top: -8px; z-index: 10;';
      header.innerHTML = `<span>정류소 · ARS 검색 결과 <strong>${items.length}개</strong></span><span>정류소명 / ARS 번호 매칭</span>`;
      fragment.appendChild(header);

      items.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(s.stopName, query);

        // ARS tags rendering
        let arsHtml = '';
        if (s.arsList && s.arsList.length > 0) {
          arsHtml = s.arsList.map(ars => {
            const isMatch = s.matchedArs === ars || ars.includes(query) || (parseInt(ars, 10) === parseInt(query, 10));
            const highlightedArs = highlightMatch(ars, query);
            return `<span class="ars-tag ${isMatch ? 'match-active' : ''}">ARS ${highlightedArs}</span>`;
          }).join(' ');
        } else {
          arsHtml = '<span class="ars-tag muted">ARS 미부여</span>';
        }

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge" style="background:#e0f2fe;color:#0369a1;">정류소</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals" style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;">${arsHtml}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${s.routes.length}개 노선 경유</span>
        `;

        item.addEventListener('click', () => {
          selectStop(s.stopName, s.routes, s.matchedArs);
        });

        fragment.appendChild(item);
      });
    }

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function checkAnyStopHasArs(queryDigits) {
    if (!routeData || !routeData.stopIndex) return false;
    const numVal = parseInt(queryDigits, 10);
    for (const name in routeData.stopIndex) {
      const routes = routeData.stopIndex[name];
      for (const r of routes) {
        if (r.arsId && (r.arsId.includes(queryDigits) || parseInt(r.arsId, 10) === numVal)) {
          return true;
        }
      }
    }
    return false;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  function closeSearchDropdown() {
    dom.searchResultsDropdown.classList.add('hidden');
  }

  // =========================================================================
  // Stop Reverse Search: Select Stop & List Serving Routes
  // =========================================================================
  function selectStop(stopName, servingRoutes, targetArsId) {
    closeSearchDropdown();
    dom.panelRouteList.classList.add('hidden');
    dom.panelRouteDetail.classList.add('hidden');
    dom.panelStopDetail.classList.remove('hidden');

    dom.stopDetailName.textContent = stopName;

    // Collect all ARS IDs
    const arsList = Array.from(new Set(servingRoutes.map(r => r.arsId).filter(Boolean)));
    if (targetArsId && arsList.includes(targetArsId)) {
      arsList.sort((a, b) => (a === targetArsId ? -1 : (b === targetArsId ? 1 : a.localeCompare(b))));
    }

    if (arsList.length > 0) {
      dom.stopDetailArs.innerHTML = arsList.map(ars => 
        `<span class="ars-badge-pill ${ars === targetArsId ? 'active' : ''}">ARS ${escapeHtml(ars)}</span>`
      ).join(' ');
    } else {
      dom.stopDetailArs.textContent = 'ARS 미부여';
    }

    dom.stopDetailCount.textContent = `${servingRoutes.length}개 노선 경유`;

    // Render Routes serving this stop
    const container = dom.stopRoutesList;
    container.innerHTML = '';

    servingRoutes.forEach(r => {
      const card = document.createElement('div');
      card.className = 'route-card';
      const arsTag = r.arsId ? `<span class="card-ars-tag ${r.arsId === targetArsId ? 'highlight' : ''}">ARS ${escapeHtml(r.arsId)}</span>` : '';
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${escapeHtml(r.routeName)}</span>
          <div style="display:flex;gap:4px;align-items:center;">
            ${arsTag}
            <span class="route-badge badge-${r.routeBadge || 'trunk'}">${r.routeType}</span>
          </div>
        </div>
        <div class="card-bottom">
          <span>클릭하여 노선 지도 보기</span>
          <span>→</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectRoute(r.routeName);
      });

      container.appendChild(card);
    });

    // Pan map to stop position: prefer targetArsId position if available
    let targetPoint = servingRoutes[0];
    if (targetArsId) {
      const matched = servingRoutes.find(r => r.arsId === targetArsId);
      if (matched && matched.lat && matched.lng) {
        targetPoint = matched;
      }
    }

    if (targetPoint?.lat && targetPoint?.lng) {
      map.flyTo([targetPoint.lat, targetPoint.lng], 15, { animate: true, duration: 0.8 });

      // Add temporary highlight marker
      if (highlightMarker) map.removeLayer(highlightMarker);
      highlightMarker = L.circleMarker([targetPoint.lat, targetPoint.lng], {
        radius: 12,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 3
      }).addTo(map);

      const popupArs = targetPoint.arsId ? `ARS: ${targetPoint.arsId}` : (arsList.length > 0 ? `ARS: ${arsList.join(', ')}` : '');
      const popupHtml = `
        <div style="min-width: 150px;">
          <strong style="font-size: 0.95rem;">${escapeHtml(stopName)}</strong><br>
          <span style="font-size: 0.8rem; color: #64748b;">${popupArs}</span>
          <div class="popup-path-actions">
            <button class="btn-set-path start" onclick="window.setPathEndpoint('start', '${escapeHtml(stopName)}')">🚩 출발</button>
            <button class="btn-set-path end" onclick="window.setPathEndpoint('end', '${escapeHtml(stopName)}')">🏁 도착</button>
          </div>
        </div>
      `;
      highlightMarker.bindPopup(popupHtml).openPopup();
    }
  }

  // =========================================================================
  // Route Simulation / Bus Animation
  // =========================================================================
  function toggleSimulation() {
    if (simIsPlaying) {
      pauseSimulation();
    } else {
      startSimulation();
    }
  }

  function startSimulation() {
    if (!currentRoute || !currentRoute.points || currentRoute.points.length === 0) return;

    // Use high-resolution OSRM road coordinates if available
    if (routingMode === 'osrm' && currentSimCoords && currentSimCoords.length > 0) {
      simPoints = currentSimCoords;
    } else {
      simPoints = currentRoute.points;
    }

    simIsPlaying = true;
    dom.simBtnText.textContent = '일시 정지';
    dom.simPlayBtn.classList.remove('play');
    dom.simPlayBtn.classList.add('pause');

    if (!simulationMarker) {
      const busIcon = L.divIcon({
        className: '',
        html: '<div class="moving-bus-marker">🚌</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      simulationMarker = L.marker([simPoints[simCurrentIndex].lat, simPoints[simCurrentIndex].lng], {
        icon: busIcon,
        zIndexOffset: 10000
      }).addTo(map);
    }

    const stepSize = simPoints.length > 300 ? 3 : 1;
    const intervalMs = simPoints.length > 300 ? 100 : 350;

    simInterval = setInterval(() => {
      if (simCurrentIndex >= simPoints.length - 1) {
        simCurrentIndex = 0; // Loop or stop
      } else {
        simCurrentIndex = Math.min(simPoints.length - 1, simCurrentIndex + stepSize);
      }

      const curPt = simPoints[simCurrentIndex];
      simulationMarker.setLatLng([curPt.lat, curPt.lng]);

      // Find nearest stop name for label
      let stopLabel = curPt.name;
      if (!stopLabel && currentRoute.points) {
        let minDist = 999999;
        let nearest = null;
        for (const p of currentRoute.points) {
          const d = Math.hypot(p.lat - curPt.lat, p.lng - curPt.lng);
          if (d < minDist) {
            minDist = d;
            nearest = p;
          }
        }
        stopLabel = nearest ? nearest.name : currentRoute.startStop;
      }

      // Update progress bar & label
      const pct = Math.round((simCurrentIndex / (simPoints.length - 1)) * 100);
      dom.simProgressBar.style.width = `${pct}%`;
      dom.simCurrentStop.textContent = `${stopLabel} (${pct}%)`;

      // Smoothly pan with bus
      map.panTo([curPt.lat, curPt.lng], { animate: true, duration: intervalMs / 1000 });
    }, intervalMs);
  }

  function pauseSimulation() {
    simIsPlaying = false;
    clearInterval(simInterval);
    dom.simBtnText.textContent = '이어 달리기';
    dom.simPlayBtn.classList.add('play');
    dom.simPlayBtn.classList.remove('pause');
  }

  function stopSimulation() {
    simIsPlaying = false;
    clearInterval(simInterval);
    simCurrentIndex = 0;
    dom.simBtnText.textContent = '주행 시뮬레이션';
    dom.simProgressBar.style.width = '0%';
    if (simulationMarker) {
      map.removeLayer(simulationMarker);
      simulationMarker = null;
    }
  }

  // =========================================================================
  // GeoJSON Export
  // =========================================================================
  function exportCurrentRouteGeoJSON() {
    if (!currentRoute) {
      alert('내보낼 노선을 먼저 선택해 주세요.');
      return;
    }

    const coordinates = (routingMode === 'osrm' && currentSimCoords && currentSimCoords.length > 0)
      ? currentSimCoords.map(p => [p.lng, p.lat])
      : currentRoute.points.map(p => [p.lng, p.lat]);
    const stopFeatures = currentRoute.points.map(p => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat]
      },
      properties: {
        seq: p.seq,
        name: p.name,
        arsId: p.arsId,
        stopId: p.stopId,
        type: p.type,
        direction: p.direction
      }
    }));

    const lineFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        routeName: currentRoute.routeName,
        routeId: currentRoute.routeId,
        routeType: currentRoute.routeType,
        startStop: currentRoute.startStop,
        turnStop: currentRoute.turnStop,
        endStop: currentRoute.endStop,
        stopCount: currentRoute.stopCount,
        lengthKm: currentRoute.lengthKm
      }
    };

    const geojson = {
      type: 'FeatureCollection',
      name: `광주버스_${currentRoute.routeName}`,
      features: [lineFeature, ...stopFeatures]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `광주버스_${currentRoute.routeName}_노선.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Path Finding (길찾기) Implementation
  // =========================================================================
  function setSearchMode(mode) {
    searchMode = mode;
    if (dom.modeSearchBtn) dom.modeSearchBtn.classList.toggle('active', mode === 'search' || mode === 'route' || mode === 'stop');
    if (dom.modePathBtn) dom.modePathBtn.classList.toggle('active', mode === 'path');

    if (mode === 'path') {
      if (dom.routeSearchWrapper) dom.routeSearchWrapper.classList.add('hidden');
      if (dom.searchInputWrapper) dom.searchInputWrapper.classList.add('hidden');
      dom.pathSearchWrapper.classList.remove('hidden');
      closeSearchDropdown();
      if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
        executePathSearch();
      }
    } else {
      if (dom.routeSearchWrapper) dom.routeSearchWrapper.classList.remove('hidden');
      if (dom.searchInputWrapper) dom.searchInputWrapper.classList.remove('hidden');
      dom.pathSearchWrapper.classList.add('hidden');
      dom.routeSearchInput.placeholder = '노선명, 정류소명 또는 ARS 번호 검색 (예: 급행03, 광천터미널, 2002, ㄱㅎ)';
      if (dom.routeSearchInput.value.trim()) {
        searchUnified(dom.routeSearchInput.value.trim());
      }
    }
  }

  window.setPathEndpoint = function (type, stopName) {
    setSearchMode('path');
    if (type === 'start') {
      dom.pathStartInput.value = stopName;
      dom.clearStartBtn.style.display = 'flex';
    } else {
      dom.pathEndInput.value = stopName;
      dom.clearEndBtn.style.display = 'flex';
    }
    if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
      executePathSearch();
    } else if (type === 'start') {
      dom.pathEndInput.focus();
    } else {
      dom.pathStartInput.focus();
    }
  };

  function handlePathAutocomplete(query, inputType) {
    activePathInputType = inputType;
    if (!query || !window.BusRouter) {
      closeSearchDropdown();
      return;
    }

    const matchedStops = window.BusRouter.searchStops(query, 12);
    if (matchedStops.length === 0) {
      closeSearchDropdown();
      return;
    }

    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';
    const fragment = document.createDocumentFragment();

    matchedStops.forEach(s => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      const arsBadge = s.arsId ? `<span class="badge-ars">ARS ${escapeHtml(s.arsId)}</span>` : '';
      item.innerHTML = `
        <div class="item-title">
          <span class="route-icon">🚏</span>
          <span class="route-name">${highlightMatch(s.name, query)}</span>
          ${arsBadge}
        </div>
        <div class="item-terminals">${s.routesCount}개 노선 경유 (${escapeHtml(s.routes.slice(0, 4).join(', '))}${s.routes.length > 4 ? '…' : ''})</div>
      `;

      item.addEventListener('click', () => {
        if (activePathInputType === 'start') {
          dom.pathStartInput.value = s.name;
          dom.clearStartBtn.style.display = 'flex';
        } else {
          dom.pathEndInput.value = s.name;
          dom.clearEndBtn.style.display = 'flex';
        }
        closeSearchDropdown();

        if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
          executePathSearch();
        } else if (activePathInputType === 'start') {
          dom.pathEndInput.focus();
        } else {
          dom.pathStartInput.focus();
        }
      });

      fragment.appendChild(item);
    });

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function executePathSearch() {
    closeSearchDropdown();
    const startName = dom.pathStartInput.value.trim();
    const endName = dom.pathEndInput.value.trim();

    if (!startName) {
      alert('출발 정류소명을 입력해주세요.');
      dom.pathStartInput.focus();
      return;
    }
    if (!endName) {
      alert('도착 정류소명을 입력해주세요.');
      dom.pathEndInput.focus();
      return;
    }
    if (startName === endName) {
      alert('출발지와 도착지가 같습니다. 서로 다른 정류소를 선택해주세요.');
      return;
    }

    if (!window.BusRouter) {
      alert('경로 검색 엔진이 아직 준비되지 않았습니다.');
      return;
    }

    // Stop ongoing simulation
    stopSimulation();
    dom.simulationBar.classList.add('hidden');

    currentPathResults = window.BusRouter.findPaths(startName, endName, currentPathSort, 10);
    selectedPathIndex = currentPathResults.length > 0 ? 0 : -1;

    // Show Path Panel, Hide others
    dom.panelRouteList.classList.add('hidden');
    dom.panelRouteDetail.classList.add('hidden');
    dom.panelStopDetail.classList.add('hidden');
    dom.panelPathResult.classList.remove('hidden');

    // Update Header
    dom.summaryStartName.textContent = startName;
    dom.summaryEndName.textContent = endName;
    dom.pathResultsCount.textContent = `${currentPathResults.length}개 경로`;

    renderPathResultsList();

    if (currentPathResults.length > 0) {
      selectAndDrawPath(0);
    } else {
      pathLayerGroup.clearLayers();
    }
  }

  function renderPathResultsList() {
    const container = dom.pathResultsList;
    container.innerHTML = '';

    if (!currentPathResults || currentPathResults.length === 0) {
      container.innerHTML = `
        <div class="path-empty-msg">
          <div class="empty-icon">🔍</div>
          <p><strong>직통 또는 1회 환승 경로를 찾지 못했습니다.</strong></p>
          <p style="margin-top:6px; font-size:0.8rem; color:#94a3b8;">출발지 또는 도착지 정류소명을 확인해주세요.</p>
        </div>
      `;
      return;
    }

    currentPathResults.forEach((path, idx) => {
      const card = document.createElement('div');
      card.className = `path-card ${idx === selectedPathIndex ? 'active' : ''}`;
      card.dataset.index = idx;

      // Badges
      const routeBadgesHtml = path.legs.map((leg, lIdx) => {
        const badge = `<span class="path-route-badge" style="background:${leg.route.color};">${escapeHtml(leg.route.name)}</span>`;
        if (lIdx === 0 && path.legs.length > 1) {
          return `${badge} <span class="path-transfer-arrow">➔</span>`;
        }
        return badge;
      }).join(' ');

      const transferTag = path.transfers === 0 
        ? `<span class="path-transfer-tag direct">직통</span>`
        : `<span class="path-transfer-tag transfer">환승 1회</span>`;

      // Legs detail without time estimation
      let legsHtml = '';
      if (path.type === 'direct') {
        const leg = path.legs[0];
        legsHtml = `
          <div class="path-legs-detail">
            <div class="leg-item">
              <div class="leg-main-row">
                <span class="leg-stop-span">🟢 <strong>${escapeHtml(leg.startStop.name)}</strong> 승차</span>
                <span style="font-size:0.75rem; color:${leg.route.color}; font-weight:700;">${escapeHtml(leg.route.name)}</span>
              </div>
              <div class="leg-sub-info">
                <span>${leg.stopCount}개 정류장 이동</span>
                <button class="btn-toggle-substops" data-leg="0">경유 정류장 목록 ▼</button>
              </div>
              <div class="leg-substops-list hidden" id="substops-list-${idx}-0">
                ${leg.stops.map(s => `<div>• ${escapeHtml(s.name)}${s.arsId ? ` (${s.arsId})` : ''}</div>`).join('')}
              </div>
              <div class="leg-main-row" style="margin-top:4px;">
                <span class="leg-stop-span">🔴 <strong>${escapeHtml(leg.endStop.name)}</strong> 하차</span>
              </div>
            </div>
          </div>
        `;
      } else {
        const leg1 = path.legs[0];
        const leg2 = path.legs[1];
        const walkNotice = path.walkDistance > 10 
          ? `<div class="walk-transfer-row">🚶 도보 약 ${path.walkDistance}m 이동 환승</div>`
          : `<div class="walk-transfer-row" style="background:#f0fdf4; border-color:#bbf7d0; color:#166534;">🔄 동일 정류장 환승</div>`;

        legsHtml = `
          <div class="path-legs-detail">
            <!-- Leg 1 -->
            <div class="leg-item">
              <div class="leg-main-row">
                <span class="leg-stop-span">🟢 <strong>${escapeHtml(leg1.startStop.name)}</strong> 승차</span>
                <span style="font-size:0.75rem; color:${leg1.route.color}; font-weight:700;">${escapeHtml(leg1.route.name)}</span>
              </div>
              <div class="leg-sub-info">
                <span>${leg1.stopCount}개 정류장 이동</span>
                <button class="btn-toggle-substops" data-leg="0">경유 정류장 목록 ▼</button>
              </div>
              <div class="leg-substops-list hidden" id="substops-list-${idx}-0">
                ${leg1.stops.map(s => `<div>• ${escapeHtml(s.name)}${s.arsId ? ` (${s.arsId})` : ''}</div>`).join('')}
              </div>
              <div class="leg-main-row" style="margin-top:4px;">
                <span class="leg-stop-span">🟠 <strong>${escapeHtml(leg1.endStop.name)}</strong> 하차</span>
              </div>
            </div>

            <!-- Walk Transfer -->
            ${walkNotice}

            <!-- Leg 2 -->
            <div class="leg-item">
              <div class="leg-main-row">
                <span class="leg-stop-span">🟠 <strong>${escapeHtml(leg2.startStop.name)}</strong> 승차</span>
                <span style="font-size:0.75rem; color:${leg2.route.color}; font-weight:700;">${escapeHtml(leg2.route.name)}</span>
              </div>
              <div class="leg-sub-info">
                <span>${leg2.stopCount}개 정류장 이동</span>
                <button class="btn-toggle-substops" data-leg="1">경유 정류장 목록 ▼</button>
              </div>
              <div class="leg-substops-list hidden" id="substops-list-${idx}-1">
                ${leg2.stops.map(s => `<div>• ${escapeHtml(s.name)}${s.arsId ? ` (${s.arsId})` : ''}</div>`).join('')}
              </div>
              <div class="leg-main-row" style="margin-top:4px;">
                <span class="leg-stop-span">🔴 <strong>${escapeHtml(leg2.endStop.name)}</strong> 하차</span>
              </div>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="path-card-top">
          <div class="path-routes-preview">${routeBadgesHtml}</div>
          ${transferTag}
        </div>
        <div class="path-card-stats">
          <span class="path-total-stops">${path.totalStops}개 정류장</span>
          <span style="font-size:0.8rem; color:var(--text-muted);">이동</span>
        </div>
        ${legsHtml}
      `;

      // Card Click: Select and draw on map
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-toggle-substops')) {
          const btn = e.target.closest('.btn-toggle-substops');
          const legIdx = btn.dataset.leg;
          const listElem = document.getElementById(`substops-list-${idx}-${legIdx}`);
          if (listElem) {
            const isHidden = listElem.classList.toggle('hidden');
            btn.textContent = isHidden ? '경유 정류장 목록 ▼' : '경유 정류장 목록 ▲';
          }
          return;
        }
        selectAndDrawPath(idx);
      });

      container.appendChild(card);
    });
  }

  function selectAndDrawPath(index) {
    if (!currentPathResults || !currentPathResults[index]) return;
    selectedPathIndex = index;

    // Update active class on cards
    document.querySelectorAll('.path-card').forEach((c, idx) => {
      c.classList.toggle('active', idx === index);
    });

    const path = currentPathResults[index];

    // Clear all other layers
    routeLayerGroup.clearLayers();
    stopsLayerGroup.clearLayers();
    waypointsLayerGroup.clearLayers();
    pathLayerGroup.clearLayers();
    if (highlightMarker) {
      map.removeLayer(highlightMarker);
      highlightMarker = null;
    }

    const allBounds = [];

    // Draw each leg
    path.legs.forEach((leg) => {
      const fullRoute = routeData.routes[leg.route.name];
      const pts = leg.points;
      let legCoords = pts.map(p => [p.lat, p.lng]);

      // If official trajectory exists, attempt to extract road sub-trajectory
      if (fullRoute && fullRoute.trajectory && fullRoute.trajectory.length > 0) {
        const traj = fullRoute.trajectory;
        let startIdx = -1, endIdx = -1;
        let startMinD = Infinity, endMinD = Infinity;

        traj.forEach((coord, tIdx) => {
          const d1 = (coord[0] - leg.startStop.lat)**2 + (coord[1] - leg.startStop.lng)**2;
          const d2 = (coord[0] - leg.endStop.lat)**2 + (coord[1] - leg.endStop.lng)**2;
          if (d1 < startMinD) { startMinD = d1; startIdx = tIdx; }
          if (d2 < endMinD) { endMinD = d2; endIdx = tIdx; }
        });

        if (startIdx >= 0 && endIdx >= 0 && startIdx < endIdx) {
          legCoords = traj.slice(startIdx, endIdx + 1);
        }
      }

      // Draw casing & route polyline
      L.polyline(legCoords, {
        color: '#ffffff',
        weight: 9,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(pathLayerGroup);

      L.polyline(legCoords, {
        color: leg.route.color,
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(pathLayerGroup);

      legCoords.forEach(c => allBounds.push(c));

      // Draw Intermediate Stops (smaller dots)
      leg.stops.forEach((s, sIdx) => {
        if (sIdx === 0 || sIdx === leg.stops.length - 1) return;

        const circle = L.circleMarker([s.lat, s.lng], {
          radius: 4.5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: leg.route.color,
          fillOpacity: 0.9
        }).addTo(pathLayerGroup);

        circle.bindTooltip(`<strong>${escapeHtml(s.name)}</strong>${s.arsId ? ` (${s.arsId})` : ''}`, {
          direction: 'top',
          offset: [0, -6]
        });
      });
    });

    // Draw Walking Leg if 1-Transfer
    if (path.type === 'transfer' && path.legs.length === 2) {
      const leg1 = path.legs[0];
      const leg2 = path.legs[1];
      const walkLine = [
        [leg1.endStop.lat, leg1.endStop.lng],
        [leg2.startStop.lat, leg2.startStop.lng]
      ];

      L.polyline(walkLine, {
        color: '#f59e0b',
        weight: 4,
        dashArray: '6, 8',
        opacity: 0.95
      }).addTo(pathLayerGroup);

      // Transfer Pin Marker
      const transIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker transfer">환승</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const transMarker = L.marker([leg1.endStop.lat, leg1.endStop.lng], { icon: transIcon }).addTo(pathLayerGroup);
      transMarker.bindPopup(`
        <div style="min-width:130px; text-align:center;">
          <strong style="color:#d97706;">환승 지점</strong><br>
          <span>${escapeHtml(leg1.endStop.name)} 하차 ➔ ${escapeHtml(leg2.startStop.name)} 승차</span><br>
          <span style="font-size:0.75rem; color:#64748b;">${path.walkDistance > 10 ? `도보 약 ${path.walkDistance}m` : '동일 정류장'}</span>
        </div>
      `);
    }

    // Departure Pin (Start)
    const startLeg = path.legs[0];
    const startIcon = L.divIcon({
      className: '',
      html: `<div class="path-pin-marker start">출발</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const startMarker = L.marker([startLeg.startStop.lat, startLeg.startStop.lng], { icon: startIcon }).addTo(pathLayerGroup);
    startMarker.bindPopup(`<strong>출발: ${escapeHtml(startLeg.startStop.name)}</strong><br>탑승 노선: ${escapeHtml(startLeg.route.name)}`).openPopup();

    // Arrival Pin (End)
    const lastLeg = path.legs[path.legs.length - 1];
    const endIcon = L.divIcon({
      className: '',
      html: `<div class="path-pin-marker end">도착</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const endMarker = L.marker([lastLeg.endStop.lat, lastLeg.endStop.lng], { icon: endIcon }).addTo(pathLayerGroup);
    endMarker.bindPopup(`<strong>도착: ${escapeHtml(lastLeg.endStop.name)}</strong><br>하차 노선: ${escapeHtml(lastLeg.route.name)}`);

    // Fit Bounds
    if (allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
        duration: 0.8
      });
    }
  }

  // =========================================================================
  // Bind Event Listeners
  // =========================================================================
  function bindEvents() {
    // Search input (Route / Stop mode)
    dom.routeSearchInput.addEventListener('input', handleSearchInput);
    dom.routeSearchInput.addEventListener('focus', handleSearchInput);

    // Clear search button
    dom.clearSearchBtn.addEventListener('click', () => {
      dom.routeSearchInput.value = '';
      dom.clearSearchBtn.style.display = 'none';
      closeSearchDropdown();
      dom.routeSearchInput.focus();
    });

    // Path dual inputs
    dom.pathStartInput.addEventListener('input', (e) => {
      dom.clearStartBtn.style.display = e.target.value ? 'flex' : 'none';
      handlePathAutocomplete(e.target.value.trim(), 'start');
    });
    dom.pathStartInput.addEventListener('focus', (e) => {
      handlePathAutocomplete(e.target.value.trim(), 'start');
    });
    dom.clearStartBtn.addEventListener('click', () => {
      dom.pathStartInput.value = '';
      dom.clearStartBtn.style.display = 'none';
      closeSearchDropdown();
      dom.pathStartInput.focus();
    });
    dom.pathStartInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (dom.pathEndInput.value.trim()) executePathSearch();
        else dom.pathEndInput.focus();
      }
    });

    dom.pathEndInput.addEventListener('input', (e) => {
      dom.clearEndBtn.style.display = e.target.value ? 'flex' : 'none';
      handlePathAutocomplete(e.target.value.trim(), 'end');
    });
    dom.pathEndInput.addEventListener('focus', (e) => {
      handlePathAutocomplete(e.target.value.trim(), 'end');
    });
    dom.clearEndBtn.addEventListener('click', () => {
      dom.pathEndInput.value = '';
      dom.clearEndBtn.style.display = 'none';
      closeSearchDropdown();
      dom.pathEndInput.focus();
    });
    dom.pathEndInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executePathSearch();
      }
    });

    // Swap button
    dom.pathSwapBtn.addEventListener('click', () => {
      const temp = dom.pathStartInput.value;
      dom.pathStartInput.value = dom.pathEndInput.value;
      dom.pathEndInput.value = temp;
      dom.clearStartBtn.style.display = dom.pathStartInput.value ? 'flex' : 'none';
      dom.clearEndBtn.style.display = dom.pathEndInput.value ? 'flex' : 'none';
      if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
        executePathSearch();
      }
    });

    // Path submit button
    dom.pathSearchSubmitBtn.addEventListener('click', executePathSearch);

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const isInside = (dom.routeSearchInput && dom.routeSearchInput.contains(e.target)) ||
                       (dom.pathStartInput && dom.pathStartInput.contains(e.target)) ||
                       (dom.pathEndInput && dom.pathEndInput.contains(e.target)) ||
                       (dom.searchResultsDropdown && dom.searchResultsDropdown.contains(e.target));
      if (!isInside) {
        closeSearchDropdown();
      }
    });

    // Search Mode switches (1. 노선 · 정류소 / 2. 길찾기)
    if (dom.btnRouteSearchSubmit) {
      dom.btnRouteSearchSubmit.addEventListener('click', () => {
        const val = dom.routeSearchInput.value.trim();
        if (val) {
          searchUnified(val);
        } else {
          searchRoutes('');
        }
      });
    }
    if (dom.btnGoToPath) dom.btnGoToPath.addEventListener('click', () => setSearchMode('path'));
    if (dom.btnBackToRouteSearch) dom.btnBackToRouteSearch.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeSearchBtn) dom.modeSearchBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeRouteBtn) dom.modeRouteBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeStopBtn) dom.modeStopBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modePathBtn) dom.modePathBtn.addEventListener('click', () => setSearchMode('path'));

    // Path sorting tabs (직통 우선 vs 최소 정류장)
    if (dom.sortDirectBtn) {
      dom.sortDirectBtn.addEventListener('click', () => {
        dom.sortDirectBtn.classList.add('active');
        if (dom.sortStopsBtn) dom.sortStopsBtn.classList.remove('active');
        currentPathSort = 'direct';
        executePathSearch();
      });
    }

    if (dom.sortStopsBtn) {
      dom.sortStopsBtn.addEventListener('click', () => {
        dom.sortStopsBtn.classList.add('active');
        if (dom.sortDirectBtn) dom.sortDirectBtn.classList.remove('active');
        currentPathSort = 'stops';
        executePathSearch();
      });
    }

    // Back from path panel
    dom.btnBackFromPath.addEventListener('click', () => {
      dom.panelPathResult.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      pathLayerGroup.clearLayers();
    });

    // Quick chips (if present)
    if (dom.quickRoutes) {
      dom.quickRoutes.addEventListener('click', (e) => {
        const chip = e.target.closest('.quick-chip');
        if (chip && chip.dataset.route) {
          selectRoute(chip.dataset.route);
        }
      });
    }

    // Category filter chips
    document.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderRouteCardList();
      });
    });

    // Back Buttons
    dom.btnBackToRouteList.addEventListener('click', () => {
      dom.panelRouteDetail.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      stopSimulation();
      dom.simulationBar.classList.add('hidden');
    });

    dom.btnBackFromStop.addEventListener('click', () => {
      dom.panelStopDetail.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      if (highlightMarker) {
        map.removeLayer(highlightMarker);
        highlightMarker = null;
      }
    });


    // Direction Tabs
    dom.tabDirAll.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirAll, 'all');
    });
    dom.tabDirUp.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirUp, '상행');
    });
    dom.tabDirDown.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirDown, '하행');
    });

    function setActiveDirTab(tabBtn, dir) {
      document.querySelectorAll('.dir-tab').forEach(t => t.classList.remove('active'));
      tabBtn.classList.add('active');
      currentDirection = dir;
      if (currentRoute) {
        drawRouteOnMap(currentRoute, currentDirection);
        renderStopTimeline(currentRoute, currentDirection, dom.stopFilterInput.value);
      }
    }

    // Stop filter within route
    dom.stopFilterInput.addEventListener('input', (e) => {
      if (currentRoute) {
        renderStopTimeline(currentRoute, currentDirection, e.target.value);
      }
    });

    // Map Settings Menu Toggle
    dom.layerMenuToggleBtn.addEventListener('click', () => {
      dom.mapSettingsMenu.classList.toggle('hidden');
    });
    dom.closeSettingsBtn.addEventListener('click', () => {
      dom.mapSettingsMenu.classList.add('hidden');
    });

    // Tile options click
    document.querySelectorAll('.tile-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        setTileLayer(btn.dataset.tile);
      });
    });

    // Checkbox controls
    dom.chkShowStops.addEventListener('change', (e) => {
      showStops = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });
    dom.chkShowWaypoints.addEventListener('change', (e) => {
      showWaypoints = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });
    dom.chkShowLabels.addEventListener('change', (e) => {
      showLabels = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });

    // GeoJSON Export
    dom.btnExportGeoJSON.addEventListener('click', exportCurrentRouteGeoJSON);

    // Sidebar Mobile Toggle
    dom.sidebarToggleBtn.addEventListener('click', () => {
      dom.sidebar.classList.toggle('closed');
    });

    // Map Floating Controls
    dom.btnZoomIn.addEventListener('click', () => map.zoomIn());
    dom.btnZoomOut.addEventListener('click', () => map.zoomOut());
    dom.btnResetGwangju.addEventListener('click', () => {
      map.flyTo([35.1595, 126.8526], 12, { animate: true, duration: 0.8 });
    });
    dom.btnFitRoute.addEventListener('click', () => {
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });

    // Simulation Controls
    dom.simPlayBtn.addEventListener('click', toggleSimulation);
    dom.simCloseBtn.addEventListener('click', () => {
      stopSimulation();
      dom.simulationBar.classList.add('hidden');
    });
  }

  // =========================================================================
  // Utility Functions
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
