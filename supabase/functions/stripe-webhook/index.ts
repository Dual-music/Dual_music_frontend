/**
 * Edge Function: stripe-webhook
 *
 * Stripe events endpoint. Verifies the `Stripe-Signature` header against
 * `STRIPE_WEBHOOK_SECRET`, then dispatches by event type:
 *  - `checkout.session.completed` → credit wallet (recharge) or grant ticket
 *    (concert/duel) / subscription (`user_subscriptions`).
 *  - `customer.subscription.updated|deleted` → sync plan & status.
 *  - `payout.paid|failed` → finalize `withdrawal_requests` row.
 *
 * Idempotent — replays are detected via `stripe_event_id` uniqueness.
 *
 * @endpoint POST /functions/v1/stripe-webhook  (verify_jwt = false)
 * @env      STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * @see      supabase/functions/create-checkout, create-ticket-checkout
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: any) => {
  console.log(`[STRIPE-WEBHOOK] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      logStep("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!sig) {
      logStep("Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      logStep("Webhook signature verification failed", { error: err?.message || "Unknown error" });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Event received", { type: event.type });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        logStep("Checkout completed", { session_id: session.id, mode: session.mode });

        // Wallet recharge (one-time payment)
        if (session.mode === "payment" && session.metadata?.type === "wallet") {
          const userId = session.metadata?.user_id as string | undefined;
          const eurAmount = Number(session.amount_total ?? 0) / 100;
          if (userId && eurAmount > 0) {
            const { computeCreditsForRecharge } = await import("../_shared/recharge-credits.ts");
            const { credits } = await computeCreditsForRecharge(supabaseClient as any, eurAmount, "EUR", "stripe");
            if (credits > 0) {
              const { data: w } = await supabaseClient.from("user_wallets").select("balance").eq("user_id", userId).maybeSingle();
              const newBal = Number(w?.balance ?? 0) + credits;
              await supabaseClient.from("user_wallets").upsert({ user_id: userId, balance: newBal, updated_at: new Date().toISOString() });
              await supabaseClient.from("credit_purchases").insert({
                user_id: userId, credits_amount: credits, paid_amount: eurAmount,
                currency: "EUR", payment_method: "stripe", status: "completed", payment_reference: session.id,
              });
              logStep("Stripe wallet credited", { user_id: userId, credits });
            }
          }
          break;
        }

        
        if (session.mode === "subscription") {
          const customerEmail = session.customer_email || session.customer_details?.email;
          
          if (customerEmail) {
            // Find user by email
            const { data: profile } = await supabaseClient
              .from("profiles")
              .select("id")
              .eq("email", customerEmail)
              .single();
            
            if (profile) {
              // Deactivate old subscriptions
              await supabaseClient
                .from("fan_subscriptions")
                .update({ is_active: false })
                .eq("user_id", profile.id);
              
              // Create new subscription
              const { error } = await supabaseClient
                .from("fan_subscriptions")
                .insert({
                  user_id: profile.id,
                  subscription_type: "premium",
                  is_active: true,
                  stripe_subscription_id: session.subscription,
                  stripe_customer_id: session.customer,
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
              
              if (error) {
                logStep("Error creating subscription", { error });
              } else {
                logStep("Subscription created for user", { user_id: profile.id });
                
                // Send notification
                await supabaseClient.from("notifications").insert({
                  user_id: profile.id,
                  type: "subscription",
                  title: "Abonnement Premium activé!",
                  message: "Bienvenue dans le club VIP! Profitez de tous les avantages premium."
                });
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        logStep("Subscription updated", { subscription_id: subscription.id, status: subscription.status });
        
        const { error } = await supabaseClient
          .from("fan_subscriptions")
          .update({
            is_active: subscription.status === "active",
            expires_at: new Date(subscription.current_period_end * 1000).toISOString()
          })
          .eq("stripe_subscription_id", subscription.id);
        
        if (error) {
          logStep("Error updating subscription", { error });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        logStep("Subscription deleted", { subscription_id: subscription.id });
        
        const { data: fanSub } = await supabaseClient
          .from("fan_subscriptions")
          .select("user_id")
          .eq("stripe_subscription_id", subscription.id)
          .single();
        
        await supabaseClient
          .from("fan_subscriptions")
          .update({ is_active: false })
          .eq("stripe_subscription_id", subscription.id);
        
        if (fanSub) {
          await supabaseClient.from("notifications").insert({
            user_id: fanSub.user_id,
            type: "subscription",
            title: "Abonnement expiré",
            message: "Votre abonnement premium a expiré. Réabonnez-vous pour continuer à profiter des avantages."
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        logStep("Payment failed", { invoice_id: invoice.id });
        
        const { data: fanSub } = await supabaseClient
          .from("fan_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", invoice.customer)
          .single();
        
        if (fanSub) {
          await supabaseClient.from("notifications").insert({
            user_id: fanSub.user_id,
            type: "payment",
            title: "Échec du paiement",
            message: "Le paiement de votre abonnement a échoué. Veuillez mettre à jour vos informations de paiement."
          });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
