export const subjects = ['수학','국어','한자','과학','역사','사회'] as const;
export type Subject = typeof subjects[number];
export type Question={id:string;day:number;subject:Subject;prompt:string;choices:string[];answer:number;explanation:string};
export const initialScopes:Record<Subject,string>={수학:'받아올림·받아내림 없는 두 자리 수 덧셈과 뺄셈',국어:'낱말에서 알맞은 겹받침 찾기',한자:'한국어문회 8급 기초 한자',과학:'초등 1학년 수준의 자연상식',역사:'선사시대의 도구와 생활',사회:''};
export const pokemon:Record<number,{name:string;type:string;next?:number;cost?:number;chain:number[];original:string;image:string}>={};
const chains=[{ids:[1,2,3],names:['이상해씨','이상해풀','이상해꽃'],type:'풀 · 독',original:'본가 게임: 레벨 16 → 레벨 32'}, {ids:[4,5,6],names:['파이리','리자드','리자몽'],type:'불꽃',original:'본가 게임: 레벨 16 → 레벨 36'}, {ids:[7,8,9],names:['꼬부기','어니부기','거북왕'],type:'물',original:'본가 게임: 레벨 16 → 레벨 36'}, {ids:[10,11,12],names:['캐터피','단데기','버터플'],type:'벌레',original:'본가 게임: 레벨 7 → 레벨 10'}, {ids:[172,25,26],names:['피츄','피카츄','라이츄'],type:'전기',original:'본가 게임: 높은 친밀도에서 레벨업 → 천둥의돌'}];
for(const c of chains)c.ids.forEach((id,i)=>{pokemon[id]={name:c.names[i],type:id===6?'불꽃 · 비행':id===12?'벌레 · 비행':c.type,next:c.ids[i+1],cost:i===0?60:i===1?120:undefined,chain:c.ids,original:c.original,image:id===172?'https://assets.pokemon.com/assets/cms2/img/pokedex/full/172.png':`https://data1.pokemonkorea.co.kr/newdata/pokedex/full/${String(id).padStart(4,'0')}01.png`}});
export const starters=[1,4,7];
export const catchable=[1,4,7,10,172];
export type GameState={energy:number;stats:Record<Subject,number>;collection:number[];partner:number|null;solved:string[];caughtDays:number[];start:string|null;approved:boolean;questions:Question[];scopes:Record<Subject,string>};
export const todayKorea=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function dayIndex(start:string|null,today=todayKorea()){return start===null?-1:Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)}
