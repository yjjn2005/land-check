// land-check-api — 토지·건축 조회 앱용 프록시 Worker
// /molit/search-act?landUseNm=   국토부 토지이용행위 코드 검색
// /molit/restriction?areaCd=&ucodeList=&landUseNm=   국토부 행위제한 조회
// /vworld/ned/{op}?pnu=&stdrYear=   브이월드 국가중점 API 프록시 (getLandUseAttr, getIndvdLandPriceAttr, ladfrlList, getLandCharacteristics)
// /vworld/search?query=   브이월드 주소 검색 프록시

const MOLIT_KEY = "2b71f243d1071c478f4d8d0ebcd6c0f494195d0eb2063b24b154238c5b398e3b";
const MOLIT_BASE = "https://apis.data.go.kr/1613000/arLandUseInfoService";
const VWORLD_KEY = "F6799A65-7960-4D2E-AA41-1BACB4EAEB1D";
const VWORLD_DOMAIN = "https://yjjn2005.github.io";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function xmlToJson(t){
  const items=[]; for(const b of (t.match(/<item>[\s\S]*?<\/item>/g)||[])){ const o={}; for(const m of b.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) o[m[1]]=m[2]; items.push(o); }
  const g=r=>(t.match(r)||[])[1];
  return { resultCode:g(/<resultCode>([^<]*)</), resultMsg:g(/<resultMsg>([^<]*)</), totalCount:g(/<totalCount>([^<]*)</), items };
}
async function molit(op, params){
  const u=new URL(`${MOLIT_BASE}/${op}`); u.searchParams.set("serviceKey",MOLIT_KEY);
  for(const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
  const r=await fetch(u.toString(),{headers:{"User-Agent":UA,"Accept":"application/xml"}});
  return xmlToJson(new TextDecoder("euc-kr").decode(await r.arrayBuffer()));
}
const ALLOWED_NED = new Set(["getLandUseAttr","getIndvdLandPriceAttr","ladfrlList","getLandCharacteristics","getPossessionAttr","ladfrlList"]);

export default {
  async fetch(req){
    const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
    if(req.method==="OPTIONS") return new Response(null,{headers:cors});
    const url=new URL(req.url); const p=url.pathname; const q=url.searchParams;
    const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
    try{
      if(p==="/molit/search-act") return json(await molit("DTsearchLunCd",{landUseNm:q.get("landUseNm")||"",pageNum:q.get("pageNum")||"1",numOfRows:q.get("numOfRows")||"30"}));
      if(p==="/molit/restriction") return json(await molit("DTarLandUseInfo",{areaCd:q.get("areaCd")||"",ucodeList:q.get("ucodeList")||"",landUseNm:q.get("landUseNm")||""}));
      const ned=p.match(/^\/vworld\/ned\/([A-Za-z]+)$/);
      if(ned){
        const op=ned[1]; if(!ALLOWED_NED.has(op)) return json({error:"op not allowed"},400);
        const u=new URL(`https://api.vworld.kr/ned/data/${op}`);
        u.searchParams.set("key",VWORLD_KEY); u.searchParams.set("domain",VWORLD_DOMAIN); u.searchParams.set("format","json");
        for(const k of ["pnu","stdrYear","numOfRows","pageNo"]) if(q.get(k)) u.searchParams.set(k,q.get(k));
        const r=await fetch(u.toString(),{headers:{"User-Agent":UA,"Accept":"application/json"}});
        const txt=await r.text();
        return new Response(txt,{status:r.status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
      }
      if(p==="/vworld/search"){
        const u=new URL("https://api.vworld.kr/req/search");
        Object.entries({service:"search",request:"search",version:"2.0",crs:"EPSG:4326",query:q.get("query")||"",type:"address",category:q.get("category")||"PARCEL",format:"json",key:VWORLD_KEY}).forEach(([k,v])=>u.searchParams.set(k,v));
        const r=await fetch(u.toString(),{headers:{"User-Agent":UA}});
        return new Response(await r.text(),{status:r.status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
      }
      return json({ok:true,routes:["/molit/search-act","/molit/restriction","/vworld/ned/{op}","/vworld/search"]});
    }catch(e){ return json({error:String(e)},500); }
  }
};
