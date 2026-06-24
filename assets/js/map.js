/* Map rendering boundary for Questbook Daejeon mock and future Naver Maps integration. */
(function attachQuestbookMap(window, document) {
  'use strict';

  // The variable stores the shared mock data namespace.
  const data = window.QuestbookMockData;
  // The variable stores shared UI helpers.
  const ui = window.QuestbookUi;

  /**
   * Input: None.
   * Output: A boolean.
   * Role: Detects whether the Naver Maps SDK is available on the page.
   * Example: if (hasNaverMaps()) renderNaverQuestMap(container, dataset);
   */
  function hasNaverMaps() {
    return Boolean(window.naver && window.naver.maps);
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
   * Input: A container element.
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
    container.classList.remove('is-naver');
    container.innerHTML = '';
    renderMockMapBase(container);
    container.insertAdjacentHTML('beforeend', data.questPlaces.map((place) => renderMockMarker(place, selectedPlaceId)).join(''));
  }

  /**
   * Input: A map container element and a selected place id.
   * Output: Nothing.
   * Role: Renders Naver Maps markers when the SDK is later added to the page.
   * Example: renderNaverQuestMap(container, 'hanbat-arboretum');
   */
  function renderNaverQuestMap(container, selectedPlaceId) {
    // The variable stores the Naver coordinate for the mock current location.
    const center = new window.naver.maps.LatLng(data.currentLocation.latitude, data.currentLocation.longitude);
    // The variable stores the Naver map instance.
    const map = new window.naver.maps.Map(container, {
      center,
      zoom: 13,
    });

    container.classList.add('is-naver');
    data.questPlaces.forEach((place) => {
      // The variable stores the badge linked to the place.
      const badge = resolveBadge(place.badgeId);
      // The variable stores HTML used as the marker icon.
      const markerContent = `<button class="map-badge" style="color:${ui.escapeHtml(badge.color)}" type="button">${ui.escapeHtml(badge.icon)}</button>`;
      // The variable stores the Naver marker for the current place.
      const marker = new window.naver.maps.Marker({
        map,
        position: new window.naver.maps.LatLng(place.latitude, place.longitude),
        icon: {
          content: markerContent,
          anchor: new window.naver.maps.Point(23, 23),
        },
      });
      window.naver.maps.Event.addListener(marker, 'click', () => {
        showPlaceDetail(place.id);
        renderPlaceList(place.id);
      });
    });

    showPlaceDetail(selectedPlaceId);
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
        <span class="type-chip">${ui.escapeHtml(rewardText)}</span>
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
   * Role: Selects a map place across the map, detail panel, and list.
   * Example: selectPlace('sungsimdang');
   */
  function selectPlace(placeId) {
    // The variable stores the static map canvas.
    const mapCanvas = document.querySelector('[data-quest-map]');
    // The variable stores the map provider requested by the page.
    const provider = mapCanvas ? mapCanvas.dataset.mapProvider : 'mock';
    if (mapCanvas && (provider !== 'naver' || !hasNaverMaps())) {
      renderMockQuestMap(mapCanvas, placeId);
    }
    showPlaceDetail(placeId);
    renderPlaceList(placeId);
  }

  /**
   * Input: A click event object.
   * Output: Nothing.
   * Role: Handles marker and place list clicks.
   * Example: document.addEventListener('click', handleMapClick);
   */
  function handleMapClick(event) {
    // The variable stores the nearest place selection trigger.
    const trigger = event.target.closest('[data-map-place-id]');
    if (!trigger) return;
    selectPlace(trigger.dataset.mapPlaceId);
  }

  /**
   * Input: A map container element and an optional initial place id.
   * Output: Nothing.
   * Role: Renders either the mock map or Naver Maps-backed map with shared data.
   * Example: renderQuestMap(document.querySelector('[data-quest-map]'));
   */
  function renderQuestMap(container, initialPlaceId) {
    if (!container) return;

    // The variable stores the first selected place id.
    const selectedPlaceId = initialPlaceId || data.questPlaces[0].id;
    // The variable stores the desired map provider.
    const provider = container.dataset.mapProvider || 'mock';

    if (provider === 'naver' && hasNaverMaps()) {
      renderNaverQuestMap(container, selectedPlaceId);
    } else {
      renderMockQuestMap(container, selectedPlaceId);
    }

    showPlaceDetail(selectedPlaceId);
    renderPlaceList(selectedPlaceId);
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Initializes the map page.
   * Example: initMapPage();
   */
  function initMapPage() {
    // The variable stores the map canvas element.
    const mapCanvas = document.querySelector('[data-quest-map]');
    renderQuestMap(mapCanvas);
    document.addEventListener('click', handleMapClick);
  }

  // The variable exposes map helpers to the main page initializer.
  window.QuestbookMap = {
    renderQuestMap,
    initMapPage,
  };
}(window, document));
