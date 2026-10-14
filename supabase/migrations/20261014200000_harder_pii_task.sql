update public.trial_clips
set pii_source = $pii$[00:00] Agent: Thanks for calling Brightline Home Goods, my name is {{NAME|Hope}}. Who am I speaking with?
[00:04] Customer: Hi {{NAME|Hope}}, it's {{NAME|Priya Raman}}. That's {{NAME|R-A-M-A-N}}.
[00:09] Agent: Thanks, {{NAME|Priya}}. What's the best number to reach you on?
[00:12] Customer: It's {{PHONE|415-555-0182}}. Oh wait, sorry, that's my old one. The new one is {{PHONE|six two eight, five five five, zero one four seven}}.
[00:21] Agent: Got it. And can you read me the order number? It should start with two letters.
[00:25] Customer: Yes, it's {{ORDER|B H four eight two one three, dash seven seven}}. It's the BX-200 blender, the eighty-nine ninety-nine one. It arrived with a cracked jug.
[00:34] Agent: I'm sorry about that. I hope we can get a replacement out today. Is it still going to {{ADDRESS|twenty-two ten Alder Street, Apartment 4B, Portland}}?
[00:43] Customer: I hope so. Actually, no, I moved last week. Please send it to {{ADDRESS|88 Cedar Lane, Beaverton}}. The courier, {{NAME|Marcus}}, knows the building.
[00:52] Agent: Updated. I'll also refund the shipping fee. Which card should that go back to?
[00:56] Customer: The Visa ending in {{CARD|four four one seven}}.
[01:00] Agent: Perfect. Where should I email the confirmation?
[01:03] Customer: It's {{EMAIL|priya dot raman at gmail dot com}}. And my partner {{NAME|Daniel}} might call about it while I'm at work on Tuesday.
[01:11] Agent: That's fine, I'll add a note. Our Portland warehouse ships by 5 p.m., so it should arrive Thursday.
[01:17] Customer: Great, thanks so much.
[01:19] Agent: You're welcome. Have a great day.$pii$
where slug = 'pii-1';
