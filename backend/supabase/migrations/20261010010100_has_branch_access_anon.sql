-- RLS policies call has_branch_access() as the querying role, including anon.
-- Without EXECUTE, an anonymous select on orders or chat failed with
-- "permission denied for function has_branch_access" instead of returning no
-- rows. For anon it always answers false (no role, no uid), so the grant is safe.

grant execute on function public.has_branch_access(uuid) to anon;
