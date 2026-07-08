-- ============================================================
-- PAPERLISS — Schema Supabase
-- Colle ce SQL dans l'éditeur SQL de ton projet Supabase
-- ============================================================

-- ── Table profiles ──
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prenom              text,
  nom                 text,
  adresse             text,
  code_postal         text,
  ville               text,
  numero_secu         text,
  pays                text NOT NULL DEFAULT 'belgique' CHECK (pays IN ('belgique', 'france')),
  plan                text NOT NULL DEFAULT 'gratuit' CHECK (plan IN ('gratuit', 'premium')),
  analyses_count      integer NOT NULL DEFAULT 0,
  analyses_reset_date timestamptz,
  notif_email         boolean NOT NULL DEFAULT false,
  notif_frequence     text NOT NULL DEFAULT 'hebdo' CHECK (notif_frequence IN ('immediat', 'hebdo', 'jamais')),
  heure_rappel        text NOT NULL DEFAULT '09:00',
  jours_avant_rappel  integer NOT NULL DEFAULT 3,
  date_rappel_exacte  text,
  expo_push_token     text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Si la table existait déjà avant l'ajout du paywall Stripe, colle ceci dans l'éditeur SQL Supabase :
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- ── Table documents ──
CREATE TABLE IF NOT EXISTS public.documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nom_fichier         text NOT NULL,
  url_fichier         text,
  texte_extrait       text,
  categorie           text NOT NULL DEFAULT 'autres'
                        CHECK (categorie IN ('courriers','factures','identite','autres')),
  statut              text NOT NULL DEFAULT 'nouveau'
                        CHECK (statut IN ('nouveau','traite','archive')),
  date_limite         date,
  urgence             boolean NOT NULL DEFAULT false,
  explication_ia      text,
  action_recommandee  text,
  organisme_detecte   text,
  lien_officiel       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Table rappels ──
CREATE TABLE IF NOT EXISTS public.rappels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_id         uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  date_rappel         date NOT NULL,
  message             text,
  envoye              boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Table radar_snapshots ──
-- Cache du résultat du "Radar" (synthèse IA sur l'ensemble des documents d'un user)
CREATE TABLE IF NOT EXISTS public.radar_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data                jsonb NOT NULL,
  documents_count     integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rappels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_snapshots ENABLE ROW LEVEL SECURITY;

-- Profiles : un user ne voit que son propre profil
CREATE POLICY "profiles: lecture propre"  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles: insertion"       ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles: mise à jour"     ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles: suppression"     ON public.profiles FOR DELETE USING (auth.uid() = id);

-- Documents : un user ne voit que ses documents
CREATE POLICY "documents: lecture propre" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents: insertion"      ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents: mise à jour"    ON public.documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents: suppression"    ON public.documents FOR DELETE USING (auth.uid() = user_id);

-- Rappels : un user ne voit que ses rappels
CREATE POLICY "rappels: lecture propre"   ON public.rappels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "rappels: insertion"        ON public.rappels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rappels: suppression"      ON public.rappels FOR DELETE USING (auth.uid() = user_id);

-- Radar snapshots : un user ne voit/modifie que ses propres snapshots
CREATE POLICY "radar_snapshots: lecture propre" ON public.radar_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "radar_snapshots: insertion"      ON public.radar_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "radar_snapshots: mise à jour"    ON public.radar_snapshots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "radar_snapshots: suppression"    ON public.radar_snapshots FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGER : créer un profil automatiquement après inscription
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STORAGE : bucket "documents" pour les fichiers uploadés
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Politique storage : chaque user gère son dossier
CREATE POLICY "storage: upload propre" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage: lecture propre" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "storage: suppression propre" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
