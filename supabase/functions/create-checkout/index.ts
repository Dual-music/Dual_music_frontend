/**
 * Edge Function: create-checkout
 *
 * Creates a Stripe Checkout Session for a credit recharge (one-shot purchase).
 * Amount and currency are derived from `economic_config` (credit_value_usd +
 * provider fees) and `exchange_rates`. The returned `url` is opened in a new
 * tab; final settlement happens via `stripe-webhook` → `wallets` credit.
 *
 * @endpoint POST /functions/v1/create-checkout
 * @body     { credits: number; currency?: string; successUrl?: string; cancelUrl?: string }
 * @returns  { url: string; sessionId: string }
 * @env      STRIPE_SECRET_KEY
 * @see      supabase/functions/stripe-webhook (settlement handler)
 * @see      src/pages/WalletRecharge.tsx
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
    const { amount, type } = await req.json();

    if (!amount || amount <= 0) {
      throw new Error("Montant invalide");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    let userEmail = null;
    let userId = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user) {
        userEmail = data.user.email;
        userId = data.user.id;
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists
    let customerId;
    if (userEmail) {
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Create checkout session for wallet recharge
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: type === "wallet" ? "Recharge Portefeuille" : "Achat de ticket",
              description: type === "wallet" 
                ? `Recharge de ${amount}€ sur votre portefeuille Dual Music`
                : `Ticket pour événement Dual Music`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: type === "wallet"
        ? `${req.headers.get("origin")}/wallet?recharge=success&provider=stripe&sid={CHECKOUT_SESSION_ID}&amount=${amount}&currency=EUR`
        : `${req.headers.get("origin")}/profile?payment=success&amount=${amount}&type=${type}`,
      cancel_url: `${req.headers.get("origin")}/wallet?payment=cancelled`,
      metadata: {
        user_id: userId,
        type: type,
        amount: amount.toString(),
      },
    });

    console.log("Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error creating checkout:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});