export type Locale = 'en' | 'fr';

export type TranslationDict = {
  common: {
    cancel: string;
    save: string;
    loading: string;
    search: string;
    remove: string;
    preview: string;
    none: string;
    start: string;
    end: string;
    disabled: string;
    active: string;
    language: string;
    languageHint: string;
  };
  auth: {
    usernamePasswordRequired: string;
    completeCaptcha: string;
    unexpectedServerResponse: string;
    invalidCredentials: string;
    rateLimited: string;
    accountDisabled: string;
    usernameTaken: string;
    invalidData: string;
    cannotReachServer: string;
    twoFaRequired: string;
    twoFaCode: string;
    passwordHint: string;
  };
  settings: {
    title: string;
    subtitleDesktop: string;
    subtitleWeb: string;
    signedInAs: string;
    displayNameShown: string;
    signOutAllDevices: string;
    profileTitle: string;
    profileHint: string;
    displayName: string;
    username: string;
    currentPassword: string;
    saveProfile: string;
    saving: string;
    passwordTitle: string;
    passwordHint: string;
    newPassword: string;
    confirmNewPassword: string;
    passwordPlaceholder: string;
    changePassword: string;
    updating: string;
    enterPasswordToConfirm: string;
    profileUpdated: string;
    passwordsMismatch: string;
    passwordChanged: string;
    overlaysDeviceHint: string;
    desktopAppHint: string;
  };
  security: {
    title: string;
    turnstileHint: string;
    cloudflareCaptcha: string;
    devicesTitle: string;
    raidsReceivedTitle: string;
    raidsReceivedHint: string;
    recentActivity: string;
    presetFriendsApplied: string;
    presetStrictApplied: string;
    prefsSaved: string;
    turnstileOn: string;
    turnstileOff: string;
  };
  gif: {
    title: string;
    favorites: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchBtn: string;
    trending: string;
    selection: string;
    clearAll: string;
    remove: string;
    loading: string;
    noFavorites: string;
    noResults: string;
    loadMore: string;
    preview: string;
    clickToggleSelect: string;
    clickImport: string;
    hoverHint: string;
    hoverHintMulti: string;
    cancel: string;
    useThisGif: string;
    useNGifs: string;
    klipyNotConfigured: string;
    searchFailed: string;
    importFailed: string;
    maxGifs: string;
  };
  rooms: {
    subtitle: string;
    empty: string;
  };
  room: {
    writeText: string;
    preview: string;
    emptyLibrary: string;
    selected: string;
    caption: string;
    captionPlaceholder: string;
    none: string;
    system: string;
    white: string;
    pureWhite: string;
    green: string;
    red: string;
    blue: string;
    amber: string;
    black: string;
  };
  motion: {
    exact: string;
    exactHint: string;
    followMouse: string;
    followMouseHint: string;
    orbit: string;
    orbitHint: string;
    trail: string;
    trailHint: string;
    dodge: string;
    dodgeHint: string;
    clickbait: string;
    clickbaitHint: string;
    takeover: string;
    takeoverHint: string;
  };
  packs: {
    helloDesc: string;
    shakeDesc: string;
    gifBounceDesc: string;
    gifBombDesc: string;
    slideMemeDesc: string;
  };
  receiver: {
    softMode: string;
    softModeDesc: string;
    maxOpacity: string;
    preferredScreen: string;
    primaryScreen: string;
    screenN: string;
    primary: string;
    alwaysReceiveOnScreen: string;
    alwaysReceiveDesc: string;
    quietHoursDesc: string;
    start: string;
    end: string;
    activeOverlays: string;
    maxStacked: string;
  };
  media: {
    emptyLibrary: string;
  };
  animation: {
    preview: string;
  };
  titleBar: {
    minimizeToTray: string;
    minimizeToTrayTitle: string;
  };
  overlay: {
    close: string;
  };
  admin: {
    newPasswordPrompt: string;
  };
  login: {
    // kept for future expansion
  };
};
