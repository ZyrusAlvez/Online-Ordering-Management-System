-- has_branch_access() no longer needs SECURITY DEFINER (flagged by the security
-- advisor, since it was callable over /rest/v1/rpc). Staff may read their own
-- branch_staff rows, which is all the function looks at, so it can run with the
-- caller's own rights.

create policy "Staff read their own branches" on public.branch_staff
  for select using (profile_id = (select auth.uid()));

create or replace function public.has_branch_access(p_branch uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select public.auth_role() = 'super_admin'
      or exists (
        select 1 from public.branch_staff s
        where s.profile_id = (select auth.uid()) and s.branch_id = p_branch
      )
$$;
