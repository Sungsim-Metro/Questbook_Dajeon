/* Page initializers for the Questbook Daejeon static app. */
(function attachQuestbookMain(window, document) {
  'use strict';

  // The variable stores the shared mock data namespace.
  const data = window.QuestbookMockData;
  // The variable stores shared UI helpers.
  const ui = window.QuestbookUi;

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Renders the home screen from shared mock data.
   * Example: initHomePage();
   */
  function initHomePage() {
    // The variable stores earned badges for home metrics.
    const earnedBadges = data.badges.filter((badge) => badge.earned);
    // The variable stores the main recommended quest.
    const recommendedQuest = data.quests[0];
    // The variable stores the recommended quest place.
    const recommendedPlace = ui.findPlaceById(recommendedQuest.placeId);
    // The variable stores the recommended quest badge.
    const recommendedBadge = ui.findBadgeById(recommendedQuest.badgeId);

    ui.setText(document, '[data-location-name]', data.currentLocation.name);
    ui.setText(document, '[data-earned-badge-count]', `${earnedBadges.length}개`);
    ui.setText(document, '[data-nearby-quest-count]', `${data.quests.length}개`);
    ui.setText(document, '[data-reward-count]', `${data.currentUser.rewardCount}개`);

    // The variable stores the recommendation card element.
    const recommendElement = document.querySelector('[data-home-recommend]');
    if (recommendElement) {
      recommendElement.innerHTML = `
        <span class="card-icon" style="color:${ui.escapeHtml(recommendedBadge.color)}">${ui.escapeHtml(recommendedBadge.icon)}</span>
        <div class="card-copy">
          <div class="card-title">${ui.escapeHtml(recommendedQuest.title)}</div>
          <div class="card-sub">${ui.escapeHtml(recommendedPlace.name)} · ${ui.escapeHtml(recommendedQuest.type)} · +${recommendedQuest.xp} XP</div>
        </div>
        <a class="text-button" href="map.html">보기</a>
      `;
    }
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Renders quest filters and the current quest list.
   * Example: initQuestsPage();
   */
  function initQuestsPage() {
    // The variable stores the quest filter container.
    const filterElement = document.querySelector('[data-quest-filters]');
    // The variable stores the quest list container.
    const listElement = document.querySelector('[data-quest-list]');
    if (!filterElement || !listElement) return;

    /**
     * Input: A quest type filter string.
     * Output: Nothing.
     * Role: Renders the quest list for the selected filter.
     * Example: renderFilteredQuests('방문형');
     */
    function renderFilteredQuests(filterValue) {
      // The variable stores quests matching the selected filter.
      const filteredQuests = filterValue === '추천'
        ? data.quests
        : data.quests.filter((quest) => quest.type === filterValue);
      listElement.innerHTML = filteredQuests.length
        ? filteredQuests.map(ui.renderQuestCard).join('')
        : '<div class="empty-note">해당 유형의 더미 퀘스트가 아직 없습니다.</div>';
    }

    /**
     * Input: A click event object.
     * Output: Nothing.
     * Role: Updates active filter state and rerenders the quest list.
     * Example: filterElement.addEventListener('click', handleFilterClick);
     */
    function handleFilterClick(event) {
      // The variable stores the clicked filter button.
      const filterButton = event.target.closest('[data-filter-value]');
      if (!filterButton) return;
      filterElement.querySelectorAll('[data-filter-value]').forEach((button) => {
        button.classList.toggle('is-active', button === filterButton);
      });
      renderFilteredQuests(filterButton.dataset.filterValue);
    }

    filterElement.addEventListener('click', handleFilterClick);
    renderFilteredQuests('추천');
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Renders the adventure notebook screen.
   * Example: initNotesPage();
   */
  function initNotesPage() {
    // The variable stores the note list container.
    const noteListElement = document.querySelector('[data-note-list]');
    if (!noteListElement) return;

    noteListElement.innerHTML = data.adventureNotes.map((note) => `
      <article class="note-card">
        <span class="note-icon">${ui.escapeHtml(note.icon)}</span>
        <div class="note-copy">
          <div class="note-title">${ui.escapeHtml(note.title)}</div>
          <div class="note-sub">${ui.escapeHtml(note.time)} · ${ui.escapeHtml(note.summary)}</div>
        </div>
        <span class="state-chip">${ui.escapeHtml(note.badge)}</span>
      </article>
    `).join('');
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Renders the badge notebook screen.
   * Example: initBadgesPage();
   */
  function initBadgesPage() {
    // The variable stores the earned badges.
    const earnedBadges = data.badges.filter((badge) => badge.earned);
    // The variable stores the featured badge.
    const featuredBadge = earnedBadges[0] || data.badges[0];
    // The variable stores the badge grid container.
    const badgeGridElement = document.querySelector('[data-badge-grid]');
    // The variable stores the stamp row container.
    const stampRowElement = document.querySelector('[data-stamp-row]');

    ui.setText(document, '[data-featured-badge-icon]', featuredBadge.icon);
    ui.setText(document, '[data-featured-badge-name]', featuredBadge.name);
    ui.setText(document, '[data-featured-badge-type]', featuredBadge.type);
    ui.setText(document, '[data-featured-badge-xp]', `+${featuredBadge.xp} XP 적립`);

    if (badgeGridElement) {
      badgeGridElement.innerHTML = data.badges.map(ui.renderBadgeCard).join('');
    }

    if (stampRowElement) {
      stampRowElement.innerHTML = data.badges.map((badge) => {
        // The variable stores the stamp state class.
        const stampClass = badge.earned ? 'is-done' : 'is-empty';
        // The variable stores the stamp display label.
        const stampLabel = badge.earned ? badge.icon : '';
        return `<div class="stamp ${stampClass}">${ui.escapeHtml(stampLabel)}</div>`;
      }).join('');
    }
  }

  /**
   * Input: None.
   * Output: Nothing.
   * Role: Dispatches page-specific rendering after common setup.
   * Example: initPage();
   */
  function initPage() {
    // The variable stores the current page id from the body dataset.
    const pageId = document.body.dataset.page || 'home';
    ui.initCommonPage(pageId);

    if (pageId === 'home') initHomePage();
    if (pageId === 'map' && window.QuestbookMap) window.QuestbookMap.initMapPage();
    if (pageId === 'quests') initQuestsPage();
    if (pageId === 'notes') initNotesPage();
    if (pageId === 'badges') initBadgesPage();
  }

  document.addEventListener('DOMContentLoaded', initPage);
}(window, document));
