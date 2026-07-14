/**
 * Edge Function: assign-monthly-badges (CRON)
 *
 * Runs on the 1st of each month. Aggregates the previous month's gift volume
 * per donor, ranks them and writes Top-Donor badges into `user_badges`
 * (TOP_1 / TOP_3 / TOP_10) for visible recognition on profiles.
 *
 * @endpoint POST /functions/v1/assign-monthly-badges
 * @returns  { month: string; badgesAssigned: number }
 * @see      src/components/profile/UserBadges.tsx
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Accept either a cron secret token OR an admin JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET');

    let authorized = false;

    // Option 1: cron secret token
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      authorized = true;
    }

    // Option 2: admin JWT
    if (!authorized && authHeader.startsWith('Bearer ')) {
      const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      const { createClient: cc } = await import('https://esm.sh/@supabase/supabase-js@2');
      const callerClient = cc(supabaseUrl, supabaseAnon, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData } = await callerClient.auth.getClaims(token);
      if (claimsData?.claims?.sub) {
        const adminCheck = cc(supabaseUrl, supabaseServiceKey);
        const { data: roleData } = await adminCheck
          .from('user_roles')
          .select('role')
          .eq('user_id', claimsData.claims.sub)
          .eq('role', 'admin')
          .maybeSingle();
        if (roleData) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current month/year label
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Calculate the start and end of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    console.log(`Processing monthly badges for: ${monthYear}`);

    // Aggregate gift totals per sender for the current month
    const { data: giftData, error: giftError } = await supabase
      .from('gift_transactions')
      .select('from_user_id, gift_id')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth);

    if (giftError) throw giftError;

    // Fetch gift prices to compute monetary value
    const giftIds = [...new Set((giftData || []).map(g => g.gift_id).filter(Boolean))];
    let priceMap: Record<string, number> = {};

    if (giftIds.length > 0) {
      const { data: gifts } = await supabase
        .from('virtual_gifts')
        .select('id, price')
        .in('id', giftIds);
      priceMap = Object.fromEntries((gifts || []).map(g => [g.id, Number(g.price)]));
    }

    // Also count duel votes (donations)
    const { data: voteData, error: voteError } = await supabase
      .from('duel_votes')
      .select('user_id, amount')
      .gte('created_at', startOfMonth)
      .lte('created_at', endOfMonth);

    if (voteError) throw voteError;

    // Tally total donation per user (gifts + votes)
    const totals: Record<string, number> = {};

    for (const g of (giftData || [])) {
      const price = g.gift_id ? (priceMap[g.gift_id] || 0) : 0;
      totals[g.from_user_id] = (totals[g.from_user_id] || 0) + price;
    }

    for (const v of (voteData || [])) {
      totals[v.user_id] = (totals[v.user_id] || 0) + Number(v.amount);
    }

    // Sort users by total donated (descending)
    const ranked = Object.entries(totals)
      .map(([userId, total]) => ({ userId, total }))
      .sort((a, b) => b.total - a.total);

    if (ranked.length === 0) {
      return new Response(JSON.stringify({ message: 'No donors this month' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Badge definitions
    const badgeRules = [
      { rank: 1, type: 'top1_monthly', name: 'Top 1 Mensuel', icon: '🥇' },
      { rank: 2, type: 'top3_monthly', name: 'Top 2 Mensuel', icon: '🥈' },
      { rank: 3, type: 'top3_monthly', name: 'Top 3 Mensuel', icon: '🥉' },
    ];

    // Top 4-10 get "top10_monthly"
    const top10Badge = { type: 'top10_monthly', name: 'Top 10 Mensuel', icon: '⭐' };

    // Remove existing monthly badges for this month to avoid duplicates
    await supabase
      .from('user_badges')
      .delete()
      .in('badge_type', ['top1_monthly', 'top3_monthly', 'top10_monthly'])
      .eq('month_year', monthYear);

    const badgesToInsert: Array<{
      user_id: string;
      badge_type: string;
      badge_name: string;
      badge_icon: string;
      month_year: string;
      is_active: boolean;
    }> = [];

    // Assign top 1, 2, 3 badges
    for (let i = 0; i < Math.min(3, ranked.length); i++) {
      const rule = badgeRules[i];
      if (rule && ranked[i]) {
        badgesToInsert.push({
          user_id: ranked[i].userId,
          badge_type: rule.type,
          badge_name: rule.name,
          badge_icon: rule.icon,
          month_year: monthYear,
          is_active: true,
        });
      }
    }

    // Assign top 4-10 badges
    for (let i = 3; i < Math.min(10, ranked.length); i++) {
      badgesToInsert.push({
        user_id: ranked[i].userId,
        badge_type: top10Badge.type,
        badge_name: `${top10Badge.name} (Top ${i + 1})`,
        badge_icon: top10Badge.icon,
        month_year: monthYear,
        is_active: true,
      });
    }

    if (badgesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('user_badges')
        .insert(badgesToInsert);

      if (insertError) throw insertError;
    }

    // Send notifications to badge winners
    for (const badge of badgesToInsert) {
      await supabase.from('notifications').insert({
        user_id: badge.user_id,
        type: 'badge',
        title: `Badge obtenu : ${badge.badge_icon} ${badge.badge_name}`,
        message: `Félicitations ! Vous avez obtenu le badge "${badge.badge_name}" pour le mois de ${monthYear}. Continuez à soutenir les artistes !`,
        data: { badge_type: badge.badge_type, month_year: monthYear },
      });
    }

    console.log(`Assigned ${badgesToInsert.length} badges for ${monthYear}`);

    return new Response(
      JSON.stringify({
        success: true,
        monthYear,
        badgesAssigned: badgesToInsert.length,
        topDonors: ranked.slice(0, 10).map((r, i) => ({ rank: i + 1, userId: r.userId, total: r.total })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('Error assigning badges:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
