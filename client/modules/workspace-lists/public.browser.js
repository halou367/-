(function (root) {
  'use strict';
  const registry = root.BranaV1Modules || (root.BranaV1Modules = Object.create(null));
  const prev = registry['workspace-lists'] || Object.create(null);
  const pick = (fn, key, globalKey) => { let val; try { val = typeof fn === 'function' ? fn() : fn; } catch { val = undefined; } return typeof val !== 'undefined' ? val : (root[globalKey || key] || prev[key] || null); };
  registry['workspace-lists'] = Object.freeze({
    workspacePath: pick(() => (typeof WorkspacePath !== 'undefined' ? WorkspacePath : undefined), 'workspacePath', 'WorkspacePath'),
    titleFlex: pick(() => (typeof TitleFlex !== 'undefined' ? TitleFlex : undefined), 'titleFlex', 'TitleFlex'),
    titleCompact: pick(() => (typeof TitleCompact !== 'undefined' ? TitleCompact : undefined), 'titleCompact', 'TitleCompact'),
    conversationLabels: pick(() => (typeof ConversationLabels !== 'undefined' ? ConversationLabels : undefined), 'conversationLabels', 'ConversationLabels'),
    workspacePreview: pick(() => (typeof WorkspacePreview !== 'undefined' ? WorkspacePreview : undefined), 'workspacePreview', 'WorkspacePreview'),
    titleCipher: pick(() => (typeof TitleCipher !== 'undefined' ? TitleCipher : undefined), 'titleCipher', 'TitleCipher'),
    titleSync: pick(() => (typeof TitleSync !== 'undefined' ? TitleSync : undefined), 'titleSync', 'TitleSync'),
    accountVendorFold: pick(() => (typeof AccountVendorFold !== 'undefined' ? AccountVendorFold : undefined), 'accountVendorFold', 'AccountVendorFold'),
    accountPanelSize: pick(() => (typeof AccountPanelSize !== 'undefined' ? AccountPanelSize : undefined), 'accountPanelSize', 'AccountPanelSize'),
    panelWork: pick(() => (typeof PanelWork !== 'undefined' ? PanelWork : undefined), 'panelWork', 'PanelWork'),
    renderWork: pick(() => (typeof RenderWork !== 'undefined' ? RenderWork : undefined), 'renderWork', 'RenderWork'),
    sidebarTools: pick(() => (typeof SideTools !== 'undefined' ? SideTools : undefined), 'sidebarTools', 'SideTools'),
    dock: pick(() => (typeof Dock !== 'undefined' ? Dock : undefined), 'dock', 'Dock'),
    titles: pick(() => (typeof Titles !== 'undefined' ? Titles : undefined), 'titles', 'Titles'),
    plus: pick(() => (typeof Tip !== 'undefined' ? Tip : undefined), 'plus', 'Tip'),
    palette: pick(() => (typeof Palette !== 'undefined' ? Palette : undefined), 'palette', 'Palette'),
    mobile: pick(() => (typeof Mob !== 'undefined' ? Mob : undefined), 'mobile', 'Mob'),
    bulk: pick(() => (typeof Bulk !== 'undefined' ? Bulk : undefined), 'bulk', 'Bulk'),
  });
})(typeof self !== 'undefined' ? self : globalThis);
