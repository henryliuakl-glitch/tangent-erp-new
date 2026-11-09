/**
 * Transform a legacy Supabase public receipts URL to an authenticated internal
 * endpoint. Existing rows do not need to be rewritten when the bucket becomes
 * private. Do not proxy arbitrary third-party URLs.
 */
export function securedReceiptHref(url:string):string{
 try{
  const path=new URL(url).pathname;
  const marker="/storage/v1/object/public/receipts/";
  const alternate="/storage/v1/object/sign/receipts/";
  const idx=path.indexOf(marker);
  const altIdx=path.indexOf(alternate);
  const raw=idx>=0?path.slice(idx+marker.length):
    altIdx>=0?path.slice(altIdx+alternate.length):null;
  if(!raw)return url;
  const file=decodeURIComponent(raw);
  return "/api/receipts?path="+encodeURIComponent(file);
 }catch{return url;}
}
