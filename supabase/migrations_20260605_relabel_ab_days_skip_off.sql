do $$
declare
  course_row record;
  day_row record;
  current_ab text;
  expected_ab text;
begin
  for course_row in
    select id, ab_pattern_start_date, school_year_start, school_year_end
    from public.courses
    where schedule_model = 'ab'
  loop
    current_ab := 'A';

    for day_row in
      select id, class_date, day_type, ab_day
      from public.course_calendar_days
      where course_id = course_row.id
        and class_date between course_row.school_year_start and course_row.school_year_end
      order by class_date
    loop
      expected_ab := null;

      if day_row.day_type <> 'off'
        and (course_row.ab_pattern_start_date is null or day_row.class_date >= course_row.ab_pattern_start_date)
      then
        expected_ab := current_ab;
        current_ab := case current_ab when 'A' then 'B' else 'A' end;
      end if;

      if day_row.ab_day is distinct from expected_ab then
        update public.course_calendar_days
        set ab_day = expected_ab,
            updated_at = now()
        where id = day_row.id;
      end if;
    end loop;
  end loop;
end $$;
