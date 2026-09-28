/**
 * Compétition: CompetitionForm — formulaire de création/édition d'une
 * compétition par un manager.
 *
 * Champs conditionnels selon `mode` :
 *  - `online` : pas de lieu physique.
 *  - `onsite` : pays / ville / commune / quartier / nom du lieu /
 *     adresse exacte / coordonnées d'accès.
 *
 * Éligibilité (`country | africa | world`) avec sélection multi-pays
 * lorsque `country` est choisi.
 *
 * Toutes les dates sont stockées en UTC ; la validation refuse les
 * incohérences (deadline > start, start > end).
 *
 * EN — Manager-facing form to create or edit a competition. Conditional
 * fields depending on mode, multi-country selector when scope is
 * `country`. Server-side validation is reinforced by the DB triggers.
 *
 * @access role=manager
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import * as competitions from "@/api/endpoints/competitions";
import { COUNTRIES } from "@/data/countries";
import { ImageUpload } from "@/components/ui/image-upload";
import { Search, X, Clock } from "lucide-react";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { toTzInputValue, toWireUtc } from "@/lib/datetime";

interface Props {
  managerId: string;
  initial?: any;
  onSaved?: (id: string) => void;
}

export const CompetitionForm = ({ managerId, initial, onSaved }: Props) => {
  const { t } = useLanguage();
  const { prefs } = useUiPreferences();
  const tz = prefs.timezone || "GMT";
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_url || "");
  const [mode, setMode] = useState<"online" | "onsite">(initial?.mode || "online");
  const [maxCandidates, setMaxCandidates] = useState<number>(initial?.max_candidates || 10);
  const [rewardDescription, setRewardDescription] = useState(initial?.reward_description || "");
  const [rewardAmount, setRewardAmount] = useState<number>(initial?.reward_amount || 0);
  const [entryFeeRequired, setEntryFeeRequired] = useState(!!initial?.entry_fee_required);
  const [entryFeeAmount, setEntryFeeAmount] = useState<number>(initial?.entry_fee_amount || 0);
  // Le manager choisit d'accepter les sponsors ou non (défaut oui).
  const [acceptsSponsors, setAcceptsSponsors] = useState<boolean>(initial?.accepts_sponsors ?? true);
  const [eligibilityScope, setEligibilityScope] = useState<"country" | "africa" | "world">(
    initial?.eligibility_scope || "country"
  );
  const [eligibleCountries, setEligibleCountries] = useState<string[]>(initial?.eligible_countries || []);
  const [country, setCountry] = useState(initial?.country || "");
  const [city, setCity] = useState(initial?.city || "");
  const [commune, setCommune] = useState(initial?.commune || "");
  const [district, setDistrict] = useState(initial?.district || "");
  const [venueName, setVenueName] = useState(initial?.venue_name || "");
  const [venueAddress, setVenueAddress] = useState(initial?.venue_address || "");
  const [venueContact, setVenueContact] = useState(initial?.venue_contact || "");
  // Dates stockées en UTC, saisies/affichées dans le fuseau préféré : conversions
  // centralisées dans lib/datetime (mêmes règles pour tous les événements).
  const toTzInput = (iso?: string | null): string => toTzInputValue(iso, tz);
  const fromTzInput = (s: string): string | null => toWireUtc(s, tz);

  const [applicationOpensAt, setApplicationOpensAt] = useState(toTzInput(initial?.application_opens_at));
  const [applicationDeadline, setApplicationDeadline] = useState(toTzInput(initial?.application_deadline));
  const [startAt, setStartAt] = useState(toTzInput(initial?.start_at));
  const [endAt, setEndAt] = useState(toTzInput(initial?.end_at));
  const [sponsorDeadline, setSponsorDeadline] = useState(toTzInput(initial?.sponsor_submission_deadline));

  const toggleCountry = (code: string) => {
    setEligibleCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSubmit = async () => {
    if (!title || !applicationDeadline || !startAt || !endAt) {
      toast({ title: t("compTitle") + " / " + t("compStartAt") + " ?", variant: "destructive" });
      return;
    }
    if (mode === "onsite" && (!country || !city || !venueName)) {
      toast({ title: t("compVenueName"), variant: "destructive" });
      return;
    }
    setBusy(true);
    const payload: any = {
      managerId,
      title, description, coverUrl: coverUrl || null,
      mode,
      maxCandidates,
      rewardDescription: rewardDescription || null,
      rewardAmount: rewardAmount || 0,
      entryFeeRequired,
      entryFeeAmount: entryFeeRequired ? entryFeeAmount : 0,
      acceptsSponsors,
      sponsorSubmissionDeadline: acceptsSponsors ? fromTzInput(sponsorDeadline) : null,
      eligibilityScope,
      eligibleCountries: eligibilityScope === "country" ? eligibleCountries : [],
      country: mode === "onsite" ? country : null,
      city: mode === "onsite" ? city : null,
      commune: mode === "onsite" ? commune : null,
      district: mode === "onsite" ? district : null,
      venueName: mode === "onsite" ? venueName : null,
      venueAddress: mode === "onsite" ? venueAddress : null,
      venueContact: mode === "onsite" ? venueContact : null,
      applicationOpensAt: fromTzInput(applicationOpensAt),
      applicationDeadline: fromTzInput(applicationDeadline),
      startAt: fromTzInput(startAt),
      endAt: fromTzInput(endAt),
      status: initial?.status || "open",
    };

    try {
      const data: any = initial?.id
        ? await competitions.updateCompetition(initial.id, payload)
        : await competitions.createCompetition(payload);
      toast({ title: initial?.id ? t("compUpdated") : t("compCreated") });
      onSaved?.(data.id);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <Label>{t("compTitle")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>{t("compDescription")}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <ImageUpload
          value={coverUrl}
          onChange={setCoverUrl}
          onUploadingChange={setCoverUploading}
          label={t("compCover")}
          folder="competitions"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("compMode")}</Label>
            <Select value={mode} onValueChange={(v: any) => setMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="online">{t("compOnline")}</SelectItem>
                <SelectItem value="onsite">{t("compOnsite")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("compMaxCandidates")}</Label>
            <Input type="number" min={1} value={maxCandidates}
              onChange={(e) => setMaxCandidates(parseInt(e.target.value || "1"))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("compReward")}</Label>
            <Input value={rewardDescription} onChange={(e) => setRewardDescription(e.target.value)} />
          </div>
          <div>
            <Label>{t("compRewardAmount")}</Label>
            <Input type="number" min={0} value={rewardAmount}
              onChange={(e) => setRewardAmount(parseFloat(e.target.value || "0"))} />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
          <Label>{t("compEntryFee")}</Label>
          <Switch checked={entryFeeRequired} onCheckedChange={setEntryFeeRequired} />
        </div>
        {entryFeeRequired && (
          <div>
            <Label>{t("compEntryFeeAmount")}</Label>
            <Input type="number" min={0} value={entryFeeAmount}
              onChange={(e) => setEntryFeeAmount(parseFloat(e.target.value || "0"))} />
          </div>
        )}

        {/* Accepter les sponsors : si désactivé, aucune candidature sponsor n'est possible. */}
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/30">
          <Label>{t("compAcceptSponsors") || "Accepter les sponsors"}</Label>
          <Switch checked={acceptsSponsors} onCheckedChange={setAcceptsSponsors} />
        </div>
        {/* Date limite des candidatures sponsor — proposée dès que les sponsors sont acceptés. */}
        {acceptsSponsors && (
          <div>
            <Label>{t("compSponsorDeadline") || "Date limite des candidatures sponsor"} ({tz})</Label>
            <Input type="datetime-local" value={sponsorDeadline} onChange={(e) => setSponsorDeadline(e.target.value)} />
          </div>
        )}

        <div>
          <Label>{t("compEligibility")}</Label>
          <Select value={eligibilityScope} onValueChange={(v: any) => setEligibilityScope(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="country">{t("compEligibilityCountry")}</SelectItem>
              <SelectItem value="africa">{t("compEligibilityAfrica")}</SelectItem>
              <SelectItem value="world">{t("compEligibilityWorld")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {eligibilityScope === "country" && (
          <div className="space-y-2">
            <Label>{t("compEligibleCountriesPick")}</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder={t("compSearchCountry") || "Rechercher un pays..."}
                className="pl-8 h-9"
              />
            </div>
            {eligibleCountries.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {eligibleCountries.map((code) => {
                  const c = COUNTRIES.find((x) => x.code === code);
                  return (
                    <Badge key={code} variant="default" className="cursor-pointer text-xs"
                      onClick={() => toggleCountry(code)}>
                      {c?.name || code}<X className="w-3 h-3 ml-1" />
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 border rounded-md">
              {filteredCountries.map((c) => (
                <Badge
                  key={c.code}
                  variant={eligibleCountries.includes(c.code) ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleCountry(c.code)}
                >
                  {c.name}
                </Badge>
              ))}
              {filteredCountries.length === 0 && (
                <span className="text-xs text-muted-foreground px-1">—</span>
              )}
            </div>
          </div>
        )}

        {mode === "onsite" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("compCountry")}</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 sticky top-0 bg-popover z-10">
                    <Input
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      placeholder={t("compSearchCountry") || "Rechercher..."}
                      className="h-8"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredCountries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("compCity")}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label>{t("compCommune")}</Label>
              <Input value={commune} onChange={(e) => setCommune(e.target.value)} />
            </div>
            <div>
              <Label>{t("compDistrict")}</Label>
              <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>
            <div>
              <Label>{t("compVenueName")}</Label>
              <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} />
            </div>
            <div>
              <Label>{t("compVenueContact")}</Label>
              <Input value={venueContact} onChange={(e) => setVenueContact(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>{t("compVenueAddress")}</Label>
              <Textarea value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} />
            </div>
          </div>
        )}

        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">
            {t("compTimezoneHint") || "Les heures saisies sont interprétées dans votre fuseau:"} <b className="text-foreground">{tz}</b>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t("compApplicationOpensAt")} <span className="text-[10px] text-muted-foreground">({tz})</span></Label>
            <Input type="datetime-local" value={applicationOpensAt}
              onChange={(e) => setApplicationOpensAt(e.target.value)} />
            <p className="text-[11px] text-muted-foreground mt-1">{t("compApplicationOpensAtHint")}</p>
          </div>
          <div>
            <Label>{t("compApplicationDeadline")} <span className="text-[10px] text-muted-foreground">({tz})</span></Label>
            <Input type="datetime-local" value={applicationDeadline}
              onChange={(e) => setApplicationDeadline(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t("compStartAt")} <span className="text-[10px] text-muted-foreground">({tz})</span></Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <Label>{t("compEndAt")} <span className="text-[10px] text-muted-foreground">({tz})</span></Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={busy || coverUploading} className="w-full">
          {initial?.id ? (t("save") || "Enregistrer") : t("compSubmit")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CompetitionForm;
