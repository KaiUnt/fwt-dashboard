CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.user_credits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE,
    credits integer NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_event_access (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    event_id varchar(255) NOT NULL,
    event_name varchar(500),
    access_type varchar(20),
    UNIQUE (user_id, event_id)
);

CREATE TABLE public.credit_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    transaction_type varchar(20),
    amount integer,
    credits_before integer,
    credits_after integer,
    description varchar(500),
    event_id varchar(255)
);

CREATE FUNCTION public.add_user_credits(integer, character varying)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.get_user_credits()
RETURNS integer LANGUAGE sql AS $$ SELECT 5 $$;
CREATE FUNCTION public.purchase_event_access(character varying, character varying)
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

CREATE POLICY "Users can insert own credits"
    ON public.user_credits FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own credits"
    ON public.user_credits FOR UPDATE USING (true);
CREATE POLICY "Users can insert own event access"
    ON public.user_event_access FOR INSERT WITH CHECK (true);
