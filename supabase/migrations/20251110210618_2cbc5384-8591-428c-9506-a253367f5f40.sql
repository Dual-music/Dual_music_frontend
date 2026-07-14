-- Create enum for app roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'artist', 'fan', 'manager');

-- Create enum for duel status
CREATE TYPE public.duel_status AS ENUM ('upcoming', 'live', 'ended');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create duels table
CREATE TABLE public.duels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist1_id UUID NOT NULL,
    artist2_id UUID NOT NULL,
    manager_id UUID,
    status duel_status DEFAULT 'upcoming',
    scheduled_time TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    winner_id UUID,
    room_id TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view duels"
ON public.duels FOR SELECT
USING (true);

CREATE POLICY "Artists and managers can update their duels"
ON public.duels FOR UPDATE
USING (
    auth.uid() = artist1_id OR 
    auth.uid() = artist2_id OR 
    auth.uid() = manager_id OR
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins and managers can create duels"
ON public.duels FOR INSERT
WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'manager')
);

-- Create user_wallets table
CREATE TABLE public.user_wallets (
    user_id UUID PRIMARY KEY,
    balance DECIMAL(10, 2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wallet"
ON public.user_wallets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet"
ON public.user_wallets FOR UPDATE
USING (auth.uid() = user_id);

-- Create virtual_gifts table
CREATE TABLE public.virtual_gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.virtual_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view gifts"
ON public.virtual_gifts FOR SELECT
USING (true);

CREATE POLICY "Admins can manage gifts"
ON public.virtual_gifts FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create gift_transactions table
CREATE TABLE public.gift_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    duel_id UUID REFERENCES public.duels(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    gift_id UUID REFERENCES public.virtual_gifts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view gift transactions"
ON public.gift_transactions FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can send gifts"
ON public.gift_transactions FOR INSERT
WITH CHECK (auth.uid() = from_user_id);

-- Create duel_votes table
CREATE TABLE public.duel_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    duel_id UUID REFERENCES public.duels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    artist_id UUID NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.duel_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view votes"
ON public.duel_votes FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can vote"
ON public.duel_votes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.duel_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gift_transactions;

-- Insert some sample gifts
INSERT INTO public.virtual_gifts (name, price, image_url) VALUES
('Rose', 1.00, '🌹'),
('Coeur', 5.00, '❤️'),
('Étoile', 10.00, '⭐'),
('Couronne', 25.00, '👑'),
('Diamant', 50.00, '💎'),
('Fusée', 100.00, '🚀');