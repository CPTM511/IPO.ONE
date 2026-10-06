// Browser-rendered text contrast; alpha colors are composited onto ancestor surfaces.
// Image/gradient-backed text is reported separately for visual review.
export async function renderedContrast(page, scope = '.app-shell') {
  return page.locator(scope).evaluate(root => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const colors = new Map();
    function rgba(value) {
      if (!colors.has(value)) {ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data];c[3]/=255;colors.set(value,c);}
      return colors.get(value);
    }
    const over = (fg,bg) => fg.slice(0,3).map((c,i)=>c*fg[3]+bg[i]*(1-fg[3]));
    const luminance = rgb => rgb.slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
    const failures=[],manual=[],checked=[];
    const path = n => n.id ? '#'+n.id : n.classList.length ? n.tagName.toLowerCase()+'.'+[...n.classList].join('.') : (n.parentElement ? path(n.parentElement)+' > ' : '')+n.tagName.toLowerCase();
    const elements = new Set();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      if(walker.currentNode.textContent.trim()) elements.add(walker.currentNode.parentElement);
    }
    for(const el of elements) {
      const s=getComputedStyle(el),box=el.getBoundingClientRect();
      if(!el.getClientRects().length||box.width<2||box.height<2||s.visibility!=='visible'||+s.opacity===0||parseFloat(s.fontSize)<1||el.closest('.sr-only,[aria-hidden="true"],:disabled,[aria-disabled="true"]'))continue;
      const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
      let background=[255,255,255],unknown=false,surface='',decoration='';
      for(const p of chain) {
        const ps=getComputedStyle(p),color=rgba(ps.backgroundColor);
        if(color[3]===1)unknown=false;
        background=over(color,background);
        if(color[3]>0)surface=path(p);
        if(ps.backgroundImage!=='none'){unknown=true;decoration=path(p);}
        if(+ps.opacity!==1)unknown=true;
      }
      const foreground=over(rgba(s.color),background),a=luminance(foreground),b=luminance(background);
      const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const required=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&+s.fontWeight>=700)?3:4.5;
      const text=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).filter(Boolean).join(' ').slice(0,110);
      const record={surface,decoration,text,selector:el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.'),parent:el.parentElement?.className,ratio:+ratio.toFixed(2),required,color:s.color,background:background.map(Math.round)};
      if(unknown)manual.push(record);else {checked.push(record);if(ratio+.005<required)failures.push(record);}
    }
    return {checked:checked.length,failures,manual};
  });
}
