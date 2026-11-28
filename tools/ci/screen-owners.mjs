// #1611: Explicit ownership of every test referenced by the screen jobs.
// Unknown tests fail open to all. Common tests are consolidated into screen-common-a/b.
export const TEST_OWNERS = {
  "tests/admin-view.test.mjs": [
    "common"
  ],
  "tests/updates-card-611-followup.test.mjs": [
    "explore/settings",
    "book"
  ],
  "tests/updates-screen-611.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-1284-home.test.mjs": [
    "home"
  ],
  "tests/v41-1286-moments.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-1440-cleanup-cards.test.mjs": [
    "board",
    "shell"
  ],
  "tests/v41-932-937-board-legend.test.mjs": [
    "board"
  ],
  "tests/v41-970-cleanup-fab.test.mjs": [
    "shell"
  ],
  "tests/v41-970-shelf-date.test.mjs": [
    "shelf"
  ],
  "tests/v41-a11y-514-remaining.test.mjs": [
    "common"
  ],
  "tests/v41-a11y-shell-names.test.mjs": [
    "common"
  ],
  "tests/v41-a11y-views.test.mjs": [
    "common"
  ],
  "tests/v41-account-settings.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-auth-skin.test.mjs": [
    "shell"
  ],
  "tests/v41-board-card-contrast.test.mjs": [
    "board"
  ],
  "tests/v41-board-cursor-detail.test.mjs": [
    "board",
    "book"
  ],
  "tests/v41-board-date-edit-608.test.mjs": [
    "board"
  ],
  "tests/v41-board-map-tree-title.test.mjs": [
    "board",
    "map"
  ],
  "tests/v41-board-order-619.test.mjs": [
    "board"
  ],
  "tests/v41-board-pinboard-582.test.mjs": [
    "board"
  ],
  "tests/v41-board-pinboard2-601.test.mjs": [
    "board"
  ],
  "tests/v41-board-readonly-520-521.test.mjs": [
    "board"
  ],
  "tests/v41-board-stack-619.test.mjs": [
    "board"
  ],
  "tests/v41-board-theme-flow.test.mjs": [
    "board",
    "map"
  ],
  "tests/v41-board-wide-view-536.test.mjs": [
    "board"
  ],
  "tests/v41-board-yt-overlap-553.test.mjs": [
    "board"
  ],
  "tests/v41-book-closed-focus-519.test.mjs": [
    "book"
  ],
  "tests/v41-book-contrast-515-516.test.mjs": [
    "book"
  ],
  "tests/v41-book-folio-contrast-522.test.mjs": [
    "book"
  ],
  "tests/v41-book-fullscreen-833.test.mjs": [
    "book"
  ],
  "tests/v41-book-long-note.test.mjs": [
    "book"
  ],
  "tests/v41-book-play-584.test.mjs": [
    "book",
    "board",
    "shelf",
    "map"
  ],
  "tests/v41-book-single-537.test.mjs": [
    "book"
  ],
  "tests/v41-book-youtube-lazy-1365.test.mjs": [
    "book"
  ],
  "tests/v41-bookmark-import-screen.test.mjs": [
    "shell",
    "explore/settings"
  ],
  "tests/v41-bottom-links-850.test.mjs": [
    "home"
  ],
  "tests/v41-community-chips-784.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-dialog-unify-1109.test.mjs": [
    "shell",
    "board",
    "book",
    "shelf",
    "map"
  ],
  "tests/v41-empty-tree-463.test.mjs": [
    "shell",
    "book"
  ],
  "tests/v41-explore-moments-1025.test.mjs": [
    "explore/settings",
    "shelf"
  ],
  "tests/v41-explore-sort-search-1363.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-font-floor-548.test.mjs": [
    "common"
  ],
  "tests/v41-frame-blank-996.test.mjs": [
    "common"
  ],
  "tests/v41-graph-842-841.test.mjs": [
    "map"
  ],
  "tests/v41-header-ia.test.mjs": [
    "shell",
    "board"
  ],
  "tests/v41-header-tabs-mobile.test.mjs": [
    "shell"
  ],
  "tests/v41-home-1010.test.mjs": [
    "home",
    "book"
  ],
  "tests/v41-home-add-1349.test.mjs": [
    "home",
    "shell",
    "board",
    "book",
    "map"
  ],
  "tests/v41-home-back-1289.test.mjs": [
    "home"
  ],
  "tests/v41-home-card-1077.test.mjs": [
    "home",
    "shell"
  ],
  "tests/v41-home-discover-history-1289.test.mjs": [
    "home",
    "explore/settings"
  ],
  "tests/v41-home-screen-952.test.mjs": [
    "home",
    "shelf"
  ],
  "tests/v41-inbox-display.test.mjs": [
    "shell",
    "board"
  ],
  "tests/v41-local-date-547.test.mjs": [
    "common"
  ],
  "tests/v41-logo-home.test.mjs": [
    "shell",
    "board",
    "book",
    "shelf",
    "map"
  ],
  "tests/v41-map-contrast.test.mjs": [
    "map"
  ],
  "tests/v41-map-fan-open.test.mjs": [
    "map"
  ],
  "tests/v41-map-open-book-518.test.mjs": [
    "map",
    "book"
  ],
  "tests/v41-map-relations-601.test.mjs": [
    "map"
  ],
  "tests/v41-map-theme-flow.test.mjs": [
    "map"
  ],
  "tests/v41-media-vertical.test.mjs": [
    "home",
    "book",
    "board"
  ],
  "tests/v41-my-news-screen-1098.test.mjs": [
    "explore/settings"
  ],
  "tests/v41-network-toolbar-517.test.mjs": [
    "map"
  ],
  "tests/v41-orbit-535-float-overlap.test.mjs": [
    "home"
  ],
  "tests/v41-quick-add.test.mjs": [
    "home",
    "shell",
    "book"
  ],
  "tests/v41-quick-gap.test.mjs": [
    "shell"
  ],
  "tests/v41-screen-audit.test.mjs": [
    "common"
  ],
  "tests/v41-share-guest-635.test.mjs": [
    "common"
  ],
  "tests/v41-shelf-new-tree.test.mjs": [
    "shelf",
    "shell",
    "board",
    "book"
  ],
  "tests/v41-shell-dialogs.test.mjs": [
    "shell",
    "home"
  ],
  "tests/v41-shell-notice.test.mjs": [
    "shell",
    "book",
    "map"
  ],
  "tests/v41-theme-ab.test.mjs": [
    "common"
  ],
  "tests/v41-token-color-886.test.mjs": [
    "common"
  ],
  "tests/v41-topmenu-885.test.mjs": [
    "shell",
    "board",
    "book",
    "shelf",
    "map"
  ],
  "tests/v41-tree-layout-777.test.mjs": [
    "shell",
    "book"
  ],
  "tests/v41-tree-line-view-row.test.mjs": [
    "book",
    "board",
    "shelf",
    "map",
    "shell"
  ],
  "tests/v41-tree-rename-tips-571.test.mjs": [
    "shell",
    "book"
  ],
  "tests/v41-tree-tag-small-862.test.mjs": [
    "shell"
  ],
  "tests/v41-tree-tips-549.test.mjs": [
    "shell"
  ],
  "tests/v41-view-a11y-panel.test.mjs": [
    "shell"
  ],
  "tests/v41-write-panel-868.test.mjs": [
    "shell"
  ],
  "tests/v41-write-tab-462.test.mjs": [
    "shell",
    "book"
  ]
};

// The ownership table is the only authority for cross-screen test files.
export const COMMON_OWNER_TESTS = Object.freeze(Object.entries(TEST_OWNERS)
  .filter(([, owners]) => owners.includes('common')).map(([file]) => file).sort());
