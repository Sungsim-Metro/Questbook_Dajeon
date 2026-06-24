/* Shared UI helpers for Questbook Daejeon static pages. */
(function attachQuestbookUi(window, document) {
  'use strict';

  // The variable stores the shared mock data namespace.
  const data = window.QuestbookMockData;

  // The variable stores page metadata used by the header and navigation.
  const pageMeta = {
    home: { title: '모험가 홈', eyebrow: 'QUESTBOOK', icon: '✦', href: 'index.html' },
    map: { title: '탐험 지도', eyebrow: 'MAP', icon: '⌖', href: 'map.html' },
    quests: { title: '퀘스트 목록', eyebrow: 'QUEST', icon: '✓', href: 'quests.html' },
    notes: { title: '탐험 노트', eyebrow: 'NOTE', icon: '▤', href: 'notes.html' },
    badges: { title: '뱃지 수첩', eyebrow: 'BADGE', icon: '●', href: 'badges.html' },
  };

  // The variable stores bottom navigation items.
  const navigationItems = [
    { id: 'home', label: '홈', icon: '⌂' },
    { id: 'map', label: '지도', icon: '⌖' },
    { id: 'quests', label: '퀘스트', icon: '✓' },
    { id: 'notes', label: '수첩', icon: '▤' },
    { id: 'badges', label: '뱃지', icon: '●' },
  ];

  /**
   * Input: Any text-like value.
   * Output: A string safe for insertion into HTML templates.
   * Role: Escapes internal mock values before rendering template strings.
   * Example: const safeTitle = escapeHtml(quest.title);
   */
  function escapeHtml(value) {
    // The variable stores the normalized string value.
    const text = String(value ?? '');
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Input: A root element or document, a CSS selector, and a display value.
   * Output: Nothing.
   * Role: Updates text content only when the target element exists.
   * Example: setText(document, '[data-user-name]', user.nickname);
   */
  function setText(root, selector, value) {
    // The variable stores the selected DOM element.
    const element = root.querySelector(selector);
    if (element) element.textContent = value;
  }

  /**
   * Input: A root element or document, a CSS selector, and a display value.
   * Output: Nothing.
   * Role: Updates text content on every matching element.
   * Example: setAllText(document, "[data-user-name]", user.nickname);
   */
  function setAllText(root, selector, value) {
    // The variable stores every selected DOM element.
    const elements = root.querySelectorAll(selector);
    elements.forEach((element) => {
      element.textContent = value;
    });
  }

  /**
   * Input: A user data object.
   * Output: A compact user summary string.
   * Role: Builds repeated status copy for headers and cards.
   * Example: const summary = formatUserSummary(data.currentUser);
   */
  function formatUserSummary(user) {
    return `퀘스트 ${user.completedQuestCount}개 · ${user.totalDistanceKm}km`;
  }

  /**
   * Input: A badge id string.
   * Output: A badge object or undefined.
   * Role: Finds a badge definition by id.
   * Example: const badge = findBadgeById('green');
   */
  function findBadgeById(badgeId) {
    return data.badges.find((badge) => badge.id === badgeId);
  }

  /**
   * Input: A place id string.
   * Output: A place object or undefined.
   * Role: Finds a quest place definition by id.
   * Example: const place = findPlaceById('hanbat-arboretum');
   */
  function findPlaceById(placeId) {
    return data.questPlaces.find((place) => place.id === placeId);
  }

  /**
   * Input: A page id string.
   * Output: Nothing.
   * Role: Renders the active page header from shared metadata.
   * Example: renderHeader('map');
   */
  function renderHeader(pageId) {
    // The variable stores metadata for the requested page.
    const meta = pageMeta[pageId] || pageMeta.home;
    setText(document, '[data-app-icon]', meta.icon);
    setText(document, '[data-app-eyebrow]', meta.eyebrow);
    setText(document, '[data-app-title]', meta.title);
    setText(document, '[data-user-level]', `Lv.${data.currentUser.level}`);
  }

  /**
   * Input: A page id string.
   * Output: Nothing.
   * Role: Renders the shared bottom navigation and active state.
   * Example: renderNavigation('quests');
   */
  function renderNavigation(pageId) {
    // The variable stores the target navigation container.
    const navigation = document.querySelector('[data-bottom-nav]');
    if (!navigation) return;

    navigation.innerHTML = navigationItems.map((item) => {
      // The variable stores metadata for the current navigation item.
      const meta = pageMeta[item.id];
      // The variable stores whether the current item matches the page.
      const isActive = item.id === pageId;
      return `
        <a class="nav-link${isActive ? ' is-active' : ''}" href="${meta.href}" aria-current="${isActive ? 'page' : 'false'}">
          <span>${escapeHtml(item.icon)}</span>
          <span>${escapeHtml(item.label)}</span>
        </a>
      `;
    }).join('');
  }

  /**
   * Input: A root element or document.
   * Output: Nothing.
   * Role: Renders all shared user summary placeholders inside the root.
   * Example: renderUserSummary(document);
   */
  function renderUserSummary(root) {
    // The variable stores the current mock user.
    const user = data.currentUser;
    // The variable stores the formatted quest and distance summary.
    const summary = formatUserSummary(user);
    setAllText(root, "[data-user-avatar]", user.avatar);
    setAllText(root, "[data-user-name]", user.nickname);
    setAllText(root, "[data-user-summary]", summary);
    setAllText(root, "[data-user-xp]", `${user.xp}XP`);
    setAllText(root, "[data-user-progress]", `${user.progressPercent}%`);
    setAllText(root, "[data-next-level]", `Lv.${user.level + 1}까지`);

    // The variable stores every progress fill element in the current root.
    const progressFills = root.querySelectorAll('[data-user-progress-fill]');
    progressFills.forEach((progressFill) => {
      progressFill.style.width = `${user.progressPercent}%`;
    });
  }

  /**
   * Input: A quest object.
   * Output: An HTML string for a quest card.
   * Role: Renders quest data consistently across home and quest list screens.
   * Example: questList.innerHTML = quests.map(renderQuestCard).join('');
   */
  function renderQuestCard(quest) {
    // The variable stores the place linked to the quest.
    const place = findPlaceById(quest.placeId);
    // The variable stores the badge linked to the quest.
    const badge = findBadgeById(quest.badgeId);
    // The variable stores the place name fallback.
    const placeName = place ? place.name : '장소 미정';
    // The variable stores the badge icon fallback.
    const badgeIcon = badge ? badge.icon : '✦';
    return `
      <article class="quest-card" tabindex="0">
        <span class="quest-icon">${escapeHtml(badgeIcon)}</span>
        <div class="quest-copy">
          <div class="quest-title">${escapeHtml(quest.title)}</div>
          <div class="quest-sub">${escapeHtml(placeName)} · ${escapeHtml(quest.distance)} · +${quest.xp} XP</div>
          <div class="quest-meta">
            <span class="type-chip">${escapeHtml(quest.type)}</span>
            <span class="state-chip">${escapeHtml(quest.status)}</span>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Input: A badge object.
   * Output: An HTML string for a badge card.
   * Role: Renders earned and locked badge states consistently.
   * Example: grid.innerHTML = badges.map(renderBadgeCard).join('');
   */
  function renderBadgeCard(badge) {
    // The variable stores the earned state class.
    const stateClass = badge.earned ? '' : ' is-locked';
    // The variable stores the badge state label.
    const stateLabel = badge.earned ? badge.type : '미발견 배지';
    return `
      <article class="badge-card${stateClass}">
        <div class="badge-symbol" style="color:${escapeHtml(badge.color)}">${escapeHtml(badge.icon)}</div>
        <div class="badge-name">${escapeHtml(badge.name)}</div>
        <div class="badge-sub">${escapeHtml(stateLabel)}</div>
      </article>
    `;
  }

  /**
   * Input: A page id string.
   * Output: Nothing.
   * Role: Initializes shared header, navigation, and user placeholders.
   * Example: initCommonPage('home');
   */
  function initCommonPage(pageId) {
    renderHeader(pageId);
    renderNavigation(pageId);
    renderUserSummary(document);
  }

  // The variable exposes shared UI helpers to page scripts.
  window.QuestbookUi = {
    escapeHtml,
    setText,
    setAllText,
    formatUserSummary,
    findBadgeById,
    findPlaceById,
    renderQuestCard,
    renderBadgeCard,
    initCommonPage,
  };
}(window, document));
