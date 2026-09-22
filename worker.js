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
  async fetch(req, env){
    const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
    if(req.method==="OPTIONS") return new Response(null,{headers:cors});
    const url=new URL(req.url); const p=url.pathname; const q=url.searchParams;
    const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});

    // ---- PIN 기반 기기 간 동기화 (즐겨찾기·다중 필지 목록) ----
    const syncMatch = p.match(/^\/sync\/([A-Za-z0-9_-]{4,64})$/);
    if(syncMatch){
      const key = "pin:" + syncMatch[1];
      if(req.method === "GET"){
        const v = await env.LAND_CHECK_SYNC.get(key);
        if(!v) return new Response("no data", { status: 404, headers: cors });
        return new Response(v, { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if(req.method === "PUT"){
        const body = await req.text();
        if(body.length > 100_000) return new Response("too large", { status: 413, headers: cors });
        try{ JSON.parse(body); } catch { return new Response("bad json", { status: 400, headers: cors }); }
        await env.LAND_CHECK_SYNC.put(key, body, { expirationTtl: 60 * 60 * 24 * 365 });
        return new Response('{"ok":true}', { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if(req.method === "DELETE"){
        await env.LAND_CHECK_SYNC.delete(key);
        return new Response('{"ok":true,"deleted":true}', { headers: { ...cors, "Content-Type": "application/json" } });
      }
      return new Response("method not allowed", { status: 405, headers: cors });
    }

    try{
      if(p==="/molit/search-act") return json(await molit("DTsearchLunCd",{landUseNm:q.get("landUseNm")||"",pageNum:q.get("pageNum")||"1",numOfRows:q.get("numOfRows")||"30"}));
      if(p==="/molit/restriction") return json(await molit("DTarLandUseInfo",{areaCd:q.get("areaCd")||"",ucodeList:q.get("ucodeList")||"",landUseNm:q.get("landUseNm")||""}));

      if(p==="/molit/land-trade"){
        const areaCd=q.get("areaCd")||"", dealYmd=q.get("dealYmd")||"";
        const url=new URL("https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade");
        url.searchParams.set("serviceKey",MOLIT_KEY); url.searchParams.set("LAWD_CD",areaCd);
        url.searchParams.set("DEAL_YMD",dealYmd); url.searchParams.set("numOfRows",q.get("numOfRows")||"300");
        // https 호출 시 실제 UTF-8 평문 응답 (http는 gzip 그대로 내려와 깨짐)
        const r=await fetch(url.toString(),{headers:{"User-Agent":UA}});
        const text=await r.text();
        return json(xmlToJson(text));
      }
      if(p==="/molit/bld-title"){
        const pnu=(q.get("pnu")||"").trim();
        if(!/^\d{19}$/.test(pnu)) return json({error:"pnu는 19자리 숫자여야 합니다"},400);
        const sigunguCd=pnu.slice(0,5), bjdongCd=pnu.slice(5,10), platGbCd=pnu.slice(10,11), bun=pnu.slice(11,15), ji=pnu.slice(15,19);
        const u=new URL("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo");
        u.searchParams.set("serviceKey",MOLIT_KEY);
        u.searchParams.set("sigunguCd",sigunguCd); u.searchParams.set("bjdongCd",bjdongCd);
        u.searchParams.set("platGbCd",platGbCd); u.searchParams.set("bun",bun); u.searchParams.set("ji",ji);
        u.searchParams.set("numOfRows",q.get("numOfRows")||"20");
        const r=await fetch(u.toString(),{headers:{"User-Agent":UA}});
        const text=await r.text();
        return json(xmlToJson(text));
      }
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
      return json({ok:true,routes:["/molit/search-act","/molit/restriction","/molit/land-trade","/vworld/ned/{op}","/vworld/search"]});
    }catch(e){ return json({error:String(e)},500); }
  }
};
