SELECT set_config(
    'request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111',
    false
);

SELECT public.purchase_multiple_event_access(
    ARRAY['event-1', 'event-2', 'event-1']::varchar[],
    ARRAY['One', 'Two', 'Duplicate']::varchar[]
);

DO $$
BEGIN
    IF (SELECT credits FROM public.user_credits WHERE user_id = auth.uid()) <> 3 THEN
        RAISE EXCEPTION 'Unexpected credit balance';
    END IF;
    IF (SELECT count(*) FROM public.user_event_access WHERE user_id = auth.uid()) <> 2 THEN
        RAISE EXCEPTION 'Unexpected access count';
    END IF;
    IF (SELECT count(*) FROM public.credit_transactions WHERE user_id = auth.uid()) <> 2 THEN
        RAISE EXCEPTION 'Unexpected transaction count';
    END IF;
END
$$;
