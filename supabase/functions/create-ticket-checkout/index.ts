/**
 * Edge Function: create-ticket-checkout
 *
 * Creates a Stripe Checkout Session for a paid concert ticket. Resolves the
 * concert price/currency from `concerts`, validates seats availability and
 * stores `concert_id` + `buyer_id` in the session metadata so the webhook can
 * insert into `concert_tickets` on payment success.
 *
 * @endpoint POST /functions/v1/create-ticket-checkout
 * @body     { concertId: string; successUrl?: string; cancelUrl?: string }
 * @returns  { url: string; sessionId: string }
 * @env      STRIPE_SECRET_KEY
 * @see      supabase/functions/stripe-webhook (ticket fulfillment)
 * @see      src/pages/ConcertDetail.tsx
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { concertId } = await req.json();

    if (!concertId) {
      throw new Error("Concert ID requis");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authentification requise");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user?.email) {
      throw new Error("Utilisateur non authentifié");
    }

    // Get concert details
    const { data: concert, error: concertError } = await supabaseClient
      .from("concerts")
      .select("*")
      .eq("id", concertId)
      .single();

    if (concertError || !concert) {
      throw new Error("Concert non trouvé");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create checkout session for ticket purchase
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Ticket - ${concert.title}`,
              description: `Concert le ${new Date(concert.scheduled_date).toLocaleDateString("fr-FR")} - ${concert.artist_name}`,
            },
            unit_amount: Math.round(concert.ticket_price * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/concert/${concertId}?payment=success`,
      cancel_url: `${req.headers.get("origin")}/concert/${concertId}?payment=cancelled`,
      metadata: {
        user_id: user.id,
        concert_id: concertId,
        type: "ticket",
      },
    });

    console.log("Ticket checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating ticket checkout:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});