-- Refresh Zack's 57AB Algebra I plan from the 2026-09-14 CSV.
-- Completed 2.01, 2.02, 2.04, and 2.05 stay intact; Zack chose to skip 2.03.
-- The remaining lessons follow CSV order. This library currently has one course.
begin;

create temporary table algebra_i_source (
  source_order integer primary key,
  source_lesson_code text not null unique,
  title text not null,
  objective text not null
) on commit drop;

insert into algebra_i_source (source_order, source_lesson_code, title, objective)
values
  (1, '2.01', 'Planning a Pizza Party', 'Let’s write expressions to estimate the cost of a pizza party.'),
  (2, '2.02', 'Writing Equations to Model Relationships (Part 1)', 'Let''s look at how equations can help us describe relationships and constraints.'),
  (3, '2.03', 'Writing Equations to Model Relationships (Part 2)', 'Let''s use patterns to help us write equations.'),
  (4, '2.04', 'Equations and Their Solutions', 'Let’s recall what we know about solutions to equations.'),
  (5, '2.05', 'Equations and Their Graphs', 'Let’s graph equations in two variables.'),
  (6, '2.06', 'Equivalent Equations', 'Let''s investigate what makes two equations equivalent.'),
  (7, '2.07', 'Explaining Steps for Rewriting Equations', 'Let’s think about why some steps for rewriting equations are valid but other steps are not.'),
  (8, '2.08', 'Which Variable to Solve for? (Part 1)', 'Let’s rearrange equations to pin down a certain quantity.'),
  (9, '2.09', 'Which Variable to Solve for? (Part 2)', 'Let’s solve an equation for one of the variables.'),
  (10, '2.10', 'Connecting Equations to Graphs (Part 1)', 'Let’s investigate what graphs can tell us about the equations and relationships they represent.'),
  (11, '2.11', 'Connecting Equations to Graphs (Part 2)', 'Let''s analyze different forms of linear equations and how the forms relate to their graphs.'),
  (12, '2.12', 'Writing and Graphing Systems of Linear Equations', 'Let’s recall what it means to solve a system of linear equations and how to do it by graphing.'),
  (13, '2.13', 'Solving Systems by Substitution', 'Let’s use substitution to solve systems of linear equations.'),
  (14, '2.14', 'Solving Systems by Elimination (Part 1)', 'Let’s investigate how adding or subtracting equations can help us solve systems of linear equations.'),
  (15, '2.15', 'Solving Systems by Elimination (Part 2)', 'Let’s think about why adding and subtracting equations works for solving systems of linear equations.'),
  (16, '2.16', 'Solving Systems by Elimination (Part 3)', 'Let''s find out how multiplying equations by a factor can help us solve systems of linear equations.'),
  (17, '2.17', 'Systems of Linear Equations and Their Solutions', 'Let''s find out how many solutions a system of equations could have.'),
  (18, '2.18', 'Representing Situations with Inequalities', 'Let’s use inequalities to represent constraints in situations.'),
  (19, '2.19', 'Solutions to Inequalities in One Variable', 'Let’s find and interpret solutions to inequalities in one variable.'),
  (20, '2.20', 'Writing and Solving Inequalities in One Variable', 'Let’s solve problems by writing and solving inequalities in one variable.'),
  (21, '2.21', 'Graphing Linear Inequalities in Two Variables (Part 1)', 'Let’s find out how to use graphs to represent solutions to inequalities in two variables.'),
  (22, '2.22', 'Graphing Linear Inequalities in Two Variables (Part 2)', 'Let’s write inequalities in two variables and make sense of the solutions by reasoning and by graphing.'),
  (23, '2.23', 'Solving Problems with Inequalities in Two Variables', 'Let’s practice writing, interpreting, and graphing solutions to inequalities in two variables.'),
  (24, '2.24', 'Solutions to Systems of Linear Inequalities in Two Variables', 'Let’s look at situations where two constraints (that can be expressed by inequalities) must be met simultaneously.'),
  (25, '2.25', 'Solving Problems with Systems of Linear Inequalities in Two Variables', 'Let’s use systems of inequalities to solve some problems.'),
  (26, '2.26', 'Modeling with Systems of Inequalities in Two Variables', 'Let’s create mathematical models using systems of inequalities.'),
  (27, '4.01', 'Describing and Graphing Situations', 'Let’s look at some fun functions around us and try to describe them.'),
  (28, '4.02', 'Function Notation', 'Let’s learn about a handy way to refer to and talk about a function.'),
  (29, '4.03', 'Interpreting & Using Function Notation', 'Let’s use function notation to talk about functions.'),
  (30, '4.04', 'Using Function Notation to Describe Rules (Part 1)', 'Let’s look at some rules that describe functions and write some, too.'),
  (31, '4.05', 'Using Function Notation to Describe Rules (Part 2)', 'Let’s graph and find the values of some functions.'),
  (32, '4.06', 'Features of Graphs', 'Let’s use graphs of functions to learn about situations.'),
  (33, '4.07', 'Using Graphs to Find Average Rate of Change', 'Let’s measure how quickly the output of a function changes.'),
  (34, '4.08', 'Interpreting and Creating Graphs', 'Let’s sketch graphs to represent situations.'),
  (35, '4.09', 'Comparing Graphs', 'Let’s compare graphs of functions to learn about the situations they represent.'),
  (36, '4.10', 'Domain and Range (Part 1)', 'Let’s find all possible inputs and outputs for a function.'),
  (37, '4.11', 'Domain and Range (Part 2)', 'Let’s analyze graphs of functions to learn about their domain and range.'),
  (38, '4.12', 'Piecewise Functions', 'Let’s look at functions that are defined in pieces.'),
  (39, '4.13', 'Absolute Value Functions (Part 1)', 'Let’s make some guesses and see how good they are.'),
  (40, '4.14', 'Absolute Value Functions (Part 2)', 'Let’s investigate distance as a function.'),
  (41, '4.15', 'Inverse Functions', 'Let’s define functions forward and backward.'),
  (42, '4.16', 'Finding and Interpreting Inverse Functions', 'Let’s find the inverse of linear functions.'),
  (43, '4.17', 'Writing Inverse Functions to Solve Problems', 'Let’s use inverse functions to solve problems.'),
  (44, '4.18', 'Using Functions to Model Battery Power', 'Let’s use functions to model data and make predictions.'),
  (45, '5.01', 'Growing and Growing', 'Let''s choose the better deal.'),
  (46, '5.02', 'Patterns of Growth', 'Let’s compare different patterns of growth.'),
  (47, '5.03', 'Representing Exponential Growth', 'Let’s explore exponential growth.'),
  (48, '5.04', 'Understanding Decay', 'Let’s look at exponential decay.'),
  (49, '5.05', 'Representing Exponential Decay', 'Let’s think about how to show and talk about exponential decay.'),
  (50, '5.06', 'Analyzing Graphs', 'Let''s compare situations where quantities change exponentially.'),
  (51, '5.07', 'Using Negative Exponents', 'Let’s look more closely at exponential graphs and equations.'),
  (52, '5.08', 'Exponential Situations as Functions', 'Let’s explore exponential functions.'),
  (53, '5.09', 'Interpreting Exponential Functions', 'Let’s find some meaningful ways to represent exponential functions.'),
  (54, '5.10', 'Looking at Rates of Change', 'Let''s calculate average rates of change for exponential functions.'),
  (55, '5.11', 'Modeling Exponential Behavior', 'Let’s use exponential functions to model real life situations.'),
  (56, '5.12', 'Reasoning about Exponential Graphs (Part 1)', 'Let’s study and compare equations and graphs of exponential functions.'),
  (57, '5.13', 'Reasoning about Exponential Graphs (Part 2)', 'Let’s investigate what we can learn from graphs that represent exponential functions.'),
  (58, '5.15', 'Functions Involving Percent Change', 'Let''s investigate what happens when we repeatedly apply a percent increase to a quantity.'),
  (59, '5.16', 'Compounding Interest', 'Let''s explore different ways of repeatedly applying a percent increase.'),
  (60, '5.17', 'Different Compounding Intervals', 'Let''s find out what happens when we repeatedly apply the same percent increase at different intervals of time.'),
  (61, '5.18', 'Expressed in Different Ways', 'Let''s write exponential expressions in different ways.'),
  (62, '5.19', 'Which Ones Changes Faster?', 'Let''s compare linear and exponential functions as they continue to increase.'),
  (63, '5.20', 'Changes over Equal Intervals', 'Let''s explore how linear and exponential functions change over equal intervals.'),
  (64, '5.21', 'Predicting Populations', 'Let''s use linear and exponential models to represent and understand population changes.'),
  (65, '6.01', 'A Different Kind of Change', 'Let’s find the rectangle with the greatest area.'),
  (66, '6.02', 'How Does it Change?', 'Let’s describe some patterns of change.'),
  (67, '6.03', 'Building Quadratic Functions from Geometric Patterns', 'Let’s describe some other geometric patterns.'),
  (68, '6.04', 'Comparing Quadratic and Exponential Functions', 'Let’s compare quadratic and exponential changes and see which one grows faster.'),
  (69, '6.05', 'Building Quadratic Functions to Describe Situations', 'Let’s measure falling objects.'),
  (70, '6.06', 'Building Quadratic Functions to Describe Situations (Part 2)', 'Let’s look at the objects being launched in the air.'),
  (71, '6.07', 'Building Quadratic Functions to Describe Situations (Part 3)', 'Let’s look at how to maximize revenue.'),
  (72, '6.08', 'Equivalent Quadratic Expressions', 'Let’s use diagrams to help us rewrite quadratic expressions.'),
  (73, '6.09', 'Standard Form and Factored Form', 'Let’s write quadratic expressions in different forms.'),
  (74, '6.10', 'Graphs of Functions in Standard and Factored Form', 'Let’s find out what quadratic expressions in standard and factored forms can reveal about the properties of their graphs.'),
  (75, '6.11', 'Graphing from the Factored Form', 'Let’s graph some quadratic functions in factored form.'),
  (76, '6.12', 'Graphing the Standard Form (Part 1)', 'Let’s see how the numbers in expressions like -3x^2 + 4 affect their graph.'),
  (77, '6.14', 'Graphs That Represent Situations', 'Let’s examine graphs that represent the paths of objects being launched in the air.'),
  (78, '6.15', 'Vertex Form', 'Let’s find out about the vertex form.'),
  (79, '6.16', 'Graphing from the Vertex Form', 'Let’s graph equations in vertex form.'),
  (80, '6.17', 'Changing the Vertex', 'Let’s write new quadratic equations in vertex form to produce certain graphs.'),
  (81, '7.01', 'Finding Unknown Inputs', 'Let’s find some new equations to solve.'),
  (82, '7.02', 'When and Why Do We Write Quadratic Equations?', 'Let’s try to solve some quadratic equations.'),
  (83, '7.03', 'Solving Quadratic Equations by Reasoning', 'Let’s find solutions to quadratic equations.'),
  (84, '7.04', 'Solving Quadratic Equations with the Zero Product Property', 'Let’s find solutions to equations that contain products that equal zero.'),
  (85, '7.05', 'How Many Solutions?', 'Let’s use graphs to investigate quadratic equations that have two solutions, one solution, or no solutions.'),
  (86, '7.06', 'Rewriting Quadratic Expressions in Factored Form', 'Let’s write expressions in factored form.'),
  (87, '7.07', 'Rewriting Quadratic Expressions in Factored Form (Part 2)', 'Let’s write some more expressions in factored form.'),
  (88, '7.08', 'Rewriting Quadratic Expressions in Factored Form (Part 3)', 'Let’s look closely at some special kinds of factors.'),
  (89, '7.09', 'Solving Quadratic Equations by Using Factored Form', 'Let’s solve some quadratic equations that before now we could only solve by graphing.'),
  (90, '7.10', 'Rewriting Quadratic Expressions in Factored Form (Part 4)', 'Let’s transform more-complicated quadratic expressions into the factored form.'),
  (91, '7.11', 'What are Perfect Squares?', 'Let’s see how perfect squares make some equations easier to solve.'),
  (92, '7.12', 'Completing the Square (Part 1)', 'Let’s learn a new method for solving quadratic equations.'),
  (93, '7.13', 'Completing the Square (Part 2)', 'Let’s solve some harder quadratic equations.'),
  (94, '7.14', 'Completing the Square (Part 3)', 'Let’s complete the square for some more complicated expressions.'),
  (95, '7.15', 'Quadratic Equations with Irrational Solutions', 'Let’s find exact solutions to quadratic equations even if the solutions are irrational.'),
  (96, '7.16', 'The Quadratic Formula', 'Let’s learn a formula for finding solutions to quadratic equations.'),
  (97, '7.17', 'Applying the Quadratic Formula (Part 1)', 'Let’s use the quadratic formula to solve some problems.'),
  (98, '7.18', 'Applying the Quadratic Formula (Part 2)', 'Let’s use the quadratic formula and solve quadratic equations with care.'),
  (99, '7.19', 'Deriving the Quadratic Formula', 'Let’s find out where the quadratic formula comes from.'),
  (100, '7.20', 'Rational and Irrational Solutions', 'Let’s consider the kinds of numbers we get when solving quadratic equations.'),
  (101, '7.21', 'Sums and Products of Rational and Irrational Numbers', 'Let’s make convincing arguments about why the sums and products of rational and irrational numbers are always certain kinds of numbers.'),
  (102, '7.22', 'Rewriting Quadratic Expressions in Vertex Form', 'Let’s see what else completing the square can help us do.'),
  (103, '7.23', 'Using Quadratic Expressions in Vertex Form to Solve Problems', 'Let’s find the maximum or minimum value of a quadratic function.'),
  (104, '7.24', 'Using Quadratic Equations to Model Situations and Solve Problems', 'Let’s analyze a situation modeled by a quadratic equation.')
;

do $$
begin
  if (select count(*) from algebra_i_source) <> 104 then
    raise exception 'Unexpected Algebra I CSV row count';
  end if;
  if (select count(*) from public.courses where selected_library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1') <> 1
     or (select selected_library_id from public.courses where id = 'c2512d97-7a35-4f11-9c15-053e49026c74')
        is distinct from '64d57898-02a0-553d-8da5-740f9d08f2b1'::uuid then
    raise exception 'Algebra I library is no longer exclusive to the expected course';
  end if;
  if (select count(*) from public.curriculum_lessons where library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1') <> 87
     or (select count(*) from public.course_lesson_plan where course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and status = 'planned') <> 83
     or (select string_agg(l.source_lesson_code, ',' order by p.class_date, p.lesson_slot)
         from public.course_lesson_plan p join public.curriculum_lessons l on l.id = p.lesson_id
         where p.course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and p.status = 'completed')
        is distinct from '2.01,2.02,2.04,2.05' then
    raise exception 'Algebra I lessons or completion state changed since review';
  end if;
  if (select pacing_mode from public.courses where id = 'c2512d97-7a35-4f11-9c15-053e49026c74') <> 'one_lesson_per_day'
     or (select schedule_model from public.courses where id = 'c2512d97-7a35-4f11-9c15-053e49026c74') <> 'every_day'
     or (select pacing_weekday_modifiers from public.courses where id = 'c2512d97-7a35-4f11-9c15-053e49026c74') <> '{}'::jsonb
     or exists (select 1 from public.course_calendar_days where course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and lesson_count_override is not null) then
    raise exception 'Algebra I pacing rules changed since review';
  end if;
  if exists (
    select 1 from public.curriculum_lessons l
    where l.library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1'
      and not exists (select 1 from algebra_i_source s where s.source_lesson_code = l.source_lesson_code)
  ) then
    raise exception 'Existing Algebra I lesson code missing from CSV';
  end if;
end $$;

create temporary table algebra_i_ordered on commit drop as
select row_number() over (order by priority, source_order)::integer as sequence_index,
       source_lesson_code, title, objective
from (
  select case source_lesson_code
           when '2.01' then 1 when '2.02' then 2
           when '2.04' then 3 when '2.05' then 4 else 5 end as priority,
         source_order, source_lesson_code, title, objective
  from algebra_i_source
  where source_lesson_code <> '2.03'
) source;

-- Move old unique positions out of the new 1-103 range before resequencing.
update public.curriculum_lessons
set sequence_index = sequence_index + 1000
where library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1';

update public.curriculum_lessons lesson
set sequence_index = ordered.sequence_index,
    title = case when ordered.source_lesson_code in ('2.01', '2.02', '2.04', '2.05')
                 then lesson.title else ordered.title end,
    objective = case when ordered.source_lesson_code in ('2.01', '2.02', '2.04', '2.05')
                     then lesson.objective else ordered.objective end
from algebra_i_ordered ordered
where lesson.library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1'
  and lesson.source_lesson_code = ordered.source_lesson_code;

insert into public.curriculum_lessons (library_id, sequence_index, source_lesson_code, title, objective)
select '64d57898-02a0-553d-8da5-740f9d08f2b1',
       ordered.sequence_index, ordered.source_lesson_code, ordered.title, ordered.objective
from algebra_i_ordered ordered
where not exists (
  select 1 from public.curriculum_lessons lesson
  where lesson.library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1'
    and lesson.source_lesson_code = ordered.source_lesson_code
);

-- This course is one lesson per schedulable day with no date overrides.
-- Upsert preserves existing planned row IDs and dates. Completed rows stay untouched.
with future_days as (
  select class_date, row_number() over (order by class_date) as future_index
  from public.course_calendar_days
  where course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74'
    and class_date > '2026-09-11'
    and day_type <> 'off'
    and not coalesce(is_grace_day, false)
), future_lessons as (
  select id, row_number() over (order by sequence_index) as future_index
  from public.curriculum_lessons
  where library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1'
    and sequence_index > 4
)
insert into public.course_lesson_plan (course_id, class_date, lesson_slot, lesson_id, status, is_added_buffer_day)
select 'c2512d97-7a35-4f11-9c15-053e49026c74', future_days.class_date, 1,
       future_lessons.id, 'planned', false
from future_days join future_lessons using (future_index)
on conflict (course_id, class_date, lesson_slot) do update
  set lesson_id = excluded.lesson_id, updated_at = now()
  where public.course_lesson_plan.status = 'planned';

do $$
begin
  if (select count(*) from public.curriculum_lessons where library_id = '64d57898-02a0-553d-8da5-740f9d08f2b1') <> 103
     or (select count(*) from public.course_lesson_plan where course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and status = 'completed') <> 4
     or (select count(*) from public.course_lesson_plan where course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and status = 'planned') <> 99
     or (select l.source_lesson_code from public.course_lesson_plan p
         join public.curriculum_lessons l on l.id = p.lesson_id
         where p.course_id = 'c2512d97-7a35-4f11-9c15-053e49026c74' and p.class_date = '2026-09-14' and p.lesson_slot = 1)
        is distinct from '2.06' then
    raise exception 'Algebra I refresh failed validation';
  end if;
end $$;

commit;
