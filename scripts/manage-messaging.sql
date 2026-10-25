-- Messaging administration queries for Supabase.
-- Run scripts/setup-messaging.sql first to create the messaging tables/functions.

-- 1. View the newest 100 messages.
select id, sender_id, recipient_id, body, created_at
from public.site_messages
order by created_at desc
limit 100;

-- A NULL recipient_id means the message was sent to all users.

-- 2. View messages for one recipient. Replace the UUID with a user's ID.
-- select id, sender_id, recipient_id, body, created_at
-- from public.site_messages
-- where recipient_id = 'PASTE-USER-ID-HERE'
-- order by created_at desc;

-- 3. View read receipts for a message. Replace the UUID with a message ID.
-- select message_id, user_id, acknowledged_at
-- from public.site_message_reads
-- where message_id = 'PASTE-MESSAGE-ID-HERE'
-- order by acknowledged_at desc;

-- 4. Find a user's ID by email, for use in the admin and recipient queries.
-- select id, email
-- from auth.users
-- where email = 'USER-EMAIL-HERE';

-- 5. Grant messaging-admin access to an account. Replace the email first.
-- insert into public.site_message_admins (user_id)
-- select id from auth.users where email = 'YOUR_ACCOUNT_EMAIL'
-- on conflict (user_id) do nothing;

-- 6. Revoke messaging-admin access. Replace the UUID with the user's ID.
-- delete from public.site_message_admins
-- where user_id = 'PASTE-USER-ID-HERE';

-- 7. Delete one message and its read receipts. Replace the UUID, then uncomment.
-- delete from public.site_messages
-- where id = 'PASTE-MESSAGE-ID-HERE';
