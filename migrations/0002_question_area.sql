-- 문제마다 "영역"(예: 덧셈, 받침·맞춤법)을 적을 칸. 비어 있으면 '기타'로 묶어 보여 줍니다.
ALTER TABLE questions ADD COLUMN area TEXT NOT NULL DEFAULT '';
