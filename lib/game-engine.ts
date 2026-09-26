import { catchable, dayIndex, pokemon, starters, subjects, todayKorea, type GameState, type Question } from './learning';
export class GameError extends Error{}
function fail(message:string):never{throw new GameError(message)}
export function applyAction(state:GameState,action:Record<string,unknown>,today=todayKorea(),random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){
 const day=dayIndex(state.start,today);
 switch(action.type){
 case 'starter': {const id=Number(action.id);if(state.partner!==null)fail('첫 파트너는 이미 선택했어요.');if(!starters.includes(id))fail('파트너를 다시 골라 주세요.');state.collection.push(id);state.partner=id;return {message:`${pokemon[id].name}와 친구가 되었어요!`};}
 case 'partner': {const id=Number(action.id);if(!state.collection.includes(id))fail('아직 만나지 못한 포켓몬이에요.');state.partner=id;return {message:`${pokemon[id].name}와 함께 모험해요.`};}
 case 'answer': {
  if(!state.approved||day<0||day>6)fail('오늘 풀 수 있는 미션이 없어요. 보호자에게 알려 주세요.');
  if(state.partner===null)fail('첫 파트너를 먼저 골라 주세요.');
  const q=state.questions.find(q=>q.id===action.id&&q.day===day);if(!q)fail('오늘의 문제를 다시 불러와 주세요.');
  if(!Number.isInteger(action.choice)||Number(action.choice)<0||Number(action.choice)>=q.choices.length)fail('답을 하나 골라 주세요.');
  if(state.solved.includes(q.id))return {correct:true,already:true,explanation:q.explanation,message:'이미 에너지를 받은 문제예요.'};
  if(action.choice!==q.answer)return {correct:false,message:'괜찮아! 다시 생각해 보자.',hint:q.explanation};
  state.solved.push(q.id);state.energy+=10;state.stats[q.subject]+=1;return {correct:true,explanation:q.explanation,message:'정답이야! 에너지 10을 모았어!'};
 }
 case 'catch': {
  if(!state.approved||day<0||day>6)fail('오늘의 미션을 먼저 풀어 주세요.');
  const qs=state.questions.filter(q=>q.day===day);if(qs.length===0||!qs.every(q=>state.solved.includes(q.id)))fail('오늘의 문제를 모두 맞혀야 해요.');
  if(state.caughtDays.includes(day))fail('오늘은 이미 포켓몬을 만났어요. 내일 다시 만나요!');
  if(!Number.isInteger(action.ball)||Number(action.ball)<0||Number(action.ball)>2)fail('포켓볼 3개 중 하나를 골라 주세요.');
  const id=catchable[Math.floor(random()*catchable.length)];const duplicate=state.collection.includes(id);
  state.caughtDays.push(day);if(duplicate)state.energy+=20;else state.collection.push(id);
  return {caught:id,duplicate,message:duplicate?`${pokemon[id].name}를 다시 만났어! 우정 에너지 +20!`:`${pokemon[id].name}를 잡았어!`};
 }
 case 'evolve': {const id=Number(action.id);const p=pokemon[id];if(!p||!state.collection.includes(id)||!p.next||!p.cost)fail('이 포켓몬은 지금 진화할 수 없어요.');if(state.energy<p.cost)fail(`에너지가 ${p.cost-state.energy} 더 필요해요.`);state.energy-=p.cost;state.collection=state.collection.filter(n=>n!==id);if(!state.collection.includes(p.next))state.collection.push(p.next);if(state.partner===id)state.partner=p.next;return {evolved:p.next,message:`축하해! ${p.name}가 ${pokemon[p.next].name}로 진화했어!`};}
 case 'approve': {if(state.approved)fail('이번 주 문제는 이미 공개했어요.');validateQuestions(state.questions);state.approved=true;state.start=today;return {message:'오늘부터 7일간의 모험을 시작해요!'};}
 case 'edit': {if(state.approved)fail('공개한 문제는 학습 기록을 위해 바꿀 수 없어요.');const edited=action.question as Question;const index=state.questions.findIndex(q=>q.id===edited?.id);if(index<0)fail('수정할 문제를 찾을 수 없어요.');const original=state.questions[index];const replacement={...edited,id:original.id,day:original.day,subject:original.subject};const candidate=state.questions.map((q,i)=>i===index?replacement:q);validateQuestions(candidate);state.questions=candidate;return {message:'문제를 저장했어요.'};}
 case 'scopes': {const scopes=action.scopes as Record<string,unknown>;if(!scopes||typeof scopes!=='object')fail('범위를 입력해 주세요.');for(const s of subjects){if(typeof scopes[s]!=='string'||String(scopes[s]).length>500)fail('과목별 범위는 500자 이내로 적어 주세요.');state.scopes[s]=String(scopes[s]).trim()}return {message:'다음 문제를 요청할 학습 범위를 저장했어요.'};}
 default:fail('지원하지 않는 요청이에요.');
 }
}
export function validateQuestions(qs:Question[]){if(qs.length!==35)fail('7일간 하루 5문제가 필요해요.');for(let d=0;d<7;d++)if(qs.filter(q=>q.day===d).length!==5)fail('매일 5문제가 있어야 해요.');if(new Set(qs.map(q=>q.id)).size!==35)fail('문제 번호가 겹쳤어요.');for(const q of qs){if(!subjects.includes(q.subject)||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>500||!Array.isArray(q.choices)||q.choices.length!==3||new Set(q.choices).size!==3||q.choices.some(c=>typeof c!=='string'||!c.trim()||c.length>150)||!Number.isInteger(q.answer)||q.answer<0||q.answer>2||typeof q.explanation!=='string'||!q.explanation.trim()||q.explanation.length>600)fail('문제, 서로 다른 보기 3개, 정답과 설명을 확인해 주세요.')}}
export function publicState(state:GameState,parent=false,today=todayKorea()){
 const day=dayIndex(state.start,today);return {...state,questions:parent?state.questions:state.questions.filter(q=>state.approved&&q.day===day).map(q=>({id:q.id,day:q.day,subject:q.subject,prompt:q.prompt,choices:q.choices})),today,day};
}

