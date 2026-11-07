/** Backward-compatible structured notes stored in the existing teaching-record text columns.
 * No migration: existing free-text rows remain readable and editable. */
const LESSON_PREFIX="cus-note-v2:";
const FEEDBACK_PREFIX="cus-feedback-v2:";
export const MASTERY_OPTIONS=["优秀","良好","基本掌握","部分掌握","需要加强"] as const;
export const PARTICIPATION_OPTIONS=["积极","正常","一般","较少","未参与"] as const;
export const PROGRESS_OPTIONS=["明显进步","稳步进步","基本稳定","有所退步","待观察"] as const;
export const HOMEWORK_OPTIONS=["已布置","未布置"] as const;
export type Mastery=typeof MASTERY_OPTIONS[number];
export type Participation=typeof PARTICIPATION_OPTIONS[number];
export type Progress=typeof PROGRESS_OPTIONS[number];
export function encodeTeacherNotes(content:string,evaluation:string){
 return LESSON_PREFIX+JSON.stringify({
  content:content.trim()||"无",evaluation:evaluation.trim()||"无"
 });
}
export function readTeacherNotes(raw:string|null|undefined){
 const fallback={content:raw?.trim()||"无",evaluation:"无"};
 if(!raw?.startsWith(LESSON_PREFIX))return fallback;
 try{
  const data=JSON.parse(raw.slice(LESSON_PREFIX.length));
  if(typeof data.content!=="string"||typeof data.evaluation!=="string")return fallback;
  return {content:data.content||"无",evaluation:data.evaluation||"无"};
 }catch{return fallback;}
}
export function encodeStudentRatings(mastery:string,participation:string,progress:string){
 return FEEDBACK_PREFIX+JSON.stringify({mastery,participation,progress});
}
export function readStudentRatings(raw:string|null|undefined){
 const fallback={mastery:"基本掌握",participation:"正常",progress:"待观察",legacy:raw||""};
 if(!raw?.startsWith(FEEDBACK_PREFIX))return fallback;
 try{
  const data=JSON.parse(raw.slice(FEEDBACK_PREFIX.length));
  return {
   mastery:MASTERY_OPTIONS.includes(data.mastery)?data.mastery:"基本掌握",
   participation:PARTICIPATION_OPTIONS.includes(data.participation)?data.participation:"正常",
   progress:PROGRESS_OPTIONS.includes(data.progress)?data.progress:"待观察",
   legacy:""
  };
 }catch{return fallback;}
}
export function validRatings(mastery:string,participation:string,progress:string){
 return MASTERY_OPTIONS.some(x=>x===mastery)&&
  PARTICIPATION_OPTIONS.some(x=>x===participation)&&
  PROGRESS_OPTIONS.some(x=>x===progress);
}
export function normalizeTutor(value:string|null|undefined):"Henry"|"Yvetta"|""{
 const x=String(value||"").trim().toLowerCase();
 if(x.includes("henry")||x.includes("牛教练")||x==="老牛")return "Henry";
 if(x.includes("yvetta")||x.includes("yutong")||x.includes("雨桐")||x.includes("宇桐")||x.includes("童教练"))return "Yvetta";
 return "";
}
