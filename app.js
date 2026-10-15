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
  let searchMode = 'route'; // 'route' | 'stop'

  // Map Layer Groups
  let routeLayerGroup = null;
  let stopsLayerGroup = null;
  let waypointsLayerGroup = null;
  let highlightMarker = null;
  let simulationMarker = null;

  // Settings
  let showStops = true;
  let showWaypoints = true;
  let showLabels = false;
  let routingMode = 'osrm'; // 'osrm' (실제 도로망) | 'direct' (직선)
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
    routeSearchInput: document.getElementById('routeSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    searchResultsDropdown: document.getElementById('searchResultsDropdown'),
    modeRouteBtn: document.getElementById('modeRouteBtn'),
    modeStopBtn: document.getElementById('modeStopBtn'),
    quickRoutes: document.getElementById('quickRoutes'),
    layerMenuToggleBtn: document.getElementById('layerMenuToggleBtn'),
    mapSettingsMenu: document.getElementById('mapSettingsMenu'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    sidebar: document.getElementById('sidebar'),

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

    // Routing Mode Elements
    btnRoutingOsrm: document.getElementById('btnRoutingOsrm'),
    btnRoutingDirect: document.getElementById('btnRoutingDirect'),
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

    // Default select "급행03" on load to showcase the route immediately!
    if (routeData && routeData.routes['급행03']) {
      selectRoute('급행03');
    }
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
    const initialLatLngs = (routingMode === 'osrm' && officialTrajectory) ? officialTrajectory : directLatLngs;

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

    // 3. Apply Official BIS Trajectory or Fallback to OSRM / Direct
    if (routingMode === 'osrm') {
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
          console.warn('Routing matching failed, keeping direct polyline:', err);
          updateOsrmStatus('direct', '직선 연결 모드');
          currentSimCoords = points;
        }
      }
    } else {
      casingPolyline.setLatLngs(directLatLngs);
      routePolyline.setLatLngs(directLatLngs);
      updateOsrmStatus('direct', '직선 노선 모드');
      currentSimCoords = points;
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
  // Search Autocomplete (Korean Chosung + Fuzzy match)
  // =========================================================================
  function handleSearchInput(e) {
    const rawVal = e.target.value.trim();
    if (!rawVal) {
      dom.clearSearchBtn.style.display = 'none';
      if (searchMode === 'route') {
        searchRoutes(''); // 빈 검색창 클릭/포커스 시 엑셀 순서대로 전체 노선 표출
      } else {
        closeSearchDropdown();
      }
      return;
    }
    dom.clearSearchBtn.style.display = 'flex';

    if (searchMode === 'route') {
      searchRoutes(rawVal);
    } else {
      searchStops(rawVal);
    }
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

    const lowerQuery = query.toLowerCase();
    const chosungQuery = getChosungString(lowerQuery);
    const stopNames = Object.keys(routeData.stopIndex);

    const matches = [];
    for (const stopName of stopNames) {
      const lowerName = stopName.toLowerCase();
      const chosungName = getChosungString(lowerName);
      if (lowerName.includes(lowerQuery) || chosungName.includes(chosungQuery)) {
        matches.push({
          stopName: stopName,
          routes: routeData.stopIndex[stopName]
        });
      }
    }

    renderSearchDropdown(matches, query, 'stop');
  }

  function renderSearchDropdown(items, query, mode) {
    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';

    if (items.length === 0) {
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
    } else {
      items.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(s.stopName, query);
        const ars = s.routes[0]?.arsId ? `ARS: ${s.routes[0].arsId}` : '';

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge" style="background:#e0f2fe;color:#0369a1;">정류소</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals">${ars}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${s.routes.length}개 노선 경유</span>
        `;

        item.addEventListener('click', () => {
          selectStop(s.stopName, s.routes);
        });

        fragment.appendChild(item);
      });
    }

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
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
  function selectStop(stopName, servingRoutes) {
    closeSearchDropdown();
    dom.panelRouteList.classList.add('hidden');
    dom.panelRouteDetail.classList.add('hidden');
    dom.panelStopDetail.classList.remove('hidden');

    dom.stopDetailName.textContent = stopName;
    const ars = servingRoutes[0]?.arsId;
    dom.stopDetailArs.textContent = ars ? `ARS: ${ars}` : 'ARS 미부여';
    dom.stopDetailCount.textContent = `${servingRoutes.length}개 노선 경유`;

    // Render Routes serving this stop
    const container = dom.stopRoutesList;
    container.innerHTML = '';

    servingRoutes.forEach(r => {
      const card = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${escapeHtml(r.routeName)}</span>
          <span class="route-badge badge-trunk">${r.routeType}</span>
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

    // Pan map to stop position
    if (servingRoutes[0]?.lat && servingRoutes[0]?.lng) {
      map.flyTo([servingRoutes[0].lat, servingRoutes[0].lng], 15, { animate: true, duration: 0.8 });

      // Add temporary highlight marker
      if (highlightMarker) map.removeLayer(highlightMarker);
      highlightMarker = L.circleMarker([servingRoutes[0].lat, servingRoutes[0].lng], {
        radius: 12,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 3
      }).addTo(map);
      highlightMarker.bindPopup(`<strong>${escapeHtml(stopName)}</strong><br>${ars ? `ARS: ${ars}` : ''}`).openPopup();
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
  // Bind Event Listeners
  // =========================================================================
  function bindEvents() {
    // Search input
    dom.routeSearchInput.addEventListener('input', handleSearchInput);
    dom.routeSearchInput.addEventListener('focus', handleSearchInput);

    // Clear search button
    dom.clearSearchBtn.addEventListener('click', () => {
      dom.routeSearchInput.value = '';
      dom.clearSearchBtn.style.display = 'none';
      closeSearchDropdown();
      dom.routeSearchInput.focus();
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!dom.routeSearchInput.contains(e.target) && !dom.searchResultsDropdown.contains(e.target)) {
        closeSearchDropdown();
      }
    });

    // Search Mode switch (Route vs Stop)
    dom.modeRouteBtn.addEventListener('click', () => {
      searchMode = 'route';
      dom.modeRouteBtn.classList.add('active');
      dom.modeStopBtn.classList.remove('active');
      dom.routeSearchInput.placeholder = '노선명 검색 (예: 급행03, 1187, 03, 수완, ㄱㅎ)';
      if (dom.routeSearchInput.value.trim()) {
        searchRoutes(dom.routeSearchInput.value.trim());
      }
    });

    dom.modeStopBtn.addEventListener('click', () => {
      searchMode = 'stop';
      dom.modeStopBtn.classList.add('active');
      dom.modeRouteBtn.classList.remove('active');
      dom.routeSearchInput.placeholder = '정류소명 검색 (예: 시청, 광천터미널, 전남대, 충장로)';
      if (dom.routeSearchInput.value.trim()) {
        searchStops(dom.routeSearchInput.value.trim());
      }
    });

    // Quick chips
    dom.quickRoutes.addEventListener('click', (e) => {
      const chip = e.target.closest('.quick-chip');
      if (chip && chip.dataset.route) {
        selectRoute(chip.dataset.route);
      }
    });

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

    // Routing Mode Switch (OSRM vs Direct)
    if (dom.btnRoutingOsrm && dom.btnRoutingDirect) {
      dom.btnRoutingOsrm.addEventListener('click', () => {
        if (routingMode === 'osrm') return;
        routingMode = 'osrm';
        dom.btnRoutingOsrm.classList.add('active');
        dom.btnRoutingDirect.classList.remove('active');
        if (currentRoute) {
          drawRouteOnMap(currentRoute, currentDirection);
        }
      });

      dom.btnRoutingDirect.addEventListener('click', () => {
        if (routingMode === 'direct') return;
        routingMode = 'direct';
        dom.btnRoutingDirect.classList.add('active');
        dom.btnRoutingOsrm.classList.remove('active');
        if (currentRoute) {
          drawRouteOnMap(currentRoute, currentDirection);
        }
      });
    }

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
