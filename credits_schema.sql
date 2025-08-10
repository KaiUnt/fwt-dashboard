-- Credits System Database Schema für FWT Dashboard
-- Basierend auf der Spezifikation in credits_system.md

-- Tabelle für User Credits Guthaben
CREATE TABLE IF NOT EXISTS user_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Tabelle für Event-Zugang
CREATE TABLE IF NOT EXISTS user_event_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id VARCHAR(255) NOT NULL, -- LiveHeats Event ID
    event_name VARCHAR(500), -- Event Name für bessere Nachvollziehbarkeit
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_type VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (access_type IN ('paid', 'free', 'gift')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, event_id)
);

-- Tabelle für Credits-Transaktionen (Audit Trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'spend', 'grant', 'refund')),
    amount INTEGER NOT NULL, -- Positive für Zugang, negativ für Ausgaben
    credits_before INTEGER NOT NULL,
    credits_after INTEGER NOT NULL,
    description VARCHAR(500),
    event_id VARCHAR(255), -- Wenn für Event-Zugang ausgegeben
    reference_id UUID, -- Referenz zu Purchase oder anderen Transactions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) -- Für Admin-Grants
);

-- Tabelle für Credit Purchases (für Stripe Integration)
CREATE TABLE IF NOT EXISTS credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    credits_purchased INTEGER NOT NULL CHECK (credits_purchased > 0),
    price_paid_cents INTEGER NOT NULL CHECK (price_paid_cents > 0), -- in Cent
    currency VARCHAR(3) DEFAULT 'EUR',
    package_type VARCHAR(20) NOT NULL CHECK (package_type IN ('single', 'pack_5', 'pack_10')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    stripe_payment_intent_id VARCHAR(255), -- Stripe Payment Intent ID
    stripe_session_id VARCHAR(255), -- Stripe Checkout Session ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies

-- User Credits RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON user_credits 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credits" ON user_credits 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update user credits" ON user_credits 
    FOR UPDATE USING (true); -- Wird über sichere RPC functions gesteuert

-- User Event Access RLS
ALTER TABLE user_event_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event access" ON user_event_access 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own event access" ON user_event_access 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Credit Transactions RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON credit_transactions 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions" ON credit_transactions 
    FOR INSERT WITH CHECK (true); -- Wird über sichere RPC functions gesteuert

-- Credit Purchases RLS
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON credit_purchases 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own purchases" ON credit_purchases 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update purchases" ON credit_purchases 
    FOR UPDATE USING (true); -- Wird über sichere RPC functions gesteuert

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_event_access_user_id ON user_event_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_event_access_event_id ON user_event_access(event_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_status ON credit_purchases(payment_status);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_credits_updated_at 
    BEFORE UPDATE ON user_credits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_purchases_updated_at 
    BEFORE UPDATE ON credit_purchases 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RPC Functions für sichere Credits-Operationen

-- Function: Get user credits
CREATE OR REPLACE FUNCTION get_user_credits()
RETURNS INTEGER AS $$
DECLARE
    user_credits INTEGER;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Get user credits, create record if not exists
    INSERT INTO user_credits (user_id, credits)
    VALUES (auth.uid(), 2) -- New users get 2 credits
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT credits INTO user_credits 
    FROM user_credits 
    WHERE user_id = auth.uid();
    
    RETURN COALESCE(user_credits, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check event access
CREATE OR REPLACE FUNCTION check_event_access(event_id_param VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    has_access BOOLEAN;
    event_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user has explicit access
    SELECT TRUE INTO has_access
    FROM user_event_access 
    WHERE user_id = auth.uid() AND event_id = event_id_param;
    
    IF has_access THEN
        RETURN TRUE;
    END IF;
    
    -- TODO: Check if event is older than 7 days (automatically free)
    -- This would need event date from external API
    -- For now, return FALSE if no explicit access
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Purchase event access
CREATE OR REPLACE FUNCTION purchase_event_access(
    event_id_param VARCHAR,
    event_name_param VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    current_credits INTEGER;
    result JSONB;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Check if user already has access
    IF check_event_access(event_id_param) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'already_has_access',
            'message', 'User already has access to this event'
        );
    END IF;
    
    -- Get current credits
    current_credits := get_user_credits();
    
    -- Check if user has enough credits
    IF current_credits < 1 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'message', 'Not enough credits',
            'credits_required', 1,
            'credits_available', current_credits
        );
    END IF;
    
    -- Start transaction
    BEGIN
        -- Deduct credit
        UPDATE user_credits 
        SET credits = credits - 1 
        WHERE user_id = auth.uid();
        
        -- Grant access
        INSERT INTO user_event_access (user_id, event_id, event_name, access_type)
        VALUES (auth.uid(), event_id_param, event_name_param, 'paid');
        
        -- Log transaction
        INSERT INTO credit_transactions (
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
            current_credits,
            current_credits - 1,
            'Event access purchase: ' || COALESCE(event_name_param, event_id_param),
            event_id_param
        );
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Event access purchased successfully',
            'credits_remaining', current_credits - 1
        );
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to purchase event access: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Add credits (for purchases/gifts)
CREATE OR REPLACE FUNCTION add_user_credits(
    credits_to_add INTEGER,
    description_param VARCHAR DEFAULT 'Credits added'
)
RETURNS JSONB AS $$
DECLARE
    current_credits INTEGER;
    new_credits INTEGER;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Validate amount
    IF credits_to_add <= 0 THEN
        RAISE EXCEPTION 'Credits to add must be positive';
    END IF;
    
    -- Get current credits
    current_credits := get_user_credits();
    new_credits := current_credits + credits_to_add;
    
    -- Start transaction
    BEGIN
        -- Update credits
        UPDATE user_credits 
        SET credits = new_credits 
        WHERE user_id = auth.uid();
        
        -- Log transaction
        INSERT INTO credit_transactions (
            user_id, 
            transaction_type, 
            amount, 
            credits_before, 
            credits_after,
            description
        ) VALUES (
            auth.uid(),
            'purchase',
            credits_to_add,
            current_credits,
            new_credits,
            description_param
        );
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Credits added successfully',
            'credits_added', credits_to_add,
            'credits_total', new_credits
        );
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to add credits: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Grant admin credits (for admins)
CREATE OR REPLACE FUNCTION grant_admin_credits(
    target_user_id UUID,
    credits_to_grant INTEGER,
    admin_note VARCHAR DEFAULT 'Admin grant'
)
RETURNS JSONB AS $$
DECLARE
    current_credits INTEGER;
    new_credits INTEGER;
    admin_role VARCHAR;
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Check if user is admin
    SELECT role INTO admin_role FROM user_profiles WHERE id = auth.uid();
    IF admin_role != 'admin' THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;
    
    -- Validate amount
    IF credits_to_grant <= 0 THEN
        RAISE EXCEPTION 'Credits to grant must be positive';
    END IF;
    
    -- Get/create target user credits
    INSERT INTO user_credits (user_id, credits)
    VALUES (target_user_id, 2)
    ON CONFLICT (user_id) DO NOTHING;
    
    SELECT credits INTO current_credits 
    FROM user_credits 
    WHERE user_id = target_user_id;
    
    new_credits := current_credits + credits_to_grant;
    
    -- Start transaction
    BEGIN
        -- Update credits
        UPDATE user_credits 
        SET credits = new_credits 
        WHERE user_id = target_user_id;
        
        -- Log transaction
        INSERT INTO credit_transactions (
            user_id, 
            transaction_type, 
            amount, 
            credits_before, 
            credits_after,
            description,
            created_by
        ) VALUES (
            target_user_id,
            'grant',
            credits_to_grant,
            current_credits,
            new_credits,
            'Admin grant: ' || admin_note,
            auth.uid()
        );
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Credits granted successfully',
            'credits_granted', credits_to_grant,
            'credits_total', new_credits
        );
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to grant credits: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: Give existing users 2 credits
INSERT INTO user_credits (user_id, credits)
SELECT 
    id as user_id,
    2 as credits
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits)
ON CONFLICT (user_id) DO NOTHING;