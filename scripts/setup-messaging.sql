create table if not exists public.site_message_admins (
    user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.site_messages (
    id uuid primary key default gen_random_uuid(),
    sender_id uuid not null references auth.users(id) on delete cascade,
    recipient_id uuid references auth.users(id) on delete cascade,
    body text not null check (char_length(btrim(body)) between 1 and 2000),
    created_at timestamptz not null default now()
);

create table if not exists public.site_message_reads (
    message_id uuid not null references public.site_messages(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    acknowledged_at timestamptz not null default now(),
    primary key (message_id, user_id)
);

create index if not exists site_messages_recipient_created_idx
    on public.site_messages (recipient_id, created_at);

alter table public.site_message_admins enable row level security;
alter table public.site_messages enable row level security;
alter table public.site_message_reads enable row level security;

revoke all on public.site_message_admins, public.site_messages, public.site_message_reads
    from public, anon, authenticated;

create or replace function public.is_site_message_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.site_message_admins as admin
        where admin.user_id = auth.uid()
    );
$$;

create or replace function public.get_site_message_recipients()
returns table (user_id uuid, full_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null or not public.is_site_message_admin() then
        raise exception 'Not authorized';
    end if;

    return query
    select profile.id, coalesce(nullif(profile.full_name, ''), 'Անանուն')
    from public.profiles as profile
    order by coalesce(nullif(profile.full_name, ''), 'Անանուն');
end;
$$;

create or replace function public.get_pending_site_messages()
returns table (id uuid, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    return query
    select message.id, message.body, message.created_at
    from public.site_messages as message
    where (message.recipient_id is null or message.recipient_id = auth.uid())
      and not exists (
          select 1
          from public.site_message_reads as receipt
          where receipt.message_id = message.id
            and receipt.user_id = auth.uid()
      )
    order by message.created_at, message.id;
end;
$$;

create or replace function public.acknowledge_site_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (
        select 1
        from public.site_messages as message
        where message.id = p_message_id
          and (message.recipient_id is null or message.recipient_id = auth.uid())
    ) then
        raise exception 'Message not found for this user';
    end if;

    insert into public.site_message_reads (message_id, user_id)
    values (p_message_id, auth.uid())
    on conflict (message_id, user_id) do nothing;
end;
$$;

create or replace function public.send_site_message(p_recipient_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    message_id uuid;
    clean_body text := btrim(p_body);
begin
    if auth.uid() is null or not public.is_site_message_admin() then
        raise exception 'Not authorized';
    end if;

    if clean_body is null or char_length(clean_body) < 1 or char_length(clean_body) > 2000 then
        raise exception 'Message must contain between 1 and 2000 characters';
    end if;

    if p_recipient_id is not null and not exists (
        select 1 from public.profiles as profile where profile.id = p_recipient_id
    ) then
        raise exception 'Recipient not found';
    end if;

    insert into public.site_messages (sender_id, recipient_id, body)
    values (auth.uid(), p_recipient_id, clean_body)
    returning id into message_id;

    return message_id;
end;
$$;

revoke all on function public.is_site_message_admin() from public, anon, authenticated;
revoke all on function public.get_site_message_recipients() from public, anon, authenticated;
revoke all on function public.get_pending_site_messages() from public, anon, authenticated;
revoke all on function public.acknowledge_site_message(uuid) from public, anon, authenticated;
revoke all on function public.send_site_message(uuid, text) from public, anon, authenticated;

grant execute on function public.is_site_message_admin() to authenticated;
grant execute on function public.get_site_message_recipients() to authenticated;
grant execute on function public.get_pending_site_messages() to authenticated;
grant execute on function public.acknowledge_site_message(uuid) to authenticated;
grant execute on function public.send_site_message(uuid, text) to authenticated;

-- After creating these objects, grant sender access to your account by email:
-- insert into public.site_message_admins (user_id)
-- select id from auth.users where email = 'YOUR_ACCOUNT_EMAIL'
-- on conflict (user_id) do nothing;