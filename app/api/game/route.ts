
import { gameDb } from '@/lib/game-db';
import { initialState } from '@/lib/questions';
import { applyAction, GameError, publicState } from '@/lib/game-engine';
import type { GameState } from '@/lib/learning';
export const dynamic='force-dynamic';
async function readState(userId:string){
 const db=gameDb();await db.prepare('INSERT OR IGNORE INTO learning_states (user_id, revision, document, updated_at) VALUES (?, 0, ?, ?)').bind(userId,JSON.stringify(initialState()),new Date().toISOString()).run();
 const row=await db.prepare('SELECT revision, document FROM learning_states WHERE user_id = ?').bind(userId).first<{revision:number;document:string}>();if(!row)throw Error('State unavailable');return {db,revision:row.revision,state:JSON.parse(row.document) as GameState};
}
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{const user={userId:'family'};const {state}=await readState(user.userId);return json({state:publicState(state,new URL(request.url).searchParams.get('parent')==='1')})}catch(error){console.error('Learning state read failed',error);return json({error:'학습 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'},503)}}
export async function POST(request:Request){
 try{const user={userId:'family'};
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'페이지에서 다시 시도해 주세요.'},403);
 const body=await request.text();if(body.length>15000)return json({error:'요청 내용이 너무 길어요.'},400);let action;try{action=JSON.parse(body)}catch{return json({error:'요청을 읽지 못했어요.'},400)}if(!action||typeof action!=='object')return json({error:'요청을 확인해 주세요.'},400);
 for(let attempt=0;attempt<3;attempt++){const {db,revision,state}=await readState(user.userId);const result=applyAction(state,action);const saved=await db.prepare('UPDATE learning_states SET document = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?').bind(JSON.stringify(state),new Date().toISOString(),user.userId,revision).run();if(saved.meta.changes===1)return json({state:publicState(state,action.parent===true),result});}
 return json({error:'다른 화면에서 기록이 바뀌었어요. 다시 시도해 주세요.'},409);
 }catch(error){if(error instanceof GameError)return json({error:error.message},400);console.error('Learning action failed',error);return json({error:'기록을 저장하지 못했어요. 다시 눌러 주세요. 같은 보상은 한 번만 저장돼요.'},503)}
}
