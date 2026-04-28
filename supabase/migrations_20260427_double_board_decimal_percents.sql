alter table public.double_board_questions
  alter column operand1 type numeric(7, 2) using operand1::numeric(7, 2);

comment on column public.double_board_questions.operand1 is
  'Stores integer operands for integer Double Board questions and percent values for percent-change questions, including 2-decimal Column 3 percents.';

comment on column public.double_board_questions.correct_answer is
  'For percent-change multipliers, stores the scaled multiplier integer: hundredths for whole-number percents and ten-thousandths for 2-decimal percents.';
