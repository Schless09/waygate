alter table public.trial_clips alter column audio_path drop not null;
alter table public.trial_clips
  add column if not exists task_type text not null default 'audio' check (task_type in ('audio', 'pii')),
  add column if not exists pii_source text;
alter table public.trial_attempts add column if not exists pii_tags jsonb;
alter table public.trial_scores add column if not exists pii_result jsonb;

insert into public.trial_clips (
  slug, title, audio_path, duration_seconds, speaker_count, reference_utterances, reference_text,
  difficulty, role, sort_order, task_type, pii_source
) values (
  'pii-1',
  'Task 3 — PII redaction',
  null,
  300,
  2,
  '[]'::jsonb,
  '',
  'standard',
  'annotator',
  4,
  'pii',
  $pii$[00:00] Agent: Thanks for calling Brightline Home Goods, this is {{NAME|Jordan}}. Can I start with your full name?
[00:04] Customer: Sure, it's {{NAME|Priya Raman}}.
[00:07] Agent: Thanks, {{NAME|Priya}}. And what's the best number to reach you on?
[00:10] Customer: My cell is {{PHONE|415-555-0182}}.
[00:15] Agent: Got it. I can see a recent order. Can you confirm the order number for me?
[00:19] Customer: Yes, it's {{ORDER|BH-48213-77}}. The blender arrived with a cracked jug.
[00:25] Agent: I'm sorry about that. I can send a replacement today. Is it still going to {{ADDRESS|2210 Alder Street, Apartment 4B, Portland}}?
[00:33] Customer: Actually no, I moved last week. Please send it to {{ADDRESS|88 Cedar Lane, Beaverton}}.
[00:40] Agent: No problem, I've updated that. I'll also refund the shipping fee. Which card should that go back to?
[00:45] Customer: The Visa ending in {{CARD|4417}}.
[00:49] Agent: Perfect. I'll email you a confirmation. Is {{EMAIL|priya.raman@example.com}} still the right address?
[00:55] Customer: Yes, that's right. Oh, and my partner {{NAME|Daniel}} might call about it while I'm at work on Tuesday.
[01:02] Agent: That's fine, I'll add a note to the order. Is there anything else I can help with today?
[01:06] Customer: No, that's everything. Thanks so much.
[01:08] Agent: You're welcome. Have a great day.$pii$
)
on conflict (slug) do update set
  title = excluded.title,
  task_type = excluded.task_type,
  pii_source = excluded.pii_source,
  sort_order = excluded.sort_order;
