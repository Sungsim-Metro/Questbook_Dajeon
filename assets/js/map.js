/* Dynamic NAVER Maps integration and mock fallback for Questbook Daejeon. */
(function attachQuestbookMap(window, document) {
  'use strict';

  // The variable stores the shared mock data namespace.
  const data = window.QuestbookMockData;
  // The variable stores shared UI helpers.
  const ui = window.QuestbookUi;
  // The variable stores the same-origin Dynamic Map configuration endpoint.
  const CONFIG_ENDPOINT = '/api/naver-map/config';
  // The variable stores the same-origin Geocoding proxy endpoint.
  const GEOCODE_ENDPOINT = '/api/naver-map/geocode';
  // The variable stores the same-origin Reverse Geocoding proxy endpoint.
  const REVERSE_GEOCODE_ENDPOINT = '/api/naver-map/reverse-geocode';
  // The variable stores the NAVER Maps JavaScript SDK URL.
  const NAVER_MAPS_SDK_URL = 'https://oapi.map.naver.com/openapi/v3/maps.js';
  // The variable stores the default Dynamic Map zoom level.
  const DEFAULT_ZOOM = 14;
  // The variable stores the zoom level used after a user selects or searches a location.
  const FOCUSED_ZOOM = 16;
  // The variable stores the geolocation timeout in milliseconds.
  const GEOLOCATION_TIMEOUT_MS = 5000;

  // The variable stores mutable map runtime state.
  const state = {
    activeLocation: null,
    config: null,
    isDynamicMapActive: false,
    map: null,
    placeMarkers: [],
    positionMarker: null,
    sdkPromise: null,
    selectedPlaceId: '',
  };

  /**
   * Input: None.
   * Output: An object containing map page elements.
   * Role: Centralizes DOM lookups used by the map page.
   * Example: const elements = getElements();
   */
  function getElements() {
    return {
      addressForm: document.querySelector('[data-map-search-form]'),
      addressInput: document.querySelector('[data-map-address-input]'),
      coordinateButton: document.querySelector('[data-map-coordinate-button]'),
      currentLocationButton: document.querySelector('[data-map-current-location]'),
      latitudeInput: document.querySelector('[data-map-lat-input]'),
      longitudeInput: document.querySelector('[data-map-lng-input]'),
      mapCanvas: document.querySelector('[data-quest-map]'),
      positionStatus: document.querySelector('[data-map-position-status]'),
      providerStatus: document.querySelector('[data-map-provider-status]'),
    };
  }

  /**
   * Input: None.
   * Output: A boolean.
   * Role: Detects whether the NAVER Maps SDK is available on the page.
   * Example: if (hasNaverMaps()) renderNaverQuestMap(container, placeId, location);
   */
  function hasNaverMaps() {
    return Boolean(window.naver && window.naver.maps);
  }

  /**
   * Input: A text label and visual status name.
   * Output: Nothing.
   * Role: Updates the map provider status pill.
   * Example: updateProviderStatus('Naver Dynamic Map', 'ready');
   */
  function updateProviderStatus(text, statusName) {
    // The variable stores the provider status pill element.
    const providerStatus = getElements().providerStatus;
    if (!providerStatus) return;

    providerStatus.textContent = text;
    providerStatus.classList.remove('is-ready', 'is-warning', 'is-error');
    if (statusName) providerStatus.classList.add(`is-${statusName}`);
  }

  /**
   * Input: A status message string.
   * Output: Nothing.
   * Role: Updates the readable current coordinate and address status.
   * Example: updatePositionStatus('대전역 · 36.33264, 127.43472');
   */
  function updatePositionStatus(text) {
    // The variable stores the position status element.
    const positionStatus = getElements().positionStatus;
    if (positionStatus) positionStatus.textContent = text;
  }

  /**
   * Input: A badge id string.
   * Output: A badge object with a safe fallback.
   * Role: Resolves map marker badge visuals from the shared badge dataset.
   * Example: const badge = resolveBadge(place.badgeId);
   */
  function resolveBadge(badgeId) {
    return ui.findBadgeById(badgeId) || { icon: '✦', color: '#0a8f48', name: '더미 배지' };
  }

  /**
   * Input: A place id string.
   * Output: A quest object or undefined.
   * Role: Finds the primary quest linked to a map place.
   * Example: const quest = findQuestByPlaceId(place.id);
   */
  function findQuestByPlaceId(placeId) {
    return data.quests.find((quest) => quest.placeId === placeId);
  }

  /**
   * Input: Latitude, longitude, name, and source strings.
   * Output: A normalized location object.
   * Role: Keeps location state consistent across browser GPS, search, coordinates, and places.
   * Example: const location = normalizeLocation(36.327, 127.427, '대전 중앙로', 'mock');
   */
  function normalizeLocation(latitude, longitude, name, source) {
    return {
      latitude,
      longitude,
      name: name || '선택 위치',
      source: source || 'manual',
    };
  }

  /**
   * Input: None.
   * Output: A fallback location object.
   * Role: Uses the existing Daejeon mock location when browser GPS is unavailable.
   * Example: const location = getFallbackLocation();
   */
  function getFallbackLocation() {
    return normalizeLocation(
      data.currentLocation.latitude,
      data.currentLocation.longitude,
      data.currentLocation.name,
      data.currentLocation.source || 'mock',
    );
  }

  /**
   * Input: A location object.
   * Output: A display coordinate string.
   * Role: Formats latitude and longitude for status text.
   * Example: const label = formatCoordinate(location);
   */
  function formatCoordinate(location) {
    return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }

  /**
   * Input: A location object.
   * Output: Nothing.
   * Role: Syncs latitude and longitude form inputs with the active location.
   * Example: setCoordinateInputs(location);
   */
  function setCoordinateInputs(location) {
    // The variable stores map page elements.
    const elements = getElements();
    if (elements.latitudeInput) elements.latitudeInput.value = location.latitude.toFixed(6);
    if (elements.longitudeInput) elements.longitudeInput.value = location.longitude.toFixed(6);
  }

  /**
   * Input: A raw coordinate value and validation metadata.
   * Output: A validated number.
   * Role: Parses coordinate text fields before moving the map.
   * Example: const lat = parseCoordinateInput('36.327', '위도', -90, 90);
   */
  function parseCoordinateInput(rawValue, label, minimum, maximum) {
    // The variable stores the trimmed coordinate string.
    const normalizedValue = String(rawValue || '').trim();
    // The variable stores the parsed numeric coordinate.
    const parsedValue = Number(normalizedValue);
    if (!normalizedValue || !Number.isFinite(parsedValue)) {
      throw new Error(`${label} 값을 숫자로 입력하세요.`);
    }
    if (parsedValue < minimum || parsedValue > maximum) {
      throw new Error(`${label} 값의 범위를 확인하세요.`);
    }
    return parsedValue;
  }

  /**
   * Input: None.
   * Output: A location object from coordinate inputs.
   * Role: Reads user-entered coordinates for manual map movement.
   * Example: const location = readCoordinateInputs();
   */
  function readCoordinateInputs() {
    // The variable stores map page elements.
    const elements = getElements();
    // The variable stores the validated latitude input.
    const latitude = parseCoordinateInput(elements.latitudeInput ? elements.latitudeInput.value : '', '위도', -90, 90);
    // The variable stores the validated longitude input.
    const longitude = parseCoordinateInput(elements.longitudeInput ? elements.longitudeInput.value : '', '경도', -180, 180);
    return normalizeLocation(latitude, longitude, '좌표 선택 위치', 'coordinate');
  }

  /**
   * Input: A JSON endpoint and URLSearchParams.
   * Output: Parsed JSON payload.
   * Role: Fetches same-origin JSON and converts HTTP failures into user-safe errors.
   * Example: const payload = await requestJson(GEOCODE_ENDPOINT, params);
   */
  async function requestJson(endpoint, params) {
    // The variable stores the serialized query string.
    const queryString = params && params.toString() ? `?${params.toString()}` : '';
    // The variable stores the JSON HTTP response.
    const response = await fetch(`${endpoint}${queryString}`, { headers: { Accept: 'application/json' } });
    // The variable stores the parsed payload, when the server returns JSON.
    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      // The variable stores the most useful error message available to the user.
      const message = payload.error || `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  /**
   * Input: None.
   * Output: A NAVER map config payload.
   * Role: Loads public Dynamic Map Key ID while keeping API Key secret on the server.
   * Example: const config = await loadNaverConfig();
   */
  async function loadNaverConfig() {
    // The variable stores the fetched map configuration.
    const config = await requestJson(CONFIG_ENDPOINT);
    state.config = config;
    return config;
  }

  /**
   * Input: None.
   * Output: A boolean.
   * Role: Checks whether Geocoding and Reverse Geocoding proxy routes can call NAVER.
   * Example: if (hasRestProxy()) await reverseGeocodeLocation(location);
   */
  function hasRestProxy() {
    return Boolean(state.config && state.config.restApiConfigured);
  }

  /**
   * Input: A NAVER Maps API Key ID.
   * Output: A promise resolved when the SDK is loaded.
   * Role: Dynamically injects the official NAVER Maps JavaScript SDK script.
   * Example: await loadNaverMapsSdk(config.keyId);
   */
  function loadNaverMapsSdk(keyId) {
    if (hasNaverMaps()) return Promise.resolve();
    if (state.sdkPromise) return state.sdkPromise;

    state.sdkPromise = new Promise((resolve, reject) => {
      // The variable stores the SDK script element.
      const script = document.createElement('script');
      script.src = `${NAVER_MAPS_SDK_URL}?ncpKeyId=${encodeURIComponent(keyId)}&submodules=geocoder`;
      script.async = true;
      script.dataset.naverMapsSdk = 'true';
      script.onload = () => {
        if (hasNaverMaps()) {
          resolve();
          return;
        }
        reject(new Error('NAVER Maps SDK loaded without the maps namespace.'));
      };
      script.onerror = () => {
        state.sdkPromise = null;
        reject(new Error('NAVER Maps SDK loading failed.'));
      };
      document.head.appendChild(script);
    });
    return state.sdkPromise;
  }

  /**
   * Input: None.
   * Output: A promise resolving to a browser location.
   * Role: Reads the browser geolocation API with a bounded timeout.
   * Example: const location = await getBrowserLocation();
   */
  function getBrowserLocation() {
    return new Promise((resolve, reject) => {
      if (!window.navigator.geolocation) {
        reject(new Error('Geolocation is unavailable.'));
        return;
      }

      window.navigator.geolocation.getCurrentPosition(
        (position) => {
          // The variable stores browser-provided coordinates.
          const coords = position.coords;
          resolve(normalizeLocation(coords.latitude, coords.longitude, '현재 위치', 'browser'));
        },
        (error) => reject(error),
        { enableHighAccuracy: true, maximumAge: 60000, timeout: GEOLOCATION_TIMEOUT_MS },
      );
    });
  }

  /**
   * Input: None.
   * Output: A promise resolving to the initial map location.
   * Role: Prefers browser GPS and falls back to the Daejeon mock location.
   * Example: const initialLocation = await resolveInitialLocation();
   */
  async function resolveInitialLocation() {
    updatePositionStatus('현재 위치를 확인하고 있습니다.');
    try {
      return await getBrowserLocation();
    } catch (error) {
      // The variable stores the fallback Daejeon location.
      const fallbackLocation = getFallbackLocation();
      updatePositionStatus(`현재 위치 권한 없음 · ${fallbackLocation.name} · ${formatCoordinate(fallbackLocation)}`);
      return fallbackLocation;
    }
  }

  /**
   * Input: A map container element.
   * Output: Nothing.
   * Role: Draws decorative map roads and areas for the mock map fallback.
   * Example: renderMockMapBase(canvas);
   */
  function renderMockMapBase(container) {
    container.insertAdjacentHTML('beforeend', `
      <div class="map-river" style="left:-38px;bottom:54px;transform:rotate(-9deg)"></div>
      <div class="map-road" style="top:0;bottom:0;left:55%;width:8px"></div>
      <div class="map-road" style="top:43%;left:0;right:0;height:8px"></div>
      <div class="map-road" style="top:64%;left:18%;width:62%;height:8px;transform:rotate(-24deg)"></div>
      <div class="map-park" style="top:9%;left:7%;width:37%;height:25%"></div>
      <div class="map-label" style="top:13%;left:11%">한밭수목원 권역</div>
      <div class="my-location-dot" style="top:48%;left:52%" aria-label="현재 위치"></div>
      <div class="map-legend"><div>내 위치</div><div>퀘스트 · 추천 관광지</div></div>
    `);
  }

  /**
   * Input: A place object and a selected place id.
   * Output: An HTML string for a mock map marker button.
   * Role: Creates a clickable badge-shaped marker for the mock map.
   * Example: const marker = renderMockMarker(place, selectedPlaceId);
   */
  function renderMockMarker(place, selectedPlaceId) {
    // The variable stores the badge linked to the place.
    const badge = resolveBadge(place.badgeId);
    // The variable stores whether this marker is selected.
    const isSelected = place.id === selectedPlaceId;
    return `
      <button class="map-marker${isSelected ? ' is-selected' : ''}" type="button" data-map-place-id="${ui.escapeHtml(place.id)}" style="left:${place.x}%;top:${place.y}%">
        <span class="map-badge" style="color:${ui.escapeHtml(badge.color)}">${ui.escapeHtml(badge.icon)}</span>
        <span class="map-marker-label">${ui.escapeHtml(place.name)}</span>
      </button>
    `;
  }

  /**
   * Input: A map container element and a selected place id.
   * Output: Nothing.
   * Role: Renders the static mock map and marker buttons.
   * Example: renderMockQuestMap(container, 'hanbat-arboretum');
   */
  function renderMockQuestMap(container, selectedPlaceId) {
    state.isDynamicMapActive = false;
    state.map = null;
    state.placeMarkers = [];
    state.positionMarker = null;
    container.classList.remove('is-naver');
    container.classList.add('is-mock');
    container.innerHTML = '';
    renderMockMapBase(container);
    container.insertAdjacentHTML('beforeend', data.questPlaces.map((place) => renderMockMarker(place, selectedPlaceId)).join(''));
  }

  /**
   * Input: A place object and a selected place id.
   * Output: A NAVER Maps marker icon object.
   * Role: Builds an HTML marker icon for a quest place.
   * Example: const icon = buildPlaceMarkerIcon(place, selectedPlaceId);
   */
  function buildPlaceMarkerIcon(place, selectedPlaceId) {
    // The variable stores the badge linked to the place.
    const badge = resolveBadge(place.badgeId);
    // The variable stores the selected marker class suffix.
    const selectedClass = place.id === selectedPlaceId ? ' is-selected' : '';
    // The variable stores the marker HTML content rendered by NAVER Maps.
    const content = `
      <button class="naver-marker${selectedClass}" type="button" data-map-place-id="${ui.escapeHtml(place.id)}" aria-label="${ui.escapeHtml(place.name)}">
        <span class="map-badge" style="color:${ui.escapeHtml(badge.color)}">${ui.escapeHtml(badge.icon)}</span>
        <span class="naver-marker-label">${ui.escapeHtml(place.name)}</span>
      </button>
    `;
    return {
      content,
      anchor: new window.naver.maps.Point(24, 58),
    };
  }

  /**
   * Input: A location object.
   * Output: A NAVER Maps marker icon object.
   * Role: Builds an HTML marker icon for the current or selected location.
   * Example: const icon = buildPositionMarkerIcon(location);
   */
  function buildPositionMarkerIcon(location) {
    // The variable stores a compact marker label by location source.
    const label = location.source === 'browser' ? '내 위치' : '선택 위치';
    // The variable stores the marker HTML content rendered by NAVER Maps.
    const content = `
      <div class="naver-position-marker" aria-label="${ui.escapeHtml(label)}">
        <span></span>
      </div>
    `;
    return {
      content,
      anchor: new window.naver.maps.Point(13, 13),
    };
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Refreshes NAVER marker icons to reflect the selected place.
   * Example: updateNaverMarkerSelection();
   */
  function updateNaverMarkerSelection() {
    state.placeMarkers.forEach((entry) => {
      entry.marker.setIcon(buildPlaceMarkerIcon(entry.place, state.selectedPlaceId));
    });
  }

  /**
   * Input: A location object.
   * Output: Nothing.
   * Role: Creates or moves the active location marker on the Dynamic Map.
   * Example: syncPositionMarker(location);
   */
  function syncPositionMarker(location) {
    if (!state.map || !hasNaverMaps()) return;

    // The variable stores the NAVER coordinate for the active location.
    const position = new window.naver.maps.LatLng(location.latitude, location.longitude);
    if (state.positionMarker) {
      state.positionMarker.setPosition(position);
      state.positionMarker.setIcon(buildPositionMarkerIcon(location));
      return;
    }

    state.positionMarker = new window.naver.maps.Marker({
      map: state.map,
      position,
      icon: buildPositionMarkerIcon(location),
      zIndex: 100,
    });
  }

  /**
   * Input: A location object, zoom level, and reverse geocoding flag.
   * Output: A promise that resolves after optional reverse geocoding.
   * Role: Moves the Dynamic Map and keeps visible coordinate state synchronized.
   * Example: await moveToLocation(location, FOCUSED_ZOOM, true);
   */
  async function moveToLocation(location, zoom, shouldReverseGeocode) {
    state.activeLocation = location;
    setCoordinateInputs(location);
    updatePositionStatus(`${location.name} · ${formatCoordinate(location)}`);

    if (state.map && hasNaverMaps()) {
      // The variable stores the NAVER coordinate for the target location.
      const position = new window.naver.maps.LatLng(location.latitude, location.longitude);
      state.map.setCenter(position);
      if (zoom) state.map.setZoom(zoom);
      syncPositionMarker(location);
    }

    if (shouldReverseGeocode) {
      await reverseGeocodeLocation(location);
    }
  }

  /**
   * Input: A NAVER Reverse Geocoding result object.
   * Output: A readable address string.
   * Role: Converts NAVER reverse geocoding regions and land fields into compact text.
   * Example: const address = buildAddressFromReverseResult(result);
   */
  function buildAddressFromReverseResult(result) {
    if (!result) return '';

    // The variable stores region metadata from NAVER Reverse Geocoding.
    const region = result.region || {};
    // The variable stores land metadata from NAVER Reverse Geocoding.
    const land = result.land || {};
    // The variable stores readable region names.
    const regionNames = ['area1', 'area2', 'area3', 'area4']
      .map((key) => (region[key] ? region[key].name : ''))
      .filter(Boolean);
    // The variable stores the road or land number suffix.
    const numberSuffix = [land.number1, land.number2].filter(Boolean).join('-');
    // The variable stores the road or land name suffix.
    const landSuffix = [land.name, numberSuffix].filter(Boolean).join(' ');
    return [...regionNames, landSuffix].filter(Boolean).join(' ');
  }

  /**
   * Input: A NAVER Reverse Geocoding payload.
   * Output: A readable address string.
   * Role: Prefers road address results and falls back to the first result.
   * Example: const address = formatReverseAddress(payload);
   */
  function formatReverseAddress(payload) {
    // The variable stores reverse geocoding result rows.
    const results = Array.isArray(payload.results) ? payload.results : [];
    // The variable stores the preferred road address result.
    const roadResult = results.find((result) => result.name === 'roadaddr');
    return buildAddressFromReverseResult(roadResult || results[0]);
  }

  /**
   * Input: A location object.
   * Output: A promise that resolves after updating address status.
   * Role: Converts the active coordinate into a readable address through the server proxy.
   * Example: await reverseGeocodeLocation(location);
   */
  async function reverseGeocodeLocation(location) {
    if (!hasRestProxy()) {
      updatePositionStatus(`${location.name} · ${formatCoordinate(location)}`);
      return;
    }

    // The variable stores query parameters for Reverse Geocoding.
    const params = new URLSearchParams({
      lat: String(location.latitude),
      lng: String(location.longitude),
      orders: 'roadaddr,addr,admcode,legalcode',
    });
    updatePositionStatus(`주소 확인 중 · ${formatCoordinate(location)}`);

    try {
      // The variable stores the Reverse Geocoding payload.
      const payload = await requestJson(REVERSE_GEOCODE_ENDPOINT, params);
      // The variable stores the formatted reverse geocoding address.
      const address = formatReverseAddress(payload);
      // The variable stores the updated active location.
      const updatedLocation = normalizeLocation(location.latitude, location.longitude, address || location.name, location.source);
      state.activeLocation = updatedLocation;
      updatePositionStatus(`${updatedLocation.name} · ${formatCoordinate(updatedLocation)}`);
    } catch (error) {
      updatePositionStatus(`주소 확인 실패 · ${formatCoordinate(location)}`);
    }
  }

  /**
   * Input: A map container, selected place id, and initial location.
   * Output: Nothing.
   * Role: Renders NAVER Dynamic Map, quest markers, and the active location marker.
   * Example: renderNaverQuestMap(container, 'hanbat-arboretum', initialLocation);
   */
  function renderNaverQuestMap(container, selectedPlaceId, initialLocation) {
    // The variable stores the NAVER coordinate for the initial map center.
    const center = new window.naver.maps.LatLng(initialLocation.latitude, initialLocation.longitude);
    state.selectedPlaceId = selectedPlaceId;
    state.isDynamicMapActive = true;
    container.classList.remove('is-mock');
    container.classList.add('is-naver');
    container.innerHTML = '';

    state.map = new window.naver.maps.Map(container, {
      center,
      zoom: DEFAULT_ZOOM,
      minZoom: 7,
      scaleControl: true,
      mapDataControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.TOP_RIGHT,
      },
    });

    state.placeMarkers = data.questPlaces.map((place) => {
      // The variable stores the marker coordinate for a quest place.
      const position = new window.naver.maps.LatLng(place.latitude, place.longitude);
      // The variable stores the NAVER marker for the current quest place.
      const marker = new window.naver.maps.Marker({
        map: state.map,
        position,
        icon: buildPlaceMarkerIcon(place, selectedPlaceId),
      });
      window.naver.maps.Event.addListener(marker, 'click', () => selectPlace(place.id));
      return { marker, place };
    });

    syncPositionMarker(initialLocation);
    showPlaceDetail(selectedPlaceId);
    renderPlaceList(selectedPlaceId);
  }

  /**
   * Input: A place id string.
   * Output: Nothing.
   * Role: Renders the selected map place information panel.
   * Example: showPlaceDetail('hanbat-arboretum');
   */
  function showPlaceDetail(placeId) {
    // The variable stores the detail panel element.
    const detailElement = document.querySelector('[data-map-detail]');
    if (!detailElement) return;

    // The variable stores the selected place or first fallback place.
    const place = data.questPlaces.find((item) => item.id === placeId) || data.questPlaces[0];
    // The variable stores the selected place badge.
    const badge = resolveBadge(place.badgeId);
    // The variable stores the selected place quest.
    const quest = findQuestByPlaceId(place.id);
    // The variable stores the selected quest title.
    const questTitle = quest ? quest.title : '연결된 퀘스트 준비 중';
    // The variable stores the selected quest reward text.
    const rewardText = quest ? `+${quest.xp} XP · ${quest.verification}` : '추천 관광지 데이터';
    // The variable stores the selected place coordinates.
    const coordinateText = `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;

    detailElement.innerHTML = `
      <article class="soft-panel map-detail-card">
        <div class="map-detail-head">
          <span class="map-badge" style="color:${ui.escapeHtml(badge.color)}">${ui.escapeHtml(badge.icon)}</span>
          <div class="map-detail-copy">
            <div class="map-detail-title">${ui.escapeHtml(place.name)}</div>
            <div class="map-detail-sub">${ui.escapeHtml(place.category)} · ${place.recommended ? '추천 관광지' : '퀘스트 후보'}</div>
          </div>
        </div>
        <div class="card-title">${ui.escapeHtml(questTitle)}</div>
        <div class="card-sub">${ui.escapeHtml(place.summary)}</div>
        <div class="map-detail-meta">
          <span class="type-chip">${ui.escapeHtml(rewardText)}</span>
          <span class="state-chip">${ui.escapeHtml(coordinateText)}</span>
        </div>
      </article>
    `;
  }

  /**
   * Input: A selected place id string.
   * Output: Nothing.
   * Role: Renders the map place list used to select markers without the map.
   * Example: renderPlaceList('science-museum');
   */
  function renderPlaceList(selectedPlaceId) {
    // The variable stores the list container element.
    const listElement = document.querySelector('[data-map-place-list]');
    if (!listElement) return;

    listElement.innerHTML = data.questPlaces.map((place) => {
      // The variable stores the badge linked to the place.
      const badge = resolveBadge(place.badgeId);
      // The variable stores whether the list item is selected.
      const isSelected = place.id === selectedPlaceId;
      return `
        <button class="map-place-button${isSelected ? ' is-selected' : ''}" type="button" data-map-place-id="${ui.escapeHtml(place.id)}">
          <span class="map-badge" style="color:${ui.escapeHtml(badge.color)}">${ui.escapeHtml(badge.icon)}</span>
          <span class="card-copy">
            <span class="card-title">${ui.escapeHtml(place.name)}</span>
            <span class="card-sub">${ui.escapeHtml(place.category)} · ${place.recommended ? '추천' : '일반'}</span>
          </span>
        </button>
      `;
    }).join('');
  }

  /**
   * Input: A selected place id string.
   * Output: Nothing.
   * Role: Selects a map place across the map, detail panel, list, and Dynamic Map center.
   * Example: selectPlace('sungsimdang');
   */
  function selectPlace(placeId) {
    // The variable stores the selected quest place.
    const place = data.questPlaces.find((item) => item.id === placeId) || data.questPlaces[0];
    // The variable stores the selected place location.
    const location = normalizeLocation(place.latitude, place.longitude, place.name, 'place');
    // The variable stores the static map canvas.
    const mapCanvas = document.querySelector('[data-quest-map]');

    state.selectedPlaceId = place.id;
    showPlaceDetail(place.id);
    renderPlaceList(place.id);

    if (state.isDynamicMapActive && state.map) {
      updateNaverMarkerSelection();
      moveToLocation(location, FOCUSED_ZOOM, false);
      return;
    }

    if (mapCanvas) renderMockQuestMap(mapCanvas, place.id);
    setCoordinateInputs(location);
    updatePositionStatus(`${location.name} · ${formatCoordinate(location)}`);
  }

  /**
   * Input: A click event object.
   * Output: Nothing.
   * Role: Handles marker and place list clicks.
   * Example: document.addEventListener('click', handleMapClick);
   */
  function handleMapClick(event) {
    if (!(event.target instanceof Element)) return;

    // The variable stores the nearest place selection trigger.
    const trigger = event.target.closest('[data-map-place-id]');
    if (!trigger) return;
    selectPlace(trigger.dataset.mapPlaceId);
  }

  /**
   * Input: A submit event object.
   * Output: A promise that resolves after address search.
   * Role: Converts an address into coordinates and moves the map.
   * Example: form.addEventListener('submit', handleAddressSubmit);
   */
  async function handleAddressSubmit(event) {
    event.preventDefault();

    // The variable stores map page elements.
    const elements = getElements();
    // The variable stores the address search query.
    const query = elements.addressInput ? elements.addressInput.value.trim() : '';
    if (!query) {
      updatePositionStatus('검색할 주소를 입력하세요.');
      return;
    }
    if (!hasRestProxy()) {
      updatePositionStatus('주소 검색에는 NAVER_MAPS_API_KEY 설정이 필요합니다.');
      return;
    }

    // The variable stores Geocoding query parameters.
    const params = new URLSearchParams({ query, count: '5', language: 'kor' });
    if (state.activeLocation) {
      params.set('coordinate', `${state.activeLocation.longitude},${state.activeLocation.latitude}`);
    }

    updatePositionStatus('주소를 검색하고 있습니다.');
    try {
      // The variable stores the NAVER Geocoding payload.
      const payload = await requestJson(GEOCODE_ENDPOINT, params);
      // The variable stores geocoding address candidates.
      const addresses = Array.isArray(payload.addresses) ? payload.addresses : [];
      if (!addresses.length) {
        updatePositionStatus('검색 결과가 없습니다.');
        return;
      }

      // The variable stores the first geocoding candidate.
      const candidate = addresses[0];
      // The variable stores the candidate latitude.
      const latitude = Number(candidate.y);
      // The variable stores the candidate longitude.
      const longitude = Number(candidate.x);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error('Geocoding result has invalid coordinates.');
      }

      // The variable stores the best display address from NAVER Geocoding.
      const displayName = candidate.roadAddress || candidate.jibunAddress || candidate.englishAddress || query;
      // The variable stores the normalized searched location.
      const location = normalizeLocation(latitude, longitude, displayName, 'geocode');
      await moveToLocation(location, FOCUSED_ZOOM, false);
    } catch (error) {
      updatePositionStatus('주소 검색에 실패했습니다.');
    }
  }

  /**
   * Input: None.
   * Output: A promise that resolves after coordinate movement.
   * Role: Moves the map to user-entered coordinates and optionally reverse geocodes them.
   * Example: await handleCoordinateMove();
   */
  async function handleCoordinateMove() {
    try {
      // The variable stores the manually entered coordinate location.
      const location = readCoordinateInputs();
      await moveToLocation(location, FOCUSED_ZOOM, hasRestProxy());
    } catch (error) {
      updatePositionStatus(error.message || '좌표 값을 확인하세요.');
    }
  }

  /**
   * Input: None.
   * Output: A promise that resolves after browser location movement.
   * Role: Moves the map to the browser location or the Daejeon fallback.
   * Example: await handleCurrentLocationRequest();
   */
  async function handleCurrentLocationRequest() {
    updatePositionStatus('현재 위치를 확인하고 있습니다.');
    try {
      // The variable stores the browser-provided location.
      const location = await getBrowserLocation();
      await moveToLocation(location, DEFAULT_ZOOM, hasRestProxy());
    } catch (error) {
      // The variable stores the fallback Daejeon location.
      const fallbackLocation = getFallbackLocation();
      await moveToLocation(fallbackLocation, DEFAULT_ZOOM, false);
      updatePositionStatus(`현재 위치 권한 없음 · ${fallbackLocation.name} · ${formatCoordinate(fallbackLocation)}`);
    }
  }

  /**
   * Input: Map page element references.
   * Output: Nothing.
   * Role: Registers form, coordinate, current location, and marker click handlers.
   * Example: bindMapControls(getElements());
   */
  function bindMapControls(elements) {
    if (elements.addressForm) elements.addressForm.addEventListener('submit', handleAddressSubmit);
    if (elements.coordinateButton) elements.coordinateButton.addEventListener('click', handleCoordinateMove);
    if (elements.currentLocationButton) elements.currentLocationButton.addEventListener('click', handleCurrentLocationRequest);
    document.addEventListener('click', handleMapClick);
  }

  /**
   * Input: A map container element and an optional initial place id.
   * Output: A promise that resolves after the map is rendered.
   * Role: Renders Dynamic Map when configured and falls back to the mock map otherwise.
   * Example: await renderQuestMap(document.querySelector('[data-quest-map]'));
   */
  async function renderQuestMap(container, initialPlaceId) {
    if (!container) return;

    // The variable stores the first selected place id.
    const selectedPlaceId = initialPlaceId || data.questPlaces[0].id;
    // The variable stores the fallback Daejeon location.
    const fallbackLocation = getFallbackLocation();
    setCoordinateInputs(fallbackLocation);
    showPlaceDetail(selectedPlaceId);
    renderPlaceList(selectedPlaceId);

    try {
      updateProviderStatus('연결 확인 중', 'warning');
      // The variable stores public Dynamic Map configuration.
      const config = await loadNaverConfig();
      if (!config.dynamicMapConfigured || !config.keyId) {
        throw new Error('NAVER Dynamic Map Key ID is missing.');
      }

      await loadNaverMapsSdk(config.keyId);
      // The variable stores the initial map location.
      const initialLocation = await resolveInitialLocation();
      renderNaverQuestMap(container, selectedPlaceId, initialLocation);
      await moveToLocation(initialLocation, DEFAULT_ZOOM, hasRestProxy());
      updateProviderStatus(config.restApiConfigured ? 'Naver Dynamic Map' : '지도만 연결', config.restApiConfigured ? 'ready' : 'warning');
    } catch (error) {
      renderMockQuestMap(container, selectedPlaceId);
      updateProviderStatus('Mock 지도', 'error');
      updatePositionStatus('네이버 지도 키 또는 Web 서비스 URL 설정을 확인하세요.');
    }
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Initializes the map page.
   * Example: initMapPage();
   */
  function initMapPage() {
    // The variable stores map page elements.
    const elements = getElements();
    bindMapControls(elements);
    renderQuestMap(elements.mapCanvas);
  }

  // The variable exposes map helpers to the main page initializer.
  window.QuestbookMap = {
    renderQuestMap,
    initMapPage,
  };
}(window, document));
