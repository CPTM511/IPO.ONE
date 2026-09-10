// A real, deliberately missing, same-origin optional resource. No API or asset
// responses are mocked. Install before navigation to exercise the error race.
export function installOptionalScriptFailureProbe() {
  window.__ipoOptionalScriptFailures=[];
  const inject=()=>{
    if(!document.documentElement?.dataset.ipoTheme||!document.head)return;
    observer.disconnect();
    const script=document.createElement('script');
    script.src='/__startup_optional_script_probe__.js';
    script.onerror=()=>window.__ipoOptionalScriptFailures.push({
      at:performance.now(),stage:document.documentElement.dataset.ipoStartup,
      resource:'deliberately unavailable optional script'
    });
    document.head.append(script);
  };
  const observer=new MutationObserver(inject);
  observer.observe(document,{subtree:true,attributes:true,attributeFilter:['data-ipo-theme']});
  inject();
}
