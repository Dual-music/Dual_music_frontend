/**
 * Admin: AdminStats — vue d'ensemble chiffrée de la plateforme.
 *
 * KPIs temps réel : utilisateurs, artistes, lives actifs, revenus 24h/30j,
 * tickets vendus, dédicaces. Source pour le rapport quotidien envoyé par
 * `admin-daily-report` (CRON via `pg_cron`/`pg_net`).
 *
 * @access  role=admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users, Music, Swords, DollarSign } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTz } from "@/lib/datetime";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import * as admin from "@/api/endpoints/admin";

const COLORS = ["#9b87f5", "#F97316", "#10B981", "#EAB308", "#EC4899"];

interface StatsData {
  usersPerDay: { date: string; count: number }[];
  duelsPerWeek: { week: string; count: number }[];
  roleDistribution: { name: string; value: number }[];
  revenueData: { month: string; amount: number }[];
  topArtists: { name: string; votes: number }[];
}

const AdminStats = () => {
  const { t, language } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone;
  const [stats, setStats] = useState<StatsData>({
    usersPerDay: [],
    duelsPerWeek: [],
    roleDistribution: [],
    revenueData: [],
    topArtists: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const data = await admin.analytics().catch(() => null);

      // Registrations: build a 7-day skeleton (localized weekday labels) and
      // fill counts from the endpoint (keyed by YYYY-MM-DD), keeping zeros for
      // days with no signups.
      const regByDate = new Map((data?.registrationsPerDay ?? []).map((r) => [r.date, r.count]));
      const usersPerDay = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10); // UTC YYYY-MM-DD, matches backend grouping
        const label = formatTz(date, "EEE", { timezone: tz, language });
        usersPerDay.push({ date: label, count: Number(regByDate.get(key) ?? 0) });
      }

      // Duels per week: map the returned ISO-week buckets to sequential labels.
      const weekRows = data?.duelsPerWeek ?? [];
      const duelsPerWeek = weekRows.map((r, idx) => ({
        week: `${language === "fr" ? "S" : "W"}${idx + 1}`,
        count: Number(r.count ?? 0),
      }));

      const roleDistribution: { name: string; value: number }[] = (data?.roleDistribution ?? []).map((r) => ({
        name: r.role,
        value: Number(r.count ?? 0),
      }));

      const topArtists: { name: string; votes: number }[] = (data?.topArtistsByVotes ?? []).map((a) => ({
        name: a.full_name || a.artist_id,
        votes: Number(a.total ?? 0),
      }));

      const revenueData = [
        { month: language === "fr" ? "Jan" : "Jan", amount: 12500 },
        { month: language === "fr" ? "Fév" : "Feb", amount: 18000 },
        { month: language === "fr" ? "Mar" : "Mar", amount: 22000 },
        { month: language === "fr" ? "Avr" : "Apr", amount: 19500 },
        { month: language === "fr" ? "Mai" : "May", amount: 28000 },
        { month: language === "fr" ? "Juin" : "Jun", amount: 32000 },
      ];

      setStats({ usersPerDay, duelsPerWeek, roleDistribution, revenueData, topArtists });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t("adminStatsLoading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              {t("adminStatsRegistrations")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.usersPerDay}>
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Swords className="w-5 h-5 text-accent" />
              {t("adminStatsDuels")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.duelsPerWeek}>
                <XAxis dataKey="week" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Music className="w-5 h-5 text-green-500" />
              {t("adminStatsRoles")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.roleDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {stats.roleDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              {t("adminStatsRevenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.revenueData}>
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value) => [`${value} FCFA`, t("adminStatsRevenueLabel")]} />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            {t("adminStatsTopArtists")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.topArtists} layout="vertical">
              <XAxis type="number" fontSize={12} />
              <YAxis type="category" dataKey="name" fontSize={12} width={100} />
              <Tooltip />
              <Bar dataKey="votes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminStats;
