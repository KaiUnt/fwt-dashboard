-- Close client-side write paths to credits/access and make multi-event purchases atomic.

DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can insert own event access" ON public.user_event_access;

REVOKE ALL ON FUNCTION public.add_user_credits(integer, character varying)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_user_credits(integer, character varying)
    TO service_role;

REVOKE ALL ON FUNCTION public.get_user_credits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.purchase_event_access(character varying, character varying)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_event_access(character varying, character varying)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purchase_multiple_event_access(
    event_ids_param character varying[],
    event_names_param character varying[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
    current_credits integer;
    expected_cost integer;
    actual_cost integer := 0;
    event_index integer;
    inserted_access_id uuid;
    unique_event_ids character varying[] := ARRAY[]::character varying[];
    unique_event_names character varying[] := ARRAY[]::character varying[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF event_ids_param IS NULL OR cardinality(event_ids_param) = 0
       OR cardinality(event_ids_param) > 50 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_request',
            'message', 'Between 1 and 50 event IDs are required'
        );
    END IF;

    IF event_names_param IS NOT NULL
       AND cardinality(event_names_param) <> cardinality(event_ids_param) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_request',
            'message', 'Event names must match the number of event IDs'
        );
    END IF;

    FOR event_index IN 1..cardinality(event_ids_param) LOOP
        IF event_ids_param[event_index] IS NULL
           OR event_ids_param[event_index] !~ '^[A-Za-z0-9_-]{1,100}$' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_request',
                'message', 'Invalid event ID'
            );
        END IF;

        IF event_names_param IS NOT NULL
           AND event_names_param[event_index] IS NOT NULL
           AND length(event_names_param[event_index]) > 500 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'invalid_request',
                'message', 'Event names must be 500 characters or fewer'
            );
        END IF;

        IF array_position(unique_event_ids, event_ids_param[event_index]) IS NULL THEN
            unique_event_ids := array_append(unique_event_ids, event_ids_param[event_index]);
            unique_event_names := array_append(
                unique_event_names,
                CASE
                    WHEN event_names_param IS NULL THEN NULL
                    ELSE event_names_param[event_index]
                END
            );
        END IF;
    END LOOP;

    INSERT INTO public.user_credits (user_id, credits)
    VALUES (auth.uid(), 5)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT credits
      INTO current_credits
      FROM public.user_credits
     WHERE user_id = auth.uid()
     FOR UPDATE;

    SELECT count(*)
      INTO expected_cost
      FROM unnest(unique_event_ids) AS requested(event_id)
     WHERE NOT EXISTS (
        SELECT 1
          FROM public.user_event_access existing
         WHERE existing.user_id = auth.uid()
           AND existing.event_id = requested.event_id
     );

    IF current_credits < expected_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'message', 'Not enough credits',
            'credits_required', expected_cost,
            'credits_available', current_credits
        );
    END IF;

    FOR event_index IN 1..cardinality(unique_event_ids) LOOP
        inserted_access_id := NULL;
        INSERT INTO public.user_event_access (user_id, event_id, event_name, access_type)
        VALUES (
            auth.uid(),
            unique_event_ids[event_index],
            unique_event_names[event_index],
            'paid'
        )
        ON CONFLICT (user_id, event_id) DO NOTHING
        RETURNING id INTO inserted_access_id;

        IF inserted_access_id IS NOT NULL THEN
            actual_cost := actual_cost + 1;
            INSERT INTO public.credit_transactions (
                user_id,
                transaction_type,
                amount,
                credits_before,
                credits_after,
                description,
                event_id
            ) VALUES (
                auth.uid(),
                'spend',
                -1,
                current_credits - actual_cost + 1,
                current_credits - actual_cost,
                'Event access purchase: ' || COALESCE(
                    unique_event_names[event_index],
                    unique_event_ids[event_index]
                ),
                unique_event_ids[event_index]
            );
        END IF;
    END LOOP;

    UPDATE public.user_credits
       SET credits = credits - actual_cost,
           updated_at = now()
     WHERE user_id = auth.uid();

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE
            WHEN actual_cost = 0 THEN 'Access already available for all requested events'
            ELSE format('Successfully purchased access to %s event(s)', actual_cost)
        END,
        'credits_remaining', current_credits - actual_cost,
        'purchased_events', to_jsonb(unique_event_ids),
        'failed_events', '[]'::jsonb
    );
END;
$$;

ALTER FUNCTION public.purchase_multiple_event_access(character varying[], character varying[])
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.purchase_multiple_event_access(character varying[], character varying[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_multiple_event_access(character varying[], character varying[])
    TO authenticated, service_role;
