/**
 * Runs before hydration to set data-theme from a stored preference, so there
 * is no flash of the wrong theme on load. If nothing is stored yet, it sets
 * nothing at all - the CSS falls back to prefers-color-scheme on its own, so
 * a first-time visitor still gets the right theme without this script having
 * to duplicate that logic in JS.
 */
export const THEME_STORAGE_KEY = "vpms-theme";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
