const PORTS = new Set([8939,8940,8941,8942]);
const NAMES = new Set(["__Host-ipo_one_session","__Host-ipo_one_csrf_bootstrap"]);
export function localReviewCookieName(name, port) {
  return PORTS.has(port) && NAMES.has(name) ? `${name}_web027m_${port}` : name;
}
export function localReviewRequestCookies(value, port) {
  if (!PORTS.has(port) || typeof value !== "string") return value;
  return value.split(";").map(part=>part.trim()).flatMap(part=>{
    const split=part.indexOf("="); if(split<0)return [part];
    const name=part.slice(0,split), tail=part.slice(split);
    for(const canonical of NAMES) if(name===localReviewCookieName(canonical,port))return [canonical+tail];
    if(NAMES.has(name) || /^__Host-ipo_one_(session|csrf_bootstrap)_web027m_/.test(name))return [];
    return [part];
  }).join("; ");
}
export function localReviewResponseCookies(value, port) {
  if (!PORTS.has(port)) return value;
  const rename=cookie=>typeof cookie === "string" ? cookie.replace(/^([^=]+)=/,(_,name)=>localReviewCookieName(name,port)+"=") : cookie;
  return Array.isArray(value) ? value.map(rename) : rename(value);
}
export function isolateLocalReviewCookies(request,response,port) {
  if(!PORTS.has(port))return;
  request.headers.cookie=localReviewRequestCookies(request.headers.cookie,port);
  const setHeader=response.setHeader.bind(response), writeHead=response.writeHead.bind(response);
  response.setHeader=(name,value)=>setHeader(name,name.toLowerCase()==="set-cookie" ? localReviewResponseCookies(value,port) : value);
  response.writeHead=(status,message,headers)=>{
    const rewrite=values=>{
      if(!values || Array.isArray(values))return values;
      return Object.fromEntries(Object.entries(values).map(([name,value])=>[name,name.toLowerCase()==="set-cookie" ? localReviewResponseCookies(value,port) : value]));
    };
    return typeof message === "string" ? writeHead(status,message,rewrite(headers)) : writeHead(status,rewrite(message));
  };
}
