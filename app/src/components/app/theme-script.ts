export const THEME_STORAGE_KEY = "nexo-theme";

// Roda antes da hidratacao (layout raiz) para evitar o flash de tema errado. A preferencia gravada na
// conta (banco) vence quando a pessoa esta logada: ThemeSync a aplica assim que o shell monta.
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="DARK"||((!t||t==="SYSTEM")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
